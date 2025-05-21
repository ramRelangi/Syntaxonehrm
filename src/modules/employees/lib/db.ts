
import pool from '@/lib/db';
import type { Employee, EmployeeFormData } from '@/modules/employees/types';

// Function to map database row to Employee object
function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id ?? undefined,
        employeeId: row.employee_id ?? undefined,
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined,
        position: row.position,
        department: row.department,
        hireDate: new Date(row.hire_date).toISOString().split('T')[0],
        status: row.status as Employee['status'],
        dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().split('T')[0] : undefined,
        reportingManagerId: row.reporting_manager_id ?? null,
        workLocation: row.work_location ?? undefined,
        employmentType: row.employment_type as Employee['employmentType'] ?? 'Full-time',
    };
}

// Get employees for a specific tenant
export async function getAllEmployees(tenantId: string): Promise<Employee[]> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
        return res.rows.map(mapRowToEmployee);
    } catch (err) {
        console.error(`Error fetching all employees for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get employee by ID (ensure it belongs to the tenant)
export async function getEmployeeById(id: string, tenantId: string): Promise<Employee | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee with id ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
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
    const res = await client.query(query, [tenantId]);
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


export async function addEmployee(employeeData: Omit<EmployeeFormData, 'employeeId'> & { tenantId: string, userId: string }): Promise<Employee> {
    const client = await pool.connect();
    if (!employeeData.tenantId) {
        throw new Error("Tenant ID is required to add an employee.");
    }
     if (!employeeData.userId) {
        throw new Error("User ID is required to link employee to a user account.");
    }

    try {
        await client.query('BEGIN');

        const newEmployeeId = await generateNextEmployeeId(employeeData.tenantId, client);

        const query = `
            INSERT INTO employees (
                tenant_id, user_id, employee_id, name, email, phone, position, department,
                hire_date, status, date_of_birth, reporting_manager_id,
                work_location, employment_type
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;
        `;
        const values = [
            employeeData.tenantId,
            employeeData.userId,
            newEmployeeId,
            employeeData.name,
            employeeData.email,
            employeeData.phone || null,
            employeeData.position,
            employeeData.department,
            employeeData.hireDate,
            employeeData.status,
            employeeData.dateOfBirth || null,
            employeeData.reportingManagerId || null,
            employeeData.workLocation || null,
            employeeData.employmentType || 'Full-time',
        ];

        const res = await client.query(query, values);
        await client.query('COMMIT');
        return mapRowToEmployee(res.rows[0]);
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error adding employee:', err);
        if (err.code === '23505') {
            if (err.constraint === 'employees_tenant_id_email_key') {
                throw new Error('Email address already exists for this tenant.');
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

export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof EmployeeFormData]?: string } = {
        name: 'name',
        email: 'email',
        phone: 'phone',
        position: 'position',
        department: 'department',
        hireDate: 'hire_date',
        status: 'status',
        dateOfBirth: 'date_of_birth',
        reportingManagerId: 'reporting_manager_id',
        workLocation: 'work_location',
        employmentType: 'employment_type',
    };

    for (const key in updates) {
        if (key === 'tenantId' || key === 'employeeId' || key === 'userId') continue;
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof EmployeeFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                let value = updates[key as keyof EmployeeFormData];
                if (key === 'phone' && value === '') value = null;
                if (key === 'dateOfBirth' && value === '') value = null;
                if (key === 'reportingManagerId' && value === '') value = null;
                if (key === 'workLocation' && value === '') value = null;
                values.push(value);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) {
        return getEmployeeById(id, tenantId);
    }

    values.push(id);
    values.push(tenantId);
    const query = `
        UPDATE employees
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err: any) {
        console.error(`Error updating employee with id ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505') {
            if (err.constraint === 'employees_tenant_id_email_key') {
                throw new Error('Email address already exists for this tenant.');
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteEmployee(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get the user_id associated with this employee
        const employeeRes = await client.query('SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        const userIdToDelete = employeeRes.rows.length > 0 ? employeeRes.rows[0].user_id : null;

        // Delete the employee record
        const deleteEmployeeRes = await client.query('DELETE FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

        if (deleteEmployeeRes.rowCount === 0) {
            await client.query('ROLLBACK');
            console.warn(`Employee ${id} not found for tenant ${tenantId} during deletion.`);
            return false; // Employee not found or not deleted
        }

        // If a user_id was associated, delete the user record
        if (userIdToDelete) {
            console.log(`[DB deleteEmployee] Deleting associated user with ID: ${userIdToDelete} for employee ${id}`);
            const deleteUserRes = await client.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userIdToDelete, tenantId]);
            if (deleteUserRes.rowCount === 0) {
                // This case is less likely if FKs are set up correctly, but good to log
                console.warn(`[DB deleteEmployee] User ${userIdToDelete} not found or not deleted for tenant ${tenantId} during employee cleanup.`);
            } else {
                console.log(`[DB deleteEmployee] Successfully deleted user ${userIdToDelete}.`);
            }
        }

        await client.query('COMMIT');
        return true;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error deleting employee with id ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Needed for login restriction
export async function getEmployeeByUserId(userId: string, tenantId: string): Promise<Employee | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee by user_id ${userId} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

    