
import pool from '@/lib/db';
import type { Employee, EmployeeFormData, Gender, EmploymentType, EmployeeStatus } from '@/modules/employees/types';
import { initializeEmployeeBalancesForAllTypes } from '@/modules/leave/lib/db';
import type { UserRole } from '@/modules/auth/types';
import { deleteUserById as dbDeleteUserById } from '@/modules/auth/lib/db';
import { formatISO, isValid, parseISO } from 'date-fns';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id, // PK: employees.id (UUID)
        tenantId: row.tenant_id,
        userId: row.user_id ?? null,
        employeeId: row.employee_id ?? null, // Human-readable

        first_name: row.first_name,
        middle_name: row.middle_name ?? null,
        last_name: row.last_name,
        name: row.name, // Generated column

        dateOfBirth: row.date_of_birth ? formatISO(new Date(row.date_of_birth), { representation: 'date' }) : null,
        gender: row.gender as Gender ?? null,
        marital_status: row.marital_status ?? null,
        nationality: row.nationality ?? null,
        blood_group: row.blood_group ?? null,

        email: row.email, // Official email from employees table
        personal_email: row.personal_email ?? null,
        phone: row.phone ?? null,

        emergency_contact_name: row.emergency_contact_name ?? null,
        emergency_contact_number: row.emergency_contact_number ?? null,

        position: row.position ?? null,
        department: row.department ?? null,
        hireDate: row.hire_date ? formatISO(new Date(row.hire_date), { representation: 'date' }) : null,
        workLocation: row.work_location ?? null,
        employmentType: row.employment_type as EmploymentType ?? null,
        reportingManagerId: row.reporting_manager_id ?? null,

        status: row.status as EmployeeStatus,
        is_active: row.is_active,

        role: row.user_role as UserRole ?? null, // Role from joined users table

        created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
}

export async function getAllEmployees(tenantId: string): Promise<Employee[]> {
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getAllEmployees] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const client = await pool.connect();
    try {
        // Selects direct fields from 'employees' table and 'role' from 'users'
        const query = `
            SELECT
                e.*, 
                u.role AS user_role
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
        if (err.code === '42703') { 
             console.error("Query causing 'column does not exist':", err.query || 'Could not retrieve query from error object');
        }
        throw err;
    } finally {
        client.release();
    }
}

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

export async function addEmployeeInternal(
    employeeData: Omit<EmployeeFormData, 'role'> & { tenantId: string, userId: string, status?: EmployeeStatus }
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

        const employeeQuery = `
            INSERT INTO employees (
                tenant_id, user_id, employee_id, first_name, middle_name, last_name,
                date_of_birth, gender, marital_status, nationality, blood_group,
                personal_email, email, phone, emergency_contact_name, emergency_contact_number,
                is_active, status, reporting_manager_id,
                position, department, work_location, employment_type, hire_date,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
            RETURNING id; 
        `;
        const employeeValues = [
            employeeData.tenantId.toLowerCase(), employeeData.userId.toLowerCase(), newEmployeeHumanId,
            first_name, middle_name || null, last_name,
            dateOfBirth || null, gender || null, marital_status || null, nationality || null, blood_group || null,
            personal_email || null, email, phone || null, emergency_contact_name || null, emergency_contact_number || null,
            isActive, currentStatus, reportingManagerId || null,
            position || null, department || null, workLocation || null, employmentType || 'Full-time', hireDate || null
        ];
        const empRes = await client.query(employeeQuery, employeeValues);
        const newEmployeePkId = empRes.rows[0].id;
        
        // Insert into employment_details (basic record)
        // For now, assuming department_id and designation_id might need to be looked up or handled differently
        // This part needs robust handling of finding/creating department and designation records
        // For this pass, we'll insert with placeholder/nullable values if actual IDs aren't readily available
        // from simple string inputs for department/position on the form.
        // A more complete solution would involve selecting department/designation IDs from dropdowns.
        // For now, we'll skip inserting into employment_details if department/designation FKs are required and not easily derived.
        // Or, if employees.department and employees.position are the primary source, employment_details might only store changes/history.
        // The schema has department_id and designation_id as NOT NULL in employment_details.
        // This means we MUST provide valid UUIDs or the insert will fail.
        // For now, we'll defer complex employment_details logic and assume the direct fields on `employees` are sufficient.

        await initializeEmployeeBalancesForAllTypes(employeeData.tenantId, newEmployeePkId, client);
        console.log(`[DB addEmployeeInternal] Initialized leave balances for new employee ${newEmployeePkId}`);

        await client.query('COMMIT');
        const createdEmployee = await getEmployeeById(newEmployeePkId, employeeData.tenantId, client);
        if (!createdEmployee) throw new Error("Failed to retrieve newly created employee details after commit.");
        return createdEmployee;

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding employee (internal):', err);
        if (err.code === '23505') { 
            if (err.constraint === 'unique_employees_tenant_id_email') {
                throw new Error('Official email address already exists for an employee in this tenant.');
            }
            if (err.constraint === 'unique_tenant_employee_code') {
                throw new Error('Generated Employee ID already exists. Please try again.');
            }
            if (err.constraint === 'employees_user_id_key' || err.constraint === 'users_employee_id_key') {
                 throw new Error('This user account is already linked to an employee profile.');
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData & { role?: UserRole }>): Promise<Employee | undefined> {
    if (!uuidRegex.test(id)) throw new Error("Invalid employee identifier (PK) format.");
    if (!uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const empTableUpdates: Partial<any> = {};
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

        // Placeholder for updating employment_details if needed
        // This would involve fetching the current employment_details record,
        // updating it or creating a new one if employment terms change significantly.

        await client.query('COMMIT');
        return getEmployeeById(id, tenantId, client); 

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

        // Cascading deletes should handle related tables like employment_details, employee_address, etc.
        // if foreign keys are set up with ON DELETE CASCADE.
        // The schema has ON DELETE CASCADE for employee_address, employee_documents, employment_details.
        // It also has ON DELETE SET NULL for employees.user_id if user is deleted,
        // and users.employee_id if employee is deleted.

        const updateManagerRefsQuery = 'UPDATE employees SET reporting_manager_id = NULL WHERE reporting_manager_id = $1 AND tenant_id = $2';
        await client.query(updateManagerRefsQuery, [id.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB deleteEmployee] Nullified reporting_manager_id references for employee PK ${id}.`);
        
        const deleteEmployeeRes = await client.query('DELETE FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        
        if (deleteEmployeeRes.rowCount === 0) {
            await client.query('ROLLBACK');
            console.warn(`[DB deleteEmployee] Employee PK ${id} not found for tenant ${tenantId} during deletion attempt. Rollback.`);
            return false;
        }
        console.log(`[DB deleteEmployee] Employee record PK ${id} deleted successfully. Count: ${deleteEmployeeRes.rowCount}.`);

        // users.employee_id is FK to employees.id, so if employees.id is deleted,
        // users.employee_id will be set to NULL due to ON DELETE SET NULL.
        // If we want to delete the user as well:
        if (userIdToDelete) {
            console.log(`[DB deleteEmployee] Attempting to delete associated user with ID: ${userIdToDelete} for tenant ${tenantId} using dbDeleteUserById.`);
            const userDeleted = await dbDeleteUserById(userIdToDelete, tenantId.toLowerCase(), client); 
            if (userDeleted) {
                console.log(`[DB deleteEmployee] Successfully deleted user ${userIdToDelete}.`);
            } else {
                console.warn(`[DB deleteEmployee] User ${userIdToDelete} not found for tenant ${tenantId} or already deleted.`);
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
        throw err; 
    } finally {
        client.release();
        console.log(`[DB deleteEmployee] Client released for deletion of employee PK ${id}.`);
    }
}
