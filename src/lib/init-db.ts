
// src/lib/init-db.ts
import pool from './db';

// Statements for ENUMs and Extensions using DO $$ blocks
const doBlockStatementsSQL = `
DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    RAISE NOTICE 'uuid-ossp extension ensured.';
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'uuid-ossp extension already exists.';
END $$;

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
`;

// The rest of the schema (DROP, CREATE TABLE, CREATE FUNCTION, etc.)
const mainSchemaSQL = `
-- Drop existing trigger functions and tables safely (functions first, then tables)
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
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS job_openings CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;
DROP TABLE IF EXISTS employee_training CASCADE;
DROP TABLE IF EXISTS training_programs CASCADE;
DROP TABLE IF EXISTS performance_ratings CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS performance_cycles CASCADE;
DROP TABLE IF EXISTS competencies CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE; -- Renamed from leave_applications
DROP TABLE IF EXISTS leave_balances CASCADE; -- Renamed from employee_leave_balance
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
RAISE NOTICE 'Existing tables dropped.';

-- Drop existing ENUM types (must be done after tables using them are dropped and before they are recreated)
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
DROP TYPE IF EXISTS job_opening_status_enum CASCADE;
DROP TYPE IF EXISTS candidate_application_status_enum CASCADE;
DROP TYPE IF EXISTS asset_status_enum CASCADE;
DROP TYPE IF EXISTS holiday_type_enum CASCADE;
DROP TYPE IF EXISTS user_role_enum CASCADE;
DROP TYPE IF EXISTS experience_level_enum_type CASCADE;
RAISE NOTICE 'Existing ENUM types dropped.';
-- Note: ENUM types are now created in doBlockStatementsSQL

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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Changed employee_id to id and made it UUID
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL UNIQUE,
    employee_id VARCHAR(50) UNIQUE, -- This is the human-readable EMP-XXX, distinct from primary key
    name VARCHAR(255) NOT NULL, -- Combined from first_name, last_name
    personal_email VARCHAR(255),
    official_email VARCHAR(255) NOT NULL,
    phone VARCHAR(50), -- Renamed from phone_number
    gender gender_enum_type,
    marital_status VARCHAR(20),
    nationality VARCHAR(50),
    blood_group VARCHAR(10),
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    date_of_birth DATE, -- Added from old schema
    position VARCHAR(255), -- From old schema, will be linked to designations
    department VARCHAR(255), -- From old schema, will be linked to departments
    hire_date DATE, -- From old schema
    status VARCHAR(50) DEFAULT 'Active', -- From old schema, consider linking to employment_details.is_active
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- From old schema
    work_location VARCHAR(255), -- From old schema
    employment_type employment_type_enum, -- From old schema, will link to employment_details
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, official_email),
    UNIQUE (tenant_id, employee_id)
);
CREATE INDEX idx_employees_tenant_id ON employees(tenant_id);
RAISE NOTICE 'employees table created.';

CREATE TABLE employee_address (
    address_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    address_type address_type_enum NOT NULL,
    address_line1 VARCHAR(100) NOT NULL,
    address_line2 VARCHAR(100),
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE
);
RAISE NOTICE 'employee_address table created.';

CREATE TABLE employee_documents (
    document_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(100),
    file_path VARCHAR(255),
    verification_status verification_status_enum DEFAULT 'PENDING'
);
RAISE NOTICE 'employee_documents table created.';

CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    department_code VARCHAR(20) UNIQUE, -- Made code unique but not primary
    parent_department_id INT REFERENCES departments(department_id) ON DELETE SET NULL,
    manager_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- Changed to UUID
    cost_center VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
CREATE INDEX idx_departments_tenant_id ON departments(tenant_id);
RAISE NOTICE 'departments table created.';

CREATE TABLE designations (
    designation_id SERIAL PRIMARY KEY,
    designation_name VARCHAR(100) NOT NULL,
    level INT, -- Simplified from NOT NULL
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Added tenant_id
    UNIQUE(tenant_id, designation_name)
);
CREATE INDEX idx_designations_tenant_id ON designations(tenant_id);
RAISE NOTICE 'designations table created.';

CREATE TABLE employment_details (
    employment_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    department_id INT REFERENCES departments(department_id) ON DELETE SET NULL, -- Allow NULL
    designation_id INT REFERENCES designations(designation_id) ON DELETE SET NULL, -- Allow NULL
    reporting_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- Changed to UUID
    employment_type employment_type_enum, -- Used existing enum, made nullable
    joining_date DATE, -- Made nullable
    confirmation_date DATE,
    exit_date DATE,
    exit_reason TEXT,
    is_probation BOOLEAN DEFAULT TRUE,
    probation_end_date DATE,
    notice_period_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE, -- This might duplicate employees.is_active
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
CREATE INDEX idx_employment_details_tenant_id ON employment_details(tenant_id);
CREATE INDEX idx_employment_details_employee_id ON employment_details(employee_id);
RAISE NOTICE 'employment_details table created.';

-- Compensation & Benefits
CREATE TABLE salary_structures (
    structure_id SERIAL PRIMARY KEY,
    structure_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'salary_structures table created.';

CREATE TABLE salary_components (
    component_id SERIAL PRIMARY KEY,
    component_name VARCHAR(100) NOT NULL,
    component_type salary_component_type_enum NOT NULL,
    is_taxable BOOLEAN DEFAULT FALSE,
    is_statutory BOOLEAN DEFAULT FALSE,
    calculation_type calculation_type_enum NOT NULL,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'salary_components table created.';

CREATE TABLE employee_salary (
    salary_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    structure_id INT REFERENCES salary_structures(structure_id) ON DELETE SET NULL, -- Allow NULL
    basic_salary DECIMAL(12,2), -- Made nullable
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'employee_salary table created.';

CREATE TABLE salary_structure_details (
    detail_id SERIAL PRIMARY KEY,
    structure_id INT NOT NULL REFERENCES salary_structures(structure_id) ON DELETE CASCADE,
    component_id INT NOT NULL REFERENCES salary_components(component_id) ON DELETE CASCADE,
    amount DECIMAL(12,2),
    percentage DECIMAL(5,2),
    formula TEXT,
    display_order INT, -- Made nullable
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'salary_structure_details table created.';

-- Time & Attendance
CREATE TABLE shifts (
    shift_id SERIAL PRIMARY KEY,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_time INT DEFAULT 15,
    half_day_hours DECIMAL(4,2) DEFAULT 4.5,
    is_night_shift BOOLEAN DEFAULT FALSE,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'shifts table created.';

CREATE TABLE employee_shift (
    employee_shift_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    shift_id INT NOT NULL REFERENCES shifts(shift_id) ON DELETE CASCADE,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'employee_shift table created.';

CREATE TABLE attendance_records (
    attendance_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
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
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, -- Added tenant_id
    UNIQUE (tenant_id, employee_id, date)
);
RAISE NOTICE 'attendance_records table created.';

-- Leave Management
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Changed to UUID for consistency
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- Renamed from leave_type_name
    short_code VARCHAR(10) UNIQUE,
    is_paid BOOLEAN DEFAULT TRUE,
    is_encashable BOOLEAN DEFAULT FALSE,
    is_carry_forward BOOLEAN DEFAULT FALSE,
    max_carry_forward_days INT,
    requires_approval BOOLEAN DEFAULT TRUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    default_balance NUMERIC(5,2) DEFAULT 0, -- From old schema
    accrual_rate NUMERIC(5,2) DEFAULT 0, -- From old schema
    applicable_gender gender_enum_type, -- From old schema
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name)
);
CREATE INDEX idx_leave_types_tenant_id ON leave_types(tenant_id);
RAISE NOTICE 'leave_types table created.';

CREATE TABLE leave_policy (
    policy_id SERIAL PRIMARY KEY,
    policy_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'leave_policy table created.';

CREATE TABLE leave_policy_details (
    detail_id SERIAL PRIMARY KEY,
    policy_id INT NOT NULL REFERENCES leave_policy(policy_id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE, -- Changed to UUID
    entitlement_days INT NOT NULL,
    max_consecutive_days INT,
    min_service_days INT DEFAULT 0,
    gender_restriction gender_enum_type, -- Use existing enum
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'leave_policy_details table created.';

CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Changed to UUID for consistency
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    balance NUMERIC(5,2) NOT NULL DEFAULT 0, -- Simplified from old schema
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    policy_id INT REFERENCES leave_policy(policy_id) ON DELETE SET NULL, -- Optional link
    year INT, -- Optional link
    UNIQUE (tenant_id, employee_id, leave_type_id) -- Kept this constraint
);
CREATE INDEX idx_leave_balances_tenant_id_employee_id ON leave_balances(tenant_id, employee_id);
RAISE NOTICE 'leave_balances table created.';

CREATE TABLE leave_requests ( -- Renamed from leave_applications
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Changed to UUID for consistency
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(5,2), -- Make nullable, can be calculated
    reason TEXT,
    status leave_application_status_enum DEFAULT 'Pending',
    request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Refers to users table PK
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT, -- Renamed from rejection_reason
    attachment_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_leave_requests_tenant_id_employee_id ON leave_requests(tenant_id, employee_id);
RAISE NOTICE 'leave_requests table created.';

-- Performance Management
CREATE TABLE competencies (
    competency_id SERIAL PRIMARY KEY,
    competency_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'competencies table created.';

CREATE TABLE performance_cycles (
    cycle_id SERIAL PRIMARY KEY,
    cycle_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'performance_cycles table created.';

CREATE TABLE performance_reviews (
    review_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    cycle_id INT NOT NULL REFERENCES performance_cycles(cycle_id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    review_date DATE NOT NULL,
    overall_rating DECIMAL(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status performance_review_status_enum DEFAULT 'DRAFT',
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'performance_reviews table created.';

CREATE TABLE performance_ratings (
    rating_id SERIAL PRIMARY KEY,
    review_id INT NOT NULL REFERENCES performance_reviews(review_id) ON DELETE CASCADE,
    competency_id INT NOT NULL REFERENCES competencies(competency_id) ON DELETE CASCADE,
    rating DECIMAL(3,1) NOT NULL,
    comments TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'performance_ratings table created.';

-- Training & Development
CREATE TABLE training_programs (
    program_id SERIAL PRIMARY KEY,
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_hours DECIMAL(5,2),
    training_type VARCHAR(50),
    is_mandatory BOOLEAN DEFAULT FALSE,
    max_participants INT,
    status training_program_status_enum DEFAULT 'PLANNED',
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'training_programs table created.';

CREATE TABLE employee_training (
    employee_training_id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    program_id INT NOT NULL REFERENCES training_programs(program_id) ON DELETE CASCADE,
    registration_date DATE NOT NULL,
    status employee_training_status_enum DEFAULT 'REGISTERED',
    completion_date DATE,
    score DECIMAL(5,2),
    feedback TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE -- Added tenant_id
);
RAISE NOTICE 'employee_training table created.';

-- Recruitment (Modified to align with existing UUID structure and merge)
CREATE TABLE job_openings ( -- Renamed from job_postings
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    job_title VARCHAR(100) NOT NULL, -- From new schema
    department_id INT REFERENCES departments(department_id) ON DELETE SET NULL, -- From new schema
    designation_id INT REFERENCES designations(designation_id) ON DELETE SET NULL, -- From new schema
    employment_type employment_type_enum, -- From new schema
    no_of_vacancies INT NOT NULL DEFAULT 1, -- From new schema
    experience_level experience_level_enum_type, -- From new schema, was experience_range
    location VARCHAR(100),
    opening_date DATE, -- From new schema, similar to date_posted
    closing_date DATE,
    status job_opening_status_enum DEFAULT 'Draft', -- From new schema
    description TEXT,
    requirements TEXT, -- From new schema
    salary_range VARCHAR(100), -- Kept from old schema
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_job_openings_tenant_id_new ON job_openings(tenant_id);
RAISE NOTICE 'job_openings table (merged) created.';

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Kept UUID for consistency
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20), -- Made nullable
    resume_url VARCHAR(255), -- Renamed from resume_path
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience DECIMAL(4,2),
    notice_period INT,
    current_salary VARCHAR(100), -- Changed from DECIMAL
    expected_salary VARCHAR(100), -- Changed from DECIMAL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    -- status from new schema is now handled by job_applications.current_stage
);
CREATE INDEX idx_candidates_tenant_id_new ON candidates(tenant_id);
CREATE UNIQUE INDEX idx_candidates_tenant_email_new ON candidates(tenant_id, email);
RAISE NOTICE 'candidates table (merged) created.';

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- Changed to UUID
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES job_openings(id) ON DELETE CASCADE, -- job_id refers to job_openings.id
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    current_stage candidate_application_status_enum DEFAULT 'Applied',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_job_applications_tenant_id_new ON job_applications(tenant_id);
CREATE INDEX idx_job_applications_candidate_id_new ON job_applications(candidate_id);
CREATE INDEX idx_job_applications_job_id_new ON job_applications(job_id);
RAISE NOTICE 'job_applications table (merged) created.';

-- System & User Management (users table already defined above)
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE -- Roles can be tenant-specific or global (tenant_id IS NULL)
);
RAISE NOTICE 'roles table created.';

CREATE TABLE user_roles (
    user_role_id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (user_id, role_id)
);
RAISE NOTICE 'user_roles table created.';

CREATE TABLE permissions (
    permission_id SERIAL PRIMARY KEY,
    permission_name VARCHAR(100) NOT NULL UNIQUE,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);
RAISE NOTICE 'permissions table created.';

CREATE TABLE role_permissions (
    role_permission_id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    permission_id INT NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (role_id, permission_id)
);
RAISE NOTICE 'role_permissions table created.';

-- Additional Tables (Holidays, Announcements, Assets)
CREATE TABLE holidays ( -- Already defined one, merging and using UUID PK
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Renamed from holiday_name
    date DATE NOT NULL, -- Renamed from holiday_date
    holiday_type holiday_type_enum, -- From new schema
    applicable_location VARCHAR(100) DEFAULT 'ALL',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, date, applicable_location)
);
CREATE INDEX idx_holidays_tenant_id_new ON holidays(tenant_id);
RAISE NOTICE 'holidays table (merged) created.';

CREATE TABLE announcements (
    announcement_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE -- Changed to UUID
);
RAISE NOTICE 'announcements table created.';

CREATE TABLE asset_inventory (
    asset_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    model_number VARCHAR(50),
    serial_number VARCHAR(50), -- Removed UNIQUE to allow tenant-scoping if needed or handle uniqueness in app
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_cost DECIMAL(12,2),
    current_value DECIMAL(12,2),
    status asset_status_enum DEFAULT 'AVAILABLE',
    location VARCHAR(100),
    notes TEXT,
    UNIQUE(tenant_id, serial_number) -- Tenant-scoped serial number
);
RAISE NOTICE 'asset_inventory table created.';

CREATE TABLE employee_assets (
    assignment_id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_id INT NOT NULL REFERENCES asset_inventory(asset_id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE, -- Changed to UUID
    assigned_date DATE NOT NULL,
    return_date DATE,
    assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Changed to UUID
    condition_at_assignment TEXT,
    condition_at_return TEXT,
    notes TEXT
);
RAISE NOTICE 'employee_assets table created.';

-- Communication Module (Already defined, ensuring tenant_id consistency)
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
CREATE INDEX idx_email_templates_tenant_id_new ON email_templates(tenant_id);
RAISE NOTICE 'email_templates table (re-affirmed) created.';

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
RAISE NOTICE 'email_configuration table (re-affirmed) created.';

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
SELECT apply_update_trigger_if_not_exists('leave_balances');
SELECT apply_update_trigger_if_not_exists('leave_requests');
SELECT apply_update_trigger_if_not_exists('holidays');
SELECT apply_update_trigger_if_not_exists('email_templates');
SELECT apply_update_trigger_if_not_exists('email_configuration');
RAISE NOTICE 'All triggers checked/applied.';

RAISE NOTICE 'Database schema initialization script finished.';
`;


export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');

    // Split DO blocks and execute them
    const doBlockRegex = /(DO\s*\$\$[\s\S]*?END\s*\$\$);?/ig;
    const individualDoBlocks: string[] = [];
    let match;
    let tempSchemaSQL = doBlockStatementsSQL; // Use the separate string for DO blocks

    console.log('Executing DO $$...END$$ blocks individually...');
    while ((match = doBlockRegex.exec(tempSchemaSQL)) !== null) {
        const block = match[0].trim();
        if (block) { // Ensure block is not empty
            individualDoBlocks.push(block);
        }
    }

    for (const block of individualDoBlocks) {
        console.log(`Executing DO block: ${block.substring(0, 100)}...`); // Log start of block
        try {
            await client.query(block);
            console.log(`Successfully executed DO block: ${block.substring(0, 100)}...`);
        } catch (doBlockError: any) {
            console.error(`Error executing DO block: ${block.substring(0, 100)}...`, doBlockError.message);
            if (doBlockError.code !== '42710') { // 42710 is 'duplicate_object' for ENUMs/Extensions
                 console.error('-----------------------------------------');
                 console.error('Error during DO block execution:', doBlockError.message);
                 if (doBlockError.stack) console.error('Stack:', doBlockError.stack);
                 console.error('Full Error Object:', doBlockError);
                 console.error('-----------------------------------------');
                throw doBlockError; // Re-throw if not a duplicate object error
            } else {
                console.warn(`Warning during DO block execution (likely duplicate object): ${doBlockError.message}`);
            }
        }
    }
    console.log('Finished executing DO $$...END$$ blocks.');


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
