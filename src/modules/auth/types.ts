
import { z } from 'zod';

// --- Tenant ---
export const tenantSchema = z.object({
  tenant_id: z.string().uuid(), // Changed from id
  name: z.string().min(1, "Company name is required"),
  subdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Subdomain can only contain letters, numbers, and hyphens").toLowerCase(), // Changed from domain
  status: z.string().default('ACTIVE'), // Added from new schema
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(), // Added from new schema
});

export type Tenant = z.infer<typeof tenantSchema>;

// --- User ---
export const userRoleSchema = z.enum(['Admin', 'Manager', 'Employee']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
    user_id: z.string().uuid(), // Changed from id
    tenant_id: z.string().uuid().nullable(), // Nullable if it's a system-level user not tied to a tenant
    employee_id: z.string().uuid().nullable().optional(), // FK to employees table
    username: z.string().min(3, "Username must be at least 3 characters"),
    passwordHash: z.string(),
    email: z.string().email("Invalid email address"), // Official email
    name: z.string().min(1, "User name is required").optional(), // Name of the person
    role: userRoleSchema.default('Employee'), // Kept simple for now
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
  companySubdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Subdomain can only contain letters, numbers, and hyphens"), // Changed from companyDomain
  adminName: z.string().min(1, "Your name is required"),
  adminUsername: z.string().min(3, "Admin username must be at least 3 characters"), // Added
  adminEmail: z.string().email("Invalid email address"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;

// --- Tenant-Specific Login Form ---
export const tenantLoginSchema = z.object({
  loginIdentifier: z.string().min(1, "Username or Email is required"), // Can be username or email
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type TenantLoginFormInputs = z.infer<typeof tenantLoginSchema>;

// --- Session Data ---
export interface SessionData {
  userId: string; // This will be user_id
  tenantId: string | null; // Can be null for system users
  tenantDomain: string | null; // Subdomain, can be null if not applicable
  userRole: UserRole; // Still using simple role for now
  username: string;
}


// --- Tenant-Specific Forgot Password Form ---
export const tenantForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Username might also be an option if emails are not unique across system but usernames are per tenant
});

export type TenantForgotPasswordFormInputs = z.infer<typeof tenantForgotPasswordSchema>;

// --- Root Forgot Password Form (Needs domain) ---
export const rootForgotPasswordSchema = z.object({
  companySubdomain: z.string().min(1, "Company subdomain is required").regex(/^[a-zA-Z0-9-]+$/, "Invalid subdomain format"),
  email: z.string().email("Invalid email address"),
});

export type RootForgotPasswordFormInputs = z.infer<typeof rootForgotPasswordSchema>;
