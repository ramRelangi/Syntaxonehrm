
'use server';

import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployee,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getTenantIdFromSession, isAdminFromSession, addUser, sendEmployeeWelcomeEmail } from '@/modules/auth/actions';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils'; // Updated import path
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// --- Server Actions ---

export async function getEmployees(): Promise<Employee[]> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
      console.error("[Action getEmployees] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
  }
  console.log(`[Action getEmployees] Fetching employees for tenant: ${tenantId}`);
  try {
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
   const dataWithTenantIdForValidation = { ...formData, tenantId }; // For validating employeeSchema contextually
   const validation = employeeSchema.omit({userId: true, employeeId: true}).safeParse(dataWithTenantIdForValidation);

  if (!validation.success) {
    console.error("[Action addEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  const { name, email, ...employeeDetails } = validation.data;

  try {
    console.log("[Action addEmployee] Validation successful. Creating user and employee...");

    // 1. Create User account
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    let newUser;
    try {
        newUser = await addUser({
            tenantId,
            email, // Use validated email
            passwordHash,
            name, // Use validated name
            role: 'Employee',
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }

    // 2. Add Employee record, linking to the new user
    // dbAddEmployee expects tenantId and userId, and other validated data
    const newEmployee = await dbAddEmployee({
        ...employeeDetails, // Contains validated position, department, hireDate etc.
        tenantId,
        userId: newUser.id,
        name, // Pass validated name
        email, // Pass validated email
    });
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}). Revalidating paths...`);

    // 3. Send welcome email
    try {
        await sendEmployeeWelcomeEmail(tenantId, newEmployee.name, newEmployee.email, newEmployee.employeeId!, temporaryPassword);
        console.log(`[Action addEmployee] Welcome email initiated for ${newEmployee.email}`);
    } catch (emailError: any) {
        console.error(`[Action addEmployee] Failed to send welcome email to ${newEmployee.email}:`, emailError);
        // Log this error, but don't fail the whole operation if employee/user were created
        // Admin notification might be good here too
    }

    revalidatePath(`/${tenantId}/employees`);
    revalidatePath(`/${tenantId}/dashboard`);
    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("[Action addEmployee] Error calling dbAddEmployee or during overall process:", error);
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add employee due to a database error.' }] };
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

  // When updating, we don't expect tenantId, userId, or employeeId in the formData
  const validation = employeeSchema.partial().omit({ tenantId: true, userId: true, employeeId: true }).safeParse(formData);

  if (!validation.success) {
     console.error("[Action updateEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    console.log("[Action updateEmployee] Validation successful. Calling dbUpdateEmployee...");
    // dbUpdateEmployee takes tenantId explicitly and formData for other fields
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, validation.data);
    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee ${id} updated successfully. Revalidating paths...`);
      revalidatePath(`/${tenantId}/employees`);
      revalidatePath(`/${tenantId}/employees/${id}`);
      revalidatePath(`/${tenantId}/employees/${id}/edit`);
      revalidatePath(`/${tenantId}/dashboard`);
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
    // Future: Consider if deleting an employee should also deactivate/delete the associated user account.
    // For now, user_id in employees table is ON DELETE SET NULL.
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} deleted successfully. Revalidating paths...`);
      revalidatePath(`/${tenantId}/employees`);
      revalidatePath(`/${tenantId}/dashboard`);
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
