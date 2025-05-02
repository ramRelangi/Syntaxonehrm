import pool from '@/lib/db';
import type { Tenant, User } from '@/modules/auth/types';

// --- Tenant Operations ---

function mapRowToTenant(row: any): Tenant {
    return {
        id: row.id,
        name: row.name,
        domain: row.domain,
        createdAt: new Date(row.created_at).toISOString(),
    };
}

export async function addTenant(tenantData: Pick<Tenant, 'name' | 'domain'>): Promise<Tenant> {
    const client = await pool.connect();
    console.log(`[DB addTenant] Attempting to add tenant: ${tenantData.name}, Domain: ${tenantData.domain}`);
    const query = `
        INSERT INTO tenants (name, domain)
        VALUES ($1, $2)
        RETURNING *;
    `;
    const values = [tenantData.name, tenantData.domain.toLowerCase()];
    try {
        const res = await client.query(query, values);
        const tenant = mapRowToTenant(res.rows[0]);
        console.log(`[DB addTenant] Tenant added successfully: ID ${tenant.id}`);
        return tenant;
    } catch (err: any) {
        console.error('[DB addTenant] Error adding tenant:', err);
        if (err.code === '23505' && err.constraint === 'tenants_domain_key') {
            throw new Error('Tenant domain already exists.');
        }
         // Handle case where table doesn't exist
        if (err.code === '42P01') { // undefined_table
            throw new Error('Database schema not initialized. Relation "tenants" does not exist.');
        }
        throw err; // Re-throw other errors
    } finally {
        client.release();
        console.log('[DB addTenant] Client released.');
    }
}

export async function getTenantById(id: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    console.log(`[DB getTenantById] Fetching tenant with ID: ${id}`);
    try {
        const res = await client.query('SELECT * FROM tenants WHERE id = $1', [id]);
        const tenant = res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
        console.log(`[DB getTenantById] Tenant found: ${!!tenant}`);
        return tenant;
    } catch (err: any) {
        console.error(`[DB getTenantById] Error fetching tenant ${id}:`, err);
         if (err.code === '42P01') { // undefined_table
            throw new Error('Database schema not initialized. Relation "tenants" does not exist.');
        }
        throw err;
    } finally {
        client.release();
        console.log('[DB getTenantById] Client released.');
    }
}

export async function getTenantByDomain(domain: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    const lowerCaseDomain = domain.toLowerCase();
    console.log(`[DB getTenantByDomain] Fetching tenant with domain: ${lowerCaseDomain}`);
    try {
        const res = await client.query('SELECT * FROM tenants WHERE domain = $1', [lowerCaseDomain]);
        const tenant = res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
        console.log(`[DB getTenantByDomain] Tenant found: ${!!tenant}`);
        return tenant;
    } catch (err: any) {
        console.error(`[DB getTenantByDomain] Error fetching tenant by domain ${lowerCaseDomain}:`, err);
         if (err.code === '42P01') { // undefined_table
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
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        passwordHash: row.password_hash,
        name: row.name,
        role: row.role, // Assumes DB role matches UserRole type
        isActive: row.is_active,
        createdAt: new Date(row.created_at).toISOString(),
    };
}

export async function addUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const client = await pool.connect();
    console.log(`[DB addUser] Attempting to add user: ${userData.email} for tenant ${userData.tenantId}`);
    const query = `
        INSERT INTO users (tenant_id, email, password_hash, name, role, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [
        userData.tenantId,
        userData.email.toLowerCase(), // Store email in lowercase
        userData.passwordHash,
        userData.name,
        userData.role,
        userData.isActive ?? true,
    ];
    try {
        const res = await client.query(query, values);
        const user = mapRowToUser(res.rows[0]);
        console.log(`[DB addUser] User added successfully: ID ${user.id}`);
        return user;
    } catch (err: any) {
        console.error('[DB addUser] Error adding user:', err);
         if (err.code === '23505') { // Handle unique constraint violations
            if (err.constraint === 'users_email_key') { // Global email uniqueness
                 throw new Error('User email already exists.');
            }
            // Add check for tenant-specific email uniqueness if applicable
            // if (err.constraint === 'users_tenant_id_email_key') {
            //     throw new Error('Email already exists for this tenant.');
            // }
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

export async function getUserById(id: string): Promise<User | undefined> {
    const client = await pool.connect();
     console.log(`[DB getUserById] Fetching user with ID: ${id}`);
    try {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [id]);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserById] User found: ${!!user}`);
        return user;
    } catch (err: any) {
        console.error(`[DB getUserById] Error fetching user ${id}:`, err);
        if (err.code === '42P01') { // undefined_table
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
        client.release();
        console.log('[DB getUserById] Client released.');
    }
}

// Get user by email (globally, or filter by tenantId if needed)
export async function getUserByEmail(email: string, tenantId?: string): Promise<User | undefined> {
    const client = await pool.connect();
    const lowerCaseEmail = email.toLowerCase();
    console.log(`[DB getUserByEmail] Fetching user with email: ${lowerCaseEmail}` + (tenantId ? ` for tenant ${tenantId}` : ' (globally)'));
    let query = 'SELECT * FROM users WHERE email = $1';
    const values = [lowerCaseEmail];

    if (tenantId) {
        query += ' AND tenant_id = $2';
        values.push(tenantId);
    }

    try {
        const res = await client.query(query, values);
        const user = res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
        console.log(`[DB getUserByEmail] User found: ${!!user}`);
        return user;
    } catch (err: any) {
        console.error(`[DB getUserByEmail] Error fetching user by email ${lowerCaseEmail}:`, err);
         if (err.code === '42P01') { // undefined_table
            throw new Error('Database schema not initialized. Relation "users" does not exist.');
        }
        throw err;
    } finally {
        client.release();
         console.log('[DB getUserByEmail] Client released.');
    }
}

// Note: The database schema has been moved to src/lib/init-db.ts
