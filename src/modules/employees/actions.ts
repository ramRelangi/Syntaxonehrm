
'use server';

import type { Employee, UserRole } from '@/modules/employees/types'; // Assuming UserRole is also defined/imported here or from auth
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployeeInternal,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId, // Ensure this is imported
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser, // This might not be needed if getEmployeeById handles the "own profile" case
    getSessionData,
    // sendEmployeeWelcomeEmail, // Now called internally by auth/actions
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
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
   if (typeof getEmployeeProfileForCurrentUser !== 'function') { // This function might be redundant now
    console.warn("[Action getEmployees] WARNING: getEmployeeProfileForCurrentUser might be redundant if getEmployeeById handles 'Employee' role correctly.");
    // throw new Error("Server configuration error: Session utility missing (getEmployeeProfileForCurrentUser).");
  }
  console.log("[Action getEmployees] All imported session functions appear to be functions.");


  let tenantId: string | null = null;
  try {
    tenantId = await getTenantIdFromSession();
  } catch (e: any) {
    console.error("[Action getEmployees] Error calling getTenantIdFromSession:", e);
    throw new Error("Failed to retrieve tenant context: " + e.message);
  }

  if (!tenantId) {
      console.error("[Action getEmployees] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
  }

  let userRole: UserRole | null = null;
  try {
    userRole = await getUserRoleFromSession();
  } catch (e: any) {
    console.error("[Action getEmployees] Error calling getUserRoleFromSession:", e);
    throw new Error("Failed to retrieve user role: " + e.message);
  }

  let userId: string | null = null;
  try {
      userId = await getUserIdFromSession();
  } catch (e: any) {
      console.error("[Action getEmployees] Error calling getUserIdFromSession:", e);
      // Continue, but user-specific logic might fail
  }


  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID: ${userId}`);

  try {
    if (userRole === 'Employee' && userId) {
      let employeeProfile: Employee | null = null;
      try {
          // For 'Employee' role, fetch their own profile using their userId
          employeeProfile = await dbGetEmployeeByUserId(userId, tenantId);
      } catch (e: any) {
          console.error("[Action getEmployees] Error calling dbGetEmployeeByUserId for 'Employee' role:", e);
          throw new Error("Failed to retrieve your employee profile: " + e.message);
      }
      return employeeProfile ? [employeeProfile] : [];
    }
    // For Admin/Manager, get all employees
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
   } catch (e: any) {
       console.error("[Action getEmployeeById] Error fetching session data:", e);
       throw new Error("Failed to retrieve session context: " + e.message);
   }

   if (!tenantId) {
      console.error("[Action getEmployeeById] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
   }
   console.log(`[Action getEmployeeById] Fetching employee with ID param: ${id} for tenant: ${tenantId}. Current user: ${currentUserId}, Role: ${userRole}`);

   try {
      if (userRole === 'Employee') {
          // If the logged-in user is an 'Employee', the 'id' parameter from the URL
          // for "My Profile" will be their userId.
          if (id === currentUserId) {
              console.log(`[Action getEmployeeById] Employee role user ${currentUserId} fetching own profile using userId ${id}.`);
              const employeeProfile = await dbGetEmployeeByUserId(id, tenantId);
              if (!employeeProfile) {
                  console.warn(`[Action getEmployeeById] Employee profile not found for user ${id} in tenant ${tenantId}.`);
                  return undefined;
              }
              return employeeProfile;
          } else {
              // Employee trying to access a different ID, which is not allowed if it's not their own user ID.
              console.warn(`[Action getEmployeeById] Employee ${currentUserId} unauthorized attempt to fetch profile for ID ${id}.`);
              throw new Error("Unauthorized to view this employee profile.");
          }
      } else { // Admin or Manager
          // Admins/Managers can fetch any employee by their direct employee.id (UUID of the employees table row)
          console.log(`[Action getEmployeeById] Admin/Manager ${currentUserId} fetching employee by employee.id ${id}.`);
          return dbGetEmployeeById(id, tenantId);
      }
   } catch (dbError: any) {
        console.error(`[Action getEmployeeById] Database error for ID ${id}, tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch employee details. Please check server logs.`);
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
       isAdminUser = sessionData.userRole === 'Admin' || sessionData.userRole === 'Manager'; // Allow Managers too
       tenantDomain = sessionData.tenantDomain;
   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!tenantId) {
       console.error("[Action addEmployee] Tenant ID could not be determined from session.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant context not found.' }] };
   }
   if (!isAdminUser) {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}`);
        return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);
   const dataWithTenantIdForValidation = { ...formData, tenantId };
   const validation = employeeSchema.omit({userId: true, employeeId: true}).safeParse(dataWithTenantIdForValidation);

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
        console.error("[Action addEmployee] Error creating user:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }

    const newEmployee = await dbAddEmployeeInternal({
        ...employeeDetails,
        tenantId,
        userId: newUser.id, // Link to the newly created user
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);
    console.log(`[Action addEmployee] Attempting to send welcome email to ${newEmployee.email}...`);
    // Call sendEmployeeWelcomeEmail (now an exported function from auth/actions)
    // sendEmployeeWelcomeEmail is an internal function to auth/actions, it's better to trigger it from there or make it more generic
    // For now, the log statement is already inside sendEmployeeWelcomeEmail if it's called
    // Directly calling here:
    if (tenantDomain && newEmployee.employeeId) { // Ensure tenantDomain and employeeId are available
        // await sendEmployeeWelcomeEmail(tenantId, newEmployee.name, newEmployee.email, newEmployee.id, newEmployee.employeeId, temporaryPassword);
        // Commenting out direct call if sendEmployeeWelcomeEmail is not exported or designed for this.
        // The welcome email logic is now primarily within auth/actions.ts itself during user creation.
        // If an admin adds an employee, a separate mechanism or UI action might be needed to send welcome.
        // For now, let's assume manual communication or a separate process.
        console.log(`[Action addEmployee] Welcome email process would be triggered here for ${newEmployee.email}`);
    } else {
        console.warn(`[Action addEmployee] Could not trigger welcome email due to missing tenantDomain or employeeId.`);
    }


    if(tenantDomain){
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/dashboard`);
    } else {
        console.warn("[Action addEmployee] Tenant domain not found in session for path revalidation.");
    }

    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("[Action addEmployee] Caught error object:", error);
    if (error.stack) {
        console.error("[Action addEmployee] Error stack:", error.stack);
    }
    const errorMessage = error.message || 'An unexpected error occurred while adding the employee. Please check server logs.';
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
   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!tenantId) {
       console.error("[Action updateEmployee] Tenant ID could not be determined from session.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant context not found.' }] };
   }
   if (!isAdminUser) { // TODO: Allow employees to edit their own profiles with restrictions
       console.warn(`[Action updateEmployee] Unauthorized attempt to update employee ${id} for tenant ${tenantId}`);
       return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to update employees.' }] };
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

        if(tenantDomain){
            revalidatePath(`/${tenantDomain}/employees`);
            revalidatePath(`/${tenantDomain}/employees/${id}`);
            revalidatePath(`/${tenantDomain}/employees/${id}/edit`);
            revalidatePath(`/${tenantDomain}/dashboard`);
        } else {
            console.warn("[Action updateEmployee] Tenant domain not found in session for path revalidation.");
        }
      return { success: true, employee: updatedEmployee };
    } else {
       console.warn(`[Action updateEmployee] Employee ${id} not found for tenant ${tenantId} during update.`);
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found for this tenant' }] };
    }
  } catch (error: any) {
    console.error(`[Action updateEmployee] Error calling dbUpdateEmployee for ${id}:`, error);
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to update employee due to a database error.' }] };
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
   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e);
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   if (!tenantId) {
       console.error("[Action deleteEmployeeAction] Tenant ID could not be determined from session.");
       return { success: false, error: 'Tenant context not found.' };
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
       if(tenantDomain){
            revalidatePath(`/${tenantDomain}/employees`);
            revalidatePath(`/${tenantDomain}/dashboard`);
       } else {
           console.warn("[Action deleteEmployeeAction] Tenant domain not found in session for path revalidation.");
       }
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee ${id} not found for tenant ${tenantId} during deletion.`);
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for ${id}:`, error);
    return { success: false, error: error.message || 'Failed to delete employee due to a database error.' };
  }
}
