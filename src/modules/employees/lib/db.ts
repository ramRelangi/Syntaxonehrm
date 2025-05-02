
import pool from '@/lib/db';
import type { Employee, EmployeeFormData } from '@/modules/employees/types';

// Function to map database row to Employee object (handles potential nulls/naming differences)
function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id,
        tenantId: row.tenant_id, // Include tenantId
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined, // Handle null phone numbers
        position: row.position,
        department: row.department,
        hireDate: new Date(row.hire_date).toISOString().split('T')[0], // Format as YYYY-MM-DD
        status: row.status as Employee['status'], // Assume status matches type
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
        throw err; // Re-throw the error for the caller to handle
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
    // Note: Database should generate the ID (e.g., using UUID or SERIAL)
    const query = `
        INSERT INTO employees (tenant_id, name, email, phone, position, department, hire_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;
    // Ensure phone is null if empty string or undefined
    const phoneValue = employeeData.phone || null;
    const values = [
        employeeData.tenantId,
        employeeData.name,
        employeeData.email,
        phoneValue,
        employeeData.position,
        employeeData.department,
        employeeData.hireDate, // Should be YYYY-MM-DD string
        employeeData.status,
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToEmployee(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding employee:', err);
         // Check for specific DB errors like unique constraint violation
        if (err.code === '23505' && err.constraint === 'employees_tenant_id_email_key') { // Adjust constraint name if different
            throw new Error('Email address already exists for this tenant.');
        }
        throw err;
    } finally {
        client.release();
    }
}

// Update employee (ensure it belongs to the tenant)
export async function updateEmployee(id: string, tenantId: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
    const client = await pool.connect();
    // Build the SET part of the query dynamically
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    // Map keys to database columns and handle optional values
    const columnMap: { [K in keyof EmployeeFormData]?: string } = {
        name: 'name',
        email: 'email',
        phone: 'phone',
        position: 'position',
        department: 'department',
        hireDate: 'hire_date',
        status: 'status'
    };

    for (const key in updates) {
        // Don't allow updating tenantId via this function
        if (key === 'tenantId') continue;

        if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key as keyof EmployeeFormData] !== undefined) {
            const dbKey = columnMap[key as keyof EmployeeFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                 // Handle phone: store null if empty string provided in update
                if (key === 'phone') {
                    values.push(updates[key] || null);
                } else {
                    values.push(updates[key as keyof EmployeeFormData]);
                }
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) {
        // No valid fields to update, maybe just return the existing record?
        return getEmployeeById(id, tenantId);
    }

    values.push(id); // Add the ID for the WHERE clause
    values.push(tenantId); // Add the tenantId for the WHERE clause
    const query = `
        UPDATE employees
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined; // Employee not found or tenant mismatch
    } catch (err: any) {
        console.error(`Error updating employee with id ${id} for tenant ${tenantId}:`, err);
         if (err.code === '23505' && err.constraint === 'employees_tenant_id_email_key') {
            throw new Error('Email address already exists for this tenant.');
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
        return res.rowCount > 0; // Returns true if a row was deleted
    } catch (err) {
        console.error(`Error deleting employee with id ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Note: Schema updated in init-db.ts
