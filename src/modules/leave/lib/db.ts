
import pool from '@/lib/db';
import type { LeaveRequest, LeaveType, LeaveRequestStatus, LeaveBalance } from '@/modules/leave/types';
import { differenceInDays } from 'date-fns';

// --- Leave Type Operations ---

function mapRowToLeaveType(row: any): LeaveType {
    return {
        id: row.id,
        tenantId: row.tenant_id, // Include tenantId
        name: row.name,
        description: row.description ?? undefined,
        requiresApproval: row.requires_approval,
        defaultBalance: row.default_balance ?? undefined,
        accrualRate: row.accrual_rate ?? undefined,
    };
}

// Get leave types for a specific tenant
export async function getAllLeaveTypes(tenantId: string): Promise<LeaveType[]> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM leave_types WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
        return res.rows.map(mapRowToLeaveType);
    } catch (err) {
        console.error(`Error fetching all leave types for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get leave type by ID (ensure it belongs to the tenant)
export async function getLeaveTypeById(id: string, tenantId: string): Promise<LeaveType | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM leave_types WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToLeaveType(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching leave type ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Add leave type for a specific tenant
export async function addLeaveType(typeData: Omit<LeaveType, 'id'>): Promise<LeaveType> {
    const client = await pool.connect();
    if (!typeData.tenantId) {
        throw new Error("Tenant ID is required to add a leave type.");
    }
    const query = `
        INSERT INTO leave_types (tenant_id, name, description, requires_approval, default_balance, accrual_rate)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [
        typeData.tenantId,
        typeData.name,
        typeData.description || null,
        typeData.requiresApproval ?? true,
        typeData.defaultBalance ?? 0,
        typeData.accrualRate ?? 0,
    ];
    try {
        const res = await client.query(query, values);
        const newType = mapRowToLeaveType(res.rows[0]);
        // IMPORTANT: Initialize balances for existing employees when a new type is added
        await initializeBalancesForNewType(newType.tenantId, newType.id, newType.defaultBalance ?? 0); // Pass tenantId
        return newType;
    } catch (err: any) {
        console.error('Error adding leave type:', err);
        if (err.code === '23505' && err.constraint === 'leave_types_tenant_id_name_key') {
             throw new Error(`Leave type name "${typeData.name}" already exists for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

// Update leave type (ensure it belongs to the tenant)
export async function updateLeaveType(id: string, tenantId: string, updates: Partial<Omit<LeaveType, 'id' | 'tenantId'>>): Promise<LeaveType | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof typeof updates]?: string } = {
        name: 'name',
        description: 'description',
        requiresApproval: 'requires_approval',
        defaultBalance: 'default_balance',
        accrualRate: 'accrual_rate'
    };

    for (const key in updates) {
         if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof typeof columnMap];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                values.push(updates[key as keyof typeof updates] ?? null); // Use null for undefined optional fields
                valueIndex++;
            }
        }
    }


    if (setClauses.length === 0) return getLeaveTypeById(id, tenantId);

    values.push(id); // ID for WHERE clause
    values.push(tenantId); // tenantId for WHERE clause
    const query = `
        UPDATE leave_types
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToLeaveType(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating leave type ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505' && err.constraint === 'leave_types_tenant_id_name_key') {
             throw new Error(`Leave type name "${updates.name}" already exists for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

// Delete leave type (ensure it belongs to the tenant and is not in use)
export async function deleteLeaveType(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        // Check if the type is used in requests or balances within the tenant before deleting
        const checkUsageQuery = `
            SELECT EXISTS (SELECT 1 FROM leave_requests WHERE leave_type_id = $1 AND tenant_id = $2) AS used_in_requests,
                   EXISTS (SELECT 1 FROM leave_balances WHERE leave_type_id = $1 AND tenant_id = $2) AS used_in_balances;
        `;
        const usageRes = await client.query(checkUsageQuery, [id, tenantId]);
        if (usageRes.rows[0].used_in_requests || usageRes.rows[0].used_in_balances) {
            console.warn(`Attempted to delete leave type ${id} for tenant ${tenantId} which is currently in use.`);
            throw new Error('Leave type cannot be deleted because it is currently in use.');
        }

        // If not used, proceed with deletion
        const deleteQuery = 'DELETE FROM leave_types WHERE id = $1 AND tenant_id = $2';
        const res = await client.query(deleteQuery, [id, tenantId]);
        // Also delete related balances (although the check above should prevent this if balances exist)
        // await client.query('DELETE FROM leave_balances WHERE leave_type_id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting leave type ${id} for tenant ${tenantId}:`, err);
        throw err; // Re-throw including custom usage error
    } finally {
        client.release();
    }
}


// --- Leave Request Operations ---

function mapRowToLeaveRequest(row: any): LeaveRequest {
    return {
        id: row.id,
        tenantId: row.tenant_id, // Include tenantId
        employeeId: row.employee_id,
        employeeName: row.employee_name, // Assuming joined or denormalized
        leaveTypeId: row.leave_type_id,
        leaveTypeName: row.leave_type_name, // Assuming joined or denormalized
        startDate: new Date(row.start_date).toISOString().split('T')[0],
        endDate: new Date(row.end_date).toISOString().split('T')[0],
        reason: row.reason,
        status: row.status as LeaveRequestStatus,
        requestDate: new Date(row.request_date).toISOString(),
        approverId: row.approver_id ?? undefined,
        approvalDate: row.approval_date ? new Date(row.approval_date).toISOString() : undefined,
        comments: row.comments ?? undefined,
    };
}

// Optimized query with joins, filtered by tenant
const BASE_REQUEST_QUERY = `
    SELECT
        lr.id, lr.tenant_id, lr.employee_id, lr.start_date, lr.end_date, lr.reason, lr.status,
        lr.request_date, lr.approver_id, lr.approval_date, lr.comments,
        e.name AS employee_name,
        lt.name AS leave_type_name,
        lr.leave_type_id -- Ensure leave_type_id is selected
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id AND lr.tenant_id = e.tenant_id -- Join includes tenant_id
    JOIN leave_types lt ON lr.leave_type_id = lt.id AND lr.tenant_id = lt.tenant_id -- Join includes tenant_id
`;

// Get leave requests for a specific tenant, optionally filtered
export async function getAllLeaveRequests(tenantId: string, filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
    const client = await pool.connect();
    let query = BASE_REQUEST_QUERY;
    const conditions: string[] = ['lr.tenant_id = $1']; // Always filter by tenant
    const values: any[] = [tenantId];
    let valueIndex = 2; // Start indexing from 2

    if (filters?.employeeId) {
        conditions.push(`lr.employee_id = $${valueIndex++}`);
        values.push(filters.employeeId);
    }
    if (filters?.status) {
        conditions.push(`lr.status = $${valueIndex++}`);
        values.push(filters.status);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY lr.request_date DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToLeaveRequest);
    } catch (err) {
        console.error(`Error fetching leave requests for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get leave request by ID (ensure it belongs to the tenant)
export async function getLeaveRequestById(id: string, tenantId: string): Promise<LeaveRequest | undefined> {
    const client = await pool.connect();
    const query = `${BASE_REQUEST_QUERY} WHERE lr.id = $1 AND lr.tenant_id = $2`;
    try {
        const res = await client.query(query, [id, tenantId]);
        return res.rows.length > 0 ? mapRowToLeaveRequest(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching leave request ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Add leave request for a specific tenant
export async function addLeaveRequest(requestData: Omit<LeaveRequest, 'id' | 'requestDate' | 'status' | 'leaveTypeName' | 'employeeName'>): Promise<LeaveRequest> {
    const client = await pool.connect();
    if (!requestData.tenantId) {
        throw new Error("Tenant ID is required to add a leave request.");
    }
    const leaveType = await getLeaveTypeById(requestData.leaveTypeId, requestData.tenantId); // Fetch leave type details for tenant
    if (!leaveType) throw new Error("Invalid leaveTypeId for this tenant");

    // Check balance before inserting (important!)
    const requestedDays = differenceInDays(new Date(requestData.endDate), new Date(requestData.startDate)) + 1;
    if (leaveType.requiresApproval) { // Only check balance if approval is needed (or based on your policy)
         const currentBalance = await getSpecificLeaveBalance(requestData.tenantId, requestData.employeeId, requestData.leaveTypeId);
         if (currentBalance === undefined || currentBalance < requestedDays) {
              throw new Error('Insufficient leave balance.');
         }
    }

    const initialStatus: LeaveRequestStatus = leaveType.requiresApproval ? 'Pending' : 'Approved';

    const query = `
        INSERT INTO leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, reason, status, request_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id; -- Return only the ID
    `;
    const values = [
        requestData.tenantId,
        requestData.employeeId,
        requestData.leaveTypeId,
        requestData.startDate,
        requestData.endDate,
        requestData.reason,
        initialStatus,
    ];
    try {
        await client.query('BEGIN'); // Start transaction

        const res = await client.query(query, values);
        const newId = res.rows[0].id;

        // If auto-approved, deduct balance immediately
        if (initialStatus === 'Approved') {
             await adjustLeaveBalance(requestData.tenantId, requestData.employeeId, requestData.leaveTypeId, -requestedDays, client); // Pass client for transaction
        }

        await client.query('COMMIT'); // Commit transaction

        // Fetch the newly created request with joined data (include tenantId)
        const newRequest = await getLeaveRequestById(newId, requestData.tenantId);
        if (!newRequest) throw new Error("Failed to retrieve newly added leave request.");
        return newRequest;

    } catch (err) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error('Error adding leave request:', err);
        throw err; // Re-throw the original error (could be balance error)
    } finally {
        client.release();
    }
}

// Update leave request status (ensure it belongs to the tenant)
export async function updateLeaveRequestStatus(
    id: string,
    tenantId: string,
    status: LeaveRequestStatus,
    comments?: string,
    approverId?: string
): Promise<LeaveRequest | undefined> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        // 1. Get current request details (including tenant check)
        const currentRequest = await getLeaveRequestById(id, tenantId);
        if (!currentRequest) {
            throw new Error('Leave request not found or does not belong to this tenant.');
        }
        const previousStatus = currentRequest.status;

        // Prevent invalid status transitions (e.g., approving an already rejected request)
        if (previousStatus !== 'Pending' && status !== 'Cancelled') { // Allow cancelling Approved/Rejected? Depends on policy
             throw new Error(`Cannot change status from ${previousStatus} to ${status}.`);
        }


        // 2. Update the request status (include tenantId in WHERE)
        const updateQuery = `
            UPDATE leave_requests
            SET status = $1, comments = $2, approver_id = $3, approval_date = NOW()
            WHERE id = $4 AND tenant_id = $5 AND status = 'Pending' -- Ensure it's still pending and matches tenant
            RETURNING *;
        `;
        const updateValues = [status, comments || null, approverId || null, id, tenantId];
        const res = await client.query(updateQuery, updateValues);

        if (res.rowCount === 0) {
            // The request was likely not in 'Pending' state anymore or tenant mismatch
             throw new Error('Leave request could not be updated (status might have changed or tenant mismatch).');
        }

        // 3. Adjust balance if necessary
        const requestedDays = differenceInDays(new Date(currentRequest.endDate), new Date(currentRequest.startDate)) + 1;
        if (previousStatus === 'Pending' && status === 'Approved') {
            await adjustLeaveBalance(tenantId, currentRequest.employeeId, currentRequest.leaveTypeId, -requestedDays, client);
        }
        // Add refund logic if cancelling an approved request is allowed:
        // else if (previousStatus === 'Approved' && status === 'Cancelled') {
        //    await adjustLeaveBalance(tenantId, currentRequest.employeeId, currentRequest.leaveTypeId, requestedDays, client);
        // }

        await client.query('COMMIT'); // Commit transaction

        // Fetch the updated request with joined data
        const updatedRequest = await getLeaveRequestById(id, tenantId);
        return updatedRequest;

    } catch (err) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error(`Error updating status for leave request ${id} (tenant ${tenantId}):`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Cancel leave request (ensure it belongs to the tenant and requester)
export async function cancelLeaveRequest(id: string, tenantId: string, userId: string): Promise<LeaveRequest | undefined> {
     const client = await pool.connect();
     try {
        // Fetch request to check ownership and status (with tenant check)
        const request = await getLeaveRequestById(id, tenantId);
        if (!request) {
             throw new Error('Leave request not found or does not belong to this tenant.');
        }
        // Authorization: Only employee who requested or maybe an admin can cancel
        // This assumes userId is the employeeId of the requester for self-cancellation
        // TODO: Enhance auth check based on user roles
        if (request.employeeId !== userId /* && !isUserAdmin(userId, tenantId) */) {
             throw new Error('You are not authorized to cancel this request.');
        }
        if (request.status !== 'Pending') {
             throw new Error('Only pending requests can be cancelled.');
        }

         // Update status to Cancelled (with tenant check)
         const updateQuery = `
            UPDATE leave_requests
            SET status = 'Cancelled', comments = $1, approval_date = NOW() -- Optional: Log cancellation time
            WHERE id = $2 AND tenant_id = $3 AND status = 'Pending' -- Ensure it's still pending and matches tenant
            RETURNING *;
         `;
         const cancelComment = `Cancelled by user ${userId}.`;
         const res = await client.query(updateQuery, [cancelComment, id, tenantId]);

         if (res.rowCount === 0) {
            throw new Error('Leave request could not be cancelled (status might have changed or tenant mismatch).');
         }

         // Fetch the updated request with joined data
         const updatedRequest = await getLeaveRequestById(id, tenantId);
         return updatedRequest;

     } catch (err) {
         console.error(`Error cancelling leave request ${id} (tenant ${tenantId}):`, err);
         throw err;
     } finally {
         client.release();
     }
}


// --- Leave Balance Operations ---

// Initialize balances for a new type for all employees WITHIN a tenant
async function initializeBalancesForNewType(tenantId: string, leaveTypeId: string, defaultBalance: number) {
    const client = await pool.connect();
    // Add balance entry for the new type for ALL existing employees of the tenant
    // Use INSERT ... ON CONFLICT DO NOTHING to avoid errors if an entry somehow exists
    const query = `
        INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, balance, last_updated)
        SELECT tenant_id, id, $1, $2, NOW()
        FROM employees
        WHERE tenant_id = $3 -- Filter by tenant
        ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;
    `;
    try {
        await client.query(query, [leaveTypeId, defaultBalance, tenantId]);
        console.log(`Initialized balances for new leave type ${leaveTypeId} for tenant ${tenantId}`);
    } catch (err) {
        console.error(`Error initializing balances for new type ${leaveTypeId} (tenant ${tenantId}):`, err);
        // Decide if this error should be fatal or just logged
    } finally {
        client.release();
    }
}

// Ensure balances exist for a specific employee within a tenant
async function initializeEmployeeBalances(tenantId: string, employeeId: string, client?: any): Promise<void> {
    const conn = client || await pool.connect(); // Use provided client or get a new one
    try {
        const leaveTypes = await getAllLeaveTypes(tenantId); // Fetch current leave types for the tenant
        const query = `
            INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, balance, last_updated)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;
        `;
        // Ensure balance exists for each leave type
        for (const lt of leaveTypes) {
             await conn.query(query, [tenantId, employeeId, lt.id, lt.defaultBalance ?? 0]);
        }
        console.log(`Ensured balances exist for employee ${employeeId} in tenant ${tenantId}`);
    } catch (err) {
        console.error(`Error ensuring balances for employee ${employeeId} (tenant ${tenantId}):`, err);
        throw err;
    } finally {
        if (!client) conn.release(); // Release only if we acquired it here
    }
}

// Get balances for a specific employee within a tenant
export async function getLeaveBalancesForEmployee(tenantId: string, employeeId: string): Promise<LeaveBalance[]> {
    const client = await pool.connect();
    try {
        // Ensure balances exist first before fetching
        await initializeEmployeeBalances(tenantId, employeeId, client);

        const query = `
            SELECT lb.tenant_id, lb.employee_id, lb.leave_type_id, lb.balance, lb.last_updated, lt.name as leave_type_name
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type_id = lt.id AND lb.tenant_id = lt.tenant_id -- Join includes tenant
            WHERE lb.tenant_id = $1 AND lb.employee_id = $2
            ORDER BY lt.name;
        `;
        const res = await client.query(query, [tenantId, employeeId]);
        return res.rows.map(row => ({
            tenantId: row.tenant_id, // Include tenantId
            employeeId: row.employee_id,
            leaveTypeId: row.leave_type_id,
            leaveTypeName: row.leave_type_name, // Include name
            balance: parseFloat(row.balance), // Ensure balance is a number
            lastUpdated: new Date(row.last_updated).toISOString(),
        }));
    } catch (err) {
        console.error(`Error fetching leave balances for employee ${employeeId} (tenant ${tenantId}):`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to get a specific balance (useful for checks) within a tenant
async function getSpecificLeaveBalance(tenantId: string, employeeId: string, leaveTypeId: string): Promise<number | undefined> {
    const client = await pool.connect();
    try {
        // Ensure balance exists first
        await initializeEmployeeBalances(tenantId, employeeId, client);

        const query = `SELECT balance FROM leave_balances WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3`;
        const res = await client.query(query, [tenantId, employeeId, leaveTypeId]);
        if (res.rows.length > 0) {
            return parseFloat(res.rows[0].balance);
        }
        return undefined; // Should not happen after initialize, but handle defensively
    } catch (err) {
        console.error(`Error fetching specific balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// Internal function to adjust balance within a tenant, potentially within a transaction
async function adjustLeaveBalance(tenantId: string, employeeId: string, leaveTypeId: string, amount: number, client?: any): Promise<void> {
    const conn = client || await pool.connect(); // Use provided client or get a new one
    const query = `
        UPDATE leave_balances
        SET balance = balance + $1, last_updated = NOW()
        WHERE tenant_id = $2 AND employee_id = $3 AND leave_type_id = $4;
    `;
    try {
        const res = await conn.query(query, [amount, tenantId, employeeId, leaveTypeId]);
         if (res.rowCount === 0) {
             // Balance record might not exist, try initializing and retrying (or throw error)
             console.warn(`Balance record not found for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId} during adjustment. Attempting init.`);
             await initializeEmployeeBalances(tenantId, employeeId, conn); // Try initializing within the same connection
             const retryRes = await conn.query(query, [amount, tenantId, employeeId, leaveTypeId]);
             if (retryRes.rowCount === 0) {
                 throw new Error(`Failed to adjust balance even after initialization attempt for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}.`);
             }
         }
        console.log(`Adjusted balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId} by ${amount}.`);
    } catch (err) {
        console.error(`Error adjusting balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}:`, err);
        throw err;
    } finally {
        if (!client) conn.release(); // Release only if we acquired it here
    }
}


// Accrual function (to be called periodically by a scheduler/cron job)
export async function runMonthlyAccrual() {
    const client = await pool.connect();
    console.log("Running monthly leave accrual...");
    try {
        // Get all active employees and leave types with accrual rates > 0
        // Process tenant by tenant or all at once? Doing all at once for simplicity.
        const accrualQuery = `
            SELECT e.tenant_id, e.id as employee_id, lt.id as leave_type_id, lt.accrual_rate
            FROM employees e
            JOIN leave_types lt ON e.tenant_id = lt.tenant_id -- Join on tenant
            WHERE e.status = 'Active' AND lt.accrual_rate > 0;
        `;
        const accrualRes = await client.query(accrualQuery);

        if (accrualRes.rows.length === 0) {
            console.log("No active employees or accruable leave types found.");
            return;
        }

        // Use a transaction for bulk update
        await client.query('BEGIN');
        let updatedCount = 0;
        for (const row of accrualRes.rows) {
            // Ensure balance record exists before updating
             await initializeEmployeeBalances(row.tenant_id, row.employee_id, client);
            // Update balance
             const updateQuery = `
                UPDATE leave_balances
                SET balance = balance + $1, last_updated = NOW()
                WHERE tenant_id = $2 AND employee_id = $3 AND leave_type_id = $4;
             `;
            await client.query(updateQuery, [row.accrual_rate, row.tenant_id, row.employee_id, row.leave_type_id]);
            updatedCount++;
        }
        await client.query('COMMIT');
        console.log(`Monthly accrual complete. Updated balances for ${updatedCount} tenant/employee/type pairs.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during monthly accrual:', err);
        throw err;
    } finally {
        client.release();
    }
}


// Note: Schema updated in init-db.ts
