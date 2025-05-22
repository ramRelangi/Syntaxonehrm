
// src/lib/init-db.ts
import pool from './db';

// Statement for the uuid-ossp extension
const extensionSQL = `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

// Individual DO $$ blocks for ENUM creation
const enumCreationSQLs = [
`DO $$ BEGIN CREATE TYPE user_role_enum AS ENUM ('Admin', 'Manager', 'Employee'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'user_role_enum already exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE gender_enum_type AS ENUM ('Male', 'Female', 'Other', 'Prefer not to say'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'gender_enum_type already exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE address_type_enum AS ENUM('PERMANENT', 'CURRENT', 'OFFICIAL'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'address_type_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE verification_status_enum AS ENUM('VERIFIED', 'PENDING', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'verification_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE employment_type_enum AS ENUM('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employment_type_enum already exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE salary_component_type_enum AS ENUM('EARNING', 'DEDUCTION', 'BENEFIT'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'salary_component_type_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE calculation_type_enum AS ENUM('FIXED', 'PERCENTAGE', 'FORMULA'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'calculation_type_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE attendance_status_enum AS ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'attendance_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE leave_application_status_enum AS ENUM('Pending', 'Approved', 'Rejected', 'Cancelled'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'leave_application_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE performance_review_status_enum AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'performance_review_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE training_program_status_enum AS ENUM('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'training_program_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE employee_training_status_enum AS ENUM('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employee_training_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE job_opening_status_enum AS ENUM('Draft', 'Open', 'Closed', 'Archived'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'job_opening_status_enum already exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE candidate_application_status_enum AS ENUM('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'candidate_application_status_enum already exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE asset_status_enum AS ENUM('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'asset_status_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE holiday_type_enum AS ENUM('FIXED', 'VARIABLE'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'holiday_type_enum exists.'; END $$;`,
`DO $$ BEGIN CREATE TYPE experience_level_enum_type AS ENUM('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director'); EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'experience_level_enum_type already exists.'; END $$;`
];

// The rest of the schema (DROP, CREATE TABLE, CREATE FUNCTION, etc.)
// Removed RAISE NOTICE statements from this block
const mainSchemaSQL = `
-- Drop existing trigger functions and tables safely (functions first, then tables)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS apply_update_trigger_if_not_exists(text) CASCADE;

-- Drop tables in an order that respects dependencies, or use CASCADE
DROP TABLE IF EXISTS employee_assets CASCADE;
DROP TABLE IF EXISTS asset_inventory CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
-- Candidates table was renamed to job_candidates for clarity, ensure consistency
DROP TABLE IF EXISTS job_candidates CASCADE;
DROP TABLE IF EXISTS candidates CASCADE; -- Assuming 'candidates' is the old name to be dropped
DROP TABLE IF EXISTS job_openings CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;
DROP TABLE IF EXISTS employee_training CASCADE;
DROP TABLE IF EXISTS training_programs CASCADE;
DROP TABLE IF EXISTS performance_ratings CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS performance_cycles CASCADE;
DROP TABLE IF EXISTS competencies CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE;
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
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Note: ENUM types are now created individually before this main block

-- Recreate Tables
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL UNIQUE,
    employee_id VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    personal_email VARCHAR(255),
    official_email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    gender gender_enum_type,
    marital_status VARCHAR(20),
    nationality VARCHAR(50),
    blood_group VARCHAR(10),
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    date_of_birth DATE,
    position VARCHAR(255),
    department VARCHAR(255), -- Consider FK to departments table
    hire_date DATE,
    status VARCHAR(50) DEFAULT 'Active', -- Consider an ENUM type
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    work_location VARCHAR(255),
    employment_type employment_type_enum,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, official_email),
    UNIQUE (tenant_id, employee_id)
);

CREATE TABLE employee_address (
    address_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    address_type address_type_enum NOT NULL,
    address_line1 VARCHAR(100) NOT NULL,
    address_line2 VARCHAR(100),
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE employee_documents (
    document_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(100),
    file_path VARCHAR(255),
    verification_status verification_status_enum DEFAULT 'PENDING'
);

CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_name VARCHAR(100) NOT NULL,
    department_code VARCHAR(20),
    parent_department_id INT REFERENCES departments(department_id) ON DELETE SET NULL,
    manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    cost_center VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, department_name)
);

CREATE TABLE designations (
    designation_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    designation_name VARCHAR(100) NOT NULL,
    level INT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, designation_name)
);

CREATE TABLE employment_details (
    employment_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE UNIQUE,
    department_id INT REFERENCES departments(department_id) ON DELETE SET NULL,
    designation_id INT REFERENCES designations(designation_id) ON DELETE SET NULL,
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    employment_type employment_type_enum,
    joining_date DATE,
    confirmation_date DATE,
    exit_date DATE,
    exit_reason TEXT,
    is_probation BOOLEAN DEFAULT TRUE,
    probation_end_date DATE,
    notice_period_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE salary_structures (
    structure_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    structure_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    UNIQUE(tenant_id, structure_name)
);

CREATE TABLE salary_components (
    component_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    component_name VARCHAR(100) NOT NULL,
    component_type salary_component_type_enum NOT NULL,
    is_taxable BOOLEAN DEFAULT FALSE,
    is_statutory BOOLEAN DEFAULT FALSE,
    calculation_type calculation_type_enum NOT NULL,
    description TEXT,
    UNIQUE(tenant_id, component_name)
);

CREATE TABLE employee_salary (
    salary_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    structure_id INT REFERENCES salary_structures(structure_id) ON DELETE SET NULL,
    basic_salary DECIMAL(12,2),
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, employee_id, effective_from)
);

CREATE TABLE salary_structure_details (
    detail_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    structure_id INT NOT NULL REFERENCES salary_structures(structure_id) ON DELETE CASCADE,
    component_id INT NOT NULL REFERENCES salary_components(component_id) ON DELETE CASCADE,
    amount DECIMAL(12,2),
    percentage DECIMAL(5,2),
    formula TEXT,
    display_order INT,
    UNIQUE(tenant_id, structure_id, component_id)
);

CREATE TABLE shifts (
    shift_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_time INT DEFAULT 15,
    half_day_hours DECIMAL(4,2) DEFAULT 4.5,
    is_night_shift BOOLEAN DEFAULT FALSE,
    description TEXT,
    UNIQUE(tenant_id, shift_name)
);

CREATE TABLE employee_shift (
    employee_shift_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id INT NOT NULL REFERENCES shifts(shift_id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, employee_id, effective_from)
);

CREATE TABLE attendance_records (
    attendance_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift_id INT REFERENCES shifts(shift_id) ON DELETE SET NULL,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    status attendance_status_enum NOT NULL,
    regular_hours DECIMAL(5,2),
    overtime_hours DECIMAL(5,2),
    late_minutes INT,
    early_minutes INT,
    remarks TEXT,
    UNIQUE (tenant_id, employee_id, date)
);

CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN DEFAULT TRUE,
    default_balance NUMERIC(5,2) DEFAULT 0,
    accrual_rate NUMERIC(5,2) DEFAULT 0,
    applicable_gender gender_enum_type,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_paid BOOLEAN DEFAULT TRUE,
    is_encashable BOOLEAN DEFAULT FALSE,
    is_carry_forward BOOLEAN DEFAULT FALSE,
    max_carry_forward_days INT,
    is_active BOOLEAN DEFAULT TRUE,
    short_code VARCHAR(10),
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, short_code)
);

CREATE TABLE leave_policy (
    policy_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    UNIQUE(tenant_id, policy_name)
);

CREATE TABLE leave_policy_details (
    detail_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    policy_id INT NOT NULL REFERENCES leave_policy(policy_id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    entitlement_days INT NOT NULL,
    max_consecutive_days INT,
    min_service_days INT DEFAULT 0,
    gender_restriction gender_enum_type,
    UNIQUE(tenant_id, policy_id, leave_type_id)
);

CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    policy_id INT REFERENCES leave_policy(policy_id) ON DELETE SET NULL,
    year INT,
    UNIQUE (tenant_id, employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(5,2),
    reason TEXT,
    status leave_application_status_enum DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    attachment_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE competencies (
    competency_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    competency_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, competency_name)
);

CREATE TABLE performance_cycles (
    cycle_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cycle_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    UNIQUE(tenant_id, cycle_name)
);

CREATE TABLE performance_reviews (
    review_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    cycle_id INT NOT NULL REFERENCES performance_cycles(cycle_id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    review_date DATE NOT NULL,
    overall_rating DECIMAL(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status performance_review_status_enum DEFAULT 'DRAFT'
);

CREATE TABLE performance_ratings (
    rating_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id INT NOT NULL REFERENCES performance_reviews(review_id) ON DELETE CASCADE,
    competency_id INT NOT NULL REFERENCES competencies(competency_id) ON DELETE CASCADE,
    rating DECIMAL(3,1) NOT NULL,
    comments TEXT
);

CREATE TABLE training_programs (
    program_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_hours DECIMAL(5,2),
    training_type VARCHAR(50),
    is_mandatory BOOLEAN DEFAULT FALSE,
    max_participants INT,
    status training_program_status_enum DEFAULT 'PLANNED',
    UNIQUE(tenant_id, program_name)
);

CREATE TABLE employee_training (
    employee_training_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    program_id INT NOT NULL REFERENCES training_programs(program_id) ON DELETE CASCADE,
    registration_date DATE NOT NULL,
    status employee_training_status_enum DEFAULT 'REGISTERED',
    completion_date DATE,
    score DECIMAL(5,2),
    feedback TEXT
);

CREATE TABLE job_openings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_title VARCHAR(100) NOT NULL,
    department VARCHAR(255),
    designation_id INT REFERENCES designations(designation_id) ON DELETE SET NULL,
    employment_type employment_type_enum,
    no_of_vacancies INT NOT NULL DEFAULT 1,
    experience_level experience_level_enum_type,
    location VARCHAR(100),
    opening_date DATE,
    closing_date DATE,
    status job_opening_status_enum DEFAULT 'Draft',
    description TEXT,
    requirements TEXT,
    salary_range VARCHAR(100),
    date_posted TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE job_candidates ( -- Renamed from 'candidates'
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    resume_url VARCHAR(255),
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience DECIMAL(4,2),
    notice_period INT,
    current_salary VARCHAR(100),
    expected_salary VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
);

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES job_candidates(id) ON DELETE CASCADE,
    job_opening_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE,
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_stage candidate_application_status_enum DEFAULT 'Applied',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, candidate_id, job_opening_id)
);

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    UNIQUE(tenant_id, role_name)
);

CREATE TABLE user_roles (
    user_role_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (user_id, role_id)
);

CREATE TABLE permissions (
    permission_id SERIAL PRIMARY KEY,
    permission_name VARCHAR(100) NOT NULL UNIQUE,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE role_permissions (
    role_permission_id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (role_id, permission_id)
);

CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    holiday_type holiday_type_enum,
    applicable_location VARCHAR(100) DEFAULT 'ALL',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name, date, applicable_location)
);

CREATE TABLE announcements (
    announcement_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE asset_inventory (
    asset_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    model_number VARCHAR(50),
    serial_number VARCHAR(50),
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_cost DECIMAL(12,2),
    current_value DECIMAL(12,2),
    status asset_status_enum DEFAULT 'AVAILABLE',
    location VARCHAR(100),
    notes TEXT,
    UNIQUE(tenant_id, serial_number)
);

CREATE TABLE employee_assets (
    assignment_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id INT NOT NULL REFERENCES asset_inventory(asset_id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_date DATE NOT NULL,
    return_date DATE,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    condition_at_assignment TEXT,
    condition_at_return TEXT,
    notes TEXT
);

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

CREATE TABLE email_configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted VARCHAR(512) NOT NULL,
    smtp_secure BOOLEAN DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Recreate Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

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
    ELSE
        -- Optionally log that trigger already exists
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
SELECT apply_update_trigger_if_not_exists('tenants');
SELECT apply_update_trigger_if_not_exists('users');
SELECT apply_update_trigger_if_not_exists('employees');
SELECT apply_update_trigger_if_not_exists('job_openings');
SELECT apply_update_trigger_if_not_exists('job_candidates');
SELECT apply_update_trigger_if_not_exists('job_applications');
SELECT apply_update_trigger_if_not_exists('leave_types');
SELECT apply_update_trigger_if_not_exists('leave_balances');
SELECT apply_update_trigger_if_not_exists('leave_requests');
SELECT apply_update_trigger_if_not_exists('holidays');
SELECT apply_update_trigger_if_not_exists('email_templates');
SELECT apply_update_trigger_if_not_exists('email_configuration');

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_openings_tenant_id ON job_openings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_candidates_tenant_id ON job_candidates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_tenant_id_job_opening_id ON job_applications(tenant_id, job_opening_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant_id_employee_id ON leave_requests(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_id_employee_id ON leave_balances(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON email_templates(tenant_id);
`;


export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');

    // Execute CREATE EXTENSION command first
    console.log(`Executing statement: ${extensionSQL}`);
    await client.query(extensionSQL);
    console.log(`Successfully executed: ${extensionSQL}`);

    // Execute each ENUM creation DO block
    for (const enumSQL of enumCreationSQLs) {
      const enumNameMatch = enumSQL.match(/CREATE TYPE (\S+)/);
      const enumShortName = enumNameMatch ? enumNameMatch[1] : 'ENUM Block';

      console.log(`Executing ENUM creation for: ${enumShortName}...`);
      try {
        await client.query(enumSQL);
        console.log(`Successfully executed ENUM creation for: ${enumShortName}.`);
      } catch (doBlockError: any) {
        if (doBlockError.code !== '42710') { // 42710 is 'duplicate_object'
          console.error(`Error executing ENUM DO block for ${enumShortName}:`, doBlockError.message);
          throw doBlockError;
        } else {
          console.warn(`Warning during ENUM creation for ${enumShortName} (likely already exists): ${doBlockError.message}`);
        }
      }
    }
    console.log('Finished executing ENUM creation DO $$...END$$ blocks.');

    // Execute the main DDL script (tables, functions, triggers)
    console.log('Executing main DDL script (tables, functions, triggers)...');
    await client.query(mainSchemaSQL);
    console.log('Main DDL script executed successfully.');

    console.log('Database schema initialization script executed successfully.');
  } catch (err: any) {
    console.error('-----------------------------------------');
    console.error('Error during database schema initialization:', err.message);
    if (err.stack) console.error('Stack:', err.stack);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    if (err.where) console.error('Where:', err.where);
    console.error('Full Error Object:', err);
    console.error('-----------------------------------------');
    throw err;
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
