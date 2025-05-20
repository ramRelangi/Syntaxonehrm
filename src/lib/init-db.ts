
// src/lib/init-db.ts
import pool from './db';

// Combine all schemas into one script for simplicity
const schemaSQL = `
-- Ensure uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT 'uuid-ossp extension ensured.';

-- Drop potentially existing trigger functions first
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS apply_update_trigger_if_not_exists(text) CASCADE;
SELECT 'Existing trigger functions dropped (if they existed).';

-- Drop existing tables in reverse dependency order (carefully!)
-- Note: CASCADE will drop dependent objects like constraints, indexes, views, etc.
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS job_postings CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
DROP TABLE IF EXISTS employees CASCADE; -- Drop employees before users if reporting_manager_id references users
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
SELECT 'Existing tables dropped (if they existed).';

-- Drop existing types (must be done after tables using them are dropped)
DROP TYPE IF EXISTS job_posting_status CASCADE;
DROP TYPE IF EXISTS candidate_status CASCADE;
DROP TYPE IF EXISTS leave_request_status CASCADE;
DROP TYPE IF EXISTS employee_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS employment_enum_type CASCADE; -- For job postings and employees
DROP TYPE IF EXISTS experience_level_enum_type CASCADE; -- For job postings
SELECT 'Existing custom types dropped (if they existed).';


-- Recreate Types

-- User Roles Enum
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Admin', 'Manager', 'Employee');
    RAISE NOTICE 'user_role type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'user_role type already exists, skipping creation.';
END $$;

-- Employee Status Enum
DO $$ BEGIN
    CREATE TYPE employee_status AS ENUM ('Active', 'Inactive', 'On Leave');
    RAISE NOTICE 'employee_status type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'employee_status type already exists, skipping creation.';
END $$;

-- Employment Type Enum (shared)
DO $$ BEGIN
    CREATE TYPE employment_enum_type AS ENUM ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary');
    RAISE NOTICE 'employment_enum_type type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'employment_enum_type type already exists, skipping creation.';
END $$;

-- Experience Level Enum (for job postings)
DO $$ BEGIN
    CREATE TYPE experience_level_enum_type AS ENUM ('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director');
    RAISE NOTICE 'experience_level_enum_type type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'experience_level_enum_type type already exists, skipping creation.';
END $$;


-- Leave Request Status Enum
DO $$ BEGIN
    CREATE TYPE leave_request_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');
    RAISE NOTICE 'leave_request_status type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'leave_request_status type already exists, skipping creation.';
END $$;

-- Job Posting Status Enum
DO $$ BEGIN
    CREATE TYPE job_posting_status AS ENUM ('Open', 'Closed', 'Draft', 'Archived');
    RAISE NOTICE 'job_posting_status type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'job_posting_status type already exists, skipping creation.';
END $$;

-- Candidate Status Enum
DO $$ BEGIN
    CREATE TYPE candidate_status AS ENUM ('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn');
    RAISE NOTICE 'candidate_status type created.';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'candidate_status type already exists, skipping creation.';
END $$;


-- Recreate Tables

-- Tenants Table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL, -- Unique, lowercase domain name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'tenants table created.';
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(LOWER(domain));

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
SELECT 'users table created.';
CREATE INDEX IF NOT EXISTS idx_users_tenant_id_email ON users(tenant_id, LOWER(email));


-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL UNIQUE, -- Link to the users table, can be null initially
    employee_id VARCHAR(50), -- Official Employee ID, unique per tenant, generated dynamically
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL, -- Email uniqueness enforced per tenant
    phone VARCHAR(50),
    position VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    hire_date DATE NOT NULL,
    status employee_status NOT NULL DEFAULT 'Active',
    date_of_birth DATE,
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    work_location VARCHAR(255),
    employment_type employment_enum_type DEFAULT 'Full-time',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, employee_id)
);
SELECT 'employees table created.';
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);


-- Leave Types Table
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    default_balance NUMERIC(5, 2) DEFAULT 0,
    accrual_rate NUMERIC(5, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name)
);
SELECT 'leave_types table created.';
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_id ON leave_types(tenant_id);


-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status leave_request_status NOT NULL DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID REFERENCES users(id),
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    attachment_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_leave_dates CHECK (end_date >= start_date)
);
SELECT 'leave_requests table created.';
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_id ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests(employee_id);


-- Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    balance NUMERIC(5, 2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, employee_id, leave_type_id)
);
SELECT 'leave_balances table created.';
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_id_employee_id ON leave_balances(tenant_id, employee_id);


-- Job Postings Table
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    salary_range VARCHAR(100),
    status job_posting_status NOT NULL DEFAULT 'Draft',
    date_posted TIMESTAMP WITH TIME ZONE,
    closing_date DATE,
    employment_type employment_enum_type DEFAULT 'Full-time',
    experience_level experience_level_enum_type DEFAULT 'Mid-Level',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'job_postings table created.';
CREATE INDEX IF NOT EXISTS idx_job_postings_tenant_id_status ON job_postings(tenant_id, status);


-- Candidates Table
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status candidate_status NOT NULL DEFAULT 'Applied',
    resume_url TEXT,
    cover_letter TEXT,
    notes TEXT,
    source TEXT,
    expected_salary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email, job_posting_id)
);
SELECT 'candidates table created.';
CREATE INDEX IF NOT EXISTS idx_candidates_tenant_id_job_posting_id ON candidates(tenant_id, job_posting_id);


-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    usage_context VARCHAR(100),
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name)
);
SELECT 'email_templates table created.';
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON email_templates(tenant_id);


-- Email Configuration Table (Single Row Per Tenant)
CREATE TABLE IF NOT EXISTS email_configuration (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
SELECT 'email_configuration table created.';

-- Holidays Table
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, date)
);
SELECT 'holidays table created.';
CREATE INDEX IF NOT EXISTS idx_holidays_tenant_id_date ON holidays(tenant_id, date);


-- Recreate Trigger function to update updated_at timestamp (universal)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';
SELECT 'update_updated_at_column function created.';

-- Recreate Function to apply trigger if it doesn't exist
CREATE OR REPLACE FUNCTION apply_update_trigger_if_not_exists(table_name_param TEXT)
RETURNS void AS $$
DECLARE
    trigger_name TEXT := 'update_' || table_name_param || '_updated_at';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = trigger_name AND tgrelid = table_name_param::regclass
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
SELECT apply_update_trigger_if_not_exists('holidays');

SELECT 'All triggers checked/applied.';
`;

export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');
    // Execute the entire script as a single query
    await client.query(schemaSQL);
    console.log('Database schema creation script executed successfully.');
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
  }
}

// Check if the script is being run directly (e.g., `npm run db:init`)
if (require.main === module) {
  initializeDatabase().then(() => {
    console.log("Manual DB initialization complete.");
    pool.end(() => console.log('Database pool closed after manual initialization.'));
  }).catch(err => {
    console.error("Manual DB initialization failed:", err);
    pool.end(() => console.log('Database pool closed after failed manual initialization.'));
    process.exit(1);
  });
}
