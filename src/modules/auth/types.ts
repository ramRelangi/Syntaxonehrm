
import { z } from 'zod';

// --- Tenant ---
export const tenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Company name is required"),
  domain: z.string().min(1, "Company domain is required").regex(/^[a-zA-Z0-9-]+$/, "Domain can only contain letters, numbers, and hyphens").toLowerCase(),
  createdAt: z.string().datetime(), // ISO string
});

export type Tenant = z.infer<typeof tenantSchema>;

// --- User ---
export const userRoleSchema = z.enum(['Admin', 'Manager', 'Employee']); // Example roles
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    email: z.string().email(),
    passwordHash: z.string(), // Store hashed password, never plaintext
    name: z.string().min(1, "User name is required"),
    role: userRoleSchema.default('Employee'),
    isActive: z.boolean().default(true),
    createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;


// --- Registration Form ---
export const registrationSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyDomain: z.string().min(1, "Company domain is required").regex(/^[a-zA-Z0-9-]+$/, "Domain can only contain letters, numbers, and hyphens"),
  adminName: z.string().min(1, "Your name is required"),
  adminEmail: z.string().email("Invalid email address"),
  adminPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegistrationFormData = z.infer<typeof registrationSchema>;

// --- Tenant-Specific Login Form ---
export const tenantLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type TenantLoginFormInputs = z.infer<typeof tenantLoginSchema>;

// --- Tenant-Specific Forgot Password Form ---
export const tenantForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type TenantForgotPasswordFormInputs = z.infer<typeof tenantForgotPasswordSchema>;

