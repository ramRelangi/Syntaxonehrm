
'use server';

import type { Employee, UserRole } from '@/modules/employees/types';
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
    // sendEmployeeWelcomeEmail, // Called from auth/actions now
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db'; // Corrected import
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Verifying imported session functions...");
  if (typeof getTenantIdFromSession !== 'function') {
    console.error("[Action getEmployees] FATAL: getTenantIdFromSession is not a function!");
    throw new Error("Server configuration error: Session utility missing (getTenantIdFromSession).");
  }
  if (typeof getUserRoleFromSession !== 'function') {
    console.error("[Action getEmployees] FATAL: getUserRoleFromSession is not a function!");
    throw new Error("Server configuration error: Session utility missing (getUserRoleFromSession).");
  }
  if (typeof getUserIdFromSession !== 'function') {
    console.error("[Action getEmployees] FATAL: getUserIdFromSession is not a function!");
    throw new Error("Server configuration error: Session utility missing (getUserIdFromSession).");
  }

  let tenantId: string | null = null;
  let userRole: UserRole | null = null;
  let userId: string | null = null;

  try {
    tenantId = await getTenantIdFromSession();
    if (!tenantId) throw new Error("Tenant ID could not be determined from session (getEmployees).");
    console.log(`[Action getEmployees] Fetched tenantId: ${tenantId}`);

    userRole = await getUserRoleFromSession();
    if (!userRole) throw new Error("User role could not be determined from session (getEmployees).");
    console.log(`[Action getEmployees] Fetched userRole: ${userRole}`);

    userId = await getUserIdFromSession();
    // userId can be null if session is not fully established, but role/tenantId might still be needed
    console.log(`[Action getEmployees] Fetched userId: ${userId}`);

  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e);
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID: ${userId}`);

  try {
    if (userRole === 'Employee' && userId) {
      console.log(`[Action getEmployees] Employee role, fetching profile for user: ${userId}`);
      let employeeProfile: Employee | null = null;
      try {
          employeeProfile = await dbGetEmployeeByUserId(userId, tenantId);
      } catch (e: any) {
          console.error(`[Action getEmployees] Error calling dbGetEmployeeByUserId for user ${userId}, tenant ${tenantId}:`, e);
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


export async function getEmployeeById(id: string): Promise<Employee | undefined> {
   let tenantId: string | null = null;
   let userRole: UserRole | null = null;
   let currentUserId: string | null = null;

   try {
       const sessionData = await getSessionData();
       if (!sessionData) {
           throw new Error("Session data not found.");
       }
       tenantId = sessionData.tenantId;
       userRole = sessionData.userRole;
       currentUserId = sessionData.userId;

       if (!tenantId) throw new Error("Tenant ID missing from session data.");
       if (!userRole) throw new Error("User role missing from session data.");
       if (!currentUserId) throw new Error("User ID missing from session data.");

   } catch (e: any) {
       console.error("[Action getEmployeeById] Error fetching session data:", e.message, e.stack);
       throw new Error("Failed to retrieve session context: " + e.message);
   }

   console.log(`[Action getEmployeeById] Fetching employee with ID param: ${id} for tenant: ${tenantId}. Current user: ${currentUserId}, Role: ${userRole}`);

   try {
      const employeeProfile = await dbGetEmployeeById(id, tenantId);

      if (!employeeProfile) {
          console.warn(`[Action getEmployeeById] Employee not found for id ${id} in tenant ${tenantId}.`);
          return undefined;
      }

      if (userRole === 'Employee') {
          if (employeeProfile.userId !== currentUserId) {
              console.warn(`[Action getEmployeeById] Employee ${currentUserId} unauthorized attempt to fetch profile for employee.id ${id} (user_id mismatch: ${employeeProfile.userId} vs ${currentUserId}).`);
              throw new Error("Unauthorized to view this employee profile.");
          }
          console.log(`[Action getEmployeeById] Employee role user ${currentUserId} successfully fetched own profile using employee.id ${id}.`);
      } else {
          console.log(`[Action getEmployeeById] Admin/Manager ${currentUserId} successfully fetched employee by employee.id ${id}.`);
      }
      return employeeProfile;

   } catch (error: any) {
        console.error(`[Action getEmployeeById] Error processing request for employee ID ${id} (tenant: ${tenantId}):`, error);

        if (error.message === "Unauthorized to view this employee profile.") {
            throw error; // Re-throw specific auth error
        }
        // If it's a database error with a code, be more specific
        if (error.code && typeof error.code === 'string') {
            throw new Error(`Database error (code ${error.code}) while fetching employee. Please check server logs.`);
        }
        // If it's any other error with a message, use that message
        if (error.message) {
            // Avoid overly generic "Error: Error: ..."
            const prefix = "Error: ";
            const msg = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
            throw new Error(msg);
        }
        // Fallback generic error
        throw new Error("An unexpected server error occurred while fetching employee details.");
   }
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let tenantId: string | null = null;
   let isAdminUser = false;
   let tenantDomain: string | null = null;

   try {
       const sessionData = await getSessionData();
       if (!sessionData) throw new Error("Session data not found.");
       tenantId = sessionData.tenantId;
       isAdminUser = sessionData.userRole === 'Admin' || sessionData.userRole === 'Manager';
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (addEmployee).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (addEmployee).");

   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e.message, e.stack);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!isAdminUser) {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}`);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);
   const dataWithTenantIdForValidation = { ...formData, tenantId }; // Add tenantId for validation if schema expects it (it does not here)
   const validation = employeeSchema.omit({userId: true, employeeId: true, tenantId: true}).safeParse(formData); // Schema expects tenantId to be omitted

  if (!validation.success) {
    console.error("[Action addEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  const { name, email, ...employeeDetails } = validation.data;

  try {
    console.log("[Action addEmployee] Validation successful. Creating user and employee...");

    const temporaryPassword = generateTemporaryPassword(12);
    console.log('[Action addEmployee] Generated temporary password length:', temporaryPassword.length); // Log length
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    let newUser;
    try {
        newUser = await dbAddUser({ // This call is to auth/lib/db.ts
            tenantId, // Passed explicitly
            email,
            passwordHash,
            name,
            role: 'Employee', // Default role for new employees
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError.message, userError.stack);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }

    const newEmployee = await dbAddEmployeeInternal({
        ...employeeDetails,
        tenantId, // Passed explicitly
        userId: newUser.id, // Link to the newly created user
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    // Call sendEmployeeWelcomeEmail (from auth/actions)
    // This action needs tenantId, employeeName, employeeEmail, employeeSystemId (employee.id), employeeLoginId (employee.employee_id), temporaryPassword
    // It's currently defined in auth/actions.ts which means it can access session state.
    // For clarity, explicitly pass tenantDomain if needed by email construction,
    // but the action should resolve SMTP settings via tenantId.
    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email}...`);
        // sendEmployeeWelcomeEmail expects tenantDomain for URL construction, pass it from session
        const emailSent = await sendEmployeeWelcomeEmail(
            tenantId,
            newEmployee.name,
            newEmployee.email,
            newEmployee.id, // employeeSystemId (UUID)
            newEmployee.employeeId!, // employeeLoginId (e.g., EMP-001) - ensure it's not null/undefined
            temporaryPassword,
            tenantDomain // Pass tenantDomain for email URL construction
        );
        if (emailSent) {
            console.log(`[Action addEmployee] Welcome email for ${newEmployee.email} queued successfully.`);
        } else {
            console.warn(`[Action addEmployee] Welcome email for ${newEmployee.email} failed to send (logged by sendEmployeeWelcomeEmail).`);
            // Not treating email failure as a transaction rollback, but admin should be notified
        }
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
    // Provide a more specific error message if possible
    let errorMessage = "An unexpected error occurred while adding the employee.";
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }

     return { success: false, errors: [{ code: 'custom', path: ['email'], message: errorMessage }] };
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

  // Schema doesn't expect tenantId, userId, or employeeId in formData for update
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
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: errorMessage }] };
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
