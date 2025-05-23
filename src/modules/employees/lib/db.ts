
import pool from '@/lib/db';
import type { Employee, EmployeeFormData, Gender } from '@/modules/employees/types';
import { initializeEmployeeBalancesForAllTypes } from '@/modules/leave/lib/db';
import type { UserRole } from '@/modules/auth/types';
import { deleteUserById as dbDeleteUserById } from '@/modules/auth/lib/db';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapRowToEmployee(row: any): Employee {
    // Maps to the new employees table structure
    return {
        id: row.id, // This is employees.id (PK, UUID)
        tenantId: row.tenant_id, // UUID
        userId: row.user_id ?? undefined, // UUID, FK to users.user_id
        employeeId: row.employee_id ?? undefined, // VARCHAR human-readable ID (e.g., EMP-001)
        name: row.name, // Generated column
        first_name: row.first_name,
        middle_name: row.middle_name ?? undefined,
        last_name: row.last_name,
        email: row.email,
        phone: row.phone ?? undefined, // Mapped from phone_number
        gender: row.gender as Gender ?? undefined,
        position: row.position ?? undefined,
        department: row.department ?? undefined,
        hireDate: row.hire_date ? new Date(row.hire_date).toISOString().split('T')[0] : undefined,
        status: row.status as Employee['status'],
        dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().split('T')[0] : undefined,
        reportingManagerId: row.reporting_manager_id ?? null,
        workLocation: row.work_location ?? undefined,
        employmentType: row.employment_type as Employee['employmentType'] ?? 'Full-time',
        role: row.role as UserRole ?? undefined, // Role comes from users table if joined, or set in action
    };
}

export async function getAllEmployees(tenantId: string): Promise<Employee[]> {
    if (!uuidRegex.test(tenantId)) {
        console.error(`[DB getAllEmployees] Invalid tenantId format: ${tenantId}`);
        throw new Error("Invalid tenant identifier format.");
    }
    const client = await pool.connect();
    try {
        const query = `
            SELECT
                e.id, e.tenant_id, e.user_id, e.employee_id,
                e.first_name, e.middle_name, e.last_name, e.name,
                e.date_of_birth, e.gender, e.marital_status, e.nationality, e.blood_group,
                e.personal_email, e.email, e.phone,
                e.emergency_contact_name, e.emergency_contact_number,
                e.created_at, e.updated_at, e.is_active,
                ed.position, d.department_name AS department, ed.joining_date AS hire_date,
                e.status,
                ed.reporting_manager_id, ed.work_location, ed.employment_type,
                u.role -- Fetch role from users table
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            LEFT JOIN employment_details ed ON e.id = ed.employee_id AND e.tenant_id = ed.tenant_id AND ed.is_active = TRUE
            LEFT JOIN departments d ON ed.department_id = d.id AND ed.tenant_id = d.tenant_id
            WHERE e.tenant_id = $1
            ORDER BY e.name ASC
        `;
        const res = await client.query(query, [tenantId.toLowerCase()]);
        return res.rows.map(mapRowToEmployee);
    } catch (err) {
        console.error(`Error fetching all employees for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

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
        const query = `
            SELECT
                e.id, e.tenant_id, e.user_id, e.employee_id,
                e.first_name, e.middle_name, e.last_name, e.name,
                e.date_of_birth, e.gender, e.marital_status, e.nationality, e.blood_group,
                e.personal_email, e.email, e.phone,
                e.emergency_contact_name, e.emergency_contact_number,
                e.created_at, e.updated_at, e.is_active,
                ed.position, d.department_name AS department, ed.joining_date AS hire_date,
                e.status,
                ed.reporting_manager_id, ed.work_location, ed.employment_type,
                u.role
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            LEFT JOIN employment_details ed ON e.id = ed.employee_id AND e.tenant_id = ed.tenant_id AND ed.is_active = TRUE
            LEFT JOIN departments d ON ed.department_id = d.id AND ed.tenant_id = d.tenant_id
            WHERE e.id = $1 AND e.tenant_id = $2
        `;
        console.log(`[DB getEmployeeById] Querying for employees.id (PK): ${id.toLowerCase()}, tenantId: ${tenantId.toLowerCase()}`);
        const res = await conn.query(query, [id.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeById] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee with id (PK) ${id} for tenant ${tenantId}:`, err);
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
    employeeData: Omit<EmployeeFormData, 'name' | 'status'> & { tenantId: string, userId: string, status?: Employee['status'] }
): Promise<Employee> {
    if (!uuidRegex.test(employeeData.tenantId)) throw new Error("Invalid tenant identifier format.");
    if (!uuidRegex.test(employeeData.userId)) throw new Error("Invalid user identifier format.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const newEmployeeSystemId = await generateNextEmployeeId(employeeData.tenantId, client);

        const {
            first_name, middle_name, last_name, dateOfBirth, gender, email, phone,
            position, department: departmentName, hireDate, reportingManagerId, workLocation, employmentType
        } = employeeData;
        
        const currentStatus = employeeData.status || 'Active'; // Default to active if not provided
        const isActive = currentStatus === 'Active';

        const employeeQuery = `
            INSERT INTO employees (
                tenant_id, user_id, employee_id, first_name, middle_name, last_name, date_of_birth, gender,
                email, phone, is_active, status, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            RETURNING id, name, status;
        `;
        const employeeValues = [
            employeeData.tenantId.toLowerCase(),
            employeeData.userId.toLowerCase(),
            newEmployeeSystemId,
            first_name, middle_name || null, last_name,
            dateOfBirth || null, gender || null, email, phone || null,
            isActive, currentStatus
        ];
        const empRes = await client.query(employeeQuery, employeeValues);
        const newEmployeePkId = empRes.rows[0].id;
        const generatedName = empRes.rows[0].name;
        const savedStatus = empRes.rows[0].status;

        let department_uuid_id: string | null = null;
        if (departmentName) {
            const deptRes = await client.query('SELECT id FROM departments WHERE tenant_id = $1 AND department_name = $2 LIMIT 1', [employeeData.tenantId, departmentName]);
            if (deptRes.rows.length > 0) department_uuid_id = deptRes.rows[0].id;
            else console.warn(`[DB addEmployeeInternal] Department "${departmentName}" not found for tenant ${employeeData.tenantId}. employment_details.department_id will be null.`);
        }
        
        let designation_uuid_id: string | null = null; // Placeholder, assuming designation name/level is not passed or resolved here for now

        const employmentDetailsQuery = `
            INSERT INTO employment_details (
                tenant_id, employee_id, department_id, designation_id, reporting_manager_id,
                employment_type, joining_date, is_active, position, work_location, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW());
        `;
        const employmentDetailsValues = [
            employeeData.tenantId.toLowerCase(), newEmployeePkId, department_uuid_id, designation_uuid_id,
            reportingManagerId || null, employmentType || 'Full-time', hireDate, isActive,
            position, workLocation || null
        ];
        await client.query(employmentDetailsQuery, employmentDetailsValues);

        await initializeEmployeeBalancesForAllTypes(employeeData.tenantId, newEmployeePkId, client);
        console.log(`[DB addEmployeeInternal] Initialized leave balances for new employee ${newEmployeePkId}`);

        await client.query('COMMIT');
        return {
            ...employeeData,
            id: newEmployeePkId,
            tenantId: employeeData.tenantId,
            userId: employeeData.userId,
            employeeId: newEmployeeSystemId,
            name: generatedName,
            status: savedStatus as Employee['status'],
            role: employeeData.role, // Role comes from form data / user creation
        } as Employee;
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding employee (internal):', err);
        if (err.code === '23505') {
            if (err.constraint === 'unique_employees_tenant_id_email') {
                throw new Error('Email address already exists for an employee in this tenant.');
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

export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    if (!uuidRegex.test(id)) throw new Error("Invalid employee identifier format.");
    if (!uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const empTableUpdates: Partial<any> = {};
        const empDetailsUpdates: Partial<any> = {};
        const userTableUpdates: Partial<any> = {};

        if (updates.first_name !== undefined) empTableUpdates.first_name = updates.first_name;
        if (updates.middle_name !== undefined) empTableUpdates.middle_name = updates.middle_name || null;
        if (updates.last_name !== undefined) empTableUpdates.last_name = updates.last_name;
        if (updates.dateOfBirth !== undefined) empTableUpdates.date_of_birth = updates.dateOfBirth || null;
        if (updates.gender !== undefined) empTableUpdates.gender = updates.gender || null;
        if (updates.email !== undefined) {
             empTableUpdates.email = updates.email;
             // If user_id is present on employee, update users table email too
             const emp = await getEmployeeById(id, tenantId, client);
             if (emp?.userId) userTableUpdates.email = updates.email;
        }
        if (updates.phone !== undefined) empTableUpdates.phone = updates.phone || null;
        if (updates.status !== undefined) {
            empTableUpdates.status = updates.status;
            empTableUpdates.is_active = updates.status === 'Active';
            empDetailsUpdates.is_active = updates.status === 'Active'; // Sync employment_details too
        }

        if (updates.position !== undefined) empDetailsUpdates.position = updates.position;
        if (updates.department !== undefined && updates.department !== null) {
            const deptRes = await client.query('SELECT id FROM departments WHERE tenant_id = $1 AND department_name = $2 LIMIT 1', [tenantId, updates.department]);
            if (deptRes.rows.length > 0) empDetailsUpdates.department_id = deptRes.rows[0].id;
            else console.warn(`Department ${updates.department} not found for update. Skipping department update.`);
        }
        if (updates.hireDate !== undefined) empDetailsUpdates.joining_date = updates.hireDate;
        if (updates.reportingManagerId !== undefined) empDetailsUpdates.reporting_manager_id = updates.reportingManagerId || null;
        if (updates.workLocation !== undefined) empDetailsUpdates.work_location = updates.workLocation || null;
        if (updates.employmentType !== undefined) empDetailsUpdates.employment_type = updates.employmentType;

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

        if (Object.keys(empDetailsUpdates).length > 0) {
            const setClausesDetails: string[] = [];
            const valuesDetails: any[] = [];
            let valueIndexDetails = 1;
            for (const key in empDetailsUpdates) {
                setClausesDetails.push(`${key} = $${valueIndexDetails++}`);
                valuesDetails.push(empDetailsUpdates[key]);
            }
            setClausesDetails.push(`updated_at = NOW()`);
            valuesDetails.push(id.toLowerCase());
            valuesDetails.push(tenantId.toLowerCase());
            const empDetailsUpdateQuery = `UPDATE employment_details SET ${setClausesDetails.join(', ')} WHERE employee_id = $${valueIndexDetails} AND tenant_id = $${valueIndexDetails + 1} AND is_active = TRUE`;
            await client.query(empDetailsUpdateQuery, valuesDetails);
        }
        
        // Update role in users table if provided and user_id exists
        if (updates.role !== undefined) {
            const empForUserUpdate = await getEmployeeById(id, tenantId, client); // Re-fetch to ensure we have user_id
            if (empForUserUpdate?.userId) {
                userTableUpdates.role = updates.role;
            }
        }
        if (Object.keys(userTableUpdates).length > 0) {
             const empForUserUpdate = await getEmployeeById(id, tenantId, client);
             if (empForUserUpdate?.userId) {
                const setClausesUser: string[] = [];
                const valuesUser: any[] = [];
                let valueIndexUser = 1;
                for (const key in userTableUpdates) {
                    setClausesUser.push(`${key} = $${valueIndexUser++}`);
                    valuesUser.push(userTableUpdates[key]);
                }
                setClausesUser.push(`updated_at = NOW()`);
                valuesUser.push(empForUserUpdate.userId.toLowerCase());
                valuesUser.push(tenantId.toLowerCase());
                const userUpdateQuery = `UPDATE users SET ${setClausesUser.join(', ')} WHERE user_id = $${valueIndexUser} AND tenant_id = $${valueIndexUser + 1}`;
                await client.query(userUpdateQuery, valuesUser);
                console.log(`[DB updateEmployee] Updated users table for user_id ${empForUserUpdate.userId}`);
             } else {
                 console.warn(`[DB updateEmployee] Cannot update users table as user_id is missing for employee ${id}`);
             }
        }


        await client.query('COMMIT');
        return getEmployeeById(id, tenantId);

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`Error updating employee with id (PK) ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505' && err.constraint === 'unique_employees_tenant_id_email') {
            throw new Error('Email address already exists for another employee in this tenant.');
        }
        throw err;
    } finally {
        client.release();
    }
}


export async function deleteEmployee(id: string, tenantId: string): Promise<boolean> {
    console.log(`[DB deleteEmployee] Attempting to delete employee PK ${id} for tenant ${tenantId}`);
    if (!uuidRegex.test(id)) throw new Error("Invalid employee identifier format.");
    if (!uuidRegex.test(tenantId)) throw new Error("Invalid tenant identifier.");

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log(`[DB deleteEmployee] Fetching employee record for PK ${id} to get user_id.`);
        const employeeRes = await client.query('SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        
        const userIdToDelete = employeeRes.rows.length > 0 ? employeeRes.rows[0].user_id : null;
        console.log(`[DB deleteEmployee] Found user_id to delete: ${userIdToDelete} (null if no user linked or employee not found).`);

        // First, delete from employment_details (or set FK to ON DELETE CASCADE in schema)
        await client.query('DELETE FROM employment_details WHERE employee_id = $1 AND tenant_id = $2', [id.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB deleteEmployee] Deleted employment_details for employee PK ${id}.`);


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
            const userDeleted = await dbDeleteUserById(userIdToDelete, tenantId.toLowerCase(), client); // Pass client for transaction
            if (userDeleted) {
                console.log(`[DB deleteEmployee] Successfully deleted user ${userIdToDelete}.`);
            } else {
                console.warn(`[DB deleteEmployee] User ${userIdToDelete} not found for tenant ${tenantId} or already deleted during employee cleanup.`);
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
                e.id, e.tenant_id, e.user_id, e.employee_id,
                e.first_name, e.middle_name, e.last_name, e.name,
                e.date_of_birth, e.gender, e.marital_status, e.nationality, e.blood_group,
                e.personal_email, e.email, e.phone,
                e.emergency_contact_name, e.emergency_contact_number,
                e.created_at, e.updated_at, e.is_active,
                ed.position, d.department_name AS department, ed.joining_date AS hire_date,
                e.status,
                ed.reporting_manager_id, ed.work_location, ed.employment_type,
                u.role
            FROM employees e
            LEFT JOIN users u ON e.user_id = u.user_id AND e.tenant_id = u.tenant_id
            LEFT JOIN employment_details ed ON e.id = ed.employee_id AND e.tenant_id = ed.tenant_id AND ed.is_active = TRUE
            LEFT JOIN departments d ON ed.department_id = d.id AND ed.tenant_id = d.tenant_id
            WHERE e.user_id = $1 AND e.tenant_id = $2
        `;
        console.log(`[DB getEmployeeByUserId] Querying for user_id: ${userId.toLowerCase()}, tenant_id: ${tenantId.toLowerCase()}`);
        const res = await conn.query(query, [userId.toLowerCase(), tenantId.toLowerCase()]);
        console.log(`[DB getEmployeeByUserId] Rows found: ${res.rows.length}`);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee by user_id ${userId} for tenant ${tenantId}:`, err);
        if(!client) throw err; else return undefined;
    } finally {
        if (!client && conn) conn.release();
    }
}
