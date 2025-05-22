
import { z } from 'zod';
import { userRoleSchema } from '@/modules/auth/types'; // Import userRoleSchema

export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const genderSchema = z.enum(['Male', 'Female', 'Other', 'Prefer not to say']);
export type Gender = z.infer<typeof genderSchema>;

export interface Employee {
  id: string;
  tenantId: string;
  userId?: string;
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  gender?: Gender;
  position: string;
  department: string;
  hireDate: string;
  status: 'Active' | 'Inactive' | 'On Leave';
  dateOfBirth?: string;
  reportingManagerId?: string | null;
  workLocation?: string;
  employmentType?: EmploymentType;
  role?: z.infer<typeof userRoleSchema>; // Add role to interface
}

export const employeeSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  employeeId: z.string().max(50).optional().nullable(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().or(z.literal("")).nullable(),
  gender: genderSchema.optional().nullable(),
  position: z.string().min(1, "Position is required"),
  department: z.string().min(1, "Department is required"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be in YYYY-MM-DD format"),
  status: z.enum(['Active', 'Inactive', 'On Leave']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").optional().or(z.literal("")).nullable(),
  reportingManagerId: z.string().uuid("Invalid manager ID format").optional().nullable(),
  workLocation: z.string().optional().or(z.literal("")).nullable(),
  employmentType: employmentTypeSchema.optional().default('Full-time'),
  role: userRoleSchema.default('Employee'), // Add role to schema, default to 'Employee'
});

// For form data, we omit server-set fields. Role is now part of the form.
export type EmployeeFormData = Omit<z.infer<typeof employeeSchema>, 'id' | 'tenantId' | 'userId' | 'employeeId' | 'status'> & {
    status?: 'Active' | 'Inactive' | 'On Leave'; // Status can be set by admin/manager
};
