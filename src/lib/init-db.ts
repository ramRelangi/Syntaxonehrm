
// src/lib/init-db.ts
import pool from './db';
import dotenv from 'dotenv';

dotenv.config(); // Ensure .env variables are loaded

// SQL to create the pgcrypto extension if it doesn't exist
const pgcryptoExtensionSQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto;`;

// SQL for ENUM type creation (PostgreSQL specific)
// Each ENUM creation is a separate DO block to avoid issues with some SQL parsers/drivers
// if they were all in one giant string with other DDL.
const enumCreationSQLs = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_enum') THEN CREATE TYPE user_role_enum AS ENUM ('Admin', 'Manager', 'Employee'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_enum_type') THEN CREATE TYPE gender_enum_type AS ENUM ('Male', 'Female', 'Other', 'Prefer not to say'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'address_type_enum') THEN CREATE TYPE address_type_enum AS ENUM ('PERMANENT', 'CURRENT', 'OFFICIAL'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_enum') THEN CREATE TYPE verification_status_enum AS ENUM ('VERIFIED', 'PENDING', 'REJECTED'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type_enum') THEN CREATE TYPE employment_type_enum AS ENUM ('Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_component_type_enum') THEN CREATE TYPE salary_component_type_enum AS ENUM ('EARNING', 'DEDUCTION', 'BENEFIT'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calculation_type_enum') THEN CREATE TYPE calculation_type_enum AS ENUM ('FIXED', 'PERCENTAGE', 'FORMULA'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status_enum') THEN CREATE TYPE attendance_status_enum AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leave_application_status_enum') THEN CREATE TYPE leave_application_status_enum AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'performance_review_status_enum') THEN CREATE TYPE performance_review_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_program_status_enum') THEN CREATE TYPE training_program_status_enum AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_training_status_enum') THEN CREATE TYPE employee_training_status_enum AS ENUM ('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_opening_status_enum') THEN CREATE TYPE job_opening_status_enum AS ENUM ('Draft', 'Open', 'Closed', 'Archived'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'candidate_application_status_enum') THEN CREATE TYPE candidate_application_status_enum AS ENUM ('Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status_enum') THEN CREATE TYPE asset_status_enum AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'holiday_type_enum') THEN CREATE TYPE holiday_type_enum AS ENUM ('FIXED', 'VARIABLE'); END IF; END $$;`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'experience_level_enum_type') THEN CREATE TYPE experience_level_enum_type AS ENUM ('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director'); END IF; END $$;`
];


const mainSchemaSQL = `
-- Drop existing tables in reverse order of creation/dependency, with CASCADE
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

DROP TABLE IF EXISTS employee_assets CASCADE;
DROP TABLE IF EXISTS asset_inventory CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS holidays CASCADE;

DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS job_openings CASCADE;

DROP TABLE IF EXISTS employee_training CASCADE;
DROP TABLE IF EXISTS training_programs CASCADE;

DROP TABLE IF EXISTS performance_ratings CASCADE;
DROP TABLE IF EXISTS performance_reviews CASCADE;
DROP TABLE IF EXISTS competencies CASCADE;
DROP TABLE IF EXISTS performance_cycles CASCADE;

DROP TABLE IF EXISTS employee_leave_balance CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE; -- Drop old plural name if it exists
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
DROP TABLE IF EXISTS employees CASCADE;

DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;

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
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    employee_id UUID UNIQUE, -- employee_id from employees table (FK will be added after employees table)
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100),
    role user_role_enum NOT NULL DEFAULT 'Employee',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_attempts INT NOT NULL DEFAULT 0,
    account_locked BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_username UNIQUE (tenant_id, username),
    CONSTRAINT unique_tenant_email UNIQUE (tenant_id, email)
);

-- Core Employee Tables (Tenant-specific)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID UNIQUE, -- Link to users table
    employee_id VARCHAR(20), -- Human-readable ID, to be generated, tenant-unique
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    last_name VARCHAR(50) NOT NULL,
    name VARCHAR(155) GENERATED ALWAYS AS (first_name || COALESCE(' ' || middle_name, '') || ' ' || last_name) STORED,
    date_of_birth DATE,
    gender gender_enum_type,
    marital_status VARCHAR(20),
    nationality VARCHAR(50),
    blood_group VARCHAR(10),
    personal_email VARCHAR(100),
    email VARCHAR(100), -- Changed from official_email
    phone VARCHAR(20), -- Changed from phone_number
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    position VARCHAR(100),
    department VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    reporting_manager_id UUID,
    work_location VARCHAR(100),
    employment_type employment_type_enum DEFAULT 'Full-time',
    hire_date DATE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_code UNIQUE (tenant_id, employee_id),
    CONSTRAINT unique_employees_tenant_id_email UNIQUE (tenant_id, email)
);

-- Add FK from users to employees now that employees table exists
ALTER TABLE users ADD CONSTRAINT fk_users_employee_id FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


CREATE TABLE employee_address (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    address_type address_type_enum NOT NULL,
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
    verification_status verification_status_enum NOT NULL DEFAULT 'PENDING',
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
    department_code VARCHAR(20) NOT NULL,
    parent_department_id UUID,
    manager_id UUID, -- This should reference employees.id
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
    level INT NOT NULL,
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
    department_id UUID NOT NULL,
    designation_id UUID NOT NULL,
    reporting_manager_id UUID, -- This should reference employees.id
    employment_type employment_type_enum NOT NULL,
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
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE CASCADE,
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
    component_type salary_component_type_enum NOT NULL,
    is_taxable BOOLEAN NOT NULL DEFAULT FALSE,
    is_statutory BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_type calculation_type_enum NOT NULL,
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
    display_order INT NOT NULL,
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
    status attendance_status_enum NOT NULL,
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
    short_code VARCHAR(10),
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    is_encashable BOOLEAN NOT NULL DEFAULT FALSE,
    is_carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
    max_carry_forward_days INT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    default_balance NUMERIC(5,2) DEFAULT 0,
    accrual_rate NUMERIC(5,2) DEFAULT 0,
    applicable_gender gender_enum_type,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_leave_type_name UNIQUE (tenant_id, name),
    CONSTRAINT unique_tenant_leave_type_short_code UNIQUE (tenant_id, short_code)
);

CREATE TABLE leave_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    effective_from DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_policy_name UNIQUE (tenant_id, name)
);

CREATE TABLE leave_policy_details (
    detail_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    entitlement_days INT NOT NULL,
    max_consecutive_days INT,
    min_service_days INT NOT NULL DEFAULT 0,
    gender_restriction gender_enum_type,
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
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
    FOREIGN KEY (policy_id) REFERENCES leave_policy(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_leave_balance_type_year UNIQUE (tenant_id, employee_id, leave_type_id, year)
);


CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(5,2),
    reason TEXT,
    status leave_application_status_enum NOT NULL DEFAULT 'Pending',
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
    FOREIGN KEY (approver_id) REFERENCES users(user_id) ON DELETE SET NULL
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
    reviewer_id UUID NOT NULL, -- employees.id
    review_date DATE NOT NULL,
    overall_rating NUMERIC(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status performance_review_status_enum NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES performance_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE performance_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    status training_program_status_enum NOT NULL DEFAULT 'PLANNED',
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
    status employee_training_status_enum NOT NULL DEFAULT 'REGISTERED',
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
    employment_type employment_type_enum,
    no_of_vacancies INT NOT NULL DEFAULT 1,
    experience_level experience_level_enum_type,
    location VARCHAR(100),
    date_posted DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closing_date DATE,
    status job_opening_status_enum NOT NULL DEFAULT 'Draft',
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
    CONSTRAINT unique_candidate_tenant_email UNIQUE (tenant_id, email)
);

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    job_id UUID NOT NULL,
    application_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status candidate_application_status_enum NOT NULL DEFAULT 'Applied',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES job_openings(id) ON DELETE CASCADE
);

-- Roles and Permissions (Advanced - optional if simple role on users table is sufficient initially)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    role_name VARCHAR(50) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_or_global_role_name UNIQUE (tenant_id, role_name)
);

CREATE TABLE user_roles (
    user_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID, -- Should be users.user_id
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT unique_user_role UNIQUE (user_id, role_id)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_name VARCHAR(100) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_permission_name UNIQUE (permission_name),
    CONSTRAINT unique_permission_key UNIQUE (permission_key)
);

CREATE TABLE role_permissions (
    role_permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID, -- Should be users.user_id
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

-- Additional Tables (Tenant-specific)
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    holiday_type holiday_type_enum,
    applicable_location VARCHAR(100) DEFAULT 'ALL',
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
    created_by UUID NOT NULL, -- users.user_id
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
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
    status asset_status_enum NOT NULL DEFAULT 'AVAILABLE',
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
    employee_id UUID NOT NULL, -- employees.id
    assigned_date DATE NOT NULL,
    return_date DATE,
    assigned_by UUID NOT NULL, -- users.user_id
    condition_at_assignment TEXT,
    condition_at_return TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (asset_id) REFERENCES asset_inventory(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Email Configuration (per tenant)
CREATE TABLE email_configuration (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INTEGER NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password_encrypted TEXT NOT NULL,
    smtp_secure BOOLEAN DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

-- Email Templates (per tenant)
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    usage_context VARCHAR(100),
    category VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_email_template_name UNIQUE (tenant_id, name)
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

-- Apply trigger to all relevant tables (ensure table names match those created)
SELECT apply_update_trigger_if_not_exists('tenants');
SELECT apply_update_trigger_if_not_exists('tenant_configurations');
SELECT apply_update_trigger_if_not_exists('subscription_plans');
SELECT apply_update_trigger_if_not_exists('tenant_subscriptions');
SELECT apply_update_trigger_if_not_exists('subscription_invoices');
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
SELECT apply_update_trigger_if_not_exists('leave_requests');
SELECT apply_update_trigger_if_not_exists('competencies');
SELECT apply_update_trigger_if_not_exists('performance_cycles');
SELECT apply_update_trigger_if_not_exists('performance_reviews');
SELECT apply_update_trigger_if_not_exists('performance_ratings');
SELECT apply_update_trigger_if_not_exists('training_programs');
SELECT apply_update_trigger_if_not_exists('employee_training');
SELECT apply_update_trigger_if_not_exists('job_openings');
SELECT apply_update_trigger_if_not_exists('candidates');
SELECT apply_update_trigger_if_not_exists('job_applications');
SELECT apply_update_trigger_if_not_exists('users');
SELECT apply_update_trigger_if_not_exists('roles');
SELECT apply_update_trigger_if_not_exists('user_roles');
SELECT apply_update_trigger_if_not_exists('permissions');
SELECT apply_update_trigger_if_not_exists('role_permissions');
SELECT apply_update_trigger_if_not_exists('holidays');
SELECT apply_update_trigger_if_not_exists('announcements');
SELECT apply_update_trigger_if_not_exists('asset_inventory');
SELECT apply_update_trigger_if_not_exists('employee_assets');
SELECT apply_update_trigger_if_not_exists('email_configuration');
SELECT apply_update_trigger_if_not_exists('email_templates');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employment_details_employee ON employment_details(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_job_applications_stage ON job_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(tenant_id, email);
`;

// Async function to execute the schema (can be called from initializeDatabase)
async function executeSchema(client: any, schemaSQL: string) {
  await client.query(schemaSQL);
}

// Main async function to initialize the database schema
export async function initializeDatabase() {
  console.log('Attempting to connect to database for schema initialization...');
  const client = await pool.connect();
  console.log('Connected to database. Executing schema creation script...');
  try {
    // Execute pgcrypto extension creation
    console.log('Executing pgcrypto extension creation...');
    await client.query(pgcryptoExtensionSQL);
    console.log('Successfully executed pgcrypto extension creation.');

    // Execute ENUM creation DO blocks
    for (const enumSQL of enumCreationSQLs) {
      const enumName = enumSQL.match(/CREATE TYPE (\w+)/)?.[1] || 'Unknown ENUM';
      console.log(`Executing ENUM creation for: ${enumName}...`);
      try {
        await client.query(enumSQL);
        console.log(`Successfully executed ENUM creation for: ${enumName}.`);
      } catch (enumErr: any) {
        // Ignore "already exists" errors for ENUM types, as they are harmless if run multiple times
        if (enumErr.code === '42710') { // 42710 is for "duplicate_object"
          console.warn(`Warning: ENUM type ${enumName} already exists. Skipping creation.`);
        } else {
          console.error(`Error creating ENUM ${enumName}:`, enumErr.message);
          throw enumErr; // Re-throw other errors
        }
      }
    }
    console.log('Finished executing ENUM creation DO $$...END$$ blocks.');


    // Execute main DDL script (tables, functions, triggers)
    console.log('Executing main DDL script (tables, functions, triggers)...');
    await client.query('BEGIN'); // Start transaction for main schema
    await executeSchema(client, mainSchemaSQL); // Call helper to execute main schema
    await client.query('COMMIT'); // Commit transaction for main schema
    console.log('Main DDL script executed successfully and transaction committed.');

  } catch (err: any) {
    console.error('-----------------------------------------');
    console.error('Error during main DDL script (tables, functions, triggers):', (err as Error).message);
    console.error('Stack:', (err as Error).stack);
    console.error('Full Error Object:', err);
    console.error('-----------------------------------------');
    await client.query('ROLLBACK'); // Rollback transaction on error
    console.error('Error during database schema initialization, transaction rolled back.');
    throw err; // Re-throw the error to be caught by the caller
  } finally {
    client.release();
    console.log('Database client released after schema initialization.');
  }
}

// Function to allow manual execution if needed (e.g., from a script)
async function manualDbInit() {
  console.log('Starting manual database initialization...');
  try {
    await initializeDatabase();
    console.log('Manual DB initialization completed successfully.');
  } catch (error) {
    console.error('Manual DB initialization failed:', error);
  } finally {
    await pool.end(); // Close the pool after script execution
    console.log('Database pool closed after manual initialization.');
  }
}

// Execute only if run directly from Node.js (e.g., `tsx src/lib/init-db.ts`)
if (require.main === module) {
  manualDbInit();
}

update code with above changes