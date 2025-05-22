
import { z } from 'zod';

export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

// New Gender Enum Schema
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
  gender?: Gender; // New gender field
  position: string;
  department: string;
  hireDate: string;
  status: 'Active' | 'Inactive' | 'On Leave';
  dateOfBirth?: string;
  reportingManagerId?: string | null;
  workLocation?: string;
  employmentType?: EmploymentType;
}

export const employeeSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  employeeId: z.string().max(50).optional().nullable(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().or(z.literal("")).nullable(),
  gender: genderSchema.optional().nullable(), // New gender field validation
  position: z.string().min(1, "Position is required"),
  department: z.string().min(1, "Department is required"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be in YYYY-MM-DD format"),
  status: z.enum(['Active', 'Inactive', 'On Leave']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").optional().or(z.literal("")).nullable(),
  reportingManagerId: z.string().uuid("Invalid manager ID format").optional().or(z.literal("")).nullable(),
  workLocation: z.string().optional().or(z.literal("")).nullable(),
  employmentType: employmentTypeSchema.optional().default('Full-time'),
});

export type EmployeeFormData = Omit<z.infer<typeof employeeSchema>, 'id' | 'tenantId' | 'employeeId' | 'userId'>;

    