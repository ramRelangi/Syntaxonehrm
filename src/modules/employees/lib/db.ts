
import pool from '@/lib/db';
import type { Employee, EmployeeFormData } from '@/modules/employees/types';

// Function to map database row to Employee object
function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id,
        tenantId: row.tenant_id,
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

// Add employee for a specific tenant
export async function addEmployee(employeeData: EmployeeFormData): Promise<Employee> {
    const client = await pool.connect();
    if (!employeeData.tenantId) {
        throw new Error("Tenant ID is required to add an employee.");
    }
    const query = `
        INSERT INTO employees (
            tenant_id, employee_id, name, email, phone, position, department, 
            hire_date, status, date_of_birth, reporting_manager_id, 
            work_location, employment_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
    `;
    const values = [
        employeeData.tenantId,
        employeeData.employeeId || null,
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
    try {
        const res = await client.query(query, values);
        return mapRowToEmployee(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding employee:', err);
        if (err.code === '23505') { // Unique constraint violation
            if (err.constraint === 'employees_tenant_id_email_key') {
                throw new Error('Email address already exists for this tenant.');
            }
            if (err.constraint === 'employees_tenant_id_employee_id_key') {
                throw new Error('Employee ID already exists for this tenant.');
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

// Update employee (ensure it belongs to the tenant)
export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof EmployeeFormData]?: string } = {
        employeeId: 'employee_id',
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
        if (key === 'tenantId') continue;
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof EmployeeFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                let value = updates[key as keyof EmployeeFormData];
                // Handle null explicitly for optional fields if empty string is passed
                if (key === 'phone' && value === '') value = null;
                if (key === 'employeeId' && value === '') value = null;
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
            if (err.constraint === 'employees_tenant_id_employee_id_key') {
                throw new Error('Employee ID already exists for this tenant.');
            }
        }
        throw err;
    } finally {
        client.release();
    }
}

// Delete employee (ensure it belongs to the tenant)
export async function deleteEmployee(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    const query = 'DELETE FROM employees WHERE id = $1 AND tenant_id = $2';
    try {
        const res = await client.query(query, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting employee with id ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}
