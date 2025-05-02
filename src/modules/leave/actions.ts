'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus, LeaveBalance } from '@/modules/leave/types';
import { leaveRequestSchema } from '@/modules/leave/types';
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
import { differenceInDays } from 'date-fns';

// --- Server Actions ---

// --- Leave Request Actions ---

export async function getLeaveRequests(filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
  return dbGetAllLeaveRequests(filters);
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | undefined> {
  return dbGetLeaveRequestById(id);
}

export async function addLeaveRequest(formData: LeaveRequestFormData): Promise<{ success: boolean; request?: LeaveRequest; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  // 'use server';
  const validation = leaveRequestSchema.safeParse(formData);

  if (!validation.success) {
    console.error("Add Leave Request Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    // The dbAddLeaveRequest now handles balance check and transaction
    const newRequest = await dbAddLeaveRequest(validation.data);
    revalidatePath('/leave'); // Revalidate leave page
    revalidatePath(`/api/leave/balances/${formData.employeeId}`); // Revalidate balance endpoint (if needed)
    return { success: true, request: newRequest };
  } catch (error: any) {
    console.error("Error adding leave request (action):", error);
    // Return specific error message (e.g., insufficient balance)
    return { success: false, errors: [{ code: 'custom', path: ['endDate'], message: error.message || 'Failed to add leave request.' }] };
  }
}

export async function updateLeaveRequestStatus(
    id: string,
    status: 'Approved' | 'Rejected', // Only allow these via this action
    comments?: string,
    approverId?: string // In real app, get from session
): Promise<{ success: boolean; request?: LeaveRequest; errors?: { code: string; path: string[]; message: string }[] }> {
  // 'use server';
  if (!['Approved', 'Rejected'].includes(status)) {
     return { success: false, errors: [{ code: 'custom', path: ['status'], message: 'Invalid status update value.' }] };
  }
  // TODO: Add role check - only admins/managers can approve/reject

  try {
    // The db function now handles transaction and balance adjustment
    const updatedRequest = await dbUpdateLeaveRequestStatus(id, status, comments, approverId /* Get from session */);
    if (updatedRequest) {
      revalidatePath('/leave');
      revalidatePath(`/api/leave/balances/${updatedRequest.employeeId}`); // Revalidate balance
      // TODO: Send notification email to employee
      return { success: true, request: updatedRequest };
    } else {
      // This case might be handled by db throwing an error now
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave request not found or cannot be updated.' }] };
    }
  } catch (error: any) {
    console.error("Error updating leave request status (action):", error);
    return { success: false, errors: [{ code: 'custom', path: ['id'], message: error.message || 'Failed to update leave request status.' }] };
  }
}

export async function cancelLeaveRequest(id: string, userId: string /* from session */): Promise<{ success: boolean; error?: string }> {
  // 'use server';
  try {
    const updatedRequest = await dbCancelLeaveRequest(id, userId /* from session */);
    if (updatedRequest) {
        revalidatePath('/leave');
        // Balance refund logic should be handled within dbCancelLeaveRequest if needed
        return { success: true };
    } else {
        // Should not happen if checks pass in db function
        return { success: false, error: 'Failed to cancel request (unexpected).' };
    }
  } catch (error: any) {
    console.error("Error cancelling leave request (action):", error);
    return { success: false, error: error.message || 'Failed to cancel leave request.' };
  }
}


// --- Leave Type Actions ---

export async function getLeaveTypes(): Promise<LeaveType[]> {
  return dbGetAllLeaveTypes();
}

export async function addLeaveTypeAction(formData: Omit<LeaveType, 'id'>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  // 'use server';
  // Add Zod schema validation here for formData
  // const validation = leaveTypeSchema.omit({id: true}).safeParse(formData);
  // if (!validation.success) { return ... }

   if (!formData.name || !formData.name.trim()) {
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: 'Leave type name is required' }] };
   }
   if (formData.defaultBalance !== undefined && formData.defaultBalance < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['defaultBalance'], message: 'Default balance cannot be negative' }] };
   }
    if (formData.accrualRate !== undefined && formData.accrualRate < 0) {
      return { success: false, errors: [{ code: 'custom', path: ['accrualRate'], message: 'Accrual rate cannot be negative' }] };
   }


  try {
    const newLeaveType = await dbAddLeaveType(formData);
    revalidatePath('/leave'); // Revalidate page where types are displayed/managed
    return { success: true, leaveType: newLeaveType };
  } catch (error: any) {
    console.error("Error adding leave type (action):", error);
    return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add leave type.' }] };
  }
}

export async function updateLeaveTypeAction(id: string, formData: Partial<Omit<LeaveType, 'id'>>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: { code: string; path: string[]; message: string }[] }> {
  // 'use server';
   // Add Zod validation for partial updates

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
    const updatedLeaveType = await dbUpdateLeaveType(id, formData);
    if (updatedLeaveType) {
      revalidatePath('/leave');
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
  // 'use server';
  try {
    // dbDeleteLeaveType now includes usage checks
    const deleted = await dbDeleteLeaveType(id);
    if (deleted) {
      revalidatePath('/leave');
      return { success: true };
    } else {
       // Should be caught by db function throwing error if in use
      return { success: false, error: 'Leave type not found.' };
    }
  } catch (error: any) {
    console.error("Error deleting leave type (action):", error);
    return { success: false, error: error.message || 'Failed to delete leave type.' };
  }
}


// --- Leave Balance Actions ---
export async function getEmployeeLeaveBalances(employeeId: string): Promise<LeaveBalance[]> {
    // This is mainly for reading data, often called via API routes from client
    return dbGetLeaveBalances(employeeId);
}

// --- Accrual Action ---
export async function runAccrualProcess(): Promise<{ success: boolean; error?: string }> {
    // 'use server'; // This might be triggered manually or by a scheduled task/cron job
    console.log("Triggering accrual process via server action...");
    try {
        await dbRunMonthlyAccrual();
        revalidatePath('/leave'); // Revalidate pages showing balances
        // Consider revalidating individual employee balance endpoints if they exist
        return { success: true };
    } catch (error: any) {
        console.error("Error running accrual process (action):", error);
        return { success: false, error: error.message || 'Failed to run accrual process.' };
    }
}
