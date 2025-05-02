import pool from '@/lib/db';
import type { Employee, EmployeeFormData } from '@/modules/employees/types';

// Function to map database row to Employee object (handles potential nulls/naming differences)
function mapRowToEmployee(row: any): Employee {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined, // Handle null phone numbers
        position: row.position,
        department: row.department,
        hireDate: new Date(row.hire_date).toISOString().split('T')[0], // Format as YYYY-MM-DD
        status: row.status as Employee['status'], // Assume status matches type
    };
}

export async function getAllEmployees(): Promise<Employee[]> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees ORDER BY name ASC');
        return res.rows.map(mapRowToEmployee);
    } catch (err) {
        console.error('Error fetching all employees:', err);
        throw err; // Re-throw the error for the caller to handle
    } finally {
        client.release();
    }
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error fetching employee with id ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addEmployee(employeeData: EmployeeFormData): Promise<Employee> {
    const client = await pool.connect();
    // Note: Database should generate the ID (e.g., using UUID or SERIAL)
    const query = `
        INSERT INTO employees (name, email, phone, position, department, hire_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
    `;
    // Ensure phone is null if empty string or undefined
    const phoneValue = employeeData.phone || null;
    const values = [
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
        if (err.code === '23505' && err.constraint === 'employees_email_key') { // Adjust constraint name if different
            throw new Error('Email address already exists.');
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function updateEmployee(id: string, updates: Partial<EmployeeFormData>): Promise<Employee | undefined> {
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
        return getEmployeeById(id);
    }

    values.push(id); // Add the ID for the WHERE clause
    const query = `
        UPDATE employees
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            return mapRowToEmployee(res.rows[0]);
        }
        return undefined; // Employee not found
    } catch (err: any) {
        console.error(`Error updating employee with id ${id}:`, err);
         if (err.code === '23505' && err.constraint === 'employees_email_key') {
            throw new Error('Email address already exists.');
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteEmployee(id: string): Promise<boolean> {
    const client = await pool.connect();
    const query = 'DELETE FROM employees WHERE id = $1';
    try {
        const res = await client.query(query, [id]);
        return res.rowCount > 0; // Returns true if a row was deleted
    } catch (err) {
        console.error(`Error deleting employee with id ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// --- Database Schema (for reference, run this in your DB tool) ---
/*
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- If using UUIDs

CREATE TYPE employee_status AS ENUM ('Active', 'Inactive', 'On Leave');

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    position VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    hire_date DATE NOT NULL,
    status employee_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

*/
