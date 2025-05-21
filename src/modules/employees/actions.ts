
'use server';

import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployee,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getTenantIdFromSession, isAdminFromSession, getUserIdFromSession, getEmployeeProfileForCurrentUser } from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function getEmployees(): Promise<Employee[]> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
      console.error("[Action getEmployees] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
  }

  const userRole = await getUserRoleFromSession();
  const userId = await getUserIdFromSession();

  console.log(`[Action getEmployees] Fetching for tenant: ${tenantId}, Role: ${userRole}, UserID: ${userId}`);

  try {
    if (userRole === 'Employee' && userId) {
      const employeeProfile = await getEmployeeProfileForCurrentUser();
      return employeeProfile ? [employeeProfile] : [];
    }
    return dbGetAllEmployees(tenantId);
  } catch (dbError: any) {
      console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
       throw new Error(`Failed to fetch employees: ${dbError.message}`);
  }
}


export async function getEmployeeById(id: string): Promise<Employee | undefined> {
   const tenantId = await getTenantIdFromSession();
   if (!tenantId) {
      console.error("[Action getEmployeeById] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
   }
   console.log(`[Action getEmployeeById] Fetching employee ${id} for tenant: ${tenantId}`);
   try {
      // Additional check: if user is 'Employee', they should only fetch their own profile
      const userRole = await getUserRoleFromSession();
      const currentUserId = await getUserIdFromSession();
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
   const tenantId = await getTenantIdFromSession();
   if (!tenantId) {
       console.error("[Action addEmployee] Tenant ID could not be determined from session.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant context not found.' }] };
   }
   const isAdmin = await isAdminFromSession();
   if (!isAdmin) {
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

    const newEmployee = await dbAddEmployee({
        ...employeeDetails,
        tenantId,
        userId: newUser.id,
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}). Revalidating paths...`);

    try {
        if (newEmployee.employeeId) {
            console.log(`[Action addEmployee] Attempting to send welcome email to ${newEmployee.email} for employee ${newEmployee.employeeId}...`);
            // const emailSent = await sendEmployeeWelcomeEmail(tenantId, newEmployee.name, newEmployee.email, newEmployee.id, newEmployee.employeeId, temporaryPassword);
            // if (emailSent) {
            //     console.log(`[Action addEmployee] Welcome email successfully sent to ${newEmployee.email}`);
            // } else {
            //     console.error(`[Action addEmployee] Welcome email FAILED to send to ${newEmployee.email} (see previous logs in sendEmployeeWelcomeEmail for details).`);
            // }
        } else {
            console.error(`[Action addEmployee] Employee ID missing for new employee ${newEmployee.id}. Cannot send welcome email.`);
        }
    } catch (emailError: any) {
        console.error(`[Action addEmployee] Exception caught while trying to send welcome email to ${newEmployee.email}:`, emailError);
    }

    const sessionData = await getSessionData();
    const tenantDomain = sessionData?.tenantDomain;
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
   const tenantId = await getTenantIdFromSession();
   if (!tenantId) {
       console.error("[Action updateEmployee] Tenant ID could not be determined from session.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant context not found.' }] };
   }
   const isAdmin = await isAdminFromSession();
   if (!isAdmin) {
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
       const sessionData = await getSessionData();
       const tenantDomain = sessionData?.tenantDomain;
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
   const tenantId = await getTenantIdFromSession();
   if (!tenantId) {
       console.error("[Action deleteEmployeeAction] Tenant ID could not be determined from session.");
       return { success: false, error: 'Tenant context not found.' };
   }
   const isAdmin = await isAdminFromSession();
   if (!isAdmin) {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} deleted successfully. Revalidating paths...`);
       const sessionData = await getSessionData();
       const tenantDomain = sessionData?.tenantDomain;
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
