import pool from '@/lib/db';
import type { LeaveRequest, LeaveType, LeaveRequestStatus, LeaveBalance } from '@/modules/leave/types';
import { differenceInDays } from 'date-fns';

// --- Leave Type Operations ---

function mapRowToLeaveType(row: any): LeaveType {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        requiresApproval: row.requires_approval,
        defaultBalance: row.default_balance ?? undefined,
        accrualRate: row.accrual_rate ?? undefined,
    };
}

export async function getAllLeaveTypes(): Promise<LeaveType[]> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM leave_types ORDER BY name ASC');
        return res.rows.map(mapRowToLeaveType);
    } catch (err) {
        console.error('Error fetching all leave types:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getLeaveTypeById(id: string): Promise<LeaveType | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM leave_types WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToLeaveType(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching leave type ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addLeaveType(typeData: Omit<LeaveType, 'id'>): Promise<LeaveType> {
    const client = await pool.connect();
    const query = `
        INSERT INTO leave_types (name, description, requires_approval, default_balance, accrual_rate)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    const values = [
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
        await initializeBalancesForNewType(newType.id, newType.defaultBalance ?? 0);
        return newType;
    } catch (err) {
        console.error('Error adding leave type:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateLeaveType(id: string, updates: Partial<Omit<LeaveType, 'id'>>): Promise<LeaveType | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof Omit<LeaveType, 'id'>]?: string } = {
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


    if (setClauses.length === 0) return getLeaveTypeById(id);

    values.push(id);
    const query = `
        UPDATE leave_types
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToLeaveType(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error updating leave type ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteLeaveType(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        // Check if the type is used in requests or balances before deleting
        const checkUsageQuery = `
            SELECT EXISTS (SELECT 1 FROM leave_requests WHERE leave_type_id = $1) AS used_in_requests,
                   EXISTS (SELECT 1 FROM leave_balances WHERE leave_type_id = $1) AS used_in_balances;
        `;
        const usageRes = await client.query(checkUsageQuery, [id]);
        if (usageRes.rows[0].used_in_requests || usageRes.rows[0].used_in_balances) {
            console.warn(`Attempted to delete leave type ${id} which is currently in use.`);
            throw new Error('Leave type cannot be deleted because it is currently in use.');
        }

        // If not used, proceed with deletion
        const deleteQuery = 'DELETE FROM leave_types WHERE id = $1';
        const res = await client.query(deleteQuery, [id]);
        // Also delete related balances
        await client.query('DELETE FROM leave_balances WHERE leave_type_id = $1', [id]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting leave type ${id}:`, err);
        throw err; // Re-throw including custom usage error
    } finally {
        client.release();
    }
}


// --- Leave Request Operations ---

function mapRowToLeaveRequest(row: any): LeaveRequest {
    return {
        id: row.id,
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

// Optimized query with joins
const BASE_REQUEST_QUERY = `
    SELECT
        lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.reason, lr.status,
        lr.request_date, lr.approver_id, lr.approval_date, lr.comments,
        e.name AS employee_name,
        lt.name AS leave_type_name,
        lr.leave_type_id -- Ensure leave_type_id is selected
    FROM leave_requests lr
    JOIN employees e ON lr.employee_id = e.id
    JOIN leave_types lt ON lr.leave_type_id = lt.id
`;


export async function getAllLeaveRequests(filters?: { employeeId?: string, status?: LeaveRequestStatus }): Promise<LeaveRequest[]> {
    const client = await pool.connect();
    let query = BASE_REQUEST_QUERY;
    const conditions: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (filters?.employeeId) {
        conditions.push(`lr.employee_id = $${valueIndex++}`);
        values.push(filters.employeeId);
    }
    if (filters?.status) {
        conditions.push(`lr.status = $${valueIndex++}`);
        values.push(filters.status);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY lr.request_date DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToLeaveRequest);
    } catch (err) {
        console.error('Error fetching leave requests:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | undefined> {
    const client = await pool.connect();
    const query = `${BASE_REQUEST_QUERY} WHERE lr.id = $1`;
    try {
        const res = await client.query(query, [id]);
        return res.rows.length > 0 ? mapRowToLeaveRequest(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching leave request ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addLeaveRequest(requestData: Omit<LeaveRequest, 'id' | 'requestDate' | 'status' | 'leaveTypeName' | 'employeeName'>): Promise<LeaveRequest> {
    const client = await pool.connect();
    const leaveType = await getLeaveTypeById(requestData.leaveTypeId); // Fetch leave type details
    if (!leaveType) throw new Error("Invalid leaveTypeId");

    // Check balance before inserting (important!)
    const requestedDays = differenceInDays(new Date(requestData.endDate), new Date(requestData.startDate)) + 1;
    if (leaveType.requiresApproval) { // Only check balance if approval is needed (or based on your policy)
         const currentBalance = await getSpecificLeaveBalance(requestData.employeeId, requestData.leaveTypeId);
         if (currentBalance === undefined || currentBalance < requestedDays) {
              throw new Error('Insufficient leave balance.');
         }
    }


    const initialStatus: LeaveRequestStatus = leaveType.requiresApproval ? 'Pending' : 'Approved';

    const query = `
        INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, reason, status, request_date)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id; -- Return only the ID
    `;
    const values = [
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
             await adjustLeaveBalance(requestData.employeeId, requestData.leaveTypeId, -requestedDays, client); // Pass client for transaction
        }

        await client.query('COMMIT'); // Commit transaction

        // Fetch the newly created request with joined data
        const newRequest = await getLeaveRequestById(newId);
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

export async function updateLeaveRequestStatus(
    id: string,
    status: LeaveRequestStatus,
    comments?: string,
    approverId?: string
): Promise<LeaveRequest | undefined> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        // 1. Get current request details
        const currentRequest = await getLeaveRequestById(id);
        if (!currentRequest) {
            throw new Error('Leave request not found.');
        }
        const previousStatus = currentRequest.status;

        // Prevent invalid status transitions (e.g., approving an already rejected request)
        if (previousStatus !== 'Pending' && status !== 'Cancelled') { // Allow cancelling Approved/Rejected? Depends on policy
             throw new Error(`Cannot change status from ${previousStatus} to ${status}.`);
        }


        // 2. Update the request status
        const updateQuery = `
            UPDATE leave_requests
            SET status = $1, comments = $2, approver_id = $3, approval_date = NOW()
            WHERE id = $4 AND status = 'Pending' -- Ensure it's still pending
            RETURNING *;
        `;
        const updateValues = [status, comments || null, approverId || null, id];
        const res = await client.query(updateQuery, updateValues);

        if (res.rowCount === 0) {
            // The request was likely not in 'Pending' state anymore
             throw new Error('Leave request could not be updated (status might have changed).');
        }

        // 3. Adjust balance if necessary
        const requestedDays = differenceInDays(new Date(currentRequest.endDate), new Date(currentRequest.startDate)) + 1;
        if (previousStatus === 'Pending' && status === 'Approved') {
            await adjustLeaveBalance(currentRequest.employeeId, currentRequest.leaveTypeId, -requestedDays, client);
        }
        // Add refund logic if cancelling an approved request is allowed:
        // else if (previousStatus === 'Approved' && status === 'Cancelled') {
        //    await adjustLeaveBalance(currentRequest.employeeId, currentRequest.leaveTypeId, requestedDays, client);
        // }

        await client.query('COMMIT'); // Commit transaction

        // Fetch the updated request with joined data
        const updatedRequest = await getLeaveRequestById(id);
        return updatedRequest;

    } catch (err) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error(`Error updating status for leave request ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function cancelLeaveRequest(id: string, userId: string): Promise<LeaveRequest | undefined> {
     const client = await pool.connect();
     try {
        // Fetch request to check ownership and status
        const request = await getLeaveRequestById(id);
        if (!request) {
             throw new Error('Leave request not found.');
        }
        // Authorization: Only employee who requested or maybe an admin can cancel
        // This assumes userId is the employeeId of the requester for self-cancellation
        if (request.employeeId !== userId /* && !isUserAdmin(userId) */) {
             throw new Error('You are not authorized to cancel this request.');
        }
        if (request.status !== 'Pending') {
             throw new Error('Only pending requests can be cancelled.');
        }

         // Update status to Cancelled
         const updateQuery = `
            UPDATE leave_requests
            SET status = 'Cancelled', comments = $1, approval_date = NOW() -- Optional: Log cancellation time
            WHERE id = $2 AND status = 'Pending' -- Ensure it's still pending
            RETURNING *;
         `;
         const cancelComment = `Cancelled by user ${userId}.`;
         const res = await client.query(updateQuery, [cancelComment, id]);

         if (res.rowCount === 0) {
            throw new Error('Leave request could not be cancelled (status might have changed).');
         }

         // Fetch the updated request with joined data
         const updatedRequest = await getLeaveRequestById(id);
         return updatedRequest;

     } catch (err) {
         console.error(`Error cancelling leave request ${id}:`, err);
         throw err;
     } finally {
         client.release();
     }
}


// --- Leave Balance Operations ---

async function initializeBalancesForNewType(leaveTypeId: string, defaultBalance: number) {
    const client = await pool.connect();
    // Add balance entry for the new type for ALL existing employees
    // Use INSERT ... ON CONFLICT DO NOTHING to avoid errors if an entry somehow exists
    const query = `
        INSERT INTO leave_balances (employee_id, leave_type_id, balance, last_updated)
        SELECT id, $1, $2, NOW()
        FROM employees
        ON CONFLICT (employee_id, leave_type_id) DO NOTHING;
    `;
    try {
        await client.query(query, [leaveTypeId, defaultBalance]);
        console.log(`Initialized balances for new leave type ${leaveTypeId}`);
    } catch (err) {
        console.error(`Error initializing balances for new type ${leaveTypeId}:`, err);
        // Decide if this error should be fatal or just logged
    } finally {
        client.release();
    }
}

async function initializeEmployeeBalances(employeeId: string, client?: any): Promise<void> {
    const conn = client || await pool.connect(); // Use provided client or get a new one
    try {
        const leaveTypes = await getAllLeaveTypes(); // Fetch current leave types
        const query = `
            INSERT INTO leave_balances (employee_id, leave_type_id, balance, last_updated)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (employee_id, leave_type_id) DO NOTHING;
        `;
        // Ensure balance exists for each leave type
        for (const lt of leaveTypes) {
             await conn.query(query, [employeeId, lt.id, lt.defaultBalance ?? 0]);
        }
        console.log(`Ensured balances exist for employee ${employeeId}`);
    } catch (err) {
        console.error(`Error ensuring balances for employee ${employeeId}:`, err);
        throw err;
    } finally {
        if (!client) conn.release(); // Release only if we acquired it here
    }
}

export async function getLeaveBalancesForEmployee(employeeId: string): Promise<LeaveBalance[]> {
    const client = await pool.connect();
    try {
        // Ensure balances exist first before fetching
        await initializeEmployeeBalances(employeeId, client);

        const query = `
            SELECT lb.employee_id, lb.leave_type_id, lb.balance, lb.last_updated, lt.name as leave_type_name
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type_id = lt.id
            WHERE lb.employee_id = $1
            ORDER BY lt.name;
        `;
        const res = await client.query(query, [employeeId]);
        return res.rows.map(row => ({
            employeeId: row.employee_id,
            leaveTypeId: row.leave_type_id,
            leaveTypeName: row.leave_type_name, // Include name
            balance: parseFloat(row.balance), // Ensure balance is a number
            lastUpdated: new Date(row.last_updated).toISOString(),
        }));
    } catch (err) {
        console.error(`Error fetching leave balances for employee ${employeeId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to get a specific balance (useful for checks)
async function getSpecificLeaveBalance(employeeId: string, leaveTypeId: string): Promise<number | undefined> {
    const client = await pool.connect();
    try {
        // Ensure balance exists first
        await initializeEmployeeBalances(employeeId, client);

        const query = `SELECT balance FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2`;
        const res = await client.query(query, [employeeId, leaveTypeId]);
        if (res.rows.length > 0) {
            return parseFloat(res.rows[0].balance);
        }
        return undefined; // Should not happen after initialize, but handle defensively
    } catch (err) {
        console.error(`Error fetching specific balance for ${employeeId}, type ${leaveTypeId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// Internal function to adjust balance, potentially within a transaction
async function adjustLeaveBalance(employeeId: string, leaveTypeId: string, amount: number, client?: any): Promise<void> {
    const conn = client || await pool.connect(); // Use provided client or get a new one
    const query = `
        UPDATE leave_balances
        SET balance = balance + $1, last_updated = NOW()
        WHERE employee_id = $2 AND leave_type_id = $3;
    `;
    try {
        const res = await conn.query(query, [amount, employeeId, leaveTypeId]);
         if (res.rowCount === 0) {
             // Balance record might not exist, try initializing and retrying (or throw error)
             console.warn(`Balance record not found for ${employeeId}, type ${leaveTypeId} during adjustment. Attempting init.`);
             await initializeEmployeeBalances(employeeId, conn); // Try initializing within the same connection
             const retryRes = await conn.query(query, [amount, employeeId, leaveTypeId]);
             if (retryRes.rowCount === 0) {
                 throw new Error(`Failed to adjust balance even after initialization attempt for ${employeeId}, type ${leaveTypeId}.`);
             }
         }
        console.log(`Adjusted balance for ${employeeId}, type ${leaveTypeId} by ${amount}.`);
    } catch (err) {
        console.error(`Error adjusting balance for ${employeeId}, type ${leaveTypeId}:`, err);
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
        const accrualQuery = `
            SELECT e.id as employee_id, lt.id as leave_type_id, lt.accrual_rate
            FROM employees e
            CROSS JOIN leave_types lt
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
             await initializeEmployeeBalances(row.employee_id, client);
            // Update balance
             const updateQuery = `
                UPDATE leave_balances
                SET balance = balance + $1, last_updated = NOW()
                WHERE employee_id = $2 AND leave_type_id = $3;
             `;
            await client.query(updateQuery, [row.accrual_rate, row.employee_id, row.leave_type_id]);
            updatedCount++;
        }
        await client.query('COMMIT');
        console.log(`Monthly accrual complete. Updated balances for ${updatedCount} employee/type pairs.`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error during monthly accrual:', err);
        throw err;
    } finally {
        client.release();
    }
}


// --- Database Schema (for reference) ---
/*
-- Requires employees table from employee module

CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    default_balance NUMERIC(5, 2) DEFAULT 0, -- e.g., 20.00 days
    accrual_rate NUMERIC(5, 2) DEFAULT 0,    -- e.g., 1.67 days per month
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE leave_request_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');

CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT, -- Prevent deleting type if used
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status leave_request_status NOT NULL DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID REFERENCES employees(id), -- Could also reference a general users table
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_dates CHECK (end_date >= start_date)
);

CREATE TABLE leave_balances (
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE, -- Cascade delete balance if type is deleted
    balance NUMERIC(5, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (employee_id, leave_type_id) -- Composite primary key
);

-- Indexes for faster lookups
CREATE INDEX idx_leave_requests_employee_id ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_types_name ON leave_types(name);

-- Triggers to update updated_at timestamps (similar to employees table)
CREATE TRIGGER update_leave_types_updated_at
BEFORE UPDATE ON leave_types
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at
BEFORE UPDATE ON leave_balances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

*/
