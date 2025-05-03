
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
import { revalidatePath } from 'next/cache'; // Keep revalidatePath for server actions
import { getTenantIdFromAuth } from '@/lib/auth'; // Import auth helper

// --- Server Actions ---

// These functions now require tenantId

export async function getEmployees(): Promise<Employee[]> {
  // TODO: Add authorization check: Ensure user has permission to view employees for this tenant
  const tenantId = await getTenantIdFromAuth();
  if (!tenantId) throw new Error("Tenant ID is required.");
  return dbGetAllEmployees(tenantId);
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  // TODO: Add authorization check
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) throw new Error("Tenant ID is required.");
  return dbGetEmployeeById(id, tenantId);
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing.' }] };
   }
  // TODO: Add authorization check: Ensure user has permission to add employees for this tenantId
   const dataWithTenantId = { ...formData, tenantId };
  const validation = employeeSchema.safeParse(dataWithTenantId);

  if (!validation.success) {
    console.error("Add Employee Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    // dbAddEmployee now expects data including tenantId
    const newEmployee = await dbAddEmployee(validation.data);
    revalidatePath(`/${tenantId}/employees`); // Revalidate tenant-specific path
    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("Error adding employee (action):", error);
    // Return specific error message if available (e.g., duplicate email)
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add employee.' }] };
  }
}

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'tenantId'>>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing.' }] };
   }
  // TODO: Add authorization check

  // Validate the partial update data along with the correct tenantId
  const validation = employeeSchema.partial().safeParse({ ...formData, tenantId }); // Validate with tenantId

  if (!validation.success) {
     console.error("Update Employee Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    // dbUpdateEmployee expects id, tenantId, and the updates object
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, validation.data);
    if (updatedEmployee) {
      revalidatePath(`/${tenantId}/employees`); // Invalidate list
      revalidatePath(`/${tenantId}/employees/${id}`); // Invalidate detail page
      revalidatePath(`/${tenantId}/employees/${id}/edit`); // Invalidate edit page
      return { success: true, employee: updatedEmployee };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found for this tenant' }] };
    }
  } catch (error: any) {
    console.error("Error updating employee (action):", error);
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to update employee.' }] };
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean; error?: string }> {
   const tenantId = await getTenantIdFromAuth();
   if (!tenantId) {
       return { success: false, error: 'Tenant ID is required.' };
   }
   // TODO: Add authorization check

  try {
    // Pass tenantId to DB function for verification
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
      revalidatePath(`/${tenantId}/employees`); // Invalidate list
      return { success: true };
    } else {
      // Employee not found for this tenant
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error("Error deleting employee (action):", error);
    return { success: false, error: error.message || 'Failed to delete employee.' };
  }
}
