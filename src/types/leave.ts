
import { z } from 'zod';

// --- Leave Type ---
export interface LeaveType {
  id: string;
  name: string;
  description?: string;
  requiresApproval: boolean;
  // Future considerations: accrualRate, maxBalance, etc.
}

// --- Leave Request ---
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface LeaveRequest {
  id: string;
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
export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"), // In a real app, this might come from session
  leaveTypeId: z.string().min(1, "Leave type is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(200, "Reason cannot exceed 200 characters"),
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: "End date cannot be earlier than start date",
  path: ["endDate"], // Point the error to the endDate field
});

export type LeaveRequestFormData = z.infer<typeof leaveRequestSchema>;


// --- Leave Balance (Example, not fully implemented in this step) ---
export interface LeaveBalance {
    employeeId: string;
    leaveTypeId: string;
    balance: number; // e.g., number of days or hours
    lastUpdated: string; // ISO string
}
