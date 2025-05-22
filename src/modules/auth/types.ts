
import { z } from 'zod';

// --- Tenant ---
export const tenantSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID format"),
  name: z.string().min(1, "Company name is required"),
  subdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Subdomain can only contain letters, numbers, and hyphens").toLowerCase(),
  status: z.string().default('ACTIVE'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
});

export type Tenant = z.infer<typeof tenantSchema>;

// --- User ---
// Keep simple UserRole enum for now, directly on the User model & users table
// The new roles/permissions tables will be a separate refactoring step.
export const userRoleSchema = z.enum(['Admin', 'Manager', 'Employee']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
    user_id: z.string().uuid("Invalid user ID format"),
    tenant_id: z.string().uuid("Invalid tenant ID format").nullable(), // Nullable for system users
    employee_id: z.string().uuid("Invalid employee ID format").nullable().optional(), // FK to employees.id (which is UUID)
    username: z.string().min(3, "Username must be at least 3 characters"),
    passwordHash: z.string(), // Renamed from password_hash to align with JS conventions
    email: z.string().email("Invalid email address"),
    name: z.string().min(1, "User name is required").optional(),
    role: userRoleSchema.default('Employee'),
    is_active: z.boolean().default(true),
    last_login: z.string().datetime().optional().nullable(),
    failed_attempts: z.number().int().default(0),
    account_locked: z.boolean().default(false),
    password_changed_at: z.string().datetime().optional().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime().optional(),
});

export type User = z.infer<typeof userSchema>;


// --- Registration Form ---
export const registrationSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companySubdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Subdomain can only contain letters, numbers, and hyphens"),
  adminName: z.string().min(1, "Your name is required"),
  adminUsername: z.string().min(3, "Admin username must be at least 3 characters long").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  adminEmail: z.string().email("Invalid email address"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;

// --- Tenant-Specific Login Form ---
export const tenantLoginSchema = z.object({
  loginIdentifier: z.string().min(1, "Username or Email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type TenantLoginFormInputs = z.infer<typeof tenantLoginSchema>;

// --- Session Data ---
export interface SessionData {
  userId: string; // This will be user_id (UUID)
  tenantId: string | null; // This will be tenant_id (UUID)
  tenantDomain: string | null; // This will be the subdomain
  userRole: UserRole;
  username: string;
}


// --- Tenant-Specific Forgot Password Form ---
export const tenantForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type TenantForgotPasswordFormInputs = z.infer<typeof tenantForgotPasswordSchema>;

// --- Root Forgot Password Form (Needs domain) ---
export const rootForgotPasswordSchema = z.object({
  companySubdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Invalid subdomain format"),
  email: z.string().email("Invalid email address"),
});

export type RootForgotPasswordFormInputs = z.infer<typeof rootForgotPasswordSchema>;
