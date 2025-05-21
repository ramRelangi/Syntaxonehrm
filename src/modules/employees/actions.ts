
'use server';

import type { Employee, User } from '@/modules/employees/types'; // Ensure User type is imported if used for role
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
    getSessionData, // Use the general session data fetcher
    sendEmployeeWelcomeEmail,
    // Ensure these specific helpers are also available if used directly elsewhere, though getSessionData is preferred
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser,
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Initiating fetch.");
  let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;

  try {
    sessionData = await getSessionData();
    if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.userId) {
      console.error("[Action getEmployees] Incomplete session data:", sessionData);
      throw new Error("Incomplete session data. TenantId, UserRole, or UserId is missing.");
    }
    console.log(`[Action getEmployees] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, userId=${sessionData.userId}`);
  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  const { tenantId, userRole, userId } = sessionData;

  try {
    if (userRole === 'Employee') {
      console.log(`[Action getEmployees] Employee role, attempting to fetch own profile for session user: ${userId}`);
      const employeeProfile = await dbGetEmployeeByUserId(userId, tenantId); // Directly use db function
      if (employeeProfile) {
        console.log(`[Action getEmployees] Found own profile for employee ${userId}.`);
        return [employeeProfile];
      } else {
        console.warn(`[Action getEmployees] No profile found for employee ${userId} in tenant ${tenantId}. Returning empty array.`);
        return [];
      }
    }
    console.log(`[Action getEmployees] Admin/Manager role, fetching all employees for tenant: ${tenantId}`);
    const employees = await dbGetAllEmployees(tenantId);
    console.log(`[Action getEmployees] Fetched ${employees.length} employees for tenant ${tenantId}.`);
    return employees;
  } catch (dbError: any) {
    console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
    throw new Error(`Failed to fetch employees from database: ${dbError.message}`);
  }
}

export async function getEmployeeByIdAction(id: string): Promise<Employee | undefined> {
  console.log(`[Action getEmployeeByIdAction] Initiating fetch for employee/user ID: ${id}`);
  let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;

  try {
    sessionData = await getSessionData();
    if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.userId) {
      console.error("[Action getEmployeeByIdAction] Incomplete session data:", sessionData);
      throw new Error("Incomplete session data. TenantId, UserRole, or UserId is missing.");
    }
    console.log(`[Action getEmployeeByIdAction] Session data: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, currentUserId=${sessionData.userId}`);
  } catch (e: any) {
    console.error("[Action getEmployeeByIdAction] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  const { tenantId, userRole, userId: currentUserId } = sessionData;
  const requestedIdLower = id.toLowerCase(); // For comparison

  try {
    let employeeProfile: Employee | undefined;

    if (userRole === 'Employee') {
      console.log(`[Action getEmployeeByIdAction] Employee role. URL param id (expected userId): ${id}. Session currentUserId: ${currentUserId}`);
      if (requestedIdLower !== currentUserId.toLowerCase()) {
        console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access profile for ID ${id} which does not match session userId ${currentUserId}.`);
        throw new Error("Unauthorized: You can only view your own employee profile.");
      }
      console.log(`[Action getEmployeeByIdAction] Employee role. Matched ID. Fetching own profile using dbGetEmployeeByUserId with userId: ${currentUserId}, tenantId: ${tenantId}`);
      employeeProfile = await dbGetEmployeeByUserId(currentUserId, tenantId);
      if (employeeProfile) {
        console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS: Found profile for user ${currentUserId}. Employee ID: ${employeeProfile.id}, Linked User ID on record: ${employeeProfile.userId}`);
      } else {
        console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED: Profile NOT found by dbGetEmployeeByUserId for user ${currentUserId} in tenant ${tenantId}.`);
      }
    } else { // Admin or Manager
      console.log(`[Action getEmployeeByIdAction] Admin/Manager role. Fetching employee by primary key (employee.id): ${id} for tenant: ${tenantId}`);
      employeeProfile = await dbGetEmployeeById(id, tenantId); // id here is employee.id (primary key)
      if (employeeProfile) {
        console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS: Found employee ${employeeProfile.id} with linked user_id ${employeeProfile.userId}`);
      } else {
        console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED: Employee profile NOT found for employee.id ${id} in tenant ${tenantId}.`);
      }
    }

    if (!employeeProfile) {
      console.warn(`[Action getEmployeeByIdAction] Final check: Employee profile not found for ID ${id} (context role: ${userRole}).`);
      return undefined;
    }
    return employeeProfile;

  } catch (error: any) {
    console.error(`[Action getEmployeeByIdAction] Error processing request for ID ${id} (tenant: ${tenantId}):`, error);
    if (error.message?.toLowerCase().includes('unauthorized')) {
      throw error;
    }
    let friendlyMessage = `Failed to fetch employee details for ID ${id}.`;
    if (error.code && typeof error.code === 'string') {
      friendlyMessage = `Database error (code ${error.code}) retrieving employee. Check server logs.`;
    } else if (error.message) {
      const prefix = "Error: ";
      friendlyMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
    }
    throw new Error(friendlyMessage);
  }
}


export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;

   try {
       console.log("[Action addEmployee] Attempting to get session data...");
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.tenantDomain) {
           console.error("[Action addEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data. TenantId, UserRole, or TenantDomain is missing.");
       }
       console.log(`[Action addEmployee] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, tenantDomain=${sessionData.tenantDomain}`);
   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRole: userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${userRolePerformingAction}`);
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
        console.error("[Action addEmployee] Error creating user in users table:", userError.message, userError.stack ? userError.stack : '(No stack trace)');
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
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email} to ${tenantDomain}...`);
        const emailSent = await sendEmployeeWelcomeEmail(
            tenantId,
            newEmployee.name,
            newEmployee.email,
            newEmployee.id,
            newEmployee.employeeId!,
            temporaryPassword,
            tenantDomain // Pass tenantDomain
        );
        if (emailSent) {
            console.log(`[Action addEmployee] Employee welcome email for ${newEmployee.email} queued successfully.`);
        } else {
            console.error(`[Action addEmployee] Employee welcome email for ${newEmployee.email} failed to send (logged separately).`);
        }
    } catch (emailError: any) {
        console.error(`[Action addEmployee] Error calling sendEmployeeWelcomeEmail: ${emailError.message}`, emailError.stack ? emailError.stack : '(No stack trace)');
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
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.userId || !sessionData?.tenantDomain) {
           console.error("[Action updateEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e.message);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRole: userRolePerformingAction, userId: currentUserIdPerformingAction, tenantDomain } = sessionData;

    if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId);
        if (!employeeToUpdate || employeeToUpdate.userId !== currentUserIdPerformingAction) {
            console.warn(`[Action updateEmployee] Unauthorized attempt by user ${currentUserIdPerformingAction} to update employee ${id}`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee.' }] };
        }
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
    console.error(`[Action updateEmployee] Error calling dbUpdateEmployee for ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
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
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.tenantDomain) {
            console.error("[Action deleteEmployeeAction] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e.message);
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   const { tenantId, userRole: userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} (and associated user if any) deleted successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee ${id} not found for tenant ${tenantId} during deletion.`);
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
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
