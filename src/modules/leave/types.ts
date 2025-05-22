
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
  attachmentUrl?: string | null; // New field
}

// --- Zod Schema for Leave Request API Payload & Form ---
// This schema defines the complete data structure including server-added context (tenantId, employeeId)
// and ensures all IDs are validated as UUIDs.
export const leaveRequestSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant identifier."),
  employeeId: z.string().uuid("Invalid employee identifier."),
  leaveTypeId: z.string().uuid("Leave type must be a valid selection."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(200, "Reason cannot exceed 200 characters"),
  attachmentUrl: z.string().url("Invalid URL format for attachment.").optional().or(z.literal('')).nullable(),
});

export const refinedLeaveRequestSchema = leaveRequestSchema.refine(data => {
    try {
        return new Date(data.endDate) >= new Date(data.startDate);
    } catch {
        return false;
    }
}, {
  message: "End date cannot be earlier than start date",
  path: ["endDate"],
});


export type LeaveRequestFormData = z.infer<typeof refinedLeaveRequestSchema>;


// --- Leave Balance ---
export interface LeaveBalance {
    tenantId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveTypeName: string; // Made non-optional as it should always be fetched
    balance: number;
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
export type HolidayFormData = Omit<Holiday, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>;
