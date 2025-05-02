
import type { LeaveRequest, LeaveType, LeaveRequestStatus } from '@/types/leave';
import { getAllEmployees } from './employee-mock-db'; // To link employees

// --- Mock Leave Types ---
let leaveTypes: LeaveType[] = [
  { id: 'lt-001', name: 'Annual Leave', description: 'Standard paid time off', requiresApproval: true },
  { id: 'lt-002', name: 'Sick Leave', description: 'For personal illness or injury', requiresApproval: false }, // Example: Sick leave might not need pre-approval but notification
  { id: 'lt-003', name: 'Unpaid Leave', description: 'Leave without pay', requiresApproval: true },
  { id: 'lt-004', name: 'Maternity Leave', description: 'Leave for new mothers', requiresApproval: true },
  { id: 'lt-005', name: 'Paternity Leave', description: 'Leave for new fathers', requiresApproval: true },
  { id: 'lt-006', name: 'Bereavement Leave', description: 'Leave for funeral attendance', requiresApproval: false }, // Often needs notification
];

// Function to get all leave types
export function getAllLeaveTypes(): LeaveType[] {
  return JSON.parse(JSON.stringify(leaveTypes));
}

// Function to get a leave type by ID
export function getLeaveTypeById(id: string): LeaveType | undefined {
   const type = leaveTypes.find((lt) => lt.id === id);
   return type ? JSON.parse(JSON.stringify(type)) : undefined;
}

// --- Mock Leave Requests ---
let leaveRequests: LeaveRequest[] = [
  {
    id: 'lr-001',
    employeeId: 'emp-001', // Alice Wonderland
    employeeName: 'Alice Wonderland',
    leaveTypeId: 'lt-001', // Annual Leave
    leaveTypeName: 'Annual Leave',
    startDate: '2024-08-01',
    endDate: '2024-08-05',
    reason: 'Vacation trip',
    status: 'Approved',
    requestDate: '2024-07-10T10:00:00Z',
    approverId: 'admin-001', // Assuming an admin ID
    approvalDate: '2024-07-11T14:30:00Z',
    comments: 'Approved. Enjoy your trip!',
  },
  {
    id: 'lr-002',
    employeeId: 'emp-002', // Bob The Builder
    employeeName: 'Bob The Builder',
    leaveTypeId: 'lt-002', // Sick Leave
    leaveTypeName: 'Sick Leave',
    startDate: '2024-07-20',
    endDate: '2024-07-21',
    reason: 'Flu',
    status: 'Approved', // Sick leave might auto-approve on submission or have a different flow
    requestDate: '2024-07-20T09:00:00Z',
    // No approver needed if auto-approved based on type config
  },
   {
    id: 'lr-003',
    employeeId: 'emp-001', // Alice Wonderland
    employeeName: 'Alice Wonderland',
    leaveTypeId: 'lt-001', // Annual Leave
    leaveTypeName: 'Annual Leave',
    startDate: '2024-09-01',
    endDate: '2024-09-01',
    reason: 'Personal appointment',
    status: 'Pending',
    requestDate: '2024-07-25T11:00:00Z',
  },
   {
    id: 'lr-004',
    employeeId: 'emp-003', // Charlie Chaplin
    employeeName: 'Charlie Chaplin',
    leaveTypeId: 'lt-003', // Unpaid Leave
    leaveTypeName: 'Unpaid Leave',
    startDate: '2024-08-15',
    endDate: '2024-08-16',
    reason: 'Family emergency',
    status: 'Rejected',
    requestDate: '2024-07-22T16:00:00Z',
    approverId: 'admin-001',
    approvalDate: '2024-07-23T09:15:00Z',
    comments: 'Insufficient detail provided. Please resubmit with more information.',
  },
];

// Function to get all leave requests (can be extended with filters)
export function getAllLeaveRequests(filters?: { employeeId?: string, status?: LeaveRequestStatus }): LeaveRequest[] {
  let filteredRequests = [...leaveRequests];

  if (filters?.employeeId) {
    filteredRequests = filteredRequests.filter(req => req.employeeId === filters.employeeId);
  }
  if (filters?.status) {
     filteredRequests = filteredRequests.filter(req => req.status === filters.status);
  }

  // Sort by request date descending by default
  filteredRequests.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());

  return JSON.parse(JSON.stringify(filteredRequests));
}

// Function to get a leave request by ID
export function getLeaveRequestById(id: string): LeaveRequest | undefined {
   const request = leaveRequests.find((req) => req.id === id);
   return request ? JSON.parse(JSON.stringify(request)) : undefined;
}

// Function to add a new leave request
export function addLeaveRequest(requestData: Omit<LeaveRequest, 'id' | 'requestDate' | 'status' | 'leaveTypeName' | 'employeeName'>): LeaveRequest {
  const newId = `lr-${String(leaveRequests.length + 1).padStart(3, '0')}`;
  const employee = getAllEmployees().find(emp => emp.id === requestData.employeeId);
  const leaveType = getLeaveTypeById(requestData.leaveTypeId);

  if (!employee || !leaveType) {
      throw new Error("Invalid employeeId or leaveTypeId");
  }

  const newRequest: LeaveRequest = {
    ...requestData,
    id: newId,
    employeeName: employee.name,
    leaveTypeName: leaveType.name,
    status: leaveType.requiresApproval ? 'Pending' : 'Approved', // Auto-approve if type allows
    requestDate: new Date().toISOString(),
  };
  leaveRequests.push(newRequest);
  return JSON.parse(JSON.stringify(newRequest));
}

// Function to update a leave request (e.g., change status)
export function updateLeaveRequest(id: string, updates: Partial<Omit<LeaveRequest, 'id' | 'employeeId' | 'leaveTypeId' | 'requestDate'>>): LeaveRequest | undefined {
  const index = leaveRequests.findIndex((req) => req.id === id);
  if (index !== -1) {
    // Ensure sensitive fields are not accidentally updated if not explicitly passed
    const currentRequest = leaveRequests[index];
    leaveRequests[index] = {
        ...currentRequest,
        ...updates,
        // Make sure employeeId, leaveTypeId, requestDate are preserved
        employeeId: currentRequest.employeeId,
        leaveTypeId: currentRequest.leaveTypeId,
        requestDate: currentRequest.requestDate,
    };
    // Add approval date if status changes to Approved/Rejected and not already set
    if ( (updates.status === 'Approved' || updates.status === 'Rejected') && !leaveRequests[index].approvalDate) {
        leaveRequests[index].approvalDate = new Date().toISOString();
    }

    return JSON.parse(JSON.stringify(leaveRequests[index]));
  }
  return undefined;
}

// Function to delete a leave request (e.g., user cancels a pending request)
export function deleteLeaveRequest(id: string): boolean {
  const index = leaveRequests.findIndex((req) => req.id === id && req.status === 'Pending'); // Only allow deleting pending requests
  if (index !== -1) {
    leaveRequests.splice(index, 1);
    return true;
  }
  return false;
}

// --- Mock Leave Balances (Example Structure) ---
// In a real app, this would be calculated based on accrual rules and taken leave.
let leaveBalances = [
    { employeeId: 'emp-001', leaveTypeId: 'lt-001', balance: 15 }, // 15 days Annual Leave
    { employeeId: 'emp-001', leaveTypeId: 'lt-002', balance: 8 },  // 8 days Sick Leave
    { employeeId: 'emp-002', leaveTypeId: 'lt-001', balance: 10 },
    { employeeId: 'emp-002', leaveTypeId: 'lt-002', balance: 5 },
];

export function getLeaveBalancesForEmployee(employeeId: string) {
    return JSON.parse(JSON.stringify(leaveBalances.filter(bal => bal.employeeId === employeeId)));
}

// Note: Functions to adjust balances when leave is taken/accrued would be needed.
```