
'use server';

import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployeeInternal,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser,
    getSessionData,
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
// import { sendEmployeeWelcomeEmail } from '@/modules/auth/actions'; // This is now called from auth/actions itself

const SALT_ROUNDS = 10;

export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Verifying imported session functions...");
  if (typeof getTenantIdFromSession !== 'function' || typeof getUserRoleFromSession !== 'function' || typeof getUserIdFromSession !== 'function' || typeof getEmployeeProfileForCurrentUser !== 'function') {
    const missing = [
        typeof getTenantIdFromSession !== 'function' && 'getTenantIdFromSession',
        typeof getUserRoleFromSession !== 'function' && 'getUserRoleFromSession',
        typeof getUserIdFromSession !== 'function' && 'getUserIdFromSession',
        typeof getEmployeeProfileForCurrentUser !== 'function' && 'getEmployeeProfileForCurrentUser',
    ].filter(Boolean).join(', ');
    console.error(`[Action getEmployees] FATAL: One or more session utility functions are not correctly imported/available: ${missing}`);
    throw new Error(`Server configuration error: Session utility missing (${missing}).`);
  }

  let tenantId: string | null = null;
  let userRole: User['role'] | null = null;
  let userId: string | null = null;

  try {
    tenantId = await getTenantIdFromSession();
    if (!tenantId) throw new Error("Tenant ID could not be determined from session (getEmployees).");
    console.log(`[Action getEmployees] Fetched tenantId: ${tenantId}`);

    userRole = await getUserRoleFromSession();
    if (!userRole) throw new Error("User role could not be determined from session (getEmployees).");
    console.log(`[Action getEmployees] Fetched userRole: ${userRole}`);

    userId = await getUserIdFromSession();
    console.log(`[Action getEmployees] Fetched userId: ${userId}`);

  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e.message, e.stack);
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID: ${userId}`);

  try {
    if (userRole === 'Employee') {
      if (!userId) {
        console.warn(`[Action getEmployees] Employee role but userId is null. Returning empty array.`);
        return [];
      }
      console.log(`[Action getEmployees] Employee role, attempting to fetch own profile for user: ${userId}`);
      let employeeProfile: Employee | null = null;
      try {
          employeeProfile = await getEmployeeProfileForCurrentUser(); // This already uses session internally
      } catch (e: any) {
          console.error(`[Action getEmployees] Error calling getEmployeeProfileForCurrentUser for user ${userId}:`, e.message, e.stack);
          throw new Error("Failed to retrieve your employee profile: " + e.message);
      }
      return employeeProfile ? [employeeProfile] : [];
    }
    console.log(`[Action getEmployees] Admin/Manager role, fetching all employees for tenant: ${tenantId}`);
    return dbGetAllEmployees(tenantId);
  } catch (dbError: any) {
      console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
       throw new Error(`Failed to fetch employees: ${dbError.message}`);
  }
}


export async function getEmployeeByIdAction(id: string): Promise<Employee | undefined> {
   let tenantId: string | null = null;
   let userRole: User['role'] | null = null;
   let currentUserId: string | null = null;
   let employeeProfile: Employee | undefined = undefined;

   try {
       const sessionData = await getSessionData();
       if (!sessionData) {
           console.error("[Action getEmployeeByIdAction] Failed to get session data.");
           throw new Error("Session data not found.");
       }
       tenantId = sessionData.tenantId;
       userRole = sessionData.userRole;
       currentUserId = sessionData.userId;

       if (!tenantId) throw new Error("Tenant ID missing from session data.");
       if (!userRole) throw new Error("User role missing from session data.");
       if (!currentUserId) throw new Error("User ID missing from session data.");

   } catch (e: any) {
       console.error("[Action getEmployeeByIdAction] Error fetching session data:", e.message, e.stack);
       throw new Error("Failed to retrieve session context: " + e.message);
   }

   console.log(`[Action getEmployeeByIdAction] Received ID param: ${id}`);
   console.log(`[Action getEmployeeByIdAction] Session - currentUserId: ${currentUserId}, tenantId: ${tenantId}, userRole: ${userRole}`);

   try {
      if (userRole === 'Employee') {
          if (id === currentUserId) {
              console.log(`[Action getEmployeeByIdAction] Employee role. Matched ID. Fetching own profile using dbGetEmployeeByUserId with userId: ${id}, tenantId: ${tenantId}`);
              employeeProfile = await dbGetEmployeeByUserId(id, tenantId); // id here is the userId
              if (employeeProfile) {
                  console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS for own profile. userId: ${id}, tenantId: ${tenantId}.`);
              } else {
                  console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED to find own profile. userId: ${id}, tenantId: ${tenantId}. This user may not have a linked employee record or there's a data mismatch.`);
              }
          } else {
              console.warn(`[Action getEmployeeByIdAction] Employee ${currentUserId} unauthorized attempt to fetch profile for employee.id/user.id ${id}.`);
              throw new Error("Unauthorized to view this employee profile.");
          }
      } else { // Admin or Manager
          console.log(`[Action getEmployeeByIdAction] Admin/Manager role. Fetching employee using dbGetEmployeeById with employee primary key id: ${id}, tenantId: ${tenantId}`);
          employeeProfile = await dbGetEmployeeById(id, tenantId); // id here is the employee_table_pk
          if (employeeProfile) {
              console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS for Admin/Manager. Employee ID: ${id}`);
          } else {
              console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED for Admin/Manager. Employee ID: ${id} not found in tenant ${tenantId}.`);
          }
      }

      if (!employeeProfile) {
        // This specific log for the "My Profile" case was already good.
        if (userRole === 'Employee' && id === currentUserId) {
             // Log already handled by the inner "FAILED" log.
        } else if (userRole !== 'Employee') {
            console.warn(`[Action getEmployeeByIdAction] Employee profile not found for id ${id} in tenant ${tenantId} (Admin/Manager view).`);
        }
        return undefined;
      }
      return employeeProfile;

   } catch (error: any) {
        console.error(`[Action getEmployeeByIdAction] Error processing request for employee ID ${id} (tenant: ${tenantId}):`, error.message, error.stack ? error.stack : '(No stack trace)');
        if (error.message === "Unauthorized to view this employee profile.") {
            throw error;
        }
        let friendlyMessage = "Failed to fetch employee details.";
        if (error.code && typeof error.code === 'string') { // e.g. DB errors
            friendlyMessage = `Database error (code ${error.code}) retrieving employee. Check server logs.`;
        } else if (error.message) {
            const prefix = "Error: ";
            friendlyMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        }
        throw new Error(friendlyMessage);
   }
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let tenantId: string | null = null;
   let isAdminUser = false;
   let tenantDomain: string | null = null;

   try {
       console.log("[Action addEmployee] Attempting to get session data...");
       const sessionData = await getSessionData();
       if (!sessionData) {
           console.error("[Action addEmployee] Session data not found.");
           throw new Error("Session data not found.");
       }
       tenantId = sessionData.tenantId;
       isAdminUser = sessionData.userRole === 'Admin' || sessionData.userRole === 'Manager';
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (addEmployee).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (addEmployee).");
       console.log(`[Action addEmployee] Session data retrieved: tenantId=${tenantId}, isAdminUser=${isAdminUser}, tenantDomain=${tenantDomain}`);

   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e.message, e.stack);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!isAdminUser) {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${await getUserRoleFromSession()}`); // Log the actual role
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);
   const validation = employeeSchema.omit({userId: true, employeeId: true, tenantId: true}).safeParse(formData);

  if (!validation.success) {
    console.error("[Action addEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  const { name, email, ...employeeDetails } = validation.data;

  try {
    console.log("[Action addEmployee] Validation successful. Creating user and employee...");

    const temporaryPassword = generateTemporaryPassword(12);
    console.log('[Action addEmployee] Generated temporary password length:', temporaryPassword.length);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    let newUser;
    try {
        newUser = await dbAddUser({
            tenantId,
            email,
            passwordHash,
            name,
            role: 'Employee',
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError.message, userError.stack);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.id}`);

    const newEmployee = await dbAddEmployeeInternal({
        ...employeeDetails,
        tenantId,
        userId: newUser.id,
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee record added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email}...`);
        // const emailSent = await sendEmployeeWelcomeEmail( // This function is in auth/actions
        //     tenantId,
        //     newEmployee.name,
        //     newEmployee.email,
        //     newEmployee.id,
        //     newEmployee.employeeId!,
        //     temporaryPassword,
        //     tenantDomain
        // );
        // For now, let's assume the auth/actions.sendEmployeeWelcomeEmail exists and works
        // If not, this would be a separate integration step.
        // Placeholder for actual call if it's moved back or refactored.
        // For now, we'll assume it's handled elsewhere or log a TODO.
        console.warn("[Action addEmployee] TODO: Ensure sendEmployeeWelcomeEmail from auth/actions is correctly invoked here if needed.");


    } catch (emailError: any) {
        console.error(`[Action addEmployee] Error calling sendEmployeeWelcomeEmail: ${emailError.message}`, emailError.stack);
    }

    revalidatePath(`/${tenantDomain}/employees`);
    revalidatePath(`/${tenantDomain}/dashboard`);

    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("[Action addEmployee] Caught error object:", error);
    if (error.stack) {
        console.error("[Action addEmployee] Error stack:", error.stack);
    }
    let errorMessage = "An unexpected error occurred while adding the employee. Please check server logs.";
    let errorPath: (string|number)[] = ['root'];
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        if (error.message.includes('Email address already exists')) errorPath = ['email'];
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }

     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let tenantId: string | null = null;
   let isAdminUser = false;
   let tenantDomain: string | null = null;
   try {
       const sessionData = await getSessionData();
       if (!sessionData) throw new Error("Session data not found.");
       tenantId = sessionData.tenantId;
       isAdminUser = sessionData.userRole === 'Admin' || sessionData.userRole === 'Manager';
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (updateEmployee).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (updateEmployee).");

   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e.message, e.stack);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!isAdminUser) {
       console.warn(`[Action updateEmployee] Unauthorized attempt to update employee ${id} for tenant ${tenantId}`);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update employees.' }] };
   }

   console.log(`[Action updateEmployee] Attempting to update employee ${id} for tenant: ${tenantId}`);

  const validation = employeeSchema.partial().omit({ tenantId: true, userId: true, employeeId: true }).safeParse(formData);

  if (!validation.success) {
     console.error("[Action updateEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    console.log("[Action updateEmployee] Validation successful. Calling dbUpdateEmployee...");
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, validation.data);
    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee ${id} updated successfully. Revalidating paths...`);

        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/employees/${id}`);
        revalidatePath(`/${tenantDomain}/employees/${id}/edit`);
        revalidatePath(`/${tenantDomain}/dashboard`);

      return { success: true, employee: updatedEmployee };
    } else {
       console.warn(`[Action updateEmployee] Employee ${id} not found for tenant ${tenantId} during update.`);
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found for this tenant' }] };
    }
  } catch (error: any) {
    console.error(`[Action updateEmployee] Error calling dbUpdateEmployee for ${id}:`, error.message, error.stack);
    let errorMessage = "Failed to update employee.";
    let errorPath: (string|number)[] = ['root'];
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
         if (error.message.includes('Email address already exists')) errorPath = ['email'];
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean; error?: string }> {
   let tenantId: string | null = null;
   let isAdminUser = false;
   let tenantDomain: string | null = null;
   try {
       const sessionData = await getSessionData();
       if (!sessionData) throw new Error("Session data not found.");
       tenantId = sessionData.tenantId;
       isAdminUser = sessionData.userRole === 'Admin' || sessionData.userRole === 'Manager';
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (deleteEmployeeAction).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (deleteEmployeeAction).");

   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e.message, e.stack);
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   if (!isAdminUser) {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} deleted successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee ${id} not found for tenant ${tenantId} during deletion.`);
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for ${id}:`, error.message, error.stack);
    let errorMessage = "Failed to delete employee.";
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
    return { success: false, error: errorMessage };
  }
}
