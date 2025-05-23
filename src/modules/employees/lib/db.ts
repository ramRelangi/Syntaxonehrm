
import pool from '@/lib/db';
import type { Employee, EmployeeFormData, Gender, EmploymentType } from '@/modules/employees/types';
import { initializeEmployeeBalancesForAllTypes } from '@/modules/leave/lib/db';
import type { UserRole } from '@/modules/auth/types';
import { deleteUserById as dbDeleteUserById } from '@/modules/auth/lib/db';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapRowToEmployee(row: any): Employee {
    // Maps to the columns directly available from the 'employees' table
    // and potentially joined 'users' table.
    return {
        id: row.id, // PK: employees.id (UUID)
        tenantId: row.tenant_id,
        userId: row.user_id ?? undefined,
        employeeId: row.employee_id ?? undefined, // Human-readable
        name: row.name, // Generated column
        first_name: row.first_name,
        middle_name: row.middle_name ?? undefined,
        last_name: row.last_name,
        email: row.email, // Official email from employees table
        personal_email: row.personal_email ?? undefined,
        phone: row.phone ?? undefined,
        gender: row.gender as Gender ?? undefined,
        dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().split('T')[0] : undefined,
        marital_status: row.marital_status ?? undefined,
        nationality: row.nationality ?? undefined,
        blood_group: row.blood_group ?? undefined,
        emergency_contact_name: row.emergency_contact_name ?? undefined,
        emergency_contact_number: row.emergency_contact_number ?? undefined,
        is_active: row.is_active,
        status: row.status as Employee['status'],
        reportingManagerId: row.reporting_manager_id ?? null,

        // Direct fields from employees table as per latest schema
        position: row.position ?? undefined,
        department: row.department ?? undefined, // This is the VARCHAR field from employees table
        workLocation: row.work_location ?? undefined,
        employmentType: row.employment_type as EmploymentType ?? undefined,
        hireDate: row.hire_date ? new Date(row.hire_date).toISOString().split('T')[0] : undefined,

        role: row.user_role as UserRole ?? undefined, // Role from joined users table
    };
}

// Fetches all employees for a tenant.
// It now primarily relies on the 'employees' table for most details.
// Joins with 'users' to get the role.
export async function getAllEmployees(tenantId: string): Promise<Employee[]> {
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getAllEmployees] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const client = await pool.connect();
    try {
        // Simplified query to reflect that most employment details are now directly on employees table
        const query = `
            SELECT
                e.*, -- Select all columns from employees
                u.role AS user_role -- Get role from users table
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            WHERE e.tenant_id = $1
            ORDER BY e.name ASC
        `;
        console.log(`[DB getAllEmployees] Querying for tenantId: ${tenantId.toLowerCase()}`);
        const res = await client.query(query, [tenantId.toLowerCase()]);
        return res.rows.map(mapRowToEmployee);
    } catch (err: any) {
        console.error(`Error fetching all employees for tenant ${tenantId}:`, err);
        if (err.code === '42703') { // Column does not exist
             console.error("Query causing 'column does not exist':", err.query || 'Could not retrieve query from error object');
        }
        throw err;
    } finally {
        client.release();
    }
}

// Fetches a single employee by their primary key (employees.id)
export async function getEmployeeById(id: string, tenantId: string, client?: any): Promise<Employee | undefined> {
    console.log(`[DB getEmployeeById] Validating IDs. Employee PK: ${id}, Tenant ID: ${tenantId}`);
    if (!uuidRegex.test(id)) {
        console.error(`[DB getEmployeeById] Invalid employee ID (PK) format: ${id}`);
        throw new Error("Invalid employee identifier (PK) format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getEmployeeById] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const conn = client || await pool.connect();
    try {
        const query = `
            SELECT
                e.*,
                u.role AS user_role
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            WHERE e.id = $1 AND e.tenant_id = $2
        `;
        console.log(`[DB getEmployeeById] Querying for employees.id (PK): ${id.toLowerCase()}, tenantId: ${tenantId.toLowerCase()}`);
        const res = await conn.query(query, [id.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeById] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err: any) {
        console.error(`Error fetching employee with id (PK) ${id} for tenant ${tenantId}:`, err);
        if (err.code === '42703') {
             console.error("Query causing 'column does not exist':", err.query || 'Could not retrieve query from error object');
        }
        if(!client) throw err; else return undefined;
    } finally {
        if (!client && conn) conn.release();
    }
}

// Generates the next human-readable employee_id (e.g., EMP-001)
async function generateNextEmployeeId(tenantId: string, client: any): Promise<string> {
    const prefix = "EMP-";
    const query = `
        SELECT employee_id FROM employees
        WHERE tenant_id = $1 AND employee_id ~ '^${prefix}[0-9]+$'
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

// Adds an employee record. Expects most details to be for the 'employees' table directly.
// The 'role' from employeeData will be used for the 'users' table, not 'employees'.
export async function addEmployeeInternal(
    employeeData: Omit<EmployeeFormData, 'name'> & { tenantId: string, userId: string, status?: Employee['status'], role: UserRole }
): Promise<Employee> {
    if (!uuidRegex.test(employeeData.tenantId)) throw new Error("Invalid tenant identifier format.");
    if (!uuidRegex.test(employeeData.userId)) throw new Error("Invalid user identifier format.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const newEmployeeHumanId = await generateNextEmployeeId(employeeData.tenantId, client);

        const {
            first_name, middle_name, last_name, dateOfBirth, gender, email, personal_email, phone,
            marital_status, nationality, blood_group, emergency_contact_name, emergency_contact_number,
            position, department, hireDate, reportingManagerId, workLocation, employmentType
        } = employeeData;
        
        const currentStatus = employeeData.status || 'Active';
        const isActive = currentStatus === 'Active';

        // Insert into 'employees' table
        const employeeQuery = `
            INSERT INTO employees (
                tenant_id, user_id, employee_id, first_name, middle_name, last_name, date_of_birth, gender,
                marital_status, nationality, blood_group, personal_email, email, phone,
                emergency_contact_name, emergency_contact_number,
                is_active, status, reporting_manager_id,
                position, department, work_location, employment_type, hire_date,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
            RETURNING id, name, status;
        `;
        const employeeValues = [
            employeeData.tenantId.toLowerCase(), employeeData.userId.toLowerCase(), newEmployeeHumanId,
            first_name, middle_name || null, last_name, dateOfBirth || null, gender || null,
            marital_status || null, nationality || null, blood_group || null, personal_email || null, email, phone || null,
            emergency_contact_name || null, emergency_contact_number || null,
            isActive, currentStatus, reportingManagerId || null,
            position || null, department || null, workLocation || null, employmentType || 'Full-time', hireDate || null
        ];
        const empRes = await client.query(employeeQuery, employeeValues);
        const newEmployeePkId = empRes.rows[0].id;
        const generatedName = empRes.rows[0].name;
        const savedStatus = empRes.rows[0].status;

        // TODO: Handle employment_details table insertion if department/designation IDs are to be managed.
        // For now, we are using the direct VARCHAR fields on employees table.

        await initializeEmployeeBalancesForAllTypes(employeeData.tenantId, newEmployeePkId, client);
        console.log(`[DB addEmployeeInternal] Initialized leave balances for new employee ${newEmployeePkId}`);

        await client.query('COMMIT');
        // Construct the Employee object to return, matching the Employee interface
        const createdEmployee = await getEmployeeById(newEmployeePkId, employeeData.tenantId, client);
        if (!createdEmployee) throw new Error("Failed to retrieve newly created employee details.");
        return createdEmployee;

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding employee (internal):', err);
        if (err.code === '23505') { // Unique constraint violation
            if (err.constraint === 'unique_employees_tenant_id_email') {
                throw new Error('Official email address already exists for an employee in this tenant.');
            }
            if (err.constraint === 'unique_tenant_employee_code') {
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

// Updates an employee record. Expects 'updates' to contain fields for 'employees' table.
export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    if (!uuidRegex.test(id)) throw new Error("Invalid employee identifier (PK) format.");
    if (!uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const empTableUpdates: Partial<any> = {};
        // Map EmployeeFormData fields to employees table columns
        if (updates.first_name !== undefined) empTableUpdates.first_name = updates.first_name;
        if (updates.middle_name !== undefined) empTableUpdates.middle_name = updates.middle_name || null;
        if (updates.last_name !== undefined) empTableUpdates.last_name = updates.last_name;
        if (updates.dateOfBirth !== undefined) empTableUpdates.date_of_birth = updates.dateOfBirth || null;
        if (updates.gender !== undefined) empTableUpdates.gender = updates.gender || null;
        if (updates.email !== undefined) empTableUpdates.email = updates.email;
        if (updates.personal_email !== undefined) empTableUpdates.personal_email = updates.personal_email || null;
        if (updates.phone !== undefined) empTableUpdates.phone = updates.phone || null;
        if (updates.marital_status !== undefined) empTableUpdates.marital_status = updates.marital_status || null;
        if (updates.nationality !== undefined) empTableUpdates.nationality = updates.nationality || null;
        if (updates.blood_group !== undefined) empTableUpdates.blood_group = updates.blood_group || null;
        if (updates.emergency_contact_name !== undefined) empTableUpdates.emergency_contact_name = updates.emergency_contact_name || null;
        if (updates.emergency_contact_number !== undefined) empTableUpdates.emergency_contact_number = updates.emergency_contact_number || null;
        if (updates.status !== undefined) {
            empTableUpdates.status = updates.status;
            empTableUpdates.is_active = updates.status === 'Active';
        }
        if (updates.reportingManagerId !== undefined) empTableUpdates.reporting_manager_id = updates.reportingManagerId || null;
        
        // Direct fields on employees table
        if (updates.position !== undefined) empTableUpdates.position = updates.position || null;
        if (updates.department !== undefined) empTableUpdates.department = updates.department || null;
        if (updates.workLocation !== undefined) empTableUpdates.work_location = updates.workLocation || null;
        if (updates.employmentType !== undefined) empTableUpdates.employment_type = updates.employmentType || null;
        if (updates.hireDate !== undefined) empTableUpdates.hire_date = updates.hireDate || null;


        if (Object.keys(empTableUpdates).length > 0) {
            const setClausesEmp: string[] = [];
            const valuesEmp: any[] = [];
            let valueIndexEmp = 1;
            for (const key in empTableUpdates) {
                setClausesEmp.push(`${key} = $${valueIndexEmp++}`);
                valuesEmp.push(empTableUpdates[key]);
            }
            setClausesEmp.push(`updated_at = NOW()`);
            valuesEmp.push(id.toLowerCase());
            valuesEmp.push(tenantId.toLowerCase());
            const empUpdateQuery = `UPDATE employees SET ${setClausesEmp.join(', ')} WHERE id = $${valueIndexEmp} AND tenant_id = $${valueIndexEmp + 1}`;
            await client.query(empUpdateQuery, valuesEmp);
        }

        // Update user's role if provided and user_id exists for this employee
        if (updates.role !== undefined) {
            const empForUserUpdate = await getEmployeeById(id, tenantId, client);
            if (empForUserUpdate?.userId) {
                await client.query(
                    'UPDATE users SET role = $1, updated_at = NOW() WHERE user_id = $2 AND tenant_id = $3',
                    [updates.role, empForUserUpdate.userId.toLowerCase(), tenantId.toLowerCase()]
                );
                console.log(`[DB updateEmployee] Updated users table role for user_id ${empForUserUpdate.userId}`);
            } else {
                console.warn(`[DB updateEmployee] Cannot update role in users table as user_id is missing for employee ${id}`);
            }
        }

        // TODO: Handle employment_details update if department/designation IDs change.

        await client.query('COMMIT');
        return getEmployeeById(id, tenantId);

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`Error updating employee with id (PK) ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505' && err.constraint === 'unique_employees_tenant_id_email') {
            throw new Error('Official email address already exists for another employee in this tenant.');
        }
        throw err;
    } finally {
        client.release();
    }
}

// Deletes an employee and their associated user account.
export async function deleteEmployee(id: string, tenantId: string): Promise<boolean> {
    console.log(`[DB deleteEmployee] Attempting to delete employee PK ${id} for tenant ${tenantId}`);
    if (!uuidRegex.test(id)) {
        console.error("[DB deleteEmployee] Invalid employee ID format:", id);
        throw new Error("Invalid employee identifier format.");
    }
    if (!uuidRegex.test(tenantId)) {
        console.error("[DB deleteEmployee] Invalid tenant ID format:", tenantId);
        throw new Error("Invalid tenant identifier.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log(`[DB deleteEmployee] Fetching employee record for PK ${id} to get user_id.`);
        const employeeRes = await client.query('SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        
        const userIdToDelete = employeeRes.rows.length > 0 ? employeeRes.rows[0].user_id : null;
        console.log(`[DB deleteEmployee] Found user_id to delete: ${userIdToDelete} (null if no user linked or employee not found).`);

        // It's crucial to delete records that depend on 'employees.id' first if ON DELETE CASCADE is not fully set up or to be safe
        // Example: If employee_assets, employment_details, etc., have FKs to employees.id without ON DELETE CASCADE,
        // they would need to be deleted here. Your schema uses ON DELETE CASCADE for employment_details, employee_address, etc.
        // So, deleting from 'employees' should cascade to those.

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
            // Pass the client to dbDeleteUserById to ensure it's part of the same transaction.
            const userDeleted = await dbDeleteUserById(userIdToDelete, tenantId.toLowerCase(), client);
            if (userDeleted) {
                console.log(`[DB deleteEmployee] Successfully deleted user ${userIdToDelete}.`);
            } else {
                // This might happen if the user_id was already unlinked or if dbDeleteUserById has an issue.
                console.warn(`[DB deleteEmployee] User ${userIdToDelete} not found for tenant ${tenantId} or already deleted during employee cleanup. This might be okay if employee was not linked to a user.`);
            }
        } else {
            console.log(`[DB deleteEmployee] No user_id associated with employee PK ${id}, or user_id was null. Skipping user deletion.`);
        }

        await client.query('COMMIT');
        console.log(`[DB deleteEmployee] Transaction committed for deletion of employee PK ${id}.`);
        return true;
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`[DB deleteEmployee] Error during deletion of employee PK ${id} for tenant ${tenantId}. Transaction rolled back:`, err);
        throw err; // Re-throw error to be handled by the action
    } finally {
        client.release();
        console.log(`[DB deleteEmployee] Client released for deletion of employee PK ${id}.`);
    }
}

// Fetches an employee by their user_id (FK from users table)
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
        const query = `
            SELECT
                e.*,
                u.role AS user_role
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            WHERE e.user_id = $1 AND e.tenant_id = $2
        `;
        console.log(`[DB getEmployeeByUserId] Querying for employees.user_id: ${userId.toLowerCase()}, tenant_id: ${tenantId.toLowerCase()}`);
        const res = await conn.query(query, [userId.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeByUserId] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err: any) {
        console.error(`Error fetching employee by user_id ${userId} for tenant ${tenantId}:`, err);
        if (err.code === '42703') {
             console.error("Query causing 'column does not exist':", err.query || 'Could not retrieve query from error object');
        }
        if(!client) throw err; else return undefined;
    } finally {
        if (!client && conn) conn.release();
    }
}
