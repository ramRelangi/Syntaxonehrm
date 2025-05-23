
import { z } from 'zod';
import { userRoleSchema } from '@/modules/auth/types';

// ENUM types based on your comprehensive schema in init-db.ts
export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const genderSchema = z.enum(['Male', 'Female', 'Other', 'Prefer not to say']);
export type Gender = z.infer<typeof genderSchema>;

export const employeeStatusSchema = z.enum(['Active', 'Inactive', 'On Leave']);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

// Main Employee Interface - reflecting columns directly on 'employees' table
export interface Employee {
  id: string; // PK: employees.id (UUID)
  tenantId: string;
  userId?: string | null; // FK: users.user_id (UUID), can be null
  employeeId?: string | null; // Human-readable ID (VARCHAR), nullable

  first_name: string;
  middle_name?: string | null;
  last_name: string;
  name: string; // Generated column: first_name + middle_name + last_name

  dateOfBirth?: string | null; // YYYY-MM-DD format
  gender?: Gender | null;
  marital_status?: string | null;
  nationality?: string | null;
  blood_group?: string | null;

  email: string; // Official email, maps to employees.email
  personal_email?: string | null;
  phone?: string | null;

  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;

  // Direct employment-related fields on the 'employees' table
  position?: string | null;       // e.g., "Software Engineer" (VARCHAR)
  department?: string | null;     // e.g., "Technology" (VARCHAR)
  hireDate?: string | null;       // YYYY-MM-DD format, maps to employees.hire_date
  workLocation?: string | null;   // e.g., "Main Office", "Remote"
  employmentType?: EmploymentType | null;
  reportingManagerId?: string | null; // FK to employees.id (UUID)

  status: EmployeeStatus;        // 'Active', 'Inactive', 'On Leave'
  is_active: boolean;            // Derived from status usually, or a direct flag

  role?: z.infer<typeof userRoleSchema> | null; // Role from the associated user account

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// Zod schema for validating employee data, reflecting the 'employees' table structure
export const employeeSchema = z.object({
  id: z.string().uuid().optional(), // PK, server-generated
  tenantId: z.string().uuid(),        // Server-set based on session
  userId: z.string().uuid().optional().nullable(), // FK to users, server-set
  employeeId: z.string().max(20).optional().nullable(), // Human-readable ID, server-generated

  first_name: z.string().min(1, "First name is required").max(50),
  middle_name: z.string().max(50).optional().nullable(),
  last_name: z.string().min(1, "Last name is required").max(50),
  name: z.string().max(155).optional(), // Generated in DB

  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").optional().nullable(),
  gender: genderSchema.optional().nullable(),
  marital_status: z.string().max(20).optional().nullable(),
  nationality: z.string().max(50).optional().nullable(),
  blood_group: z.string().max(10).optional().nullable(),

  email: z.string().email("Invalid official email address").max(100), // Official email
  personal_email: z.string().email("Invalid personal email address").max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),

  emergency_contact_name: z.string().max(100).optional().nullable(),
  emergency_contact_number: z.string().max(20).optional().nullable(),

  // Direct employment-related fields from the 'employees' table
  position: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be YYYY-MM-DD").optional().nullable(),
  workLocation: z.string().max(100).optional().nullable(),
  employmentType: employmentTypeSchema.optional().nullable().default('Full-time'),
  reportingManagerId: z.string().uuid("Invalid manager ID format.").optional().nullable(),

  status: employeeStatusSchema.default('Active'),
  is_active: z.boolean().default(true),

  role: userRoleSchema.optional().nullable().default('Employee'), // Role for the associated user account

  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// For form data, omits server-set fields. Includes all fields an admin/manager might set.
export type EmployeeFormData = Omit<z.infer<typeof employeeSchema>,
  'id' | 'tenantId' | 'userId' | 'employeeId' | 'name' | 'created_at' | 'updated_at' | 'is_active'
>;
// is_active is derived from status on save, not directly set in form.
// name is generated. id, tenantId, userId, employeeId (human) are server-set.

