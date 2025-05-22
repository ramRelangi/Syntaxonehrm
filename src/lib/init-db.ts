
// src/lib/init-db.ts
import pool from './db';
import dotenv from 'dotenv';

dotenv.config(); // Ensure .env variables are loaded

const pgcryptoExtensionSQL = `CREATE EXTENSION IF NOT EXISTS pgcrypto;`;

// ENUM type definitions as separate constants for clarity and individual execution
// These DO $$ ... END $$; blocks should be executed one by one.
const enumCreationSQLBlocks = [
`DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('Admin', 'Manager', 'Employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE gender_enum_type AS ENUM ('M', 'F', 'O');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE address_type_enum AS ENUM ('PERMANENT', 'CURRENT', 'OFFICIAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM ('VERIFIED', 'PENDING', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE employment_type_enum AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE salary_component_type_enum AS ENUM ('EARNING', 'DEDUCTION', 'BENEFIT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE calculation_type_enum AS ENUM ('FIXED', 'PERCENTAGE', 'FORMULA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE attendance_status_enum AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'WEEK_OFF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE leave_application_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE performance_review_status_enum AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE training_program_status_enum AS ENUM ('PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE employee_training_status_enum AS ENUM ('REGISTERED', 'ATTENDED', 'COMPLETED', 'DROPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE job_opening_status_enum AS ENUM ('Draft', 'Open', 'Closed', 'Archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE candidate_application_status_enum AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE candidate_application_active_status_enum AS ENUM ('ACTIVE', 'WITHDRAWN', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE asset_status_enum AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED', 'LOST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE holiday_type_enum AS ENUM ('FIXED', 'VARIABLE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`,
`DO $$ BEGIN
    CREATE TYPE experience_level_enum_type AS ENUM ('Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;`
];


const mainSchemaSQL = `
-- Drop existing tables safely (order matters for foreign keys if not using CASCADE broadly)
-- Make sure to drop tables that depend on others first, or use CASCADE judiciously.
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
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
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS subscription_invoices CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS tenant_configurations CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_configuration CASCADE;

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

-- Core Employee Tables (Tenant-specific)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from employee_id to id (UUID)
    tenant_id UUID NOT NULL,
    user_id UUID UNIQUE, -- Link to users table
    employee_id VARCHAR(20), -- Human-readable, tenant-unique employee code (e.g., EMP-001)
    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    last_name VARCHAR(50) NOT NULL,
    name VARCHAR(155) GENERATED ALWAYS AS (first_name || COALESCE(' ' || middle_name, '') || ' ' || last_name) STORED, -- Generated full name
    date_of_birth DATE, -- Changed from NOT NULL
    gender gender_enum_type, -- Use pre-defined ENUM
    marital_status VARCHAR(20),
    nationality VARCHAR(50),
    blood_group VARCHAR(10),
    personal_email VARCHAR(100),
    email VARCHAR(100), -- Changed from official_email
    phone VARCHAR(20), -- Changed from phone_number
    emergency_contact_name VARCHAR(100),
    emergency_contact_number VARCHAR(20),
    hire_date DATE NOT NULL,
    position VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    reporting_manager_id UUID, -- Self-referential to employees.id
    work_location VARCHAR(100),
    employment_type employment_type_enum DEFAULT 'FULL_TIME',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- Potentially redundant with 'status', consider merging
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_code UNIQUE (tenant_id, employee_id),
    CONSTRAINT unique_tenant_employee_email UNIQUE (tenant_id, email)
);


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
    verification_status verification_status_enum DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Organizational Structure (Tenant-specific)
CREATE TABLE departments (
    department_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    department_code VARCHAR(20) NOT NULL,
    parent_department_id UUID,
    manager_id UUID,
    cost_center VARCHAR(50),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (parent_department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_department_name UNIQUE (tenant_id, department_name),
    CONSTRAINT unique_tenant_department_code UNIQUE (tenant_id, department_code)
);

CREATE TABLE designations (
    designation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    reporting_manager_id UUID,
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
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE CASCADE,
    FOREIGN KEY (designation_id) REFERENCES designations(designation_id) ON DELETE CASCADE,
    FOREIGN KEY (reporting_manager_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- Compensation & Benefits (Tenant-specific)
CREATE TABLE salary_structures (
    structure_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    component_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    FOREIGN KEY (structure_id) REFERENCES salary_structures(structure_id) ON DELETE CASCADE
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
    FOREIGN KEY (structure_id) REFERENCES salary_structures(structure_id) ON DELETE CASCADE,
    FOREIGN KEY (component_id) REFERENCES salary_components(component_id) ON DELETE CASCADE
);

-- Time & Attendance (Tenant-specific)
CREATE TABLE shifts (
    shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE
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
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_date UNIQUE (tenant_id, employee_id, date)
);

-- Leave Management (Tenant-specific)
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from leave_type_id
    tenant_id UUID NOT NULL,
    name VARCHAR(50) NOT NULL, -- Changed from leave_type_name
    short_code VARCHAR(10), -- Made optional
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    is_encashable BOOLEAN NOT NULL DEFAULT FALSE,
    is_carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
    max_carry_forward_days INT,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    applicable_gender gender_enum_type, -- Added based on previous schema
    default_balance NUMERIC(5,2) DEFAULT 0, -- Added based on previous schema
    accrual_rate NUMERIC(5,2) DEFAULT 0, -- Added based on previous schema
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_leave_type_name UNIQUE (tenant_id, name),
    CONSTRAINT unique_tenant_leave_type_short_code UNIQUE (tenant_id, short_code)
);

CREATE TABLE leave_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from policy_id
    tenant_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL, -- Changed from policy_name
    effective_from DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_policy_name UNIQUE (tenant_id, name)
);

CREATE TABLE leave_policy_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from detail_id
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
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Added last_updated
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
    FOREIGN KEY (policy_id) REFERENCES leave_policy(id) ON DELETE SET NULL,
    CONSTRAINT unique_tenant_employee_leave_balance_type_year UNIQUE (tenant_id, employee_id, leave_type_id, year)
);
-- Add generated column for closing_balance separately
ALTER TABLE employee_leave_balance
ADD COLUMN closing_balance NUMERIC(5,2) GENERATED ALWAYS AS (opening_balance + earned_balance - consumed_balance + adjusted_balance) STORED;


CREATE TABLE leave_applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    leave_type_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(5,2) NOT NULL,
    reason TEXT,
    status leave_application_status_enum DEFAULT 'PENDING',
    applied_on TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by UUID,
    approval_date TIMESTAMP WITH TIME ZONE, -- Renamed from approved_on
    comments TEXT, -- Renamed from rejection_reason, more generic
    attachment_url VARCHAR(255), -- Added attachment_url
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL -- Approver is a user
);

-- Performance Management (Tenant-specific)
CREATE TABLE competencies (
    competency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    cycle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    cycle_id UUID NOT NULL,
    reviewer_id UUID NOT NULL, -- This is employees.id of the reviewer
    review_date DATE NOT NULL,
    overall_rating NUMERIC(3,1),
    strengths TEXT,
    areas_for_improvement TEXT,
    comments TEXT,
    status performance_review_status_enum DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (cycle_id) REFERENCES performance_cycles(cycle_id) ON DELETE CASCADE,
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
    FOREIGN KEY (review_id) REFERENCES performance_reviews(review_id) ON DELETE CASCADE,
    FOREIGN KEY (competency_id) REFERENCES competencies(competency_id) ON DELETE CASCADE
);

-- Training & Development (Tenant-specific)
CREATE TABLE training_programs (
    program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    duration_hours NUMERIC(5,2),
    training_type VARCHAR(50),
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    max_participants INT,
    status training_program_status_enum DEFAULT 'PLANNED',
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
    status employee_training_status_enum DEFAULT 'REGISTERED',
    completion_date DATE,
    score NUMERIC(5,2),
    feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES training_programs(program_id) ON DELETE CASCADE
);

-- Recruitment (Tenant-specific)
CREATE TABLE job_openings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from job_id
    tenant_id UUID NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    department_id UUID,
    designation_id UUID,
    employment_type employment_type_enum, -- Use enum
    no_of_vacancies INT NOT NULL,
    experience_level experience_level_enum_type, -- Use ENUM
    location VARCHAR(100),
    date_posted DATE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Renamed from opening_date
    closing_date DATE,
    status job_opening_status_enum DEFAULT 'Draft',
    description TEXT,
    requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    FOREIGN KEY (designation_id) REFERENCES designations(designation_id) ON DELETE SET NULL
);

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from candidate_id
    tenant_id UUID NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    name VARCHAR(101) GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20), -- Changed from NOT NULL
    resume_url VARCHAR(255), -- Renamed from resume_path
    source VARCHAR(50),
    current_company VARCHAR(100),
    current_designation VARCHAR(100),
    total_experience NUMERIC(4,2),
    notice_period INT,
    current_salary NUMERIC(12,2), -- Changed to NUMERIC
    expected_salary NUMERIC(12,2), -- Changed to NUMERIC
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_candidate_email UNIQUE (tenant_id, email)
    -- Status removed from here, will be on job_applications
);

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Changed from application_id
    tenant_id UUID NOT NULL,
    candidate_id UUID NOT NULL,
    job_id UUID NOT NULL, -- This is job_openings.id
    application_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Renamed from applied_date
    status candidate_application_status_enum DEFAULT 'APPLIED', -- Renamed from current_stage
    -- status (active/withdrawn) column removed as it's covered by application_status_enum
    notes TEXT, -- Added from prior schema
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES job_openings(id) ON DELETE CASCADE
);

-- System & User Management (Tenant-aware)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    employee_id UUID, -- This is employees.id
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100), -- Added name field as per prior schema logic
    role user_role_enum, -- Using the ENUM type, and it's nullable to allow for role table linkage
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    failed_attempts INT NOT NULL DEFAULT 0,
    account_locked BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL, -- Changed from employees.employee_id
    CONSTRAINT unique_tenant_username UNIQUE (tenant_id, username),
    CONSTRAINT unique_tenant_email UNIQUE (tenant_id, email)
);

CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    role_name user_role_enum NOT NULL, -- Use the ENUM type
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
    assigned_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT unique_user_role UNIQUE (user_id, role_id)
);

CREATE TABLE permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    assigned_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by) REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

-- Additional Tables (Tenant-specific)
CREATE TABLE holidays (
    holiday_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    holiday_name VARCHAR(100) NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_type holiday_type_enum NOT NULL,
    applicable_location VARCHAR(100) NOT NULL DEFAULT 'ALL',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_holiday_date_location UNIQUE (tenant_id, holiday_date, applicable_location)
);

CREATE TABLE announcements (
    announcement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE asset_inventory (
    asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    asset_name VARCHAR(100) NOT NULL,
    asset_type VARCHAR(50) NOT NULL,
    model_number VARCHAR(50),
    serial_number VARCHAR(50),
    purchase_date DATE,
    warranty_expiry DATE,
    purchase_cost NUMERIC(12,2),
    current_value NUMERIC(12,2),
    status asset_status_enum DEFAULT 'AVAILABLE',
    location VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT unique_tenant_asset_serial_number UNIQUE (tenant_id, serial_number)
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
    FOREIGN KEY (asset_id) REFERENCES asset_inventory(asset_id) ON DELETE CASCADE,
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

-- Apply trigger to all relevant tables
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
CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employment_details_employee_id ON employment_details(tenant_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_applications_status ON leave_applications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_job_applications_current_stage ON job_applications(tenant_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(tenant_id, email); -- Assuming email is unique per tenant
