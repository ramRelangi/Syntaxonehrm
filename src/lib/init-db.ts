
// src/lib/init-db.ts
import pool from './db'; // Assuming pool is exported from db.ts
import dotenv from 'dotenv';

dotenv.config(); // Ensure .env variables are loaded

// SQL for enabling pgcrypto extension (for gen_random_uuid())
const pgcryptoExtensionSQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto;`;

// Main schema DDL (Tables, Functions, Triggers)
const mainSchemaSQL = `
-- Drop existing trigger functions and tables safely
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS apply_update_trigger_if_not_exists(text) CASCADE;

-- Drop tables in an order that respects dependencies, or use CASCADE
DROP TABLE IF EXISTS leave_balances CASCADE; -- Old plural name
DROP TABLE IF EXISTS employee_leave_balance CASCADE; -- Ensure this is dropped before recreation
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
DROP TABLE IF EXISTS leave_applications CASCADE;
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
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS employees CASCADE; -- employees table before users due to FK in users
DROP TABLE IF EXISTS subscription_invoices CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS tenant_configurations CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Tenant Management
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    subdomain VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_name UNIQUE (name)
);

CREATE TABLE tenant_configurations (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_config UNIQUE (tenant_id, config_key)
);

-- Subscription Management
CREATE TABLE subscription_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
    max_users INT NOT NULL,
    max_employees INT NOT NULL,
    features JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED', 'EXPIRED')),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(plan_id) ON DELETE RESTRICT
);

CREATE TABLE subscription_invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(subscription_id) ON DELETE CASCADE,
    CONSTRAINT unique_invoice_number UNIQUE (invoice_number)
);

-- System & User Management (Tenant-aware)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- Can be NULL for system-level users
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100), -- User's full name
    role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Manager', 'Employee')), -- Simplified roles for now
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_attempts INT NOT NULL DEFAULT 0,
    account_locked BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_username UNIQUE (tenant_id, username), -- Username unique per tenant
    CONSTRAINT unique_tenant_user_email UNIQUE (tenant_id, email) -- Email unique per tenant
);

-- Core Employee Tables (Tenant-specific)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- This is employee PK
    tenant_id UUID NOT NULL,
    user_id UUID UNIQUE, -- Link to the users table (users.id), can be NULL if user not yet created
    employee_id VARCHAR(50), -- Human-readable employee ID, e.g., EMP-001 (unique per tenant)
    name VARCHAR(150) NOT NULL, -- Combined name for easier display
    email VARCHAR(100), -- Official email
    phone VARCHAR(20),
    gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
    position VARCHAR(100),
    department VARCHAR(100),
    hire_date DATE,
    reporting_manager_id UUID,
    work_location VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    date_of_birth DATE,
    employment_type VARCHAR(20) CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL, -- Self-referencing to employees.id
    CONSTRAINT unique_tenant_employee_official_email UNIQUE (tenant_id, email),
    CONSTRAINT unique_tenant_employee_id UNIQUE (tenant_id, employee_id)
);


CREATE TABLE employee_address (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('PERMANENT', 'CURRENT', 'OFFICIAL')),
    address_line1 VARCHAR(100) NOT NULL,
    address_line2 VARCHAR(100),
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE employee_documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(100),
    file_path VARCHAR(255),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('VERIFIED', 'PENDING', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Organizational Structure (Tenant-specific)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    department_code VARCHAR(20),
    parent_department_id UUID,
    manager_id UUID,
    cost_center VARCHAR(50),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_department_name UNIQUE (tenant_id, department_name),
    CONSTRAINT unique_tenant_department_code UNIQUE (tenant_id, department_code)
);

CREATE TABLE designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    designation_name VARCHAR(100) NOT NULL,
    level INT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_designation_name UNIQUE (tenant_id, designation_name)
);

CREATE TABLE employment_details (
    employment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    department_id UUID,
    designation_id UUID,
    reporting_manager_id UUID,
    employment_type VARCHAR(20) NOT NULL CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary')),
    joining_date DATE NOT NULL,
    confirmation_date DATE,
    exit_date DATE,
    exit_reason TEXT,
    is_probation BOOLEAN NOT NULL DEFAULT TRUE,
    probation_end_date DATE,
    notice_period_days INT NOT NULL DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- Compensation & Benefits (Tenant-specific)
CREATE TABLE salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    structure_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_structure_name UNIQUE (tenant_id, structure_name)
);

CREATE TABLE salary_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    component_name VARCHAR(100) NOT NULL,
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('EARNING', 'DEDUCTION', 'BENEFIT')),
    is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
    is_statutory BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_type VARCHAR(20) NOT NULL CHECK (calculation_type IN ('FIXED', 'PERCENTAGE', 'FORMULA')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_component_name UNIQUE (tenant_id, component_name)
);

CREATE TABLE employee_salary (
    salary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    structure_id UUID NOT NULL,
    basic_salary NUMERIC(12,2) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE
);

CREATE TABLE salary_structure_details (
    detail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    structure_id UUID NOT NULL,
    component_id UUID NOT NULL,
    amount NUMERIC(12,2),
    percentage NUMERIC(5,2),
    formula TEXT,
    display_order INT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(id) ON DELETE CASCADE
);

-- Time & Attendance (Tenant-specific)
CREATE TABLE shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_time INT NOT NULL DEFAULT 15,
    half_day_hours NUMERIC(4,2) NOT NULL DEFAULT 4.5,
    is_night_shift BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_shift_name UNIQUE (tenant_id, shift_name)
);

CREATE TABLE employee_shift (
    employee_shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
);

CREATE TABLE attendance_records (
    attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    date DATE NOT NULL,
    shift_id UUID,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF')),
    regular_hours NUMERIC(5,2),
    overtime_hours NUMERIC(5,2),
    late_minutes INT,
    early_minutes INT,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_date UNIQUE (tenant_id, employee_id, date)
);

-- Leave Management (Tenant-specific)
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    default_balance NUMERIC(5,2) DEFAULT 0,
    accrual_rate NUMERIC(5,2) DEFAULT 0,
    applicable_gender VARCHAR(20) CHECK (applicable_gender IN ('Male', 'Female', 'Other', 'Prefer not to say', NULL)),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_leave_type_name UNIQUE (tenant_id, name)
);

CREATE TABLE leave_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_policy_name UNIQUE (tenant_id, policy_name)
);

CREATE TABLE leave_policy_details (
    detail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    entitlement_days INT NOT NULL,
    max_consecutive_days INT,
    min_service_days INT NOT NULL DEFAULT 0,
    gender_restriction VARCHAR(20) CHECK (gender_restriction IN ('Male', 'Female', 'Other', 'Prefer not to say', NULL)),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (policy_id) REFERENCES leave_policy(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE TABLE employee_leave_balance (
    balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    policy_id UUID, -- Made optional as balance might exist without specific policy
    year INT, -- Made optional
    opening_balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    earned_balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    consumed_balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    adjusted_balance NUMERIC(5,2) NOT NULL DEFAULT 0,
    closing_balance NUMERIC(5,2) GENERATED ALWAYS AS (opening_balance + earned_balance - consumed_balance + adjusted_balance) STORED,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Added last_updated
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
    FOREIGN KEY (policy_id) REFERENCES leave_policy(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_leave_balance_type_year UNIQUE (tenant_id, employee_id, leave_type_id, year)
);

CREATE TABLE leave_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(5,2),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    request_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approver_id UUID,
    approval_date TIMESTAMP WITH TIME ZONE,
    comments TEXT,
    attachment_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance Management (Tenant-specific)
CREATE TABLE competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    competency_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_competency_name UNIQUE (tenant_id, competency_name)
);

CREATE TABLE performance_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    cycle_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_cycle_name UNIQUE (tenant_id, cycle_name)
);

CREATE TABLE performance_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    cycle_id UUID NOT NULL,
    reviewer_id UUID NOT NULL,
    review_date DATE NOT NULL,
    overall_rating NUMERIC(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES performance_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE performance_ratings (
    rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    review_id UUID NOT NULL,
    competency_id UUID NOT NULL,
    rating NUMERIC(3,1) NOT NULL,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (review_id) REFERENCES performance_reviews(id) ON DELETE CASCADE,
    FOREIGN KEY (competency_id) REFERENCES competencies(id) ON DELETE CASCADE
);

-- Training & Development (Tenant-specific)
CREATE TABLE training_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_hours NUMERIC(5,2),
    training_type VARCHAR(50),
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    max_participants INT,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_program_name UNIQUE (tenant_id, program_name)
);

CREATE TABLE employee_training (
    employee_training_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    program_id UUID NOT NULL,
    registration_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED')),
    completion_date DATE,
    score NUMERIC(5,2),
    feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES training_programs(id) ON DELETE CASCADE
);

-- Recruitment (Tenant-specific)
CREATE TABLE job_openings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    department_id UUID,
    designation_id UUID,
    employment_type VARCHAR(50) CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary')),
    no_of_vacancies INT,
    experience_level VARCHAR(50) CHECK (experience_level IN ('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director')),
    location VARCHAR(100),
    date_posted DATE,
    closing_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Open', 'Closed', 'Archived')),
    description TEXT,
    requirements TEXT,
    salary_range VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL
);

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    resume_url VARCHAR(255),
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience NUMERIC(4,2),
    notice_period INT,
    current_salary VARCHAR(100),
    expected_salary VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_candidate_email UNIQUE (tenant_id, email)
);

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    job_opening_id UUID NOT NULL,
    application_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (job_opening_id) REFERENCES job_openings(id) ON DELETE CASCADE
);

-- Additional Tables (Tenant-specific)
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    holiday_type VARCHAR(20) NOT NULL CHECK (holiday_type IN ('FIXED', 'VARIABLE')),
    applicable_location VARCHAR(100) NOT NULL DEFAULT 'ALL',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_holiday_date_location UNIQUE (tenant_id, date, applicable_location)
);

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    publish_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE asset_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    model_number VARCHAR(50),
    serial_number VARCHAR(50),
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_cost NUMERIC(12,2),
    current_value NUMERIC(12,2),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST')),
    location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_serial_number UNIQUE (tenant_id, serial_number)
);

CREATE TABLE employee_assets (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    assigned_date DATE NOT NULL,
    return_date DATE,
    assigned_by UUID NOT NULL,
    condition_at_assignment TEXT,
    condition_at_return TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES asset_inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Email templates and configuration (Tenant-specific)
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    usage_context VARCHAR(100),
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    UNIQUE (tenant_id, name)
);

CREATE TABLE email_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted VARCHAR(512) NOT NULL,
    smtp_secure BOOLEAN DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to apply trigger if it doesn't exist
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
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
SELECT apply_update_trigger_if_not_exists('tenants');
SELECT apply_update_trigger_if_not_exists('tenant_configurations');
SELECT apply_update_trigger_if_not_exists('subscription_plans');
SELECT apply_update_trigger_if_not_exists('tenant_subscriptions');
SELECT apply_update_trigger_if_not_exists('subscription_invoices');
SELECT apply_update_trigger_if_not_exists('users');
SELECT apply_update_trigger_if_not_exists('employees');
SELECT apply_update_trigger_if_not_exists('employee_address');
SELECT apply_update_trigger_if_not_exists('employee_documents');
SELECT apply_update_trigger_if_not_exists('departments');
SELECT apply_update_trigger_if_not_exists('designations');
SELECT apply_update_trigger_if_not_exists('employment_details');
SELECT apply_update_trigger_if_not_exists('salary_structures');
SELECT apply_update_trigger_if_not_exists('salary_components');
SELECT apply_update_trigger_if_not_exists('employee_salary');
SELECT apply_update_trigger_if_not_exists('salary_structure_details');
SELECT apply_update_trigger_if_not_exists('shifts');
SELECT apply_update_trigger_if_not_exists('employee_shift');
SELECT apply_update_trigger_if_not_exists('attendance_records');
SELECT apply_update_trigger_if_not_exists('leave_types');
SELECT apply_update_trigger_if_not_exists('leave_policy');
SELECT apply_update_trigger_if_not_exists('leave_policy_details');
SELECT apply_update_trigger_if_not_exists('employee_leave_balance');
SELECT apply_update_trigger_if_not_exists('leave_applications');
SELECT apply_update_trigger_if_not_exists('competencies');
SELECT apply_update_trigger_if_not_exists('performance_cycles');
SELECT apply_update_trigger_if_not_exists('performance_reviews');
SELECT apply_update_trigger_if_not_exists('performance_ratings');
SELECT apply_update_trigger_if_not_exists('training_programs');
SELECT apply_update_trigger_if_not_exists('employee_training');
SELECT apply_update_trigger_if_not_exists('job_openings');
SELECT apply_update_trigger_if_not_exists('candidates');
SELECT apply_update_trigger_if_not_exists('job_applications');
-- SELECT apply_update_trigger_if_not_exists('roles'); -- Roles table from previous schema, not in this one
-- SELECT apply_update_trigger_if_not_exists('permissions'); -- Permissions table from previous schema
-- SELECT apply_update_trigger_if_not_exists('role_permissions'); -- Role_permissions table from previous schema
SELECT apply_update_trigger_if_not_exists('holidays');
SELECT apply_update_trigger_if_not_exists('announcements');
SELECT apply_update_trigger_if_not_exists('asset_inventory');
SELECT apply_update_trigger_if_not_exists('employee_assets');
SELECT apply_update_trigger_if_not_exists('email_templates');
SELECT apply_update_trigger_if_not_exists('email_configuration');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employment_details_employee ON employment_details(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON job_applications(tenant_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(tenant_id, username); -- Username unique per tenant already exists, but index can help
CREATE INDEX IF NOT EXISTS idx_users_email ON users(tenant_id, email); -- Email unique per tenant already exists
`;

// Helper function to execute DDL statements
async function executeSchema(client: any, sql: string, label: string) {
  console.log(`Executing ${label}...`);
  try {
    await client.query(sql);
    console.log(`Successfully executed ${label}.`);
  } catch (err) {
    console.error(`-----------------------------------------`);
    console.error(`Error during ${label}:`, (err as Error).message);
    console.error(`Stack:`, (err as Error).stack);
    console.error(`Full Error Object:`, err);
    console.error(`-----------------------------------------`);
    throw err;
  }
}

export async function initializeDatabase() {
  const client = await pool.connect();
  console.log('Attempting to connect to database for schema initialization...');
  try {
    await client.query('BEGIN');
    console.log('Connected to database. Executing schema creation script...');

    // Execute extension creation
    await executeSchema(client, pgcryptoExtensionSQL, 'pgcrypto extension creation');

    // Execute main DDL script (tables, functions, triggers)
    await executeSchema(client, mainSchemaSQL, 'main DDL script (tables, functions, triggers)');

    await client.query('COMMIT');
    console.log('Database schema initialized successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during database schema initialization, transaction rolled back.');
    throw error; // Re-throw the error to be caught by the caller
  } finally {
    client.release();
    console.log('Database client released after schema initialization.');
  }
}

// Function to be called when running the script directly
async function manualDbInit() {
  console.log('Starting manual database initialization...');
  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Manual DB initialization failed:', error);
  } finally {
    await pool.end(); // Close the pool
    console.log('Database pool closed after manual initialization.');
  }
}

// If this script is run directly (e.g., `tsx src/lib/init-db.ts`), execute manualDbInit
if (require.main === module) {
  manualDbInit();
}