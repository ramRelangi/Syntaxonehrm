// src/lib/init-db.ts
import pool from './db';

const schemaSQL = `
-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL, -- Unique, lowercase domain name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM   pg_class c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        WHERE  c.relname = 'idx_tenants_domain'
        AND    n.nspname = 'public' -- assuming public schema
    ) THEN
        CREATE INDEX idx_tenants_domain ON tenants(domain);
    END IF;
END$$;


-- User Roles Enum (Example)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Link to tenant, cascade delete users if tenant is deleted
    email VARCHAR(255) UNIQUE NOT NULL, -- Ensure email is globally unique
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'Employee',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP -- Add trigger for this
);

-- Create indexes only if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_users_tenant_id' AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_users_tenant_id ON users(tenant_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_users_email' AND n.nspname = 'public'
    ) THEN
        CREATE INDEX idx_users_email ON users(email);
    END IF;
END$$;


-- Trigger function to update updated_at timestamp (create or replace)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger first (if it exists) to avoid errors, then create
DO $$ BEGIN
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN undefined_table THEN null; -- Ignore if table doesn't exist yet
END $$;

`;

async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');
    await client.query(schemaSQL);
    console.log('Database schema initialized (or already exists) successfully.');
  } catch (err: any) {
    console.error('Error during database schema initialization:', err);
    // Exit process with error if initialization fails
    process.exit(1);
  } finally {
    if (client) {
      await client.release();
      console.log('Database client released.');
    }
    // Ensure the pool is closed after initialization to allow the script to exit
    await pool.end();
    console.log('Database pool closed.');
  }
}

// Run the initialization
initializeDatabase();
