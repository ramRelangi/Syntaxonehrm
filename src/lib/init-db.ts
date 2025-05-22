
// src/lib/init-db.ts
import pool from './db';

// Combine all schemas into one script for simplicity
const schemaSQL = `
-- Ensure uuid-ossp extension is enabled
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    RAISE NOTICE 'uuid-ossp extension ensured.';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'uuid-ossp extension already exists.';
END $$;

-- Drop existing trigger functions and tables safely
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS apply_update_trigger_if_not_exists(text) CASCADE;
RAISE NOTICE 'Existing trigger functions dropped (if they existed).';

-- Drop tables in an order that respects dependencies, or use CASCADE
RAISE NOTICE 'Dropping existing tables...';
DROP TABLE IF EXISTS employee_assets CASCADE;
DROP TABLE IF EXISTS asset_inventory CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
-- Users table is critical for auth, handle with extreme care or defer changes
-- DROP TABLE IF EXISTS users CASCADE; 
DROP TABLE IF EXISTS job_applications CASCADE; -- New, but drop if re-running
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS job_openings CASCADE; -- Was job_postings
DROP TABLE IF EXISTS job_postings CASCADE; -- Old name, ensure it's dropped
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;
DROP TABLE IF EXISTS employee_training CASCADE;
DROP TABLE IF EXISTS training_programs CASCADE;
DROP TABLE IF EXISTS performance_ratings CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS performance_cycles CASCADE;
DROP TABLE IF EXISTS competencies CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE; -- Was leave_requests
DROP TABLE IF EXISTS leave_requests CASCADE; -- Old name
DROP TABLE IF EXISTS employee_leave_balance CASCADE;
DROP TABLE IF EXISTS leave_policy_details CASCADE;
DROP TABLE IF EXISTS leave_policy CASCADE;
DROP TABLE IF EXISTS leave_types CASCADE;
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS employee_shift CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS salary_structure_details CASCADE;
DROP TABLE IF EXISTS employee_salary CASCADE;
DROP TABLE IF EXISTS salary_components CASCADE;
DROP TABLE IF EXISTS salary_structures CASCADE;
DROP TABLE IF EXISTS employment_details CASCADE;
DROP TABLE IF EXISTS designations CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS employee_documents CASCADE;
DROP TABLE IF EXISTS employee_address CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
RAISE NOTICE 'Existing tables dropped.';

-- Drop existing ENUM types (must be done after tables using them are dropped)
RAISE NOTICE 'Dropping existing ENUM types...';
DROP TYPE IF EXISTS gender_enum_type CASCADE;
DROP TYPE IF EXISTS address_type_enum CASCADE;
DROP TYPE IF EXISTS verification_status_enum CASCADE;
DROP TYPE IF EXISTS employment_type_enum CASCADE;
DROP TYPE IF EXISTS salary_component_type_enum CASCADE;
DROP TYPE IF EXISTS calculation_type_enum CASCADE;
DROP TYPE IF EXISTS attendance_status_enum CASCADE;
DROP TYPE IF EXISTS leave_application_status_enum CASCADE;
DROP TYPE IF EXISTS performance_review_status_enum CASCADE;
DROP TYPE IF EXISTS training_program_status_enum CASCADE;
DROP TYPE IF EXISTS employee_training_status_enum CASCADE;
DROP TYPE IF EXISTS job_opening_status_enum CASCADE; -- Used by job_openings
DROP TYPE IF EXISTS candidate_application_status_enum CASCADE; -- Used by candidates & job_applications
DROP TYPE IF EXISTS asset_status_enum CASCADE;
DROP TYPE IF EXISTS holiday_type_enum CASCADE;
DROP TYPE IF EXISTS user_role_enum CASCADE; -- For user roles
DROP TYPE IF EXISTS experience_level_enum_type CASCADE; -- For job_openings
RAISE NOTICE 'Existing ENUM types dropped.';

-- Recreate ENUM Types needed for the application
RAISE NOTICE 'Creating ENUM types...';
DO $$ BEGIN CREATE TYPE user_role_enum AS ENUM ('Admin', 'Manager', 'Employee'); RAISE NOTICE 'user_role_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'user_role_enum already exists.'; END $$;
DO $$ BEGIN CREATE TYPE gender_enum_type AS ENUM ('Male', 'Female', 'Other', 'Prefer not to say'); RAISE NOTICE 'gender_enum_type created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'gender_enum_type already exists.'; END $$;
DO $$ BEGIN CREATE TYPE address_type_enum AS ENUM('PERMANENT', 'CURRENT', 'OFFICIAL'); RAISE NOTICE 'address_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'address_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE verification_status_enum AS ENUM('VERIFIED', 'PENDING', 'REJECTED'); RAISE NOTICE 'verification_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'verification_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE employment_type_enum AS ENUM('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'); RAISE NOTICE 'employment_type_enum created for employees/job_openings.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employment_type_enum for employees/job_openings already exists.'; END $$;
DO $$ BEGIN CREATE TYPE salary_component_type_enum AS ENUM('EARNING', 'DEDUCTION', 'BENEFIT'); RAISE NOTICE 'salary_component_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'salary_component_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE calculation_type_enum AS ENUM('FIXED', 'PERCENTAGE', 'FORMULA'); RAISE NOTICE 'calculation_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'calculation_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE attendance_status_enum AS ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'); RAISE NOTICE 'attendance_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'attendance_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE leave_application_status_enum AS ENUM('Pending', 'Approved', 'Rejected', 'Cancelled'); RAISE NOTICE 'leave_application_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'leave_application_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE performance_review_status_enum AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'); RAISE NOTICE 'performance_review_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'performance_review_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE training_program_status_enum AS ENUM('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'); RAISE NOTICE 'training_program_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'training_program_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE employee_training_status_enum AS ENUM('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED'); RAISE NOTICE 'employee_training_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employee_training_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE job_opening_status_enum AS ENUM('Draft', 'Open', 'Closed', 'Archived'); RAISE NOTICE 'job_opening_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'job_opening_status_enum already exists.'; END $$;
DO $$ BEGIN CREATE TYPE candidate_application_status_enum AS ENUM('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn'); RAISE NOTICE 'candidate_application_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'candidate_application_status_enum already exists.'; END $$;
DO $$ BEGIN CREATE TYPE asset_status_enum AS ENUM('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'); RAISE NOTICE 'asset_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'asset_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE holiday_type_enum AS ENUM('FIXED', 'VARIABLE'); RAISE NOTICE 'holiday_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'holiday_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE experience_level_enum_type AS ENUM('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director'); RAISE NOTICE 'experience_level_enum_type created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'experience_level_enum_type already exists.'; END $$;
RAISE NOTICE 'ENUM types creation step completed.';

-- Recreate Tables
RAISE NOTICE 'Creating tables...';

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
RAISE NOTICE 'tenants table created.';

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'Employee',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
);
RAISE NOTICE 'users table created.';

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL UNIQUE, -- Link to the users table
    employee_id VARCHAR(50) UNIQUE, -- Human-readable ID, unique within tenant
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    gender gender_enum_type,
    position VARCHAR(255),
    department VARCHAR(255),
    hire_date DATE,
    status VARCHAR(50) DEFAULT 'Active', -- Consider an ENUM if statuses are fixed
    date_of_birth DATE,
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- Self-referencing for manager
    work_location VARCHAR(255),
    employment_type employment_type_enum,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, employee_id)
);
RAISE NOTICE 'employees table created.';

-- Recruitment Module Tables (adapted for UUID PKs and tenant_id)
CREATE TABLE job_openings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_title VARCHAR(100) NOT NULL,
    description TEXT,
    department VARCHAR(255), -- Kept from your new schema, aligns with employee department
    location VARCHAR(100),
    salary_range VARCHAR(100),
    status job_opening_status_enum DEFAULT 'Draft',
    date_posted TIMESTAMP WITH TIME ZONE, -- Set when status changes from Draft to Open
    closing_date DATE,
    employment_type employment_type_enum, -- From your new schema
    experience_level experience_level_enum_type, -- From your new schema
    no_of_vacancies INT NOT NULL DEFAULT 1,
    requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_job_openings_tenant_id ON job_openings(tenant_id);
RAISE NOTICE 'job_openings table created (was job_postings).';

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_posting_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE, -- Renamed FK, references job_openings
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    name VARCHAR(100) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED, -- Combined name
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    resume_url VARCHAR(255), -- Changed from resume_path
    cover_letter TEXT,
    application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status candidate_application_status_enum DEFAULT 'Applied',
    notes TEXT,
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience DECIMAL(4,2), -- In years, e.g., 2.5
    notice_period INT, -- In days
    current_salary VARCHAR(100), -- Store as string to accommodate various formats/currencies
    expected_salary VARCHAR(100), -- Store as string
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email, job_posting_id) -- Candidate can apply to multiple jobs, but only once per job with the same email
);
CREATE INDEX idx_candidates_tenant_id ON candidates(tenant_id);
CREATE INDEX idx_candidates_job_posting_id ON candidates(job_posting_id);
RAISE NOTICE 'candidates table created.';

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_opening_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_stage candidate_application_status_enum DEFAULT 'Applied',
    -- 'status' from your schema seems redundant if current_stage covers the application lifecycle.
    -- If 'status' means something else like 'Active' vs 'Archived' application record, it can be added.
    -- For now, focusing on current_stage.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_job_applications_tenant_id ON job_applications(tenant_id);
CREATE INDEX idx_job_applications_candidate_id ON job_applications(candidate_id);
CREATE INDEX idx_job_applications_job_opening_id ON job_applications(job_opening_id);
RAISE NOTICE 'job_applications table created.';

-- Leave Management Tables (adapted for UUID PKs and tenant_id)
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    leave_type_name VARCHAR(50) NOT NULL,
    short_code VARCHAR(10),
    description TEXT,
    requires_approval BOOLEAN DEFAULT TRUE,
    default_balance NUMERIC(5,2) DEFAULT 0, -- Using NUMERIC for precision
    accrual_rate NUMERIC(5,2) DEFAULT 0,
    applicable_gender gender_enum_type,
    is_paid BOOLEAN DEFAULT TRUE,
    is_encashable BOOLEAN DEFAULT FALSE,
    is_carry_forward BOOLEAN DEFAULT FALSE,
    max_carry_forward_days INT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, leave_type_name),
    UNIQUE (tenant_id, short_code)
);
CREATE INDEX idx_leave_types_tenant_id ON leave_types(tenant_id);
RAISE NOTICE 'leave_types table created.';

CREATE TABLE leave_policy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, policy_name)
);
RAISE NOTICE 'leave_policy table created.';

CREATE TABLE leave_policy_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES leave_policy(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT, -- Prevent deleting type if used in policy
    entitlement_days NUMERIC(5,2) NOT NULL,
    max_consecutive_days INT,
    min_service_days INT DEFAULT 0,
    gender_restriction gender_enum_type,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (policy_id, leave_type_id)
);
RAISE NOTICE 'leave_policy_details table created.';

CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    -- policy_id UUID NOT NULL REFERENCES leave_policy(id) ON DELETE RESTRICT, -- policy_id was in your new schema for balances.
    year INT, -- Optional, if balances are reset yearly. If continuous, this might not be needed.
    balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- opening_balance, earned_balance, consumed_balance, adjusted_balance, closing_balance (generated) from new schema are good for detailed auditing.
    -- For simplicity, starting with a single 'balance'. Can be expanded.
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, employee_id, leave_type_id) -- Removed year for now for continuous balance
);
CREATE INDEX idx_leave_balances_tenant_id_employee_id ON leave_balances(tenant_id, employee_id);
RAISE NOTICE 'leave_balances table created (was employee_leave_balance).';

CREATE TABLE leave_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- FK to employees.id (UUID)
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(5,2) NOT NULL, -- Calculated from start/end, considering holidays/weekends if logic is added
    reason TEXT,
    status leave_application_status_enum DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Renamed from applied_on
    approver_id UUID REFERENCES users(id) ON DELETE SET NULL, -- FK to users.id (UUID)
    approval_date TIMESTAMP WITH TIME ZONE, -- Renamed from approved_on
    comments TEXT, -- Renamed from rejection_reason, can be used for approval/rejection comments
    attachment_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_leave_applications_tenant_id_employee_id ON leave_applications(tenant_id, employee_id);
RAISE NOTICE 'leave_applications table created (was leave_requests).';

CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    holiday_name VARCHAR(100) NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_type holiday_type_enum NOT NULL,
    applicable_location VARCHAR(100) DEFAULT 'ALL',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, holiday_date, applicable_location)
);
CREATE INDEX idx_holidays_tenant_id ON holidays(tenant_id);
RAISE NOTICE 'holidays table created.';

-- Communication Module Tables
CREATE TABLE email_templates (
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
CREATE INDEX idx_email_templates_tenant_id ON email_templates(tenant_id);
RAISE NOTICE 'email_templates table created.';

CREATE TABLE email_configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE, -- Each tenant has one config
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted VARCHAR(512) NOT NULL, -- Store encrypted password
    smtp_secure BOOLEAN DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
RAISE NOTICE 'email_configuration table created.';

-- Add other tables from your new schema here, adapted with tenant_id and UUID PKs
-- For example: departments, designations, employment_details, etc.
-- For brevity, I am focusing on the modules we've touched (Recruitment, Leave, basic Employee/User/Tenant structure).

RAISE NOTICE 'Core tables creation step completed.';

-- Recreate Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';
RAISE NOTICE 'update_updated_at_column function created.';

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
        RAISE NOTICE 'Trigger %% created for table %%.', trigger_name, table_name_param;
    ELSE
        RAISE NOTICE 'Trigger %% already exists for table %%.', trigger_name, table_name_param;
    END IF;
END;
$$ LANGUAGE plpgsql;
RAISE NOTICE 'apply_update_trigger_if_not_exists function created.';

-- Apply trigger to all relevant tables
RAISE NOTICE 'Applying updated_at triggers...';
SELECT apply_update_trigger_if_not_exists('tenants');
SELECT apply_update_trigger_if_not_exists('users');
SELECT apply_update_trigger_if_not_exists('employees');
SELECT apply_update_trigger_if_not_exists('job_openings');
SELECT apply_update_trigger_if_not_exists('candidates');
SELECT apply_update_trigger_if_not_exists('job_applications');
SELECT apply_update_trigger_if_not_exists('leave_types');
SELECT apply_update_trigger_if_not_exists('leave_policy');
SELECT apply_update_trigger_if_not_exists('leave_policy_details');
SELECT apply_update_trigger_if_not_exists('leave_balances');
SELECT apply_update_trigger_if_not_exists('leave_applications');
SELECT apply_update_trigger_if_not_exists('holidays');
SELECT apply_update_trigger_if_not_exists('email_templates');
SELECT apply_update_trigger_if_not_exists('email_configuration');
RAISE NOTICE 'All triggers checked/applied.';

-- Initial Data (Optional - e.g., default roles if using them)
-- Example: INSERT INTO roles (role_name, is_system) VALUES ('Admin', TRUE), ('Manager', TRUE), ('Employee', TRUE) ON CONFLICT (role_name) DO NOTHING;

RAISE NOTICE 'Database schema initialization script finished.';
`;

export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');
    // Execute statements one by one or wrapped in a way that allows RAISE NOTICE
    const statements = schemaSQL.split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      // console.log(`Executing: ${statement.substring(0, 100)}...`); // Log snippet of statement
      await client.query(statement);
    }
    console.log('Database schema creation script executed successfully.');
  } catch (err: any) {
    console.error('-----------------------------------------');
    console.error('Error during database schema initialization:', err.message);
    if (err.stack) console.error('Stack:', err.stack);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    if (err.where) console.error('Where:', err.where);
    // console.error('Full Error Object:', err); // Can be very verbose
    console.error('-----------------------------------------');
    throw err; // Re-throw to indicate failure
  } finally {
    if (client) {
      await client.release();
      console.log('Database client released after schema initialization.');
    }
  }
}

// If run directly, initialize and exit
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
