'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus, LeaveBalance } from '@/modules/leave/types';
import { leaveRequestSchema, refinedLeaveRequestSchema } from '@/modules/leave/types'; // Use refined schema for add
import {
  getAllLeaveRequests as dbGetAllLeaveRequests,
  getLeaveRequestById as dbGetLeaveRequestById,
  addLeaveRequest as dbAddLeaveRequest,
  updateLeaveRequestStatus as dbUpdateLeaveRequestStatus, // Use specific status update function
  cancelLeaveRequest as dbCancelLeaveRequest, // Use specific cancel function
  getAllLeaveTypes as dbGetAllLeaveTypes,
  getLeaveTypeById as dbGetLeaveTypeById,
  addLeaveType as dbAddLeaveType,
  updateLeaveType as dbUpdateLeaveType,
  deleteLeaveType as dbDeleteLeaveType,
  getLeaveBalancesForEmployee as dbGetLeaveBalances,
  runMonthlyAccrual as dbRunMonthlyAccrual, // Import accrual function
} from '@/modules/leave/lib/db'; // Import from the new DB file
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
// Import new session helpers from auth actions
import { getTenantIdFromSession, getUserIdFromSession, isAdminFromSession } from '@/modules/auth/actions';

// --- Leave Request Actions ---

export async function getLeaveRequests(filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) {
     console.error("[Action getLeaveRequests] Tenant ID could not be determined from session.");
     throw new Error("Tenant context not found.");
  }
  console.log(`[Action getLeaveRequests] Fetching for tenant ${tenantId}, filters:`, filters);
  // TODO: Authorization - Check if user can view these requests (e.g., only own requests unless admin/manager)
  try {
      return dbGetAllLeaveRequests(tenantId, filters);
  } catch (dbError: any) {
      console.error(`[Action getLeaveRequests] Database error for tenant ${tenantId}:`, dbError);
      if (dbError.code === '22P02' && dbError.message?.includes('uuid')) {
           throw new Error("Internal server error: Invalid identifier.");
      }
      throw new Error(`Failed to fetch leave requests: ${dbError.message}`);
  }
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | undefined> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) {
      console.error("[Action getLeaveRequestById] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
  }
  console.log(`[Action getLeaveRequestById] Fetching request ${id} for tenant ${tenantId}`);
  // TODO: Authorization - Check if user can view this specific request
  try {
      return dbGetLeaveRequestById(id, tenantId);
  } catch (dbError: any) {
       console.error(`[Action getLeaveRequestById] Database error for request ${id}, tenant ${tenantId}:`, dbError);
       throw new Error(`Failed to fetch leave request details: ${dbError.message}`);
   }
}

export async function addLeaveRequest(formData: Omit<LeaveRequestFormData, 'tenantId'>): Promise<{ success: boolean; request?: LeaveRequest; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  const employeeId = await getUserIdFromSession(); // Use new session helper
  if (!employeeId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Could not identify employee.' }] };

  // UUID validation is handled inside the DB layer now

  const dataWithContext = { ...formData, tenantId, employeeId };

  const validation = refinedLeaveRequestSchema.safeParse(dataWithContext); // Use refined schema

  if (!validation.success) {
    console.error("Add Leave Request Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    const newRequest = await dbAddLeaveRequest(validation.data);
    revalidatePath(`/${tenantId}/leave`); // Revalidate tenant-specific leave page
    revalidatePath(`/api/leave/balances/${employeeId}`); // Revalidate balance endpoint for the user
    return { success: true, request: newRequest };
  } catch (error: any) {
    console.error("Error adding leave request (action):", error);
    return { success: false, errors: [{ code: 'custom', path: ['endDate'], message: error.message || 'Failed to add leave request.' }] };
  }
}

export async function updateLeaveRequestStatus(
    id: string,
    status: 'Approved' | 'Rejected',
    comments?: string
): Promise<{ success: boolean; request?: LeaveRequest; errors?: { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  const approverId = await getUserIdFromSession(); // Use new session helper
  if (!approverId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Approver ID not found.' }] };

  // Authorization Check
  const isAdmin = await isAdminFromSession(); // Use new session helper
  if (!isAdmin) {
      return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to approve/reject requests.' }] };
  }

  if (!['Approved', 'Rejected'].includes(status)) {
     return { success: false, errors: [{ code: 'custom', path: ['status'], message: 'Invalid status update value.' }] };
  }

  try {
    // Pass tenantId and approverId to the DB function
    const updatedRequest = await dbUpdateLeaveRequestStatus(id, tenantId, status, comments, approverId);
    if (updatedRequest) {
      revalidatePath(`/${tenantId}/leave`);
      revalidatePath(`/api/leave/balances/${updatedRequest.employeeId}`); // Revalidate balance
      // TODO: Send notification email to employee
      return { success: true, request: updatedRequest };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave request not found or cannot be updated.' }] };
    }
  } catch (error: any) {
    console.error("Error updating leave request status (action):", error);
    return { success: false, errors: [{ code: 'custom', path: ['id'], message: error.message || 'Failed to update leave request status.' }] };
  }
}

export async function cancelLeaveRequest(id: string): Promise<{ success: boolean; error?: string }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, error: 'Tenant context not found.' };

  const userId = await getUserIdFromSession(); // Use new session helper
  if (!userId) return { success: false, error: 'Could not identify user.' };

  try {
    const updatedRequest = await dbCancelLeaveRequest(id, tenantId, userId);
    if (updatedRequest) {
        revalidatePath(`/${tenantId}/leave`);
        return { success: true };
    } else {
        return { success: false, error: 'Failed to cancel request (unexpected).' };
    }
  } catch (error: any) {
    console.error("Error cancelling leave request (action):", error);
    return { success: false, error: error.message || 'Failed to cancel leave request.' };
  }
}


// --- Leave Type Actions ---

export async function getLeaveTypes(): Promise<LeaveType[]> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) {
      console.error("[Action getLeaveTypes] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
   }
  // TODO: Authorization check if needed
  try {
      return dbGetAllLeaveTypes(tenantId);
  } catch (dbError: any) {
        console.error(`[Action getLeaveTypes] Database error for tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch leave types: ${dbError.message}`);
  }
}

export async function addLeaveTypeAction(formData: Omit<LeaveType, 'id' | 'tenantId'>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  // Authorization Check
  const isAdmin = await isAdminFromSession(); // Use new session helper
  if (!isAdmin) return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized.' }] };


   if (!formData.name || !formData.name.trim()) {
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: 'Leave type name is required' }] };
   }
   if (formData.defaultBalance !== undefined && formData.defaultBalance < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['defaultBalance'], message: 'Default balance cannot be negative' }] };
   }
    if (formData.accrualRate !== undefined && formData.accrualRate < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['accrualRate'], message: 'Accrual rate cannot be negative' }] };
   }

  const dataWithTenantId = { ...formData, tenantId };

  try {
    const newLeaveType = await dbAddLeaveType(dataWithTenantId);
    revalidatePath(`/${tenantId}/leave`);
    return { success: true, leaveType: newLeaveType };
  } catch (error: any) {
    console.error("Error adding leave type (action):", error);
    return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add leave type.' }] };
  }
}

export async function updateLeaveTypeAction(id: string, formData: Partial<Omit<LeaveType, 'id' | 'tenantId'>>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

   // Authorization Check
   const isAdmin = await isAdminFromSession(); // Use new session helper
   if (!isAdmin) return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized.' }] };


   if (formData.name !== undefined && !formData.name.trim()) {
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: 'Leave type name cannot be empty' }] };
   }
    if (formData.defaultBalance !== undefined && formData.defaultBalance < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['defaultBalance'], message: 'Default balance cannot be negative' }] };
   }
    if (formData.accrualRate !== undefined && formData.accrualRate < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['accrualRate'], message: 'Accrual rate cannot be negative' }] };
   }

  try {
    const updatedLeaveType = await dbUpdateLeaveType(id, tenantId, formData);
    if (updatedLeaveType) {
      revalidatePath(`/${tenantId}/leave`);
      return { success: true, leaveType: updatedLeaveType };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave type not found' }] };
    }
  } catch (error: any) {
    console.error("Error updating leave type (action):", error);
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to update leave type.' }] };
  }
}

export async function deleteLeaveTypeAction(id: string): Promise<{ success: boolean; error?: string }> {
  const tenantId = await getTenantIdFromSession(); // Use new session helper
  if (!tenantId) return { success: false, error: 'Tenant context not found.' };

   // Authorization Check
   const isAdmin = await isAdminFromSession(); // Use new session helper
   if (!isAdmin) return { success: false, error: 'Unauthorized.' };


  try {
    const deleted = await dbDeleteLeaveType(id, tenantId);
    if (deleted) {
      revalidatePath(`/${tenantId}/leave`);
      return { success: true };
    } else {
      return { success: false, error: 'Leave type not found.' };
    }
  } catch (error: any) {
    console.error("Error deleting leave type (action):", error);
    return { success: false, error: error.message || 'Failed to delete leave type.' };
  }
}


// --- Leave Balance Actions ---
export async function getEmployeeLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) {
       console.error("[Action getEmployeeLeaveBalances] Tenant ID could not be determined from session.");
       throw new Error("Tenant context not found.");
    }

     // UUID validation handled in DB layer

    console.log(`[Action getEmployeeLeaveBalances] Fetching balances for employee ${employeeId}, tenant ${tenantId}`);
    // TODO: Authorization - Check if user can view this employee's balances
    try {
        return dbGetLeaveBalances(tenantId, employeeId);
    } catch (dbError: any) {
         console.error(`[Action getEmployeeLeaveBalances] Database error for employee ${employeeId}, tenant ${tenantId}:`, dbError);
         if (dbError.code === '22P02' && dbError.message?.includes('uuid')) {
             throw new Error("Internal server error: Invalid identifier.");
         }
         throw new Error(`Failed to fetch leave balances: ${dbError.message}`);
    }
}

// --- Accrual Action ---
export async function runAccrualProcess(): Promise<{ success: boolean; error?: string }> {
    // Authorization: Should only be run by an admin or system process
    const isAdmin = await isAdminFromSession(); // Use new session helper
    if (!isAdmin) return { success: false, error: 'Unauthorized.' };

    console.log("Triggering accrual process via server action...");
    try {
        await dbRunMonthlyAccrual();
        revalidatePath('/leave', 'layout'); // Revalidate all leave pages across tenants
        return { success: true };
    } catch (error: any) {
        console.error("Error running accrual process (action):", error);
        return { success: false, error: error.message || 'Failed to run accrual process.' };
    }
}
