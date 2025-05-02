


import type { Employee } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployee,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
} from '@/modules/employees/lib/mock-db';
import { z } from 'zod';
// import { revalidatePath } from 'next/cache'; // No longer needed here

// --- These functions are now intended to be called by API routes ---

export async function getEmployees(): Promise<Employee[]> {
  // Simulate potential async delay
  // await new Promise(resolve => setTimeout(resolve, 50));
  return dbGetAllEmployees();
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
  // Simulate potential async delay
  // await new Promise(resolve => setTimeout(resolve, 50));
  return dbGetEmployeeById(id);
}

export async function addEmployee(formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
  const validation = employeeSchema.safeParse(formData);

  if (!validation.success) {
    return { success: false, errors: validation.error.errors };
  }

  try {
    // Simulate potential async delay
    // await new Promise(resolve => setTimeout(resolve, 100));
    const newEmployee = dbAddEmployee(validation.data);
    // revalidatePath('/employees'); // Revalidation handled by client-side cache invalidation
    return { success: true, employee: newEmployee };
  } catch (error) {
    console.error("Error adding employee:", error);
    // In a real app, you might return a more specific error message
    return { success: false }; // Consider adding error message detail here
  }
}

export async function updateEmployee(id: string, formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] }> {
   const validation = employeeSchema.safeParse(formData);

  if (!validation.success) {
    return { success: false, errors: validation.error.errors };
  }

  try {
    // Simulate potential async delay
    // await new Promise(resolve => setTimeout(resolve, 100));
    const updatedEmployee = dbUpdateEmployee(id, validation.data);
    if (updatedEmployee) {
      // revalidatePath('/employees'); // Invalidate list
      // revalidatePath(`/employees/${id}`); // Invalidate detail page
      // revalidatePath(`/employees/${id}/edit`); // Invalidate edit page
      return { success: true, employee: updatedEmployee };
    } else {
      // Handle case where employee might not be found during update
       return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found' }] };
    }
  } catch (error) {
    console.error("Error updating employee:", error);
    return { success: false }; // Consider adding error message detail here
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean }> {
  try {
    // Simulate potential async delay
    // await new Promise(resolve => setTimeout(resolve, 100));
    const deleted = dbDeleteEmployee(id);
    if (deleted) {
      // revalidatePath('/employees'); // Invalidate list
      // No need to revalidate detail/edit pages that will now 404
      return { success: true };
    } else {
      return { success: false }; // Employee not found
    }
  } catch (error) {
    console.error("Error deleting employee:", error);
    return { success: false }; // Consider adding error message detail here
  }
}
