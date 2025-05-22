
import pool from '@/lib/db';
import type { Tenant, User } from '@/modules/auth/types';
import type { Employee } from '@/modules/employees/types'; // Employee type for FK

// --- Tenant Operations ---

function mapRowToTenant(row: any): Tenant {
    return {
        tenant_id: row.tenant_id,
        name: row.name,
        subdomain: row.subdomain, // Changed from domain
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
        if (err.code === '23505') { // unique_violation
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

export async function getTenantByDomain(subdomain: string): Promise<Tenant | undefined> { // Changed parameter name
    const client = await pool.connect();
    const lowerCaseSubdomain = subdomain.toLowerCase();
    console.log(`[DB getTenantByDomain] Fetching tenant with subdomain: ${lowerCaseSubdomain}`);
    try {
        const res = await client.query('SELECT * FROM tenants WHERE subdomain = $1', [lowerCaseSubdomain]); // Changed column name
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
    return {
        user_id: row.user_id,
        tenant_id: row.tenant_id,
        employee_id: row.employee_id ?? undefined,
        username: row.username,
        passwordHash: row.password_hash,
        email: row.email, // This is official_email as per new schema's intent
        name: row.name, // Name of the person
        role: row.role, // Kept simple for now
        is_active: row.is_active,
        last_login: row.last_login ? new Date(row.last_login).toISOString() : undefined,
        failed_attempts: row.failed_attempts,
        account_locked: row.account_locked,
        password_changed_at: row.password_changed_at ? new Date(row.password_changed_at).toISOString() : undefined,
        created_at: new Date(row.created_at).toISOString(),
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
}

// UserData now expects username and tenant_id can be null for system users
export async function addUser(userData: Omit<User, 'user_id' | 'created_at' | 'updated_at' | 'last_login' | 'failed_attempts' | 'account_locked' | 'password_changed_at'>): Promise<User> {
    const client = await pool.connect();
    console.log(`[DB addUser] Attempting to add user: ${userData.username} (Email: ${userData.email}) for tenant ${userData.tenant_id || 'SYSTEM'}`);
    const query = `
        INSERT INTO users (tenant_id, employee_id, username, password_hash, email, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *;
    `;
    const values = [
        userData.tenant_id, // Can be null for system users
        userData.employee_id || null, // Can be null initially
        userData.username.toLowerCase(), // Store username consistently
        userData.passwordHash,
        userData.email.toLowerCase(), // Store email consistently
        userData.name,
        userData.role, // Kept simple for now
        userData.is_active ?? true,
    ];
    try {
        const res = await client.query(query, values);
        const user = mapRowToUser(res.rows[0]);
        console.log(`[DB addUser] User added successfully: ID ${user.user_id}`);
        return user;
    } catch (err: any) {
        console.error('[DB addUser] Error adding user:', err);
         if (err.code === '23505') { // unique_violation
            if (err.constraint === 'unique_username') { // Based on new schema
                 throw new Error('Username already exists.');
            }
            if (err.constraint === 'unique_email') { // Based on new schema
                 throw new Error('Email address already exists.');
            }
             if (err.constraint === 'users_employee_id_key') { // If employee_id needs to be unique
                throw new Error('This employee is already linked to a user account.');
            }
        }
        if (err.code === '42P01') { // undefined_table
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
    console.log(`[DB getUserById] Fetching user with ID: ${user_id}`);
    try {
        const res = await conn.query('SELECT * FROM users WHERE user_id = $1', [user_id]);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserById] User found: ${!!user}`);
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
        // For system users or if email is globally unique and tenant_id is NULL
        query = 'SELECT * FROM users WHERE tenant_id IS NULL AND email = $1';
        values = [lowerCaseEmail];
    }

    try {
        const res = await client.query(query, values);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserByEmail] User found: ${!!user}`);
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
        query = 'SELECT * FROM users WHERE tenant_id IS NULL AND username = $1';
        values = [lowerCaseUsername];
    }

    try {
        const res = await client.query(query, values);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserByUsername] User found: ${!!user}`);
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


export async function getEmployeeByEmployeeIdAndTenantId(employee_id_pk: string, tenantId: string): Promise<Employee | undefined> {
    // This function assumes employee_id_pk is the UUID primary key of the employees table
    const client = await pool.connect();
    console.log(`[DB getEmployeeByEmployeeIdAndTenantId (auth/db)] Fetching employee with Employee PK: ${employee_id_pk} for tenant ${tenantId}`);
    const query = 'SELECT * FROM employees WHERE employee_id = $1 AND tenant_id = $2'; // employee_id is the PK
    const values = [employee_id_pk, tenantId];
    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            // This mapping needs to be consistent with Employee type from employees module
            const row = res.rows[0];
            return {
                employee_id: row.employee_id, // PK from employees table
                tenant_id: row.tenant_id,
                // user_id: row.user_id, // Link to users table
                name: `${row.first_name} ${row.last_name || ''}`.trim(),
                first_name: row.first_name,
                last_name: row.last_name,
                official_email: row.official_email,
                // Add other fields from your Employee type definition here
                status: row.is_active ? 'Active' : 'Inactive', // Example mapping
            } as unknown as Employee; // Cast carefully, ensure all required fields are mapped
        }
        return undefined;
    } catch (err: any) {
        console.error(`[DB getEmployeeByEmployeeIdAndTenantId (auth/db)] Error fetching employee by PK ${employee_id_pk} for tenant ${tenantId}:`, err);
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "employees" does not exist.');
        }
        throw err;
    } finally {
        client.release();
    }
}

// Get employee by user_id (FK from employees table) and tenant_id
export async function getEmployeeByUserId(user_id: string, tenantId: string): Promise<Employee | undefined> {
    const client = await pool.connect();
    console.log(`[DB getEmployeeByUserId (auth/db)] Fetching employee with User ID (FK): ${user_id} for tenant ${tenantId}`);
    const query = 'SELECT * FROM employees WHERE user_id = $1 AND tenant_id = $2'; // user_id is FK on employees
    const values = [user_id, tenantId];
    try {
        const res = await client.query(query, values);
        if (res.rows.length > 0) {
            const row = res.rows[0];
             return {
                employee_id: row.employee_id, // PK from employees table
                user_id: row.user_id, // FK to users table
                tenant_id: row.tenant_id,
                name: `${row.first_name} ${row.last_name || ''}`.trim(),
                first_name: row.first_name,
                last_name: row.last_name,
                official_email: row.official_email,
                status: row.is_active ? 'Active' : 'Inactive',
            } as unknown as Employee; // Cast carefully
        }
        return undefined;
    } catch (err: any) {
        console.error(`[DB getEmployeeByUserId (auth/db)] Error fetching employee by User ID (FK) ${user_id} for tenant ${tenantId}:`, err);
        if (err.code === '42P01') {
            throw new Error('Database schema not initialized. Relation "employees" does not exist.');
        }
        throw err;
    } finally {
        client.release();
    }
}

// Function to delete a user by user_id
export async function deleteUserById(user_id: string, tenant_id: string | null, client?: any): Promise<boolean> {
    const conn = client || await pool.connect();
    console.log(`[DB deleteUserById] Attempting to delete user: ${user_id} for tenant ${tenant_id || 'SYSTEM'}`);
    try {
        const query = tenant_id
            ? 'DELETE FROM users WHERE user_id = $1 AND tenant_id = $2'
            : 'DELETE FROM users WHERE user_id = $1 AND tenant_id IS NULL';
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
        throw err;
    } finally {
        if (!client) conn.release();
    }
}
