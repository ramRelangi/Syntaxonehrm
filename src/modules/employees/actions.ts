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

// These functions are intended to be called DIRECTLY from client components
// using the 'use server' directive.

export async function getEmployees(): Promise<Employee[]> {
  // No 'use server' needed here if only called by other server actions/components
  return dbGetAllEmployees();
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  // No 'use server' needed here if only called by other server actions/components
  return dbGetEmployeeById(id);
}

export async function addEmployee(formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
  // 'use server'; // This action will be called from the client form

  const validation = employeeSchema.safeParse(formData);

  if (!validation.success) {
    console.error("Add Employee Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    const newEmployee = await dbAddEmployee(validation.data);
    revalidatePath('/employees'); // Revalidate the employee list page
    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("Error adding employee (action):", error);
    // Return specific error message if available (e.g., duplicate email)
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add employee.' }] };
  }
}

export async function updateEmployee(id: string, formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
 // 'use server'; // This action will be called from the client form

  const validation = employeeSchema.safeParse(formData);

  if (!validation.success) {
     console.error("Update Employee Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    const updatedEmployee = await dbUpdateEmployee(id, validation.data);
    if (updatedEmployee) {
      revalidatePath('/employees'); // Invalidate list
      revalidatePath(`/employees/${id}`); // Invalidate detail page
      revalidatePath(`/employees/${id}/edit`); // Invalidate edit page
      return { success: true, employee: updatedEmployee };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found' }] };
    }
  } catch (error: any) {
    console.error("Error updating employee (action):", error);
     return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to update employee.' }] };
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean; error?: string }> {
  // 'use server'; // This action will be called from the client (e.g., data table)

  try {
    const deleted = await dbDeleteEmployee(id);
    if (deleted) {
      revalidatePath('/employees'); // Invalidate list
      return { success: true };
    } else {
      // Should not happen if called from UI where ID exists, but handle defensively
      return { success: false, error: 'Employee not found.' };
    }
  } catch (error: any) {
    console.error("Error deleting employee (action):", error);
    return { success: false, error: error.message || 'Failed to delete employee.' };
  }
}
