'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus } from '@/modules/leave/types'; // Updated import
import { leaveRequestSchema } from '@/modules/leave/types'; // Updated import
import {
  getAllLeaveRequests as dbGetAllLeaveRequests,
  getLeaveRequestById as dbGetLeaveRequestById,
  addLeaveRequest as dbAddLeaveRequest,
  updateLeaveRequest as dbUpdateLeaveRequest,
  deleteLeaveRequest as dbDeleteLeaveRequest,
  getAllLeaveTypes as dbGetAllLeaveTypes,
  getLeaveTypeById as dbGetLeaveTypeById,
  addLeaveType as dbAddLeaveType,
  updateLeaveType as dbUpdateLeaveType,
  deleteLeaveType as dbDeleteLeaveType,
  getLeaveBalancesForEmployee as dbGetLeaveBalances,
} from '@/modules/leave/lib/mock-db'; // Updated import
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

// Add action for adding leave types - omitted schema definition for brevity
export async function addLeaveTypeAction(formData: Omit<LeaveType, 'id'>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: z.ZodIssue[] }> {
  // Basic validation example (add zod schema in real app)
  if (!formData.name || !formData.name.trim()) {
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: 'Leave type name is required' }] };
  }

  try {
    const newLeaveType = dbAddLeaveType(formData);
    revalidatePath('/leave'); // Revalidate page where types are displayed/managed
    return { success: true, leaveType: newLeaveType };
  } catch (error) {
    console.error("Error adding leave type:", error);
    return { success: false };
  }
}

// Update action for leave types - omitted schema definition for brevity
export async function updateLeaveTypeAction(id: string, formData: Partial<Omit<LeaveType, 'id'>>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: z.ZodIssue[] }> {
   // Basic validation example
   if (formData.name !== undefined && !formData.name.trim()) {
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: 'Leave type name cannot be empty' }] };
   }

  try {
    const updatedLeaveType = dbUpdateLeaveType(id, formData);
    if (updatedLeaveType) {
      revalidatePath('/leave');
      return { success: true, leaveType: updatedLeaveType };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave type not found' }] };
    }
  } catch (error) {
    console.error("Error updating leave type:", error);
    return { success: false };
  }
}

// Delete action for leave types
export async function deleteLeaveTypeAction(id: string): Promise<{ success: boolean }> {
  try {
    // Consider adding checks here: can't delete if requests use this type?
    const deleted = dbDeleteLeaveType(id);
    if (deleted) {
      revalidatePath('/leave');
      return { success: true };
    } else {
      return { success: false }; // Not found or couldn't delete
    }
  } catch (error) {
    console.error("Error deleting leave type:", error);
    return { success: false };
  }
}


// --- Leave Balance Actions ---
export async function getEmployeeLeaveBalances(employeeId: string) {
    // Example action to fetch balances
    return dbGetLeaveBalances(employeeId);
}
