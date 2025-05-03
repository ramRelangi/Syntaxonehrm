'use server';

import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployee,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
} from '@/modules/employees/lib/db'; // Import from the new DB file
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getTenantIdFromAuth, isUserAdmin } from '@/lib/auth'; // Import auth helpers

// --- Server Actions ---

export async function getEmployees(): Promise<Employee[]> {
  // Get tenant ID and handle potential errors immediately
  const tenantId = await getTenantIdFromAuth();
  if (!tenantId) {
      console.error("[Action getEmployees] Tenant ID could not be determined from auth.");
      throw new Error("Tenant ID is required."); // Throw error if tenant ID is missing
  }
  console.log(`[Action getEmployees] Fetching employees for tenant: ${tenantId}`);

  // TODO: Add authorization check: Ensure user has permission to view employees
  // Example:
  // const canView = await checkUserPermission(userId, tenantId, 'view_employees');
  // if (!canView) throw new Error("Unauthorized to view employees.");

  try {
     return dbGetAllEmployees(tenantId);
  } catch (dbError: any) {
      console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
       // Re-throw a potentially more generic error or the original one
       throw new Error(`Failed to fetch employees: ${dbError.message}`);
  }
}


export async function getEmployeeById(id: string): Promise<Employee | undefined> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
      console.error("[Action getEmployeeById] Tenant ID could not be determined from auth.");
      throw new Error("Tenant ID is required.");
   }
   console.log(`[Action getEmployeeById] Fetching employee ${id} for tenant: ${tenantId}`);
   // TODO: Add authorization check
   try {
      return dbGetEmployeeById(id, tenantId);
   } catch (dbError: any) {
        console.error(`[Action getEmployeeById] Database error for employee ${id}, tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch employee details: ${dbError.message}`);
   }
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       console.error("[Action addEmployee] Tenant ID could not be determined from auth.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing or authentication failed.' }] };
   }
   // TODO: Add authorization check: Ensure user has permission to add employees for this tenantId
   const isAdmin = await isUserAdmin(); // Example check
   if (!isAdmin) {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}`);
        return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);
   const dataWithTenantId = { ...formData, tenantId }; // Add tenantId derived from auth
   const validation = employeeSchema.safeParse(dataWithTenantId);

  if (!validation.success) {
    console.error("[Action addEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    console.log("[Action addEmployee] Validation successful. Calling dbAddEmployee...");
    // dbAddEmployee now expects data including tenantId
    const newEmployee = await dbAddEmployee(validation.data);
    console.log(`[Action addEmployee] Employee added successfully (ID: ${newEmployee.id}). Revalidating paths...`);
    // Revalidate tenant-specific paths using the actual tenantId
    revalidatePath(`/${tenantId}/employees`); // Adjust path based on tenant routing if needed
    revalidatePath('/dashboard'); // Revalidate dashboard as employee count might change
    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("[Action addEmployee] Error calling dbAddEmployee:", error);
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add employee due to a database error.' }] };
  }
}

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'tenantId'>>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       console.error("[Action updateEmployee] Tenant ID could not be determined from auth.");
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing or authentication failed.' }] };
   }
   // TODO: Add authorization check
   const isAdmin = await isUserAdmin();
   if (!isAdmin) {
       console.warn(`[Action updateEmployee] Unauthorized attempt to update employee ${id} for tenant ${tenantId}`);
       return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to update employees.' }] };
   }

   console.log(`[Action updateEmployee] Attempting to update employee ${id} for tenant: ${tenantId}`);

  const validation = employeeSchema.partial().omit({ tenantId: true }).safeParse(formData); // Omit tenantId for validation

  if (!validation.success) {
     console.error("[Action updateEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    console.log("[Action updateEmployee] Validation successful. Calling dbUpdateEmployee...");
    // dbUpdateEmployee expects id, tenantId, and the updates object
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, validation.data); // Pass validation.data which excludes tenantId
    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee ${id} updated successfully. Revalidating paths...`);
      // Revalidate tenant-specific paths
      revalidatePath(`/${tenantId}/employees`); // Adjust path based on tenant routing if needed
      revalidatePath(`/${tenantId}/employees/${id}`);
      revalidatePath(`/${tenantId}/employees/${id}/edit`);
      revalidatePath('/dashboard'); // Revalidate dashboard
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
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       console.error("[Action deleteEmployeeAction] Tenant ID could not be determined from auth.");
       return { success: false, error: 'Tenant ID is required or authentication failed.' };
   }
   // TODO: Add authorization check
   const isAdmin = await isUserAdmin();
   if (!isAdmin) {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    // Pass tenantId to DB function for verification
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} deleted successfully. Revalidating paths...`);
      // Revalidate tenant-specific paths
      revalidatePath(`/${tenantId}/employees`); // Adjust path based on tenant routing if needed
      revalidatePath('/dashboard'); // Revalidate dashboard
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee ${id} not found for tenant ${tenantId} during deletion.`);
      // Employee not found for this tenant
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for ${id}:`, error);
    return { success: false, error: error.message || 'Failed to delete employee due to a database error.' };
  }
}
