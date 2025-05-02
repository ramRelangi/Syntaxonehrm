
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

// --- Server Actions ---

// These functions now require tenantId

export async function getEmployees(tenantId: string): Promise<Employee[]> {
  // No 'use server' needed here if only called by other server actions/components
  // TODO: Add authorization check: Ensure user has permission to view employees for this tenant
  if (!tenantId) throw new Error("Tenant ID is required.");
  return dbGetAllEmployees(tenantId);
}

export async function getEmployeeById(id: string, tenantId: string): Promise<Employee | undefined> {
  // No 'use server' needed here if only called by other server actions/components
  // TODO: Add authorization check
  if (!tenantId) throw new Error("Tenant ID is required.");
  return dbGetEmployeeById(id, tenantId);
}

export async function addEmployee(formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
  // 'use server'; // This action will be called from the client form
  if (!formData.tenantId) {
      return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing.' }] };
  }
  // TODO: Add authorization check: Ensure user has permission to add employees for this tenantId

  const validation = employeeSchema.safeParse(formData);

  if (!validation.success) {
    console.error("Add Employee Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    // dbAddEmployee now expects data including tenantId
    const newEmployee = await dbAddEmployee(validation.data);
    revalidatePath(`/${validation.data.tenantId}/employees`); // Revalidate tenant-specific path
    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("Error adding employee (action):", error);
    // Return specific error message if available (e.g., duplicate email)
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add employee.' }] };
  }
}

export async function updateEmployee(id: string, tenantId: string, formData: Partial<EmployeeFormData>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
 // 'use server'; // This action will be called from the client form
  if (!tenantId) {
      return { success: false, errors: [{ code: 'custom', path: ['tenantId'], message: 'Tenant ID is missing.' }] };
  }
  // TODO: Add authorization check

  // Exclude tenantId from formData before validation if it's present (shouldn't be changed)
  const { tenantId: _, ...updateData } = formData;

  // Use partial schema for updates, add tenantId back after validation if needed by DB layer
  // Or validate the full object including the correct tenantId
  const validation = employeeSchema.partial().safeParse({ ...updateData, tenantId }); // Validate with tenantId

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

export async function deleteEmployeeAction(id: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
  // 'use server'; // This action will be called from the client (e.g., data table)
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
