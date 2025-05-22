
'use server';

import type { LeaveRequest, LeaveType, LeaveRequestFormData, LeaveRequestStatus, LeaveBalance, Holiday, HolidayFormData } from '@/modules/leave/types';
import { refinedLeaveRequestSchema, holidaySchema } from '@/modules/leave/types';
import {
  getAllLeaveRequests as dbGetAllLeaveRequests,
  getLeaveRequestById as dbGetLeaveRequestById,
  addLeaveRequest as dbAddLeaveRequest,
  updateLeaveRequestStatus as dbUpdateLeaveRequestStatus,
  cancelLeaveRequest as dbCancelLeaveRequest,
  getAllLeaveTypes as dbGetAllLeaveTypes,
  getLeaveTypeById as dbGetLeaveTypeById,
  addLeaveType as dbAddLeaveType,
  updateLeaveType as dbUpdateLeaveType,
  deleteLeaveType as dbDeleteLeaveType,
  getLeaveBalancesForEmployee as dbGetLeaveBalances, // This expects employee.id (PK)
  runMonthlyAccrual as dbRunMonthlyAccrual,
  getAllHolidays as dbGetAllHolidays,
  addHoliday as dbAddHoliday,
  updateHoliday as dbUpdateHoliday,
  deleteHoliday as dbDeleteHoliday,
} from '@/modules/leave/lib/db';
import { getEmployeeByUserId as dbGetEmployeeByUserId } from '@/modules/employees/lib/db'; // To get employee PK from user ID
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getTenantIdFromSession, getUserIdFromSession, isAdminFromSession, getEmployeeProfileForCurrentUser } from '@/modules/auth/actions'; // getEmployeeProfileForCurrentUser can get employee PK

// --- Leave Request Actions ---

export async function getLeaveRequestsAction(filters?: { employeeId?: string, status?: LeaveRequestStatus, forManagerApproval?: boolean }): Promise<LeaveRequest[]> {
  const tenantId = await getTenantIdFromSession();
  if (!tenantId) {
     console.error("[Action getLeaveRequestsAction] Tenant ID could not be determined from session.");
     throw new Error("Tenant context not found.");
  }
  
  let effectiveFilters = { ...filters };

  if (filters?.forManagerApproval) {
    console.log(`[Action getLeaveRequestsAction] Filtering for manager approval.`);
    const managerUserId = await getUserIdFromSession(); // This is the manager's users.id
    if (!managerUserId) {
        console.warn("[Action getLeaveRequestsAction] Could not determine manager's user ID for approval filter.");
        throw new Error("Could not identify manager for approval filtering.");
    }
    const managerEmployeeProfile = await dbGetEmployeeByUserId(managerUserId, tenantId);
    if (!managerEmployeeProfile) {
        console.warn(`[Action getLeaveRequestsAction] Manager with user ID ${managerUserId} does not have an employee profile in tenant ${tenantId}. Cannot filter by reporting manager.`);
        return []; // Or throw error, depending on desired behavior
    }
    effectiveFilters.filterByReportingManagerEmployeeId = managerEmployeeProfile.id; // Pass manager's employee.id (PK)
    delete effectiveFilters.forManagerApproval; // Remove the boolean flag
    effectiveFilters.status = 'Pending'; // Manager approval is only for pending requests
    console.log(`[Action getLeaveRequestsAction] Manager's employee PK for filtering: ${managerEmployeeProfile.id}`);
  }


  console.log(`[Action getLeaveRequestsAction] Fetching for tenant ${tenantId}, effective filters:`, effectiveFilters);
  try {
      // If employeeId filter is present, it's likely a user_id. Convert to employee PK if necessary.
      // However, dbGetAllLeaveRequests expects employeeId to be the employee PK.
      // If the filter is for "my requests", it usually comes from a user context.
      if (effectiveFilters.employeeId) {
          const userMakingRequest = await dbGetEmployeeByUserId(effectiveFilters.employeeId, tenantId);
          if (userMakingRequest) {
              effectiveFilters.employeeId = userMakingRequest.id; // Use PK for DB query
              console.log(`[Action getLeaveRequestsAction] Converted filter employeeId (user_id ${filters?.employeeId}) to PK ${userMakingRequest.id}`);
          } else {
              console.warn(`[Action getLeaveRequestsAction] No employee profile found for user_id ${filters?.employeeId} to filter requests. Returning empty.`);
              return [];
          }
      }
      return dbGetAllLeaveRequests(tenantId, effectiveFilters);
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

  const approverUserId = await getUserIdFromSession(); // This is the user_id of the person taking action
  if (!approverUserId) return { success: false, errors: [{ code: 'custom', path: [], message: 'Approver ID not found.' }] };

  // Authorization: Check if current user is Admin or the reporting manager of the request's employee
  const requestToUpdate = await dbGetLeaveRequestById(id, tenantId);
  if (!requestToUpdate) {
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Leave request not found.' }] };
  }

  const isAdmin = await isAdminFromSession();
  let isReportingManager = false;
  if (!isAdmin) {
      const managerProfile = await dbGetEmployeeByUserId(approverUserId, tenantId);
      if (managerProfile && requestToUpdate.employeeId) { // requestToUpdate.employeeId is PK
          const submittingEmployee = await dbGetEmployeeByUserId(requestToUpdate.employeeId, tenantId); // This is wrong - need employee from request.employeeId
          const actualSubmittingEmployee = await dbGetEmployeeById(requestToUpdate.employeeId, tenantId);

          if (actualSubmittingEmployee && actualSubmittingEmployee.reportingManagerId === managerProfile.id) {
              isReportingManager = true;
          }
      }
  }

  if (!isAdmin && !isReportingManager) {
      return { success: false, errors: [{ code: 'custom', path: [], message: 'Unauthorized to approve/reject this request.' }] };
  }


  if (!['Approved', 'Rejected'].includes(status)) {
     return { success: false, errors: [{ code: 'custom', path: ['status'], message: 'Invalid status update value.' }] };
  }

  try {
    // Pass approver's user_id to the DB layer
    const updatedRequest = await dbUpdateLeaveRequestStatus(id, tenantId, status, comments, approverUserId);
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

  const userId = await getUserIdFromSession(); // This is user_id of the person cancelling
  if (!userId) return { success: false, error: 'Could not identify user.' };
  
  try {
    // dbCancelLeaveRequest now expects the user_id of the person initiating the cancel for ownership check.
    const updatedRequest = await dbCancelLeaveRequest(id, tenantId, userId); 
    if (updatedRequest) {
        revalidatePath(`/${tenantId}/leave`);
        if (updatedRequest.employeeId) { // employeeId here is the PK
          revalidatePath(`/api/leave/balances/${updatedRequest.employeeId}`);
        }
        return { success: true };
    } else {
        // This path might not be reachable if dbCancelLeaveRequest throws an error on failure
        return { success: false, error: 'Failed to cancel request (unexpected, request might not be cancellable or not found).' };
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
// Parameter 'employeeId' here is expected to be user_id from the client (e.g., from query param or session)
export async function getEmployeeLeaveBalancesAction(employeeId: string): Promise<LeaveBalance[]> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
       console.error("[Action getEmployeeLeaveBalancesAction] Tenant ID could not be determined from session.");
       throw new Error("Tenant context not found.");
    }
    
    // Fetch the employee's primary key (employees.id) using the provided employeeId (which is user_id)
    const employeeProfile = await dbGetEmployeeByUserId(employeeId, tenantId);
    if (!employeeProfile) {
        console.warn(`[Action getEmployeeLeaveBalancesAction] No employee profile found for user ID ${employeeId} in tenant ${tenantId}. Returning empty balances.`);
        return [];
    }
    const employeePrimaryKey = employeeProfile.id; // This is the employees.id (PK)

    console.log(`[Action getEmployeeLeaveBalancesAction] Fetching balances for employee PK ${employeePrimaryKey}, tenant ${tenantId}`);
    try {
        return dbGetLeaveBalances(tenantId, employeePrimaryKey);
    } catch (dbError: any) {
         console.error(`[Action getEmployeeLeaveBalancesAction] Database error for employee PK ${employeePrimaryKey}, tenant ${tenantId}:`, dbError);
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
        revalidatePath(`/${tenantId}/leave`, 'layout'); // Revalidate the whole leave layout
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

    