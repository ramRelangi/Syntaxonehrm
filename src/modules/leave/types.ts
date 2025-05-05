
import { z } from 'zod';

// --- Leave Type ---
export interface LeaveType {
  id: string;
  tenantId: string; // Add tenant ID
  name: string;
  description?: string;
  requiresApproval: boolean;
  defaultBalance?: number; // e.g., initial days granted per year/period
  accrualRate?: number; // e.g., days accrued per month
}

// --- Leave Request ---
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: string;
  tenantId: string; // Add tenant ID
  employeeId: string; // Link to Employee
  employeeName: string; // Denormalized for easier display
  leaveTypeId: string; // Link to LeaveType
  leaveTypeName: string; // Denormalized
  startDate: string; // ISO string (e.g., '2024-07-15')
  endDate: string; // ISO string
  reason: string;
  status: LeaveRequestStatus;
  requestDate: string; // ISO string when the request was made
  approverId?: string; // ID of the user who approved/rejected
  approvalDate?: string; // ISO string when action was taken
  comments?: string; // Approver comments
}

// --- Zod Schema for Leave Request Form ---
// FormData usually won't include tenantId directly, derived from context/session
export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"), // In a real app, this might come from session
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(200, "Reason cannot exceed 200 characters"),
});
// Refine needs to be added after object definition
export const refinedLeaveRequestSchema = leaveRequestSchema.refine(data => {
    try {
        return new Date(data.endDate) >= new Date(data.startDate);
    } catch {
        return false; // Invalid date format handled by regex, but catch errors just in case
    }
}, {
  message: "End date cannot be earlier than start date",
  path: ["endDate"], // Point the error to the endDate field
});


export type LeaveRequestFormData = z.infer<typeof refinedLeaveRequestSchema>;


// --- Leave Balance ---
export interface LeaveBalance {
    tenantId: string; // Add tenant ID
    employeeId: string;
    leaveTypeId: string;
    leaveTypeName?: string; // Optional: Name for display
    balance: number; // e.g., number of days or hours
    lastUpdated: string; // ISO string
}


// --- Holiday ---
export const holidaySchema = z.object({
  id: z.string().optional(), // Optional for creation
  tenantId: z.string().uuid(), // Tenant association
  name: z.string().min(3, "Holiday name must be at least 3 characters"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  description: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Holiday = z.infer<typeof holidaySchema>;
// FormData for adding/editing holidays
export type HolidayFormData = Omit<Holiday, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
