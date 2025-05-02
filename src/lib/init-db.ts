
// src/lib/init-db.ts
import pool from './db';

// Combine all schemas into one script for simplicity
const schemaSQL = `
-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT 'uuid-ossp extension ensured.';

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL, -- Unique, lowercase domain name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'tenants table ensured.';

-- Index for tenants.domain (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
SELECT 'Index idx_tenants_domain checked/created.';

-- User Roles Enum
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Employee');
    RAISE NOTICE 'user_role type created or already exists.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'user_role type already exists, skipping creation.';
END $$;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- Email uniqueness enforced per tenant
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'Employee',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email) -- Ensure email is unique within a tenant
);
SELECT 'users table ensured.';

-- Index for users table (using IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_id_email ON users(tenant_id, email);
SELECT 'Index idx_users_tenant_id_email checked/created.';

-- Employee Status Enum
DO $$ BEGIN
    CREATE TYPE employee_status AS ENUM ('Active', 'Inactive', 'On Leave');
    RAISE NOTICE 'employee_status type created or already exists.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'employee_status type already exists, skipping creation.';
END $$;

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL, -- Email uniqueness enforced per tenant
    phone VARCHAR(50),
    position VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    hire_date DATE NOT NULL,
    status employee_status NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email) -- Ensure email is unique within a tenant
);
SELECT 'employees table ensured.';

-- Index for employees table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
SELECT 'Index idx_employees_tenant_id checked/created.';

-- Leave Types Table
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    name VARCHAR(100) NOT NULL, -- Name uniqueness enforced per tenant
    description TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    default_balance NUMERIC(5, 2) DEFAULT 0,
    accrual_rate NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name) -- Ensure name is unique within a tenant
);
SELECT 'leave_types table ensured.';

-- Index for leave_types table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_id ON leave_types(tenant_id);
SELECT 'Index idx_leave_types_tenant_id checked/created.';


-- Leave Request Status Enum
DO $$ BEGIN
    CREATE TYPE leave_request_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
    RAISE NOTICE 'leave_request_status type created or already exists.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'leave_request_status type already exists, skipping creation.';
END $$;

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status leave_request_status NOT NULL DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID REFERENCES users(id), -- Link to users table for approver
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_leave_dates CHECK (end_date >= start_date)
);
SELECT 'leave_requests table ensured.';

-- Index for leave_requests table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_id ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests(employee_id);
SELECT 'Indexes for leave_requests checked/created.';


-- Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    -- id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Optional primary key if needed
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    balance NUMERIC(5, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, employee_id, leave_type_id) -- Composite key including tenant
);
SELECT 'leave_balances table ensured.';

-- Index for leave_balances table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_id_employee_id ON leave_balances(tenant_id, employee_id);
SELECT 'Index idx_leave_balances_tenant_id_employee_id checked/created.';


-- Job Posting Status Enum
DO $$ BEGIN
    CREATE TYPE job_posting_status AS ENUM ('Open', 'Closed', 'Draft', 'Archived');
    RAISE NOTICE 'job_posting_status type created or already exists.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'job_posting_status type already exists, skipping creation.';
END $$;

-- Job Postings Table
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    salary_range VARCHAR(100),
    status job_posting_status NOT NULL DEFAULT 'Draft',
    date_posted TIMESTAMP WITH TIME ZONE,
    closing_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'job_postings table ensured.';

-- Index for job_postings table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_job_postings_tenant_id_status ON job_postings(tenant_id, status);
SELECT 'Index idx_job_postings_tenant_id_status checked/created.';


-- Candidate Status Enum
DO $$ BEGIN
    CREATE TYPE candidate_status AS ENUM ('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn');
    RAISE NOTICE 'candidate_status type created or already exists.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'candidate_status type already exists, skipping creation.';
END $$;

-- Candidates Table
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL, -- Unique per posting within a tenant
    phone VARCHAR(50),
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status candidate_status NOT NULL DEFAULT 'Applied',
    resume_url TEXT,
    cover_letter TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email, job_posting_id) -- Prevent duplicate applications within a tenant
);
SELECT 'candidates table ensured.';

-- Index for candidates table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_id_job_posting_id ON candidates(tenant_id, job_posting_id);
SELECT 'Index idx_candidates_tenant_id_job_posting_id checked/created.';


-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Add tenant_id
    name VARCHAR(255) NOT NULL, -- Unique per tenant
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    usage_context VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name) -- Ensure name is unique within a tenant
);
SELECT 'email_templates table ensured.';

-- Index for email_templates table (using IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON email_templates(tenant_id);
SELECT 'Index idx_email_templates_tenant_id checked/created.';


-- Email Configuration Table (Single Row Per Tenant)
CREATE TABLE IF NOT EXISTS email_configuration (
    -- id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Use tenant_id as PK if 1-to-1
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE, -- Use tenant_id as PK
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password TEXT NOT NULL, -- STORE ENCRYPTED!
    smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'email_configuration table ensured.';


-- Trigger function to update updated_at timestamp (universal)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';
SELECT 'update_updated_at_column function ensured.';

-- Function to apply trigger if it doesn't exist
CREATE OR REPLACE FUNCTION apply_update_trigger_if_not_exists(table_name_param TEXT)
RETURNS void AS $$
DECLARE
    trigger_name TEXT := 'update_' || table_name_param || '_updated_at';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = trigger_name
    ) THEN
        EXECUTE format('
            CREATE TRIGGER %I
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();', trigger_name, table_name_param);
        RAISE NOTICE 'Trigger % created for table %.', trigger_name, table_name_param;
    ELSE
        RAISE NOTICE 'Trigger % already exists for table %.', trigger_name, table_name_param;
    END IF;
END;
$$ LANGUAGE plpgsql;
SELECT 'apply_update_trigger_if_not_exists function created.';

-- Apply trigger to all relevant tables
SELECT apply_update_trigger_if_not_exists('users');
SELECT apply_update_trigger_if_not_exists('employees');
SELECT apply_update_trigger_if_not_exists('leave_types');
SELECT apply_update_trigger_if_not_exists('leave_requests');
SELECT apply_update_trigger_if_not_exists('leave_balances');
SELECT apply_update_trigger_if_not_exists('job_postings');
SELECT apply_update_trigger_if_not_exists('candidates');
SELECT apply_update_trigger_if_not_exists('email_templates');
SELECT apply_update_trigger_if_not_exists('email_configuration');

SELECT 'All triggers checked/applied.';

-- Add more schema definitions for other modules as needed...

`;

export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');
    // Execute the entire script as a single query
    await client.query(schemaSQL);
    console.log('Database schema initialization script executed successfully.');
  } catch (err: any) {
    console.error('-----------------------------------------');
    console.error('Error during database schema initialization:', err.message);
    console.error('Stack:', err.stack);
    console.error('Error Details:', err); // Log the full error object
    console.error('-----------------------------------------');
    // Re-throw the error so it can be caught by the caller (e.g., registerTenantAction)
    throw err;
  } finally {
    if (client) {
      await client.release();
      console.log('Database client released after schema initialization.');
    }
    // Do NOT close the pool here if it's meant to be reused by the application
    // await pool.end();
    // console.log('Database pool closed after schema initialization.');
  }
}

// Check if the script is being run directly (e.g., `npm run db:init`)
if (require.main === module) {
  initializeDatabase().then(() => {
    console.log("Manual DB initialization complete.");
    pool.end(() => console.log('Database pool closed after manual initialization.')); // Close pool when run manually
  }).catch(err => {
    console.error("Manual DB initialization failed:", err);
    pool.end(() => console.log('Database pool closed after failed manual initialization.')); // Close pool on manual failure
    process.exit(1);
  });
}
