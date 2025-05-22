
'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus, LeaveBalance, Holiday, HolidayFormData } from '@/modules/leave/types';
import { leaveRequestSchema, refinedLeaveRequestSchema, holidaySchema } from '@/modules/leave/types'; // Use refined schema for add, add holiday schema
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
  getAllHolidays as dbGetAllHolidays, // Import holiday functions
  addHoliday as dbAddHoliday,
  updateHoliday as dbUpdateHoliday,
  deleteHoliday as dbDeleteHoliday,
} from '@/modules/leave/lib/db'; // Import from the new DB file
import { getEmployeeByUserId as dbGetEmployeeByUserId } from '@/modules/employees/lib/db'; // Import this to get employee PK
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
// Import new session helpers from auth actions
import { getTenantIdFromSession, getUserIdFromSession, isAdminFromSession, _parseSessionCookie } from '@/modules/auth/actions';

// --- Helper Functions ---
// No longer needed here as actions will call auth helpers directly

// --- Leave Request Actions ---

export async function getLeaveRequestsAction(filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
     console.error("[Action getLeaveRequestsAction] Tenant ID could not be determined from session.");
     throw new Error("Tenant context not found.");
  }
  console.log(`[Action getLeaveRequestsAction] Fetching for tenant ${tenantId}, filters:`, filters);
  try {
      return dbGetAllLeaveRequests(tenantId, filters);
  } catch (dbError: any) {
      console.error(`[Action getLeaveRequestsAction] Database error for tenant ${tenantId}:`, dbError);
      if (dbError.code === '22P02' && dbError.message?.includes('uuid')) {
           throw new Error("Internal server error: Invalid identifier.");
      }
      throw new Error(`Failed to fetch leave requests: ${dbError.message}`);
  }
}

export async function getLeaveRequestByIdAction(id: string): Promise<LeaveRequest | undefined> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
      console.error("[Action getLeaveRequestByIdAction] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
  }
  console.log(`[Action getLeaveRequestByIdAction] Fetching request ${id} for tenant ${tenantId}`);
  try {
      return dbGetLeaveRequestById(id, tenantId);
  } catch (dbError: any) {
       console.error(`[Action getLeaveRequestByIdAction] Database error for request ${id}, tenant ${tenantId}:`, dbError);
       throw new Error(`Failed to fetch leave request details: ${dbError.message}`);
   }
}

export async function addLeaveRequestAction(formData: Omit<LeaveRequestFormData, 'tenantId' | 'employeeId'>): Promise<{ success: boolean; request?: LeaveRequest; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  const userId = await getUserIdFromSession(); // This is the user_id
  if (!userId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Could not identify employee.' }] };

  // Fetch the employee's primary key (employees.id)
  const employeeProfile = await dbGetEmployeeByUserId(userId, tenantId);
  if (!employeeProfile) {
    console.error(`[Action addLeaveRequestAction] No employee profile found for userId ${userId} in tenant ${tenantId}.`);
    return { success: false, errors: [{ code: 'custom', path: ['employeeId'], message: 'Employee profile not found.' }] };
  }
  const employeePrimaryKey = employeeProfile.id; // This is the employees.id to be used

  const dataWithContext = { ...formData, tenantId, employeeId: employeePrimaryKey };

  const validation = refinedLeaveRequestSchema.safeParse(dataWithContext);

  if (!validation.success) {
    console.error("[Action addLeaveRequestAction] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    const newRequest = await dbAddLeaveRequest(validation.data); // dbAddLeaveRequest expects employeeId to be the PK
    revalidatePath(`/${tenantId}/leave`);
    revalidatePath(`/api/leave/balances/${employeePrimaryKey}`); // Revalidate balance endpoint for the user (using employee PK)
    return { success: true, request: newRequest };
  } catch (error: any) {
    console.error("[Action addLeaveRequestAction] Error adding leave request:", error);
    return { success: false, errors: [{ code: 'custom', path: ['endDate'], message: error.message || 'Failed to add leave request.' }] };
  }
}

export async function updateLeaveRequestStatusAction(
    id: string,
    status: 'Approved' | 'Rejected',
    comments?: string
): Promise<{ success: boolean; request?: LeaveRequest; errors?: { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  const approverId = await getUserIdFromSession();
  if (!approverId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Approver ID not found.' }] };

  const isAdmin = await isAdminFromSession();
  if (!isAdmin) {
      return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to approve/reject requests.' }] };
  }

  if (!['Approved', 'Rejected'].includes(status)) {
     return { success: false, errors: [{ code: 'custom', path: ['status'], message: 'Invalid status update value.' }] };
  }

  try {
    const updatedRequest = await dbUpdateLeaveRequestStatus(id, tenantId, status, comments, approverId);
    if (updatedRequest) {
      revalidatePath(`/${tenantId}/leave`);
      revalidatePath(`/api/leave/balances/${updatedRequest.employeeId}`); // employeeId on request is the PK
      return { success: true, request: updatedRequest };
    } else {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave request not found or cannot be updated.' }] };
    }
  } catch (error: any) {
    console.error("[Action updateLeaveRequestStatusAction] Error updating status:", error);
    return { success: false, errors: [{ code: 'custom', path: ['id'], message: error.message || 'Failed to update leave request status.' }] };
  }
}

export async function cancelLeaveRequestAction(id: string): Promise<{ success: boolean; error?: string }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, error: 'Tenant context not found.' };

  const userId = await getUserIdFromSession(); // This is user_id
  if (!userId) return { success: false, error: 'Could not identify user.' };
  
  try {
    const updatedRequest = await dbCancelLeaveRequest(id, tenantId, userId); // userId here is used for ownership check
    if (updatedRequest) {
        revalidatePath(`/${tenantId}/leave`);
        if (updatedRequest.employeeId) { // employeeId here is the PK
          revalidatePath(`/api/leave/balances/${updatedRequest.employeeId}`);
        }
        return { success: true };
    } else {
        return { success: false, error: 'Failed to cancel request (unexpected).' };
    }
  } catch (error: any) {
    console.error("[Action cancelLeaveRequestAction] Error cancelling request:", error);
    return { success: false, error: error.message || 'Failed to cancel leave request.' };
  }
}


// --- Leave Type Actions ---

export async function getLeaveTypesAction(): Promise<LeaveType[]> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
      console.error("[Action getLeaveTypesAction] Tenant ID could not be determined from session.");
      throw new Error("Tenant context not found.");
   }
  try {
      return dbGetAllLeaveTypes(tenantId);
  } catch (dbError: any) {
        console.error(`[Action getLeaveTypesAction] Database error for tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch leave types: ${dbError.message}`);
  }
}

export async function addLeaveTypeAction(formData: Omit<LeaveType, 'id' | 'tenantId'>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

  const isAdmin = await isAdminFromSession();
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
    console.error("[Action addLeaveTypeAction] Error adding leave type:", error);
    return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add leave type.' }] };
  }
}

export async function updateLeaveTypeAction(id: string, formData: Partial<Omit<LeaveType, 'id' | 'tenantId'>>): Promise<{ success: boolean; leaveType?: LeaveType; errors?: { code: string; path: string[]; message: string }[] }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

   const isAdmin = await isAdminFromSession();
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
    console.error("[Action updateLeaveTypeAction] Error updating leave type:", error);
     return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to update leave type.' }] };
  }
}

export async function deleteLeaveTypeAction(id: string): Promise<{ success: boolean; error?: string }> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) return { success: false, error: 'Tenant context not found.' };

   const isAdmin = await isAdminFromSession();
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
    console.error("[Action deleteLeaveTypeAction] Error deleting leave type:", error);
    return { success: false, error: error.message || 'Failed to delete leave type.' };
  }
}


// --- Leave Balance Actions ---
// Parameter 'userId' here refers to the user's ID from the users table.
export async function getEmployeeLeaveBalancesAction(userId: string): Promise<LeaveBalance[]> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
       console.error("[Action getEmployeeLeaveBalancesAction] Tenant ID could not be determined from session.");
       throw new Error("Tenant context not found.");
    }

    console.log(`[Action getEmployeeLeaveBalancesAction] Fetching balances for user ${userId}, tenant ${tenantId}`);
    try {
        const employeeProfile = await dbGetEmployeeByUserId(userId, tenantId);
        if (!employeeProfile) {
            console.warn(`[Action getEmployeeLeaveBalancesAction] No employee profile found for user ${userId} in tenant ${tenantId}. Returning empty balances.`);
            return [];
        }
        // Pass the employee's primary key (employeeProfile.id) to the DB function
        return dbGetLeaveBalances(tenantId, employeeProfile.id);
    } catch (dbError: any) {
         console.error(`[Action getEmployeeLeaveBalancesAction] Database error for user ${userId}, tenant ${tenantId}:`, dbError);
         if (dbError.code === '22P02' && dbError.message?.includes('uuid')) {
             throw new Error("Internal server error: Invalid identifier.");
         }
         throw new Error(`Failed to fetch leave balances: ${dbError.message}`);
    }
}

// --- Accrual Action ---
export async function runAccrualProcessAction(): Promise<{ success: boolean; error?: string }> {
    const isAdmin = await isAdminFromSession();
    if (!isAdmin) return { success: false, error: 'Unauthorized.' };

    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return {success: false, error: 'Tenant context not found.'};

    console.log(`[Action runAccrualProcessAction] Triggering accrual process for tenant ${tenantId}...`);
    try {
        await dbRunMonthlyAccrual(tenantId);
        revalidatePath(`/${tenantId}/leave`, 'layout');
        return { success: true };
    } catch (error: any) {
        console.error(`[Action runAccrualProcessAction] Error running accrual for tenant ${tenantId}:`, error);
        return { success: false, error: error.message || 'Failed to run accrual process.' };
    }
}

// --- Holiday Actions ---

export async function getHolidaysAction(): Promise<Holiday[]> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) throw new Error("Tenant context not found.");
    try {
        return dbGetAllHolidays(tenantId);
    } catch (error: any) {
        console.error(`[Action getHolidaysAction] Error fetching holidays for tenant ${tenantId}:`, error);
        throw new Error(`Failed to fetch holidays: ${error.message}`);
    }
}

export async function addHolidayAction(formData: HolidayFormData): Promise<{ success: boolean; holiday?: Holiday; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

    const isAdmin = await isAdminFromSession();
    if (!isAdmin) return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized.' }] };

    const validation = holidaySchema.omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).safeParse(formData);
    if (!validation.success) {
        console.error("[Action addHolidayAction] Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }

    try {
        const newHoliday = await dbAddHoliday({ ...validation.data, tenantId });
        revalidatePath(`/${tenantId}/leave`);
        return { success: true, holiday: newHoliday };
    } catch (error: any) {
        console.error("[Action addHolidayAction] Error adding holiday:", error);
        const errorMessage = error.message || 'Failed to add holiday.';
        const errorPath = errorMessage.includes('already exists on') ? ['date'] : ['root'];
        return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
    }
}

export async function updateHolidayAction(id: string, formData: HolidayFormData): Promise<{ success: boolean; holiday?: Holiday; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Tenant context not found.' }] };

    const isAdmin = await isAdminFromSession();
    if (!isAdmin) return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized.' }] };

    const validation = holidaySchema.omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).safeParse(formData);
    if (!validation.success) {
        console.error("[Action updateHolidayAction] Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }

    try {
        const updatedHoliday = await dbUpdateHoliday(id, tenantId, validation.data);
        if (updatedHoliday) {
            revalidatePath(`/${tenantId}/leave`);
            return { success: true, holiday: updatedHoliday };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Holiday not found.' }] };
        }
    } catch (error: any) {
        console.error("[Action updateHolidayAction] Error updating holiday:", error);
        const errorMessage = error.message || 'Failed to update holiday.';
        const errorPath = errorMessage.includes('already exists on') ? ['date'] : ['root'];
        return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
    }
}

export async function deleteHolidayAction(id: string): Promise<{ success: boolean; error?: string }> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) return { success: false, error: 'Tenant context not found.' };

    const isAdmin = await isAdminFromSession();
    if (!isAdmin) return { success: false, error: 'Unauthorized.' };

    try {
        const deleted = await dbDeleteHoliday(id, tenantId);
        if (deleted) {
            revalidatePath(`/${tenantId}/leave`);
            return { success: true };
        } else {
            return { success: false, error: 'Holiday not found.' };
        }
    } catch (error: any) {
        console.error("[Action deleteHolidayAction] Error deleting holiday:", error);
        return { success: false, error: error.message || 'Failed to delete holiday.' };
    }
}

    