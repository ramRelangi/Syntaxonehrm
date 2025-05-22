
// src/lib/init-db.ts
import pool from './db';

// Combine all schemas into one script for simplicity
const schemaSQL = `
-- Ensure uuid-ossp extension is enabled (though less used in new schema, good to have)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SELECT 'uuid-ossp extension ensured.';

-- Drop potentially existing trigger functions first
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS apply_update_trigger_if_not_exists(text) CASCADE;
SELECT 'Existing trigger functions dropped (if they existed).';

-- Drop existing tables in reverse dependency order (carefully!)
-- Note: CASCADE will drop dependent objects like constraints, indexes, views, etc.
DROP TABLE IF EXISTS employee_assets CASCADE;
DROP TABLE IF EXISTS asset_inventory CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS job_openings CASCADE;
DROP TABLE IF EXISTS employee_training CASCADE;
DROP TABLE IF EXISTS training_programs CASCADE;
DROP TABLE IF EXISTS performance_ratings CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS performance_cycles CASCADE;
DROP TABLE IF EXISTS competencies CASCADE;
DROP TABLE IF EXISTS leave_applications CASCADE;
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
-- Old tables from previous schema (if any)
DROP TABLE IF EXISTS email_configuration CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS tenants CASCADE; -- Assuming tenants table is not part of the new schema based on user input. If it is, it should be managed separately or added.
SELECT 'Existing tables dropped (if they existed).';

-- Drop existing types (must be done after tables using them are dropped)
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
-- Old types (if any)
DROP TYPE IF EXISTS job_posting_status CASCADE;
DROP TYPE IF EXISTS candidate_status CASCADE;
DROP TYPE IF EXISTS leave_request_status CASCADE;
DROP TYPE IF EXISTS employee_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS experience_level_enum_type CASCADE;
SELECT 'Existing custom types dropped (if they existed).';


-- Recreate Types
DO $$ BEGIN CREATE TYPE gender_enum_type AS ENUM ('M', 'F', 'O'); RAISE NOTICE 'gender_enum_type created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'gender_enum_type exists.'; END $$;
DO $$ BEGIN CREATE TYPE address_type_enum AS ENUM('PERMANENT', 'CURRENT', 'OFFICIAL'); RAISE NOTICE 'address_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'address_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE verification_status_enum AS ENUM('VERIFIED', 'PENDING', 'REJECTED'); RAISE NOTICE 'verification_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'verification_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE employment_type_enum AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'); RAISE NOTICE 'employment_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employment_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE salary_component_type_enum AS ENUM('EARNING', 'DEDUCTION', 'BENEFIT'); RAISE NOTICE 'salary_component_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'salary_component_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE calculation_type_enum AS ENUM('FIXED', 'PERCENTAGE', 'FORMULA'); RAISE NOTICE 'calculation_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'calculation_type_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE attendance_status_enum AS ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'); RAISE NOTICE 'attendance_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'attendance_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE leave_application_status_enum AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'); RAISE NOTICE 'leave_application_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'leave_application_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE performance_review_status_enum AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'); RAISE NOTICE 'performance_review_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'performance_review_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE training_program_status_enum AS ENUM('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'); RAISE NOTICE 'training_program_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'training_program_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE employee_training_status_enum AS ENUM('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED'); RAISE NOTICE 'employee_training_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'employee_training_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE job_opening_status_enum AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'); RAISE NOTICE 'job_opening_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'job_opening_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE candidate_application_status_enum AS ENUM('NEW', 'SCREENING', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'APPLIED', 'OFFER', 'ACTIVE', 'WITHDRAWN'); RAISE NOTICE 'candidate_application_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'candidate_application_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE asset_status_enum AS ENUM('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'); RAISE NOTICE 'asset_status_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'asset_status_enum exists.'; END $$;
DO $$ BEGIN CREATE TYPE holiday_type_enum AS ENUM('FIXED', 'VARIABLE'); RAISE NOTICE 'holiday_type_enum created.'; EXCEPTION WHEN duplicate_object THEN RAISE NOTICE 'holiday_type_enum exists.'; END $$;

-- Recreate Tables

-- Core Employee Tables
CREATE TABLE employees (
    employee_id VARCHAR(20) PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender gender_enum_type, -- Changed CHAR(1) to use the enum
    marital_status VARCHAR(20),
    nationality VARCHAR(50),
    blood_group VARCHAR(10),
    personal_email VARCHAR(100),
    official_email VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20),
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Trigger will handle ON UPDATE
    is_active BOOLEAN DEFAULT TRUE
);
SELECT 'employees table created.';

CREATE TABLE employee_address (
    address_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    address_type address_type_enum NOT NULL,
    address_line1 VARCHAR(100) NOT NULL,
    address_line2 VARCHAR(100),
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
);
SELECT 'employee_address table created.';

CREATE TABLE employee_documents (
    document_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(100),
    file_path VARCHAR(255),
    verification_status verification_status_enum DEFAULT 'PENDING',
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
);
SELECT 'employee_documents table created.';

-- Organizational Structure
CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    department_name VARCHAR(100) NOT NULL UNIQUE,
    department_code VARCHAR(20) NOT NULL UNIQUE,
    parent_department_id INT,
    manager_id VARCHAR(20),
    cost_center VARCHAR(50),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (parent_department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);
SELECT 'departments table created.';

CREATE TABLE designations (
    designation_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    designation_name VARCHAR(100) NOT NULL UNIQUE,
    level INT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
SELECT 'designations table created.';

CREATE TABLE employment_details (
    employment_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    department_id INT NOT NULL,
    designation_id INT NOT NULL,
    reporting_manager_id VARCHAR(20),
    employment_type employment_type_enum NOT NULL,
    joining_date DATE NOT NULL,
    confirmation_date DATE,
    exit_date DATE,
    exit_reason TEXT,
    is_probation BOOLEAN DEFAULT TRUE,
    probation_end_date DATE,
    notice_period_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE RESTRICT,
    FOREIGN KEY (designation_id) REFERENCES designations(designation_id) ON DELETE RESTRICT,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);
SELECT 'employment_details table created.';

-- Compensation & Benefits
CREATE TABLE salary_structures (
    structure_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    structure_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT
);
SELECT 'salary_structures table created.';

CREATE TABLE salary_components (
    component_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    component_name VARCHAR(100) NOT NULL,
    component_type salary_component_type_enum NOT NULL,
    is_taxable BOOLEAN DEFAULT FALSE,
    is_statutory BOOLEAN DEFAULT FALSE,
    calculation_type calculation_type_enum NOT NULL,
    description TEXT
);
SELECT 'salary_components table created.';

CREATE TABLE employee_salary (
    salary_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    structure_id INT NOT NULL,
    basic_salary DECIMAL(12,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (structure_id) REFERENCES salary_structures(structure_id) ON DELETE RESTRICT
);
SELECT 'employee_salary table created.';

CREATE TABLE salary_structure_details (
    detail_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    structure_id INT NOT NULL,
    component_id INT NOT NULL,
    amount DECIMAL(12,2),
    percentage DECIMAL(5,2),
    formula TEXT,
    display_order INT NOT NULL,
    FOREIGN KEY (structure_id) REFERENCES salary_structures(structure_id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON DELETE RESTRICT
);
SELECT 'salary_structure_details table created.';

-- Time & Attendance
CREATE TABLE shifts (
    shift_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_time INT DEFAULT 15,
    half_day_hours DECIMAL(4,2) DEFAULT 4.5,
    is_night_shift BOOLEAN DEFAULT FALSE,
    description TEXT
);
SELECT 'shifts table created.';

CREATE TABLE employee_shift (
    employee_shift_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    shift_id INT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE RESTRICT
);
SELECT 'employee_shift table created.';

CREATE TABLE attendance_records (
    attendance_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    shift_id INT,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    status attendance_status_enum NOT NULL,
    regular_hours DECIMAL(5,2),
    overtime_hours DECIMAL(5,2),
    late_minutes INT,
    early_minutes INT,
    remarks TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL,
    UNIQUE (employee_id, date) -- Changed UNIQUE KEY syntax
);
SELECT 'attendance_records table created.';

-- Leave Management
CREATE TABLE leave_types (
    leave_type_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    leave_type_name VARCHAR(50) NOT NULL UNIQUE,
    short_code VARCHAR(10) NOT NULL UNIQUE,
    is_paid BOOLEAN DEFAULT TRUE,
    is_encashable BOOLEAN DEFAULT FALSE,
    is_carry_forward BOOLEAN DEFAULT FALSE,
    max_carry_forward_days INT,
    requires_approval BOOLEAN DEFAULT TRUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
SELECT 'leave_types table created.';

CREATE TABLE leave_policy (
    policy_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    policy_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT
);
SELECT 'leave_policy table created.';

CREATE TABLE leave_policy_details (
    detail_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    policy_id INT NOT NULL,
    leave_type_id INT NOT NULL,
    entitlement_days INT NOT NULL,
    max_consecutive_days INT,
    min_service_days INT DEFAULT 0,
    gender_restriction gender_enum_type, -- Changed CHAR(1)
    FOREIGN KEY (policy_id) REFERENCES leave_policy(policy_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE RESTRICT
);
SELECT 'leave_policy_details table created.';

CREATE TABLE employee_leave_balance (
    balance_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    leave_type_id INT NOT NULL,
    policy_id INT NOT NULL,
    year INT NOT NULL,
    opening_balance DECIMAL(5,2) NOT NULL,
    earned_balance DECIMAL(5,2) DEFAULT 0,
    consumed_balance DECIMAL(5,2) DEFAULT 0,
    adjusted_balance DECIMAL(5,2) DEFAULT 0,
    closing_balance DECIMAL(5,2) GENERATED ALWAYS AS (opening_balance + earned_balance - consumed_balance + adjusted_balance) STORED,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE RESTRICT,
    FOREIGN KEY (policy_id) REFERENCES leave_policy(policy_id) ON DELETE RESTRICT,
    UNIQUE (employee_id, leave_type_id, year) -- Changed UNIQUE KEY syntax
);
SELECT 'employee_leave_balance table created.';

CREATE TABLE leave_applications (
    application_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    leave_type_id INT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(5,2) NOT NULL,
    reason TEXT,
    status leave_application_status_enum DEFAULT 'PENDING',
    applied_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by VARCHAR(20),
    approved_on TIMESTAMP,
    rejection_reason TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE RESTRICT,
    FOREIGN KEY (approved_by) REFERENCES employees(employee_id) ON DELETE SET NULL
);
SELECT 'leave_applications table created.';

-- Performance Management
CREATE TABLE competencies (
    competency_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    competency_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);
SELECT 'competencies table created.';

CREATE TABLE performance_cycles (
    cycle_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    cycle_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT
);
SELECT 'performance_cycles table created.';

CREATE TABLE performance_reviews (
    review_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    cycle_id INT NOT NULL,
    reviewer_id VARCHAR(20) NOT NULL,
    review_date DATE NOT NULL,
    overall_rating DECIMAL(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status performance_review_status_enum DEFAULT 'DRAFT',
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES performance_cycles(cycle_id) ON DELETE RESTRICT,
    FOREIGN KEY (reviewer_id) REFERENCES employees(employee_id) ON DELETE RESTRICT
);
SELECT 'performance_reviews table created.';

CREATE TABLE performance_ratings (
    rating_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    review_id INT NOT NULL,
    competency_id INT NOT NULL,
    rating DECIMAL(3,1) NOT NULL,
    comments TEXT,
    FOREIGN KEY (review_id) REFERENCES performance_reviews(review_id) ON DELETE CASCADE,
    FOREIGN KEY (competency_id) REFERENCES competencies(competency_id) ON DELETE RESTRICT
);
SELECT 'performance_ratings table created.';

-- Training & Development
CREATE TABLE training_programs (
    program_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_hours DECIMAL(5,2),
    training_type VARCHAR(50),
    is_mandatory BOOLEAN DEFAULT FALSE,
    max_participants INT,
    status training_program_status_enum DEFAULT 'PLANNED'
);
SELECT 'training_programs table created.';

CREATE TABLE employee_training (
    employee_training_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    employee_id VARCHAR(20) NOT NULL,
    program_id INT NOT NULL,
    registration_date DATE NOT NULL,
    status employee_training_status_enum DEFAULT 'REGISTERED',
    completion_date DATE,
    score DECIMAL(5,2),
    feedback TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES training_programs(program_id) ON DELETE RESTRICT
);
SELECT 'employee_training table created.';

-- Recruitment
CREATE TABLE job_openings (
    job_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    job_title VARCHAR(100) NOT NULL,
    department_id INT,
    designation_id INT,
    employment_type VARCHAR(50), -- Consider using employment_type_enum if applicable
    no_of_vacancies INT NOT NULL,
    experience_range VARCHAR(50),
    location VARCHAR(100),
    opening_date DATE NOT NULL,
    closing_date DATE,
    status job_opening_status_enum DEFAULT 'DRAFT',
    description TEXT,
    requirements TEXT,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    FOREIGN KEY (designation_id) REFERENCES designations(designation_id) ON DELETE SET NULL
);
SELECT 'job_openings table created.';

CREATE TABLE candidates (
    candidate_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    resume_path VARCHAR(255),
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience DECIMAL(4,2),
    notice_period INT,
    current_salary DECIMAL(12,2),
    expected_salary DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Trigger will handle ON UPDATE
    status candidate_application_status_enum DEFAULT 'NEW'
);
SELECT 'candidates table created.';

CREATE TABLE job_applications (
    application_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    candidate_id INT NOT NULL,
    job_id INT NOT NULL,
    applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_stage candidate_application_status_enum DEFAULT 'APPLIED', -- Ensure enum covers these values
    status candidate_application_status_enum DEFAULT 'ACTIVE', -- Ensure enum covers these values
    FOREIGN KEY (candidate_id) REFERENCES candidates(candidate_id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES job_openings(job_id) ON DELETE CASCADE
);
SELECT 'job_applications table created.';

-- System & User Management
CREATE TABLE users (
    user_id VARCHAR(20) PRIMARY KEY, -- Could be UUID if employees.employee_id also uses UUIDs
    employee_id VARCHAR(20) UNIQUE,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    failed_attempts INT DEFAULT 0,
    account_locked BOOLEAN DEFAULT FALSE,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Trigger will handle ON UPDATE
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);
SELECT 'users table created.';

CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE
);
SELECT 'roles table created.';

CREATE TABLE user_roles (
    user_role_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    user_id VARCHAR(20) NOT NULL,
    role_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(20),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE (user_id, role_id) -- Changed UNIQUE KEY syntax
);
SELECT 'user_roles table created.';

CREATE TABLE permissions (
    permission_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    permission_name VARCHAR(100) NOT NULL UNIQUE,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);
SELECT 'permissions table created.';

CREATE TABLE role_permissions (
    role_permission_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(20),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    UNIQUE (role_id, permission_id) -- Changed UNIQUE KEY syntax
);
SELECT 'role_permissions table created.';

-- Additional Tables
CREATE TABLE holidays (
    holiday_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    holiday_name VARCHAR(100) NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_type holiday_type_enum NOT NULL,
    applicable_location VARCHAR(100) DEFAULT 'ALL',
    description TEXT,
    UNIQUE (holiday_date, applicable_location) -- Changed UNIQUE KEY syntax
);
SELECT 'holidays table created.';

CREATE TABLE announcements (
    announcement_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    publish_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(20) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);
SELECT 'announcements table created.';

CREATE TABLE asset_inventory (
    asset_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    asset_name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    model_number VARCHAR(50),
    serial_number VARCHAR(50) UNIQUE,
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_cost DECIMAL(12,2),
    current_value DECIMAL(12,2),
    status asset_status_enum DEFAULT 'AVAILABLE',
    location VARCHAR(100),
    notes TEXT
);
SELECT 'asset_inventory table created.';

CREATE TABLE employee_assets (
    assignment_id SERIAL PRIMARY KEY, -- Changed to SERIAL
    asset_id INT NOT NULL,
    employee_id VARCHAR(20) NOT NULL,
    assigned_date DATE NOT NULL,
    return_date DATE,
    assigned_by VARCHAR(20) NOT NULL,
    condition_at_assignment TEXT,
    condition_at_return TEXT,
    notes TEXT,
    FOREIGN KEY (asset_id) REFERENCES asset_inventory(asset_id) ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL
);
SELECT 'employee_assets table created.';


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
        RAISE NOTICE 'Trigger %% created for table %%.', trigger_name, table_name_param;
    ELSE
        RAISE NOTICE 'Trigger %% already exists for table %%.', trigger_name, table_name_param;
    END IF;
END;
$$ LANGUAGE plpgsql;
SELECT 'apply_update_trigger_if_not_exists function created.';

-- Apply trigger to all relevant tables that have an updated_at column
-- and were intended to use ON UPDATE CURRENT_TIMESTAMP
SELECT apply_update_trigger_if_not_exists('employees');
SELECT apply_update_trigger_if_not_exists('candidates');
SELECT apply_update_trigger_if_not_exists('users');
-- Add other tables here if they have updated_at and need auto-update
-- e.g., SELECT apply_update_trigger_if_not_exists('departments');
-- e.g., SELECT apply_update_trigger_if_not_exists('designations');
-- etc. for all tables with updated_at.

SELECT 'All triggers checked/applied.';
`;

export async function initializeDatabase() {
  let client;
  try {
    console.log('Attempting to connect to database for schema initialization...');
    client = await pool.connect();
    console.log('Connected to database. Executing schema creation script...');
    await client.query(schemaSQL);
    console.log('Database schema creation script executed successfully.');
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
    