
import pool from '@/lib/db';
import type { Tenant, User } from '@/modules/auth/types';
import type { Employee } from '@/modules/employees/types'; // For Employee type hint

// --- Tenant Operations ---

function mapRowToTenant(row: any): Tenant {
    return {
        tenant_id: row.tenant_id,
        name: row.name,
        subdomain: row.subdomain,
        status: row.status,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
}

export async function addTenant(tenantData: Pick<Tenant, 'name' | 'subdomain'>): Promise<Tenant> {
    const client = await pool.connect();
    console.log(`[DB addTenant] Attempting to add tenant: ${tenantData.name}, Subdomain: ${tenantData.subdomain}`);
    const query = `
        INSERT INTO tenants (name, subdomain, status, created_at, updated_at)
        VALUES ($1, $2, 'ACTIVE', NOW(), NOW())
        RETURNING *;
    `;
    const values = [tenantData.name, tenantData.subdomain.toLowerCase()];
    try {
        const res = await client.query(query, values);
        const tenant = mapRowToTenant(res.rows[0]);
        console.log(`[DB addTenant] Tenant added successfully: ID ${tenant.tenant_id}`);
        return tenant;
    } catch (err: any) {
        console.error('[DB addTenant] Error adding tenant:', err);
        if (err.code === '23505') {
            if (err.constraint === 'tenants_subdomain_key') {
                throw new Error('Tenant subdomain already exists.');
            }
            if (err.constraint === 'unique_tenant_name') {
                 throw new Error('Tenant name already exists.');
            }
        }
        if (err.code === '42P01') { // undefined_table
            throw new Error('Database schema not initialized. Relation "tenants" does not exist.');
        }
        throw err;
    } finally {
        client.release();
        console.log('[DB addTenant] Client released.');
    }
}

export async function getTenantById(tenant_id: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    console.log(`[DB getTenantById] Fetching tenant with ID: ${tenant_id}`);
    try {
        const res = await client.query('SELECT * FROM tenants WHERE tenant_id = $1', [tenant_id]);
        const tenant = res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
        console.log(`[DB getTenantById] Tenant found: ${!!tenant}`);
        return tenant;
    } catch (err: any) {
        console.error(`[DB getTenantById] Error fetching tenant ${tenant_id}:`, err);
         if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "tenants" does not exist.');
        }
        throw err;
    } finally {
        client.release();
        console.log('[DB getTenantById] Client released.');
    }
}

export async function getTenantByDomain(subdomain: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    const lowerCaseSubdomain = subdomain.toLowerCase();
    console.log(`[DB getTenantByDomain] Fetching tenant with subdomain: ${lowerCaseSubdomain}`);
    try {
        const res = await client.query('SELECT * FROM tenants WHERE subdomain = $1', [lowerCaseSubdomain]);
        const tenant = res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
        console.log(`[DB getTenantByDomain] Tenant found: ${!!tenant}`);
        return tenant;
    } catch (err: any) {
        console.error(`[DB getTenantByDomain] Error fetching tenant by subdomain ${lowerCaseSubdomain}:`, err);
         if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "tenants" does not exist.');
        }
        throw err;
    } finally {
         client.release();
         console.log('[DB getTenantByDomain] Client released.');
    }
}

// --- User Operations ---

function mapRowToUser(row: any): User {
    console.log('[mapRowToUser] Mapping row:', row);
    const user = {
        user_id: row.user_id,
        tenant_id: row.tenant_id,
        employee_id: row.employee_id ?? undefined,
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email,
        name: row.name,
        role: row.role,
        is_active: row.is_active,
        last_login: row.last_login ? new Date(row.last_login).toISOString() : undefined,
        failed_attempts: row.failed_attempts,
        account_locked: row.account_locked,
        password_changed_at: row.password_changed_at ? new Date(row.password_changed_at).toISOString() : undefined,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
    console.log('[mapRowToUser] Mapped user object:', user);
    return user;
}

export async function addUser(userData: Omit<User, 'user_id' | 'created_at' | 'updated_at' | 'last_login' | 'failed_attempts' | 'account_locked' | 'password_changed_at'>): Promise<User> {
    const client = await pool.connect();
    console.log(`[DB addUser] Attempting to add user: ${userData.username} (Email: ${userData.email}) for tenant ${userData.tenant_id || 'SYSTEM'}`);
    const query = `
        INSERT INTO users (tenant_id, employee_id, username, password_hash, email, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *;
    `;
    const values = [
        userData.tenant_id,
        userData.employee_id || null,
        userData.username.toLowerCase(),
        userData.passwordHash,
        userData.email.toLowerCase(),
        userData.name,
        userData.role,
        userData.is_active ?? true,
    ];
    try {
        const res = await client.query(query, values);
        const user = mapRowToUser(res.rows[0]);
        console.log(`[DB addUser] User added successfully: user_id ${user.user_id}, username ${user.username}`);
        return user;
    } catch (err: any) {
        console.error('[DB addUser] Error adding user:', err);
         if (err.code === '23505') {
            if (err.constraint === 'unique_tenant_username') {
                 throw new Error('Username already exists for this tenant.');
            }
            if (err.constraint === 'unique_tenant_email') {
                 throw new Error('Email address already exists for this tenant.');
            }
            if (err.constraint === 'users_employee_id_key') {
                throw new Error('This employee is already linked to a user account.');
            }
             if (err.constraint === 'unique_username') { // For schema without tenantId unique constraint
                 throw new Error('Username already exists.');
             }
             if (err.constraint === 'unique_email') { // For schema without tenantId unique constraint
                 throw new Error('Email address already exists.');
             }
        }
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
        client.release();
        console.log('[DB addUser] Client released.');
    }
}

export async function getUserById(user_id: string, client?: any): Promise<User | undefined> {
    const conn = client || await pool.connect();
    console.log(`[DB getUserById] Fetching user with user_id: ${user_id}`);
    try {
        const res = await conn.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserById] User found for user_id ${user_id}:`, user ? { userId: user.user_id, username: user.username } : 'undefined');
        return user;
    } catch (err: any) {
        console.error(`[DB getUserById] Error fetching user ${user_id}:`, err);
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
        if (!client) conn.release();
        console.log('[DB getUserById] Client released if not passed externally.');
    }
}

export async function getUserByEmail(email: string, tenantId: string | null): Promise<User | undefined> {
    const client = await pool.connect();
    const lowerCaseEmail = email.toLowerCase();
    console.log(`[DB getUserByEmail] Fetching user with email: ${lowerCaseEmail} for tenant ${tenantId || 'SYSTEM'}`);
    let query;
    let values;
    if (tenantId) {
        query = 'SELECT * FROM users WHERE tenant_id = $1 AND email = $2';
        values = [tenantId, lowerCaseEmail];
    } else {
        // This case might not be relevant if all users are tenant-specific as per new schema
        query = 'SELECT * FROM users WHERE email = $1'; // Assuming email is globally unique if no tenantId
        values = [lowerCaseEmail];
    }

    try {
        const res = await client.query(query, values);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserByEmail] User found for email ${lowerCaseEmail}, tenant ${tenantId || 'SYSTEM'}:`, user ? { userId: user.user_id, username: user.username } : 'undefined');
        return user;
    } catch (err: any) {
        console.error(`[DB getUserByEmail] Error fetching user by email ${lowerCaseEmail} for tenant ${tenantId || 'SYSTEM'}:`, err);
         if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
         client.release();
         console.log('[DB getUserByEmail] Client released.');
    }
}

export async function getUserByUsername(username: string, tenantId: string | null): Promise<User | undefined> {
    const client = await pool.connect();
    const lowerCaseUsername = username.toLowerCase();
    console.log(`[DB getUserByUsername] Fetching user with username: ${lowerCaseUsername} for tenant ${tenantId || 'SYSTEM'}`);
     let query;
    let values;
    if (tenantId) {
        query = 'SELECT * FROM users WHERE tenant_id = $1 AND username = $2';
        values = [tenantId, lowerCaseUsername];
    } else {
        // Username should be globally unique according to new schema's users table
        query = 'SELECT * FROM users WHERE username = $1';
        values = [lowerCaseUsername];
    }

    try {
        const res = await client.query(query, values);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserByUsername] User found for username ${lowerCaseUsername}, tenant ${tenantId || 'SYSTEM'}:`, user ? { userId: user.user_id, username: user.username } : 'undefined');
        return user;
    } catch (err: any) {
        console.error(`[DB getUserByUsername] Error fetching user by username ${lowerCaseUsername} for tenant ${tenantId || 'SYSTEM'}:`, err);
         if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
         client.release();
         console.log('[DB getUserByUsername] Client released.');
    }
}


export async function getEmployeeByEmployeeIdAndTenantId(employee_id_string: string, tenantId: string): Promise<Employee | undefined> {
    const client = await pool.connect();
    console.log(`[DB getEmployeeByEmployeeIdAndTenantId (auth/db)] Fetching employee with Employee ID String: ${employee_id_string} for tenant ${tenantId}`);
    const query = 'SELECT * FROM employees WHERE employee_id = $1 AND tenant_id = $2';
    const values = [employee_id_string, tenantId];
    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            const row = res.rows[0];
            return {
                id: row.id, // Primary Key
                employee_id: row.employee_id, // Human-readable string ID
                tenantId: row.tenant_id,
                user_id: row.user_id, // FK to users table
                first_name: row.first_name,
                last_name: row.last_name,
                name: `${row.first_name} ${row.last_name || ''}`.trim(),
                email: row.email, // Using 'email' as official_email was removed
                status: row.is_active ? 'Active' : 'Inactive', // Deriving from is_active
                 // Add other fields from your new employees schema as needed
            } as Employee; // Cast carefully, ensure all required Employee fields are mapped
        }
        console.log(`[DB getEmployeeByEmployeeIdAndTenantId (auth/db)] No employee found for Employee ID String ${employee_id_string}`);
        return undefined;
    } catch (err: any) {
        console.error(`[DB getEmployeeByEmployeeIdAndTenantId (auth/db)] Error fetching employee by human-readable ID ${employee_id_string} for tenant ${tenantId}:`, err);
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "employees" does not exist.');
        }
        throw err;
    } finally {
        client.release();
    }
}


export async function getEmployeeByUserId(user_id_uuid: string, tenantId: string, client?: any): Promise<Employee | undefined> {
    const conn = client || await pool.connect();
    console.log(`[DB getEmployeeByUserId (auth/db)] Fetching employee with User ID (UUID FK): ${user_id_uuid} for tenant ${tenantId}`);
    // This query needs to match your *new* schema for the employees table
    const query = `
        SELECT 
            e.id, e.tenant_id, e.user_id, e.employee_id, 
            e.first_name, e.middle_name, e.last_name,
            e.email, e.is_active
            -- Join with employment_details if necessary for status or other Employee type fields
        FROM employees e
        WHERE e.user_id = $1 AND e.tenant_id = $2
    `;
    const values = [user_id_uuid.toLowerCase(), tenantId.toLowerCase()];
    try {
        const res = await conn.query(query, values);
        if (res.rows.length > 0) {
            const row = res.rows[0];
             return {
                id: row.id, // This is the employee PK (employees.id)
                user_id: row.user_id, // This is the FK to users table
                tenantId: row.tenant_id,
                employeeId: row.employee_id, // This is the human-readable string ID
                name: `${row.first_name} ${row.last_name || ''}`.trim(),
                first_name: row.first_name,
                last_name: row.last_name,
                email: row.email, // New schema has 'email'
                status: row.is_active ? 'Active' : 'Inactive', // Derive from is_active
                // You might need to join with employment_details for position, department, hireDate, etc.
                // For now, keeping it simple as per the direct columns in employees table.
            } as Employee;
        }
        console.log(`[DB getEmployeeByUserId (auth/db)] No employee found for User ID (UUID FK) ${user_id_uuid}`);
        return undefined;
    } catch (err: any) {
        console.error(`[DB getEmployeeByUserId (auth/db)] Error fetching employee by User ID (UUID FK) ${user_id_uuid} for tenant ${tenantId}:`, err);
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "employees" does not exist.');
        }
        if(!client) throw err;
    } finally {
        if (!client && conn) conn.release();
    }
}

export async function deleteUserById(user_id: string, tenant_id: string | null, client?: any): Promise<boolean> {
    const conn = client || await pool.connect();
    console.log(`[DB deleteUserById] Attempting to delete user: ${user_id} for tenant ${tenant_id || 'SYSTEM'}`);
    try {
        // Set employee_id in users table to NULL for any employee referencing this user
        // This query assumes your new 'users' table has 'employee_id' and your 'employees' table has 'user_id'
        // If 'users.employee_id' points to 'employees.employee_id' (the VARCHAR one), this needs adjustment.
        // Assuming users.employee_id points to employees.id (UUID PK)
        const updateEmployeeFkQuery = 'UPDATE employees SET user_id = NULL WHERE user_id = $1 AND tenant_id = $2';
        if (tenant_id) {
            await conn.query(updateEmployeeFkQuery, [user_id, tenant_id]);
        }
        
        const query = tenant_id
            ? 'DELETE FROM users WHERE user_id = $1 AND tenant_id = $2'
            : 'DELETE FROM users WHERE user_id = $1 AND tenant_id IS NULL'; // For system users if any
        const values = tenant_id ? [user_id, tenant_id] : [user_id];
        const res = await conn.query(query, values);

        if (res.rowCount !== null && res.rowCount > 0) {
            console.log(`[DB deleteUserById] User ${user_id} deleted successfully.`);
            return true;
        }
        console.warn(`[DB deleteUserById] User ${user_id} not found for tenant ${tenant_id || 'SYSTEM'} or already deleted.`);
        return false;
    } catch (err: any) {
        console.error(`[DB deleteUserById] Error deleting user ${user_id} for tenant ${tenant_id || 'SYSTEM'}:`, err);
        if(!client) throw err;
        return false;
    } finally {
        if (!client && conn) conn.release();
    }
}

    
