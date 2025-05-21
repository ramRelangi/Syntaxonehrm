
'use server';

import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployeeInternal, // Renamed for clarity
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
    // sendEmployeeWelcomeEmail, // This is internal to auth/actions.ts now
} from '@/modules/auth/actions'; // Main import for session helpers
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
// Import sendEmployeeWelcomeEmail specifically if it were exported for direct use here
// For now, it's called internally by addEmployee if user creation is also there.

const SALT_ROUNDS = 10;

// Helper function to send welcome email, assuming it's exposed or handled
// For now, we'll assume the addEmployee flow will trigger this via auth/actions
// or a shared notification service if one were created.

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
   if (typeof getEmployeeProfileForCurrentUser !== 'function') {
    console.error("[Action getEmployees] FATAL: getEmployeeProfileForCurrentUser is not a function!");
    throw new Error("Server configuration error: Session utility missing (getEmployeeProfileForCurrentUser).");
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
  }


  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID: ${userId}`);

  try {
    if (userRole === 'Employee' && userId) {
      let employeeProfile: Employee | null = null;
      try {
          employeeProfile = await getEmployeeProfileForCurrentUser();
      } catch (e: any) {
          console.error("[Action getEmployees] Error calling getEmployeeProfileForCurrentUser:", e);
          throw new Error("Failed to retrieve employee profile: " + e.message);
      }
      return employeeProfile ? [employeeProfile] : [];
    }
    return dbGetAllEmployees(tenantId);
  } catch (dbError: any) {
      console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
       throw new Error(`Failed to fetch employees: ${dbError.message}`);
  }
}


export async function getEmployeeById(id: string): Promise<Employee | undefined> {
   let tenantId: string | null = null;
   try {
       tenantId = await getTenantIdFromSession();
   } catch (e: any) {
       console.error("[Action getEmployeeById] Error calling getTenantIdFromSession:", e);
       throw new Error("Failed to retrieve tenant context: " + e.message);
   }

   if (!tenantId) {
      console.error("[Action getEmployeeById] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
   }
   console.log(`[Action getEmployeeById] Fetching employee ${id} for tenant: ${tenantId}`);

   let userRole: UserRole | null = null;
   let currentUserId: string | null = null;
   try {
       userRole = await getUserRoleFromSession();
       currentUserId = await getUserIdFromSession();
   } catch (e: any) {
       console.error("[Action getEmployeeById] Error fetching user role or ID:", e);
       // Allow to proceed, but auth checks later might fail or be incomplete
   }


   try {
      if (userRole === 'Employee') {
          const ownProfile = await dbGetEmployeeByUserId(currentUserId!, tenantId);
          if (ownProfile && ownProfile.id === id) {
              return ownProfile;
          } else {
              console.warn(`[Action getEmployeeById] Employee role user ${currentUserId} attempted to fetch profile for ${id}. Denied.`);
              throw new Error("Unauthorized to view this employee profile.");
          }
      }
      return dbGetEmployeeById(id, tenantId);
   } catch (dbError: any) {
        console.error(`[Action getEmployeeById] Database error for employee ${id}, tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch employee details: ${dbError.message}`);
   }
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let tenantId: string | null = null;
   let isAdminUser = false;
   try {
       tenantId = await getTenantIdFromSession();
       isAdminUser = await isAdminFromSession();
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
   const dataWithTenantIdForValidation = { ...formData, tenantId }; // Use the resolved tenantId
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
        newUser = await dbAddUser({ // Using dbAddUser from auth/lib/db
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

    const newEmployee = await dbAddEmployeeInternal({ // Using dbAddEmployeeInternal from employees/lib/db
        ...employeeDetails,
        tenantId,
        userId: newUser.id,
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}). Revalidating paths...`);

    // The sendEmployeeWelcomeEmail is now called from auth/actions.ts after successful registration.
    // If we need to send it here too for direct employee addition by admin, we'd need to import it.
    // For now, assuming the primary welcome email flow is via user registration.
    // If an admin adds an employee, they might communicate password separately or we add an explicit "Send Welcome Email" button.
    // Let's call it from auth/actions.ts's sendEmployeeWelcomeEmail function.
    // This requires sendEmployeeWelcomeEmail to be exported from auth/actions.ts if it's not already.
    // For now, I will assume it's handled internally or will be a separate step.
    // If it IS exported (it seems it is not designed to be), the call would be:
    // await sendEmployeeWelcomeEmail(tenantId, newEmployee.name, newEmployee.email, newEmployee.id, newEmployee.employeeId!, temporaryPassword);
    // Given the previous error about getSessionData, it's safer to keep sendEmployeeWelcomeEmail internal to auth/actions.ts
    // or make it a fully self-contained action that gets tenantId itself.
    // Let's assume for now this is handled by the admin manually or a different process.

    let tenantDomain: string | null = null;
    try {
        const sessionData = await getSessionData();
        tenantDomain = sessionData?.tenantDomain;
    } catch (e: any) {
        console.warn("[Action addEmployee] Error fetching tenant domain for revalidation:", e);
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
   try {
       tenantId = await getTenantIdFromSession();
       isAdminUser = await isAdminFromSession();
   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   if (!tenantId) {
       console.error("[Action updateEmployee] Tenant ID could not be determined from session.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant context not found.' }] };
   }
   if (!isAdminUser) {
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
       let tenantDomain: string | null = null;
       try {
            const sessionData = await getSessionData();
            tenantDomain = sessionData?.tenantDomain;
       } catch (e: any) {
            console.warn("[Action updateEmployee] Error fetching tenant domain for revalidation:", e);
       }

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
   try {
       tenantId = await getTenantIdFromSession();
       isAdminUser = await isAdminFromSession();
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
       let tenantDomain: string | null = null;
       try {
            const sessionData = await getSessionData();
            tenantDomain = sessionData?.tenantDomain;
       } catch (e: any) {
            console.warn("[Action deleteEmployeeAction] Error fetching tenant domain for revalidation:", e);
       }
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
