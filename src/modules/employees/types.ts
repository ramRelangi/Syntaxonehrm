
import { z } from 'zod';
import { userRoleSchema } from '@/modules/auth/types';

// Re-align with the ENUM type defined in init-db.ts
export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

// Re-align with the ENUM type defined in init-db.ts
export const genderSchema = z.enum(['Male', 'Female', 'Other', 'Prefer not to say']);
export type Gender = z.infer<typeof genderSchema>;

// Employee interface reflecting the columns directly on the 'employees' table
// as per the latest init-db.ts.
export interface Employee {
  id: string; // PK: employees.id (UUID)
  tenantId: string;
  userId?: string; // FK: users.user_id (UUID)
  employeeId?: string; // Human-readable ID (VARCHAR)
  name: string; // Generated from first, middle, last name
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string; // Official email
  personal_email?: string;
  phone?: string;
  gender?: Gender;
  dateOfBirth?: string; // YYYY-MM-DD
  marital_status?: string;
  nationality?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  is_active: boolean;
  status: 'Active' | 'Inactive' | 'On Leave'; // From employees.status
  reportingManagerId?: string | null; // FK to employees.id (UUID)

  // Fields now directly on the employees table as per comprehensive schema
  position?: string; // VARCHAR on employees table
  department?: string; // VARCHAR on employees table
  workLocation?: string; // VARCHAR on employees table
  employmentType?: EmploymentType; // ENUM on employees table
  hireDate?: string; // DATE on employees table

  role?: z.infer<typeof userRoleSchema>; // From users table
}

// Zod schema for validation, reflecting fields on the 'employees' table
export const employeeSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  employeeId: z.string().max(20).optional().nullable(), // Corresponds to employees.employee_id
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string().optional().nullable(),
  last_name: z.string().min(1, "Last name is required"),
  // 'name' is generated in DB, so not in form data for submission usually
  email: z.string().email("Invalid official email address"), // Official email
  personal_email: z.string().email("Invalid personal email address").optional().nullable(),
  phone: z.string().optional().nullable(),
  gender: genderSchema.optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").optional().nullable(),
  marital_status: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  blood_group: z.string().optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_number: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  status: z.enum(['Active', 'Inactive', 'On Leave']).default('Active'),
  reportingManagerId: z.string().uuid("Invalid manager ID format.").optional().nullable(),

  // Direct fields on employees table
  position: z.string().min(1, "Position is required").optional().nullable(),
  department: z.string().min(1, "Department is required").optional().nullable(),
  workLocation: z.string().optional().nullable(),
  employmentType: employmentTypeSchema.optional().nullable().default('Full-time'),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be in YYYY-MM-DD format").optional().nullable(),

  role: userRoleSchema.default('Employee'), // For the associated user account
});

// For form data, we omit server-set fields like id, tenantId, userId, employeeId (human-readable).
// Name is generated.
export type EmployeeFormData = Omit<z.infer<typeof employeeSchema>, 'id' | 'tenantId' | 'userId' | 'employeeId' | 'name'>;
