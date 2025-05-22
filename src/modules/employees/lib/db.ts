
import pool from '@/lib/db';
import type { Employee, EmployeeFormData, Gender } from '@/modules/employees/types';
import { initializeEmployeeBalancesForAllTypes } from '@/modules/leave/lib/db';
import type { UserRole } from '@/modules/auth/types';
import { deleteUserById as dbDeleteUserById } from '@/modules/auth/lib/db'; // Import user deletion function

// Case-insensitive UUID regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Function to map database row to Employee object
function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id, // This is employees.id (PK)
        tenantId: row.tenant_id,
        userId: row.user_id ?? undefined, // This is users.id (FK)
        employeeId: row.employee_id ?? undefined, // This is the human-readable EMP-XXX
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined,
        gender: row.gender as Gender ?? undefined,
        position: row.position,
        department: row.department,
        hireDate: new Date(row.hire_date).toISOString().split('T')[0],
        status: row.status as Employee['status'],
        dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().split('T')[0] : undefined,
        reportingManagerId: row.reporting_manager_id ?? null,
        workLocation: row.work_location ?? undefined,
        employmentType: row.employment_type as Employee['employmentType'] ?? 'Full-time',
        role: row.role as UserRole ?? undefined, // Role is on users table, this might come from a JOIN in future
    };
}

// Get employees for a specific tenant
export async function getAllEmployees(tenantId: string): Promise<Employee[]> {
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getAllEmployees] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees WHERE tenant_id = $1 ORDER BY name ASC', [tenantId.toLowerCase()]);
        return res.rows.map(mapRowToEmployee);
    } catch (err) {
        console.error(`Error fetching all employees for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get employee by ID (PK of employees table, ensure it belongs to the tenant)
export async function getEmployeeById(id: string, tenantId: string, client?: any): Promise<Employee | undefined> {
    console.log(`[DB getEmployeeById] Validating IDs. Employee PK: ${id}, Tenant ID: ${tenantId}`);
    if (!uuidRegex.test(id)) {
        console.error(`[DB getEmployeeById] Invalid employee ID (PK) format: ${id}`);
        throw new Error("Invalid employee identifier format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getEmployeeById] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const conn = client || await pool.connect();
    try {
        console.log(`[DB getEmployeeById] Querying for employee.id (PK): ${id.toLowerCase()}, tenantId: ${tenantId.toLowerCase()}`);
        const res = await conn.query('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeById] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee with id (PK) ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        if (!client) conn.release();
    }
}

// Function to generate the next employee_id for a tenant
async function generateNextEmployeeId(tenantId: string, client: any): Promise<string> {
    const prefix = "EMP-";
    const query = `
        SELECT employee_id FROM employees
        WHERE tenant_id = $1 AND employee_id ~ '^${prefix}\\d+$'
        ORDER BY CAST(SUBSTRING(employee_id FROM ${prefix.length + 1}) AS INTEGER) DESC
        LIMIT 1;
    `;
    const res = await client.query(query, [tenantId.toLowerCase()]);
    let nextNumericPart = 1;
    if (res.rows.length > 0 && res.rows[0].employee_id) {
        const lastId = res.rows[0].employee_id;
        const numericPart = parseInt(lastId.substring(prefix.length), 10);
        if (!isNaN(numericPart)) {
            nextNumericPart = numericPart + 1;
        }
    }
    return `${prefix}${String(nextNumericPart).padStart(3, '0')}`;
}


// This internal function now expects `userId` (from users table) to be passed.
// The `role` parameter is conceptually for the User, not directly stored on Employee here.
export async function addEmployeeInternal(
    employeeData: Omit<EmployeeFormData, 'employeeId' | 'role'> & { tenantId: string, userId: string, role?: UserRole }
): Promise<Employee> {
    if (!uuidRegex.test(employeeData.tenantId)) {
        console.error(`[DB addEmployeeInternal] Invalid tenantId format: ${employeeData.tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
     if (!uuidRegex.test(employeeData.userId)) {
        console.error(`[DB addEmployeeInternal] Invalid userId format: ${employeeData.userId}`);
        throw new Error("Invalid user identifier format.");
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const newEmployeeId = await generateNextEmployeeId(employeeData.tenantId, client);
        const query = `
            INSERT INTO employees (
                tenant_id, user_id, employee_id, name, email, phone, gender, position, department,
                hire_date, status, date_of_birth, reporting_manager_id,
                work_location, employment_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *;
        `;
        const values = [
            employeeData.tenantId.toLowerCase(),
            employeeData.userId.toLowerCase(), // Store the user's UUID
            newEmployeeId,
            employeeData.name,
            employeeData.email,
            employeeData.phone || null,
            employeeData.gender || null,
            employeeData.position,
            employeeData.department,
            employeeData.hireDate,
            employeeData.status || 'Active',
            employeeData.dateOfBirth || null,
            employeeData.reportingManagerId || null,
            employeeData.workLocation || null,
            employeeData.employmentType || 'Full-time',
        ];
        const res = await client.query(query, values);
        const newEmployee = mapRowToEmployee(res.rows[0]);

        // Initialize leave balances for this new employee
        await initializeEmployeeBalancesForAllTypes(newEmployee.tenantId, newEmployee.id, client); // Use newEmployee.id (PK)
        console.log(`[DB addEmployeeInternal] Initialized leave balances for new employee ${newEmployee.id}`);

        await client.query('COMMIT');
        return newEmployee;
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding employee (internal):', err);
        if (err.code === '23505') {
            if (err.constraint === 'employees_tenant_id_email_key') {
                throw new Error('Email address already exists for an employee in this tenant.');
            }
            if (err.constraint === 'employees_tenant_id_employee_id_key') {
                throw new Error('Generated Employee ID already exists for this tenant. Please try again.');
            }
            if (err.constraint === 'employees_user_id_key') {
                 throw new Error('This user account is already linked to an employee profile.');
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

// The `updates` parameter can contain `role` but it's not used to update the employees table.
export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    if (!uuidRegex.test(id)) {
        console.error(`[DB updateEmployee] Invalid employee ID (PK) format: ${id}`);
        throw new Error("Invalid employee identifier format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB updateEmployee] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    // Define which fields from EmployeeFormData can be updated on the employees table.
    const allowedEmployeeTableUpdates: (keyof Omit<EmployeeFormData, 'role'>)[] = [
        'name', 'email', 'phone', 'gender', 'position', 'department',
        'hireDate', 'status', 'dateOfBirth', 'reportingManagerId',
        'workLocation', 'employmentType'
    ];

    for (const key of allowedEmployeeTableUpdates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = key === 'hireDate' ? 'hire_date' :
                          key === 'dateOfBirth' ? 'date_of_birth' :
                          key === 'reportingManagerId' ? 'reporting_manager_id' :
                          key === 'workLocation' ? 'work_location' :
                          key === 'employmentType' ? 'employment_type' : key;

            setClauses.push(`${dbKey} = $${valueIndex}`);
            let value = updates[key];
            // Handle specific keys that might be empty strings from form but should be null in DB
            if ((key === 'phone' || key === 'dateOfBirth' || key === 'reportingManagerId' || key === 'workLocation' || key === 'gender') && value === '') {
                value = null;
            }
            values.push(value);
            valueIndex++;
        }
    }

    if (setClauses.length === 0) {
        // If only role was in 'updates', or no updatable fields were provided.
        // It's important to release the client if we exit early.
        client.release();
        return getEmployeeById(id, tenantId);
    }

    setClauses.push(`updated_at = NOW()`); // Always update updated_at
    values.push(id.toLowerCase());
    values.push(tenantId.toLowerCase());

    const query = `
        UPDATE employees
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToEmployee(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating employee with id (PK) ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505' && err.constraint === 'employees_tenant_id_email_key') {
            throw new Error('Email address already exists for another employee in this tenant.');
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteEmployee(id: string, tenantId: string): Promise<boolean> {
    console.log(`[DB deleteEmployee] Attempting to delete employee PK ${id} for tenant ${tenantId}`);
    if (!uuidRegex.test(id)) {
        console.error(`[DB deleteEmployee] Invalid employee ID (PK) format: ${id}`);
        throw new Error("Invalid employee identifier format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB deleteEmployee] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier.");
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log(`[DB deleteEmployee] Fetching employee record for PK ${id} to get user_id.`);
        const employeeRes = await client.query('SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        
        const userIdToDelete = employeeRes.rows.length > 0 ? employeeRes.rows[0].user_id : null;
        console.log(`[DB deleteEmployee] Found user_id to delete: ${userIdToDelete} (null if no user linked or employee not found).`);

        console.log(`[DB deleteEmployee] Attempting to delete employee record PK ${id}.`);
        const deleteEmployeeRes = await client.query('DELETE FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        
        if (deleteEmployeeRes.rowCount === 0) {
            await client.query('ROLLBACK');
            console.warn(`[DB deleteEmployee] Employee PK ${id} not found for tenant ${tenantId} during deletion attempt. Rollback.`);
            return false;
        }
        console.log(`[DB deleteEmployee] Employee record PK ${id} deleted successfully. Count: ${deleteEmployeeRes.rowCount}.`);

        if (userIdToDelete) {
            console.log(`[DB deleteEmployee] Attempting to delete associated user with ID: ${userIdToDelete} for tenant ${tenantId} using dbDeleteUserById.`);
            // Pass the client to dbDeleteUserById to keep it within the same transaction
            const userDeleted = await dbDeleteUserById(userIdToDelete, tenantId.toLowerCase(), client);
            if (userDeleted) {
                console.log(`[DB deleteEmployee] Successfully deleted user ${userIdToDelete}.`);
            } else {
                console.warn(`[DB deleteEmployee] User ${userIdToDelete} not found during employee cleanup, or an error occurred in dbDeleteUserById (which should ideally throw on error).`);
                // If dbDeleteUserById returns false on "not found" but doesn't throw, the transaction will still commit.
                // If it throws on error, this part of the log might not be reached if user deletion fails critically.
            }
        } else {
            console.log(`[DB deleteEmployee] No user_id associated with employee PK ${id}, or user_id was null. Skipping user deletion.`);
        }

        await client.query('COMMIT');
        console.log(`[DB deleteEmployee] Transaction committed for deletion of employee PK ${id}.`);
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DB deleteEmployee] Error during deletion of employee PK ${id} for tenant ${tenantId}. Transaction rolled back:`, err);
        throw err;
    } finally {
        client.release();
        console.log(`[DB deleteEmployee] Client released for deletion of employee PK ${id}.`);
    }
}

// Get employee by user_id (FK from users table) and tenant_id
export async function getEmployeeByUserId(userId: string, tenantId: string, client?: any): Promise<Employee | undefined> {
    console.log(`[DB getEmployeeByUserId] Validating IDs. User ID: ${userId}, Tenant ID: ${tenantId}`);
    if (!uuidRegex.test(userId)) {
        console.error(`[DB getEmployeeByUserId] Invalid userId format: ${userId}`);
        throw new Error("Invalid user identifier format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getEmployeeByUserId] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const conn = client || await pool.connect();
    try {
        console.log(`[DB getEmployeeByUserId] Querying for user_id: ${userId.toLowerCase()}, tenant_id: ${tenantId.toLowerCase()}`);
        const res = await conn.query('SELECT * FROM employees WHERE user_id = $1 AND tenant_id = $2', [userId.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeByUserId] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee by user_id ${userId} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        if (!client) conn.release();
    }
}

