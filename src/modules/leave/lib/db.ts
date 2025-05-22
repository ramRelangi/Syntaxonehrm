import pool from '@/lib/db';
import type { LeaveRequest, LeaveType, LeaveRequestStatus, LeaveBalance, Holiday, HolidayFormData } from '@/modules/leave/types';
import type { Gender } from '@/modules/employees/types'; // Import Gender type
import { differenceInDays } from 'date-fns';
import { formatISO, isValid, parseISO } from 'date-fns';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapRowToLeaveType(row: any): LeaveType {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description ?? undefined,
        requiresApproval: row.requires_approval,
        defaultBalance: row.default_balance ?? undefined,
        accrualRate: row.accrual_rate ?? undefined,
        applicableGender: row.applicable_gender as Gender ?? undefined, // Map new field
    };
}

export async function getAllLeaveTypes(tenantId: string): Promise<LeaveType[]> {
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB getAllLeaveTypes] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
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

export async function getLeaveTypeById(id: string, tenantId: string): Promise<LeaveType | undefined> {
    if (!id || !uuidRegex.test(id)) {
        console.error(`[DB getLeaveTypeById] Invalid leave type ID format: ${id}`);
        throw new Error("Invalid leave type identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB getLeaveTypeById] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
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

export async function initializeEmployeeBalancesForAllTypes(tenantId: string, employeeId: string, client?: any) {
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!employeeId || !uuidRegex.test(employeeId)) throw new Error("Invalid employee identifier.");

    const conn = client || await pool.connect();
    try {
        console.log(`[DB initializeEmployeeBalancesForAllTypes] Initializing balances for employee ${employeeId} in tenant ${tenantId}.`);
        const leaveTypes = await getAllLeaveTypes(tenantId);

        if (leaveTypes.length === 0) {
            console.log(`[DB initializeEmployeeBalancesForAllTypes] No leave types found for tenant ${tenantId}. Skipping balance initialization for employee ${employeeId}.`);
            return;
        }

        const insertQuery = `
            INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, balance, last_updated)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;
        `;
        for (const lt of leaveTypes) {
             await conn.query(insertQuery, [tenantId, employeeId, lt.id, lt.defaultBalance ?? 0]);
             console.log(`[DB initializeEmployeeBalancesForAllTypes] Ensured balance for employee ${employeeId}, type ${lt.name} (${lt.id}).`);
        }
        console.log(`[DB initializeEmployeeBalancesForAllTypes] Finished initializing/ensuring balances for employee ${employeeId}.`);
    } catch (err) {
        console.error(`Error initializing all balances for employee ${employeeId} (tenant ${tenantId}):`, err);
        if (!client) throw err;
    } finally {
        if (!client && conn) conn.release();
    }
}


export async function addLeaveType(typeData: Omit<LeaveType, 'id'>): Promise<LeaveType> {
    if (!typeData.tenantId || !uuidRegex.test(typeData.tenantId)) {
        console.error(`[DB addLeaveType] Invalid tenantId format: ${typeData.tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    const query = `
        INSERT INTO leave_types (tenant_id, name, description, requires_approval, default_balance, accrual_rate, applicable_gender)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
    `;
    const values = [
        typeData.tenantId,
        typeData.name,
        typeData.description || null,
        typeData.requiresApproval ?? true,
        typeData.defaultBalance ?? 0,
        typeData.accrualRate ?? 0,
        typeData.applicableGender || null, // Add applicableGender
    ];
    try {
        await client.query('BEGIN');
        const res = await client.query(query, values);
        const newType = mapRowToLeaveType(res.rows[0]);
        await initializeBalancesForNewTypeForAllEmployees(newType.tenantId, newType.id, newType.defaultBalance ?? 0, client);
        await client.query('COMMIT');
        return newType;
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding leave type:', err);
        if (err.code === '23505' && err.constraint === 'leave_types_tenant_id_name_key') {
             throw new Error(`Leave type name "${typeData.name}" already exists for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

async function initializeBalancesForNewTypeForAllEmployees(tenantId: string, leaveTypeId: string, defaultBalance: number, client: any) {
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!leaveTypeId || !uuidRegex.test(leaveTypeId)) throw new Error("Invalid leave type identifier.");

    console.log(`[DB initializeBalancesForNewTypeForAllEmployees] Initializing balances for new leave type ${leaveTypeId} for ALL employees in tenant ${tenantId}.`);
    const query = `
        INSERT INTO leave_balances (tenant_id, employee_id, leave_type_id, balance, last_updated)
        SELECT e.tenant_id, e.id, $1, $2, NOW()
        FROM employees e
        WHERE e.tenant_id = $3
        ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;
    `;
    try {
        const res = await client.query(query, [leaveTypeId, defaultBalance, tenantId]);
        console.log(`[DB initializeBalancesForNewTypeForAllEmployees] ${res.rowCount} balance records created/ensured for new type ${leaveTypeId}.`);
    } catch (err) {
        console.error(`Error initializing balances for new type ${leaveTypeId} for all employees in tenant ${tenantId}:`, err);
        throw err;
    }
}


export async function updateLeaveType(id: string, tenantId: string, updates: Partial<Omit<LeaveType, 'id' | 'tenantId'>>): Promise<LeaveType | undefined> {
    if (!id || !uuidRegex.test(id)) {
        console.error(`[DB updateLeaveType] Invalid leave type ID format: ${id}`);
        throw new Error("Invalid leave type identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB updateLeaveType] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof typeof updates]?: string } = {
        name: 'name',
        description: 'description',
        requiresApproval: 'requires_approval',
        defaultBalance: 'default_balance',
        accrualRate: 'accrual_rate',
        applicableGender: 'applicable_gender', // Add applicableGender
    };

    for (const key in updates) {
         if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof typeof columnMap];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                // Ensure 'applicableGender' explicitly allows null if that's the intent for "All"
                values.push(key === 'applicableGender' && updates[key] === undefined ? null : updates[key as keyof typeof updates] ?? null);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return getLeaveTypeById(id, tenantId);
    values.push(id);
    values.push(tenantId);
    const query = `
        UPDATE leave_types
        SET ${setClauses.join(', ')}, updated_at = NOW()
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

export async function deleteLeaveType(id: string, tenantId: string): Promise<boolean> {
    if (!id || !uuidRegex.test(id)) {
        console.error(`[DB deleteLeaveType] Invalid leave type ID format: ${id}`);
        throw new Error("Invalid leave type identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB deleteLeaveType] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    try {
        const checkUsageQuery = `
            SELECT EXISTS (SELECT 1 FROM leave_requests WHERE leave_type_id = $1 AND tenant_id = $2) AS used_in_requests,
                   EXISTS (SELECT 1 FROM leave_balances WHERE leave_type_id = $1 AND tenant_id = $2 AND balance != 0) AS used_in_balances_with_value;
        `;
        const usageRes = await client.query(checkUsageQuery, [id, tenantId]);
        if (usageRes.rows[0].used_in_requests || usageRes.rows[0].used_in_balances_with_value) {
            console.warn(`Attempted to delete leave type ${id} for tenant ${tenantId} which is currently in use or has non-zero balances.`);
            throw new Error('Leave type cannot be deleted because it is in use or has associated balances.');
        }
        const deleteQuery = 'DELETE FROM leave_types WHERE id = $1 AND tenant_id = $2';
        const res = await client.query(deleteQuery, [id, tenantId]);
        await client.query('DELETE FROM leave_balances WHERE leave_type_id = $1 AND tenant_id = $2 AND balance = 0', [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting leave type ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

function mapRowToLeaveRequest(row: any): LeaveRequest {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        employeeId: row.employee_id,
        employeeName: row.employee_name,
        leaveTypeId: row.leave_type_id,
        leaveTypeName: row.leave_type_name,
        startDate: new Date(row.start_date).toISOString().split('T')[0],
        endDate: new Date(row.end_date).toISOString().split('T')[0],
        reason: row.reason,
        status: row.status as LeaveRequestStatus,
        requestDate: new Date(row.request_date).toISOString(),
        approverId: row.approver_id ?? undefined,
        approvalDate: row.approval_date ? new Date(row.approval_date).toISOString() : undefined,
        comments: row.comments ?? undefined,
        attachmentUrl: row.attachment_url ?? undefined,
    };
}

const BASE_REQUEST_QUERY = `
    SELECT
        lr.id, lr.tenant_id, lr.employee_id, lr.start_date, lr.end_date, lr.reason, lr.status,
        lr.request_date, lr.approver_id, lr.approval_date, lr.comments, lr.attachment_url,
        e.name AS employee_name,
        lt.name AS leave_type_name,
        lr.leave_type_id
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id AND lr.tenant_id = e.tenant_id
    JOIN leave_types lt ON lr.leave_type_id = lt.id AND lr.tenant_id = lt.tenant_id
`;

export async function getAllLeaveRequests(tenantId: string, filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB getAllLeaveRequests] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    if (filters?.employeeId && !uuidRegex.test(filters.employeeId)) {
        console.error(`[DB getAllLeaveRequests] Invalid employeeId format in filter: ${filters.employeeId}`);
        throw new Error("Invalid employee identifier.");
    }
    const client = await pool.connect();
    let query = BASE_REQUEST_QUERY;
    const conditions: string[] = ['lr.tenant_id = $1'];
    const values: any[] = [tenantId];
    let valueIndex = 2;

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

export async function getLeaveRequestById(id: string, tenantId: string): Promise<LeaveRequest | undefined> {
     if (!id || !uuidRegex.test(id)) {
        console.error(`[DB getLeaveRequestById] Invalid leave request ID format: ${id}`);
        throw new Error("Invalid leave request identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB getLeaveRequestById] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
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

export async function addLeaveRequest(requestData: Omit<LeaveRequest, 'id' | 'requestDate' | 'status' | 'leaveTypeName' | 'employeeName'>): Promise<LeaveRequest> {
    if (!requestData.tenantId || !uuidRegex.test(requestData.tenantId)) {
        console.error(`[DB addLeaveRequest] Invalid tenantId format: ${requestData.tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    if (!requestData.employeeId || !uuidRegex.test(requestData.employeeId)) {
        console.error(`[DB addLeaveRequest] Invalid employeeId format: ${requestData.employeeId}`);
        throw new Error("Invalid employee identifier.");
    }
    if (!requestData.leaveTypeId || !uuidRegex.test(requestData.leaveTypeId)) {
        console.error(`[DB addLeaveRequest] Invalid leaveTypeId format: ${requestData.leaveTypeId}`);
        throw new Error("Invalid leave type identifier.");
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const leaveType = await getLeaveTypeById(requestData.leaveTypeId, requestData.tenantId);
        if (!leaveType) {
            await client.query('ROLLBACK');
            throw new Error("Invalid leaveTypeId for this tenant");
        }

        const requestedDays = differenceInDays(new Date(requestData.endDate), new Date(requestData.startDate)) + 1;
        if (requestedDays <= 0) {
            await client.query('ROLLBACK');
            throw new Error('End date must be after start date.');
        }

        const currentBalance = await getSpecificLeaveBalance(requestData.tenantId, requestData.employeeId, requestData.leaveTypeId, client);
        if (currentBalance === undefined || currentBalance < requestedDays) {
            await client.query('ROLLBACK');
            throw new Error('Insufficient leave balance.');
        }

        const initialStatus: LeaveRequestStatus = leaveType.requiresApproval ? 'Pending' : 'Approved';

        const query = `
            INSERT INTO leave_requests (tenant_id, employee_id, leave_type_id, start_date, end_date, reason, status, attachment_url, request_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING id;
        `;
        const values = [
            requestData.tenantId,
            requestData.employeeId,
            requestData.leaveTypeId,
            requestData.startDate,
            requestData.endDate,
            requestData.reason,
            initialStatus,
            requestData.attachmentUrl || null,
        ];

        const res = await client.query(query, values);
        const newId = res.rows[0].id;

        if (initialStatus === 'Approved') {
             console.log(`[DB addLeaveRequest] Leave type does not require approval. Deducting ${requestedDays} days.`);
             await adjustLeaveBalance(requestData.tenantId, requestData.employeeId, requestData.leaveTypeId, -requestedDays, client);
        }

        await client.query('COMMIT');
        const newRequest = await getLeaveRequestById(newId, requestData.tenantId);
        if (!newRequest) throw new Error("Failed to retrieve newly added leave request.");
        return newRequest;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error adding leave request:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateLeaveRequestStatus(
    id: string,
    tenantId: string,
    status: LeaveRequestStatus,
    comments?: string,
    approverId?: string
): Promise<LeaveRequest | undefined> {
    if (!id || !uuidRegex.test(id)) throw new Error("Invalid leave request identifier.");
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (approverId && !uuidRegex.test(approverId)) throw new Error("Invalid approver identifier.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const currentRequest = await getLeaveRequestById(id, tenantId);
        if (!currentRequest) throw new Error('Leave request not found.');

        const previousStatus = currentRequest.status;
        const requestedDays = differenceInDays(new Date(currentRequest.endDate), new Date(currentRequest.startDate)) + 1;

        if (previousStatus === status) {
            console.warn(`[DB updateLeaveRequestStatus] Request ${id} is already in ${status} state. No update performed.`);
            await client.query('ROLLBACK');
            return currentRequest;
        }

        if (previousStatus === 'Pending' && status === 'Approved') {
            await adjustLeaveBalance(tenantId, currentRequest.employeeId, currentRequest.leaveTypeId, -requestedDays, client);
        } else if (previousStatus === 'Approved' && (status === 'Rejected' || status === 'Cancelled')) {
            await adjustLeaveBalance(tenantId, currentRequest.employeeId, currentRequest.leaveTypeId, requestedDays, client);
        } else if (previousStatus !== 'Pending' && status !== 'Cancelled') {
            await client.query('ROLLBACK');
            throw new Error(`Invalid status transition from ${previousStatus} to ${status}.`);
        }

        const updateQuery = `
            UPDATE leave_requests
            SET status = $1, comments = $2, approver_id = $3, approval_date = NOW(), updated_at = NOW()
            WHERE id = $4 AND tenant_id = $5
            RETURNING *;
        `;
        const updateValues = [status, comments || null, approverId || null, id, tenantId];
        const res = await client.query(updateQuery, updateValues);

        if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            throw new Error('Leave request could not be updated (status might have changed or tenant mismatch).');
        }

        await client.query('COMMIT');
        return await getLeaveRequestById(id, tenantId);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error updating status for leave request ${id} (tenant ${tenantId}):`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function cancelLeaveRequest(id: string, tenantId: string, userId: string): Promise<LeaveRequest | undefined> {
    if (!id || !uuidRegex.test(id)) throw new Error("Invalid leave request identifier.");
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!userId || !uuidRegex.test(userId)) throw new Error("Invalid user identifier.");

     const client = await pool.connect();
     try {
        await client.query('BEGIN');
        const request = await getLeaveRequestById(id, tenantId);
        if (!request) throw new Error('Leave request not found or does not belong to this tenant.');
        if (request.employeeId !== userId) throw new Error('You are not authorized to cancel this request.');

        const previousStatus = request.status;
        if (previousStatus === 'Cancelled' || previousStatus === 'Rejected') {
            await client.query('ROLLBACK');
            throw new Error(`Request is already ${previousStatus} and cannot be cancelled again.`);
        }

        const requestedDays = differenceInDays(new Date(request.endDate), new Date(request.startDate)) + 1;
        if (previousStatus === 'Approved') {
             await adjustLeaveBalance(tenantId, request.employeeId, request.leaveTypeId, requestedDays, client);
        }

         const updateQuery = `
            UPDATE leave_requests
            SET status = 'Cancelled', comments = COALESCE(comments || E'\\nCancelled by user.', 'Cancelled by user.'), approval_date = NOW(), updated_at = NOW(), approver_id = $1
            WHERE id = $2 AND tenant_id = $3
            RETURNING *;
         `;
         const res = await client.query(updateQuery, [userId, id, tenantId]);
         if (res.rowCount === 0) {
            await client.query('ROLLBACK');
            throw new Error('Leave request could not be cancelled (it might have been processed by an admin).');
         }
         await client.query('COMMIT');
         return await getLeaveRequestById(id, tenantId);
     } catch (err) {
         await client.query('ROLLBACK');
         console.error(`Error cancelling leave request ${id} (tenant ${tenantId}):`, err);
         throw err;
     } finally {
         client.release();
     }
}

export async function getLeaveBalancesForEmployee(tenantId: string, employeeId: string): Promise<LeaveBalance[]> {
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!employeeId || !uuidRegex.test(employeeId)) throw new Error("Invalid employee identifier.");

    const client = await pool.connect();
    try {
        await initializeEmployeeBalancesForAllTypes(tenantId, employeeId, client);

        const query = `
            SELECT lb.tenant_id, lb.employee_id, lb.leave_type_id, lb.balance, lb.last_updated, lt.name as leave_type_name
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type_id = lt.id AND lb.tenant_id = lt.tenant_id
            WHERE lb.tenant_id = $1 AND lb.employee_id = $2
            ORDER BY lt.name;
        `;
        const res = await client.query(query, [tenantId, employeeId]);
        return res.rows.map(row => ({
            tenantId: row.tenant_id,
            employeeId: row.employee_id,
            leaveTypeId: row.leave_type_id,
            leaveTypeName: row.leave_type_name,
            balance: parseFloat(row.balance),
            lastUpdated: new Date(row.last_updated).toISOString(),
        }));
    } catch (err) {
        console.error(`Error fetching leave balances for employee ${employeeId} (tenant ${tenantId}):`, err);
        throw err;
    } finally {
        client.release();
    }
}

async function getSpecificLeaveBalance(tenantId: string, employeeId: string, leaveTypeId: string, client?: any): Promise<number | undefined> {
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!employeeId || !uuidRegex.test(employeeId)) throw new Error("Invalid employee identifier.");
    if (!leaveTypeId || !uuidRegex.test(leaveTypeId)) throw new Error("Invalid leave type identifier.");

    const conn = client || await pool.connect();
    try {
        await initializeEmployeeBalancesForAllTypes(tenantId, employeeId, conn);
        const query = `SELECT balance FROM leave_balances WHERE tenant_id = $1 AND employee_id = $2 AND leave_type_id = $3`;
        const res = await conn.query(query, [tenantId, employeeId, leaveTypeId]);
        if (res.rows.length > 0) {
            return parseFloat(res.rows[0].balance);
        }
        const leaveType = await getLeaveTypeById(leaveTypeId, tenantId);
        return leaveType?.defaultBalance ?? 0;
    } catch (err) {
        console.error(`Error fetching specific balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}:`, err);
        if (!client) throw err;
        return undefined;
    } finally {
        if (!client && conn) conn.release();
    }
}

async function adjustLeaveBalance(tenantId: string, employeeId: string, leaveTypeId: string, amount: number, client?: any): Promise<void> {
    if (!tenantId || !uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");
    if (!employeeId || !uuidRegex.test(employeeId)) throw new Error("Invalid employee identifier.");
    if (!leaveTypeId || !uuidRegex.test(leaveTypeId)) throw new Error("Invalid leave type identifier.");

    const conn = client || await pool.connect();
    const query = `
        UPDATE leave_balances
        SET balance = balance + $1, last_updated = NOW()
        WHERE tenant_id = $2 AND employee_id = $3 AND leave_type_id = $4;
    `;
    try {
        await initializeEmployeeBalancesForAllTypes(tenantId, employeeId, conn);

        const res = await conn.query(query, [amount, tenantId, employeeId, leaveTypeId]);
         if (res.rowCount === 0) {
             console.warn(`Balance record not found for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId} during adjustment, even after init. This is unexpected.`);
             throw new Error(`Failed to adjust balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}. Balance record missing.`);
         }
        console.log(`Adjusted balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId} by ${amount}.`);
    } catch (err) {
        console.error(`Error adjusting balance for tenant ${tenantId}, employee ${employeeId}, type ${leaveTypeId}:`, err);
        if (!client) throw err;
    } finally {
        if (!client && conn) conn.release();
    }
}

export async function runMonthlyAccrual() {
    const client = await pool.connect();
    console.log("Running monthly leave accrual...");
    try {
        const accrualQuery = `
            SELECT e.tenant_id, e.id as employee_id, lt.id as leave_type_id, lt.accrual_rate
            FROM employees e
            JOIN leave_types lt ON e.tenant_id = lt.tenant_id
            WHERE e.status = 'Active' AND lt.accrual_rate > 0;
        `;
        const accrualRes = await client.query(accrualQuery);
        if (accrualRes.rows.length === 0) {
            console.log("No active employees or accruable leave types found.");
            return;
        }
        await client.query('BEGIN');
        let updatedCount = 0;
        for (const row of accrualRes.rows) {
             await initializeEmployeeBalancesForAllTypes(row.tenant_id, row.employee_id, client);
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

function mapRowToHoliday(row: any): Holiday {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        date: formatISO(new Date(row.date), { representation: 'date' }),
        description: row.description ?? undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
    };
}

export async function getAllHolidays(tenantId: string): Promise<Holiday[]> {
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB getAllHolidays] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM holidays WHERE tenant_id = $1 ORDER BY date ASC', [tenantId]);
        return res.rows.map(mapRowToHoliday);
    } catch (err) {
        console.error(`Error fetching holidays for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addHoliday(holidayData: Omit<Holiday, 'id' | 'createdAt' | 'updatedAt'>): Promise<Holiday> {
    if (!holidayData.tenantId || !uuidRegex.test(holidayData.tenantId)) {
        console.error(`[DB addHoliday] Invalid tenantId format: ${holidayData.tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    try {
        parseISO(holidayData.date);
    } catch (e) {
        throw new Error("Invalid date format. Please use YYYY-MM-DD.");
    }
    const client = await pool.connect();
    const query = `
        INSERT INTO holidays (tenant_id, name, date, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const values = [
        holidayData.tenantId,
        holidayData.name,
        holidayData.date,
        holidayData.description || null,
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToHoliday(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding holiday:', err);
        if (err.code === '23505' && err.constraint === 'holidays_tenant_id_date_key') {
            throw new Error(`A holiday already exists on ${holidayData.date} for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function updateHoliday(id: string, tenantId: string, updates: HolidayFormData): Promise<Holiday | undefined> {
    if (!id || !uuidRegex.test(id)) {
        console.error(`[DB updateHoliday] Invalid holiday ID format: ${id}`);
        throw new Error("Invalid holiday identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB updateHoliday] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    if (updates.date) {
        try {
            parseISO(updates.date);
        } catch (e) {
            throw new Error("Invalid date format. Please use YYYY-MM-DD.");
        }
    }
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof HolidayFormData]?: string } = {
        name: 'name',
        date: 'date',
        description: 'description',
    };

    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof typeof columnMap];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                values.push(updates[key as keyof typeof updates] ?? null);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return (await client.query('SELECT * FROM holidays WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows.map(mapRowToHoliday)[0];
    values.push(id);
    values.push(tenantId);
    const query = `
        UPDATE holidays
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToHoliday(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating holiday ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505' && err.constraint === 'holidays_tenant_id_date_key') {
            throw new Error(`Another holiday already exists on ${updates.date} for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteHoliday(id: string, tenantId: string): Promise<boolean> {
    if (!id || !uuidRegex.test(id)) {
        console.error(`[DB deleteHoliday] Invalid holiday ID format: ${id}`);
        throw new Error("Invalid holiday identifier.");
    }
    if (!tenantId || !uuidRegex.test(tenantId)) {
        console.error(`[DB deleteHoliday] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    const query = 'DELETE FROM holidays WHERE id = $1 AND tenant_id = $2';
    try {
        const res = await client.query(query, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting holiday ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}