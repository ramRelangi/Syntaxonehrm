
import { z } from 'zod';
import type { Gender } from '@/modules/employees/types'; // Import Gender type

// --- Leave Type ---
export const leaveTypeSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().uuid(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  requiresApproval: z.boolean().default(true),
  defaultBalance: z.coerce.number().min(0, "Default balance cannot be negative").optional().default(0),
  accrualRate: z.coerce.number().min(0, "Accrual rate cannot be negative").optional().default(0),
  applicableGender: z.custom<Gender>().optional().nullable().describe("Specify if this leave type is only for a particular gender."), // Allow null for 'All'
});

export type LeaveType = z.infer<typeof leaveTypeSchema>;


// --- Leave Request ---
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

// Base schema for API payload before server-side context is added
export const leaveRequestPayloadSchema = z.object({
  leaveTypeId: z.string().uuid("Leave type must be a valid selection."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(200, "Reason cannot exceed 200 characters"),
  attachmentUrl: z.string().url("Invalid URL format for attachment.").optional().or(z.literal('')).nullable(),
});

// Schema including server-side context (tenantId, employeeId) for full validation
export const leaveRequestSchema = leaveRequestPayloadSchema.extend({
  tenantId: z.string().uuid("Invalid tenant identifier."),
  employeeId: z.string().uuid("Invalid employee identifier."),
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

// Type for the actual leave request object as stored/retrieved
export interface LeaveRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName: string; // Denormalized for easier display
  leaveTypeId: string;
  leaveTypeName: string; // Denormalized
  startDate: string; // ISO string (e.g., '2024-07-15')
  endDate: string; // ISO string
  reason: string;
  status: LeaveRequestStatus;
  requestDate: string; // ISO string when the request was made
  approverId?: string; // ID of the user who approved/rejected
  approvalDate?: string; // ISO string when action was taken
  comments?: string; // Approver comments
  attachmentUrl?: string | null;
}

// Type for form data (client-side, before tenantId is added by server)
// It includes employeeId because the form knows this.
export type LeaveRequestFormData = z.infer<typeof refinedLeaveRequestSchema>;


// --- Leave Balance ---
export interface LeaveBalance {
    tenantId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveTypeName: string;
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
