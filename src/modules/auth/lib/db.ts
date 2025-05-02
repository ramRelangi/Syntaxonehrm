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
    const query = `
        INSERT INTO tenants (name, domain)
        VALUES ($1, $2)
        RETURNING *;
    `;
    const values = [tenantData.name, tenantData.domain.toLowerCase()];
    try {
        const res = await client.query(query, values);
        return mapRowToTenant(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding tenant:', err);
        if (err.code === '23505' && err.constraint === 'tenants_domain_key') {
            throw new Error('Tenant domain already exists.');
        }
        throw err; // Re-throw other errors
    } finally {
        client.release();
    }
}

export async function getTenantById(id: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM tenants WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching tenant ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getTenantByDomain(domain: string): Promise<Tenant | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM tenants WHERE domain = $1', [domain.toLowerCase()]);
        return res.rows.length > 0 ? mapRowToTenant(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching tenant by domain ${domain}:`, err);
        throw err;
    } finally {
        client.release();
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
        return mapRowToUser(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding user:', err);
         if (err.code === '23505') { // Handle unique constraint violations
            if (err.constraint === 'users_email_key') { // Global email uniqueness
                 throw new Error('User email already exists.');
            }
            // Add check for tenant-specific email uniqueness if applicable
            // if (err.constraint === 'users_tenant_id_email_key') {
            //     throw new Error('Email already exists for this tenant.');
            // }
        }
        throw err;
    } finally {
        client.release();
    }
}

export async function getUserById(id: string): Promise<User | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching user ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get user by email (globally, or filter by tenantId if needed)
export async function getUserByEmail(email: string, tenantId?: string): Promise<User | undefined> {
    const client = await pool.connect();
    let query = 'SELECT * FROM users WHERE email = $1';
    const values = [email.toLowerCase()];

    if (tenantId) {
        query += ' AND tenant_id = $2';
        values.push(tenantId);
    }

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToUser(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching user by email ${email}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// --- Database Schema (for reference) ---
/*
-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants Table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL, -- Unique, lowercase domain name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenants_domain ON tenants(domain);

-- User Roles Enum (Example)
CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Employee');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Link to tenant, cascade delete users if tenant is deleted
    email VARCHAR(255) UNIQUE NOT NULL, -- Ensure email is globally unique
    -- OR UNIQUE (tenant_id, email) if emails only need to be unique within a tenant
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'Employee',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Add trigger for this
    -- Add other user profile fields as needed
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- Trigger to update updated_at timestamp (if not already created globally)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

*/
