
import { z } from 'zod';

export interface Employee {
  id: string;
  tenantId: string; // Add tenant ID
  name: string;
  email: string;
  phone?: string;
  position: string;
  department: string;
  hireDate: string; // Store as ISO string (e.g., '2024-01-15') for simplicity
  status: 'Active' | 'Inactive' | 'On Leave';
}

// Define Zod schema for validation (aligned with Employee type)
export const employeeSchema = z.object({
  tenantId: z.string().uuid(), // Add tenant ID validation
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().or(z.literal("")), // Allow empty string for optional phone
  position: z.string().min(1, "Position is required"),
  department: z.string().min(1, "Department is required"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Hire date must be in YYYY-MM-DD format"),
  status: z.enum(['Active', 'Inactive', 'On Leave']),
});

// FormData might not include ID, but needs tenantId
export type EmployeeFormData = z.infer<typeof employeeSchema>;
