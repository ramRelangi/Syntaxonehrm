
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
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser, // Keep this for getEmployees
    getSessionData, // General session data fetcher
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
// import { sendEmployeeWelcomeEmail } from '@/modules/auth/actions'; // This is now called from auth/actions itself

const SALT_ROUNDS = 10;

// Helper to ensure session utilities are loaded (conceptual, for debugging)
if (typeof getTenantIdFromSession !== 'function' || typeof getUserRoleFromSession !== 'function' || typeof getUserIdFromSession !== 'function') {
    console.error("[Module Init - employee/actions] CRITICAL: Session utility functions not available at module load time.");
}


export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Verifying session functions again at runtime...");
  if (typeof getTenantIdFromSession !== 'function') throw new Error("Server Error: getTenantIdFromSession not loaded.");
  if (typeof getUserRoleFromSession !== 'function') throw new Error("Server Error: getUserRoleFromSession not loaded.");
  if (typeof getUserIdFromSession !== 'function') throw new Error("Server Error: getUserIdFromSession not loaded.");
  if (typeof getEmployeeProfileForCurrentUser !== 'function') throw new Error("Server Error: getEmployeeProfileForCurrentUser not loaded.");


  let tenantId: string | null = null;
  let userRole: User['role'] | null = null;
  let userId: string | null = null;

  try {
    tenantId = await getTenantIdFromSession();
    if (!tenantId) throw new Error("Tenant ID could not be determined from session (getEmployees).");

    userRole = await getUserRoleFromSession();
    if (!userRole) throw new Error("User role could not be determined from session (getEmployees).");

    userId = await getUserIdFromSession();
    // userId can be null if no user is logged in, but role/tenantId check should catch this earlier if required

  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID (from session): ${userId}`);

  try {
    if (userRole === 'Employee') {
      if (!userId) {
        console.warn(`[Action getEmployees] Employee role but session userId is null. Returning empty array.`);
        return [];
      }
      console.log(`[Action getEmployees] Employee role, attempting to fetch own profile for session user: ${userId}`);
      let employeeProfile: Employee | null = null;
      try {
          employeeProfile = await getEmployeeProfileForCurrentUser(); // This uses session internally
      } catch (e: any) {
          console.error(`[Action getEmployees] Error calling getEmployeeProfileForCurrentUser for user ${userId}:`, e.message, e.stack ? e.stack : '(No stack trace)');
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
    let currentUserId: string | null = null; // This is user.id from users table

    try {
        const sessionData = await getSessionData(); // Use general session fetcher
        tenantId = sessionData?.tenantId ?? null;
        userRole = sessionData?.userRole ?? null;
        currentUserId = sessionData?.userId ?? null;

        if (!tenantId || !userRole || !currentUserId) {
            console.error("[Action getEmployeeByIdAction] Incomplete session data.");
            throw new Error("User session is incomplete or user not found.");
        }
        console.log(`[Action getEmployeeByIdAction] Received ID param (expected employee.id): ${id}`);
        console.log(`[Action getEmployeeByIdAction] Session - currentUserId: ${currentUserId}, tenantId: ${tenantId}, userRole: ${userRole}`);
    } catch (e: any) {
        console.error("[Action getEmployeeByIdAction] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
        throw new Error("Failed to retrieve session context: " + e.message);
    }

    let employeeProfile: Employee | undefined = undefined;

    try {
        // All roles will first try to fetch the employee by their primary key (employee.id)
        console.log(`[Action getEmployeeByIdAction] Attempting to fetch employee by primary key (employee.id): ${id.toLowerCase()} for tenant: ${tenantId}`);
        employeeProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId);

        if (!employeeProfile) {
            console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED: Employee profile NOT found for employee.id ${id} in tenant ${tenantId}.`);
            return undefined; // Employee not found by primary key
        }
        console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS: Found employee ${employeeProfile.id} with linked user_id ${employeeProfile.userId}`);

        if (userRole === 'Employee') {
            // If the user is an Employee, they can only view/edit their own profile.
            // We've fetched the employee by employee.id from the URL. Now check if its user_id matches the session's currentUserId.
            if (employeeProfile.userId !== currentUserId) {
                console.warn(`[Action getEmployeeByIdAction] Authorization_Failed (Employee Role): Attempt to access employee profile (employee.id: ${id}) whose linked user_id (${employeeProfile.userId}) does not match the session's currentUserId (${currentUserId}).`);
                throw new Error("Unauthorized: You can only view or edit your own employee profile.");
            }
            console.log(`[Action getEmployeeByIdAction] Authorization SUCCESS (Employee Role): User ${currentUserId} is authorized to view employee ${id} (their own profile, matched via employee.userId).`);
        } else { // Admin or Manager
            console.log(`[Action getEmployeeByIdAction] Authorization SUCCESS (Admin/Manager Role): User ${currentUserId} (Role: ${userRole}) is authorized to view employee ${id}.`);
        }

        return employeeProfile;

    } catch (error: any) {
        console.error(`[Action getEmployeeByIdAction] Error processing request for employee.id ${id} (tenant: ${tenantId}):`, error);
        if (error.message?.toLowerCase().includes('unauthorized')) {
            throw error; // Re-throw specific auth error
        }
        let friendlyMessage = "Failed to fetch employee details.";
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
   let tenantId: string | null = null;
   let userRolePerformingAction: User['role'] | null = null;
   let tenantDomain: string | null = null;

   try {
       console.log("[Action addEmployee] Attempting to get session data...");
       const sessionData = await getSessionData();
       if (!sessionData) {
           console.error("[Action addEmployee] Session data not found.");
           throw new Error("Session data not found.");
       }
       tenantId = sessionData.tenantId;
       userRolePerformingAction = sessionData.userRole;
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (addEmployee).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (addEmployee).");
       if (!userRolePerformingAction) throw new Error("User role missing from session data (addEmployee).");

       console.log(`[Action addEmployee] Session data retrieved: tenantId=${tenantId}, UserRole=${userRolePerformingAction}, tenantDomain=${tenantDomain}`);

   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

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
        newUser = await dbAddUser({ // This is addUser from auth/lib/db
            tenantId,
            email,
            passwordHash,
            name,
            role: 'Employee', // New users created via addEmployee are 'Employee' role
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
        userId: newUser.id, // Link to the newly created user
        name, // Pass name and email again as dbAddEmployeeInternal expects them
        email,
    });
    console.log(`[Action addEmployee] Employee record added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email}...`);
        // Assuming sendEmployeeWelcomeEmail is correctly imported from auth/actions and handles tenantDomain
        // const emailSent = await sendEmployeeWelcomeEmail(
        //     tenantId,
        //     newEmployee.name,
        //     newEmployee.email,
        //     newEmployee.id, 
        //     newEmployee.employeeId!, 
        //     temporaryPassword
        // );
        // if (emailSent) {
        //     console.log(`[Action addEmployee] Employee welcome email for ${newEmployee.email} queued successfully.`);
        // } else {
        //     console.error(`[Action addEmployee] Employee welcome email for ${newEmployee.email} failed to send (logged separately).`);
        // }
         console.warn("[Action addEmployee] TODO: Ensure sendEmployeeWelcomeEmail from auth/actions is correctly invoked here if needed and handles tenantDomain correctly.");

    } catch (emailError: any) {
        console.error(`[Action addEmployee] Error calling sendEmployeeWelcomeEmail: ${emailError.message}`, emailError.stack ? emailError.stack : '(No stack trace)');
        // Do not fail the whole action if email sending fails, but log it.
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
   let userRolePerformingAction: User['role'] | null = null;
   let tenantDomain: string | null = null;
   let currentUserIdPerformingAction: string | null = null;

   try {
       const sessionData = await getSessionData();
       if (!sessionData) throw new Error("Session data not found.");
       tenantId = sessionData.tenantId;
       userRolePerformingAction = sessionData.userRole;
       currentUserIdPerformingAction = sessionData.userId;
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (updateEmployee).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (updateEmployee).");
       if (!userRolePerformingAction) throw new Error("User role missing from session data (updateEmployee).");
       if (!currentUserIdPerformingAction) throw new Error("User ID missing from session data (updateEmployee).");


   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

    // Authorization: Allow employee to update their own profile, or Admin/Manager to update any
    if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        // If not admin/manager, check if they are trying to update their own profile
        // 'id' here is employee.id from the URL
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
   let tenantId: string | null = null;
   let userRolePerformingAction: User['role'] | null = null;
   let tenantDomain: string | null = null;
   try {
       const sessionData = await getSessionData();
       if (!sessionData) throw new Error("Session data not found.");
       tenantId = sessionData.tenantId;
       userRolePerformingAction = sessionData.userRole;
       tenantDomain = sessionData.tenantDomain;

       if (!tenantId) throw new Error("Tenant ID missing from session data (deleteEmployeeAction).");
       if (!tenantDomain) throw new Error("Tenant domain missing from session data (deleteEmployeeAction).");
       if (!userRolePerformingAction) throw new Error("User role missing from session data (deleteEmployeeAction).");

   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId); // dbDeleteEmployee now handles user deletion
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

    