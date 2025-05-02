
'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus } from '@/types/leave';
import { leaveRequestSchema } from '@/types/leave';
import {
  getAllLeaveRequests as dbGetAllLeaveRequests,
  getLeaveRequestById as dbGetLeaveRequestById,
  addLeaveRequest as dbAddLeaveRequest,
  updateLeaveRequest as dbUpdateLeaveRequest,
  deleteLeaveRequest as dbDeleteLeaveRequest,
  getAllLeaveTypes as dbGetAllLeaveTypes,
  getLeaveTypeById as dbGetLeaveTypeById,
  getLeaveBalancesForEmployee as dbGetLeaveBalances, // Example usage
} from '@/lib/leave-mock-db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { differenceInDays } from 'date-fns';

// --- Leave Request Actions ---

export async function getLeaveRequests(filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
  return dbGetAllLeaveRequests(filters);
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | undefined> {
  return dbGetLeaveRequestById(id);
}

export async function addLeaveRequest(formData: LeaveRequestFormData): Promise<{ success: boolean; request?: LeaveRequest; errors?: z.ZodIssue[] }> {
  const validation = leaveRequestSchema.safeParse(formData);

  if (!validation.success) {
    return { success: false, errors: validation.error.errors };
  }

  // Additional business logic checks (e.g., balance check) could go here
  // const balances = await dbGetLeaveBalances(validation.data.employeeId);
  // const leaveType = await dbGetLeaveTypeById(validation.data.leaveTypeId);
  // const requestedDays = differenceInDays(new Date(validation.data.endDate), new Date(validation.data.startDate)) + 1;
  // const relevantBalance = balances.find(b => b.leaveTypeId === validation.data.leaveTypeId);
  // if (leaveType?.requiresApproval && relevantBalance && relevantBalance.balance < requestedDays) {
  //   return { success: false, errors: [{ code: 'custom', path: ['endDate'], message: 'Insufficient leave balance' }] };
  // }

  try {
    const newRequest = dbAddLeaveRequest(validation.data);
    revalidatePath('/leave'); // Revalidate the main leave page
    // Optionally revalidate employee-specific views if they exist
    return { success: true, request: newRequest };
  } catch (error: any) {
    console.error("Error adding leave request:", error);
    return { success: false, errors: [{ code: 'custom', path: [''], message: error.message || 'Failed to add leave request.' }] };
  }
}

export async function updateLeaveRequestStatus(
    id: string,
    status: LeaveRequestStatus,
    comments?: string,
    approverId?: string // In real app, get from session
): Promise<{ success: boolean; request?: LeaveRequest; errors?: z.ZodIssue[] }> {
  if (!['Approved', 'Rejected', 'Cancelled'].includes(status)) {
     return { success: false, errors: [{ code: 'custom', path: ['status'], message: 'Invalid status update.' }] };
  }

  // Add more validation? E.g., only pending requests can be approved/rejected

  try {
    const updatedRequest = dbUpdateLeaveRequest(id, { status, comments, approverId });
    if (updatedRequest) {
      revalidatePath('/leave'); // Revalidate list
      // Revalidate detail page if exists: revalidatePath(`/leave/${id}`);
      return { success: true, request: updatedRequest };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave request not found or cannot be updated.' }] };
    }
  } catch (error) {
    console.error("Error updating leave request status:", error);
    return { success: false };
  }
}


export async function cancelLeaveRequest(id: string): Promise<{ success: boolean }> {
    // This might need role checks in a real app (employee can cancel pending, admin maybe others)
     try {
        // Attempt to update status to 'Cancelled'. dbUpdateLeaveRequest might have internal logic
        // OR use a dedicated cancel function if needed.
        // For simplicity, we allow direct update if the request exists and is pending.
        const request = await dbGetLeaveRequestById(id);
        if (request?.status === 'Pending') {
             const updated = dbUpdateLeaveRequest(id, { status: 'Cancelled' });
             if (updated) {
                revalidatePath('/leave');
                return { success: true };
             }
        }
         // If not pending or not found
        return { success: false };
    } catch (error) {
        console.error("Error cancelling leave request:", error);
        return { success: false };
    }
}


// --- Leave Type Actions ---

export async function getLeaveTypes(): Promise<LeaveType[]> {
  return dbGetAllLeaveTypes();
}

// Add/Update/Delete actions for Leave Types would follow a similar pattern
// For simplicity, they are omitted in this step, assuming types are pre-configured.

// --- Leave Balance Actions ---
export async function getEmployeeLeaveBalances(employeeId: string) {
    // Example action to fetch balances
    return dbGetLeaveBalances(employeeId);
}
```