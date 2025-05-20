
import { z } from 'zod';

export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']); // Extended
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export interface Employee {
  id: string;
  tenantId: string;
  userId?: string; // Link to the user account for login
  employeeId?: string; // Official Employee ID, unique per tenant, dynamically generated
  name: string;
  email: string;
  phone?: string;
  position: string;
  department: string;
  hireDate: string; // Store as ISO string (e.g., '2024-01-15')
  status: 'Active' | 'Inactive' | 'On Leave';
  dateOfBirth?: string; // YYYY-MM-DD
  reportingManagerId?: string | null; // UUID of another employee (manager)
  workLocation?: string;
  employmentType?: EmploymentType;
}

// Define Zod schema for validation (aligned with Employee type)
export const employeeSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(), // user_id can be null if employee doesn't have login yet
  employeeId: z.string().max(50, "Employee ID cannot exceed 50 characters").optional().nullable(), // Auto-generated, so optional in form
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().or(z.literal("")).nullable(),
  position: z.string().min(1, "Position is required"),
  department: z.string().min(1, "Department is required"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be in YYYY-MM-DD format"),
  status: z.enum(['Active', 'Inactive', 'On Leave']),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD").optional().or(z.literal("")).nullable(),
  reportingManagerId: z.string().uuid("Invalid manager ID format").optional().or(z.literal("")).nullable(),
  workLocation: z.string().optional().or(z.literal("")).nullable(),
  employmentType: employmentTypeSchema.optional().default('Full-time'),
});

// FormData might not include ID, but needs tenantId for actions. employeeId is auto-generated.
// userId will be associated during the addEmployee action.
export type EmployeeFormData = Omit<z.infer<typeof employeeSchema>, 'id' | 'tenantId' | 'employeeId' | 'userId'>;
