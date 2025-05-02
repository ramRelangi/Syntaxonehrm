
import type { LeaveRequest, LeaveType, LeaveRequestStatus } from '@/types/leave';
import { getAllEmployees } from './employee-mock-db'; // To link employees

// --- Mock Leave Types ---
let leaveTypes: LeaveType[] = [
  { id: 'lt-001', name: 'Annual Leave', description: 'Standard paid time off', requiresApproval: true, defaultBalance: 20, accrualRate: 1.67 },
  { id: 'lt-002', name: 'Sick Leave', description: 'For personal illness or injury', requiresApproval: false, defaultBalance: 10, accrualRate: 0.83 }, // Example: Sick leave might not need pre-approval but notification
  { id: 'lt-003', name: 'Unpaid Leave', description: 'Leave without pay', requiresApproval: true, defaultBalance: 0, accrualRate: 0 },
  { id: 'lt-004', name: 'Maternity Leave', description: 'Leave for new mothers', requiresApproval: true, defaultBalance: 0, accrualRate: 0 }, // Usually specific duration policy
  { id: 'lt-005', name: 'Paternity Leave', description: 'Leave for new fathers', requiresApproval: true, defaultBalance: 0, accrualRate: 0 }, // Usually specific duration policy
  { id: 'lt-006', name: 'Bereavement Leave', description: 'Leave for funeral attendance', requiresApproval: false, defaultBalance: 3, accrualRate: 0 }, // Often needs notification, fixed amount per event
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

// Function to add a new leave type
export function addLeaveType(typeData: Omit<LeaveType, 'id'>): LeaveType {
  const newId = `lt-${String(leaveTypes.length + 1).padStart(3, '0')}`;
  const newType: LeaveType = {
    ...typeData,
    id: newId,
    // Provide default values if not specified
    defaultBalance: typeData.defaultBalance ?? 0,
    accrualRate: typeData.accrualRate ?? 0,
    requiresApproval: typeData.requiresApproval ?? true,
  };
  leaveTypes.push(newType);
  // When adding a new type, potentially initialize balances for existing employees?
  // initializeBalancesForNewType(newId, newType.defaultBalance); // See below
  return JSON.parse(JSON.stringify(newType));
}

// Function to update a leave type
export function updateLeaveType(id: string, updates: Partial<Omit<LeaveType, 'id'>>): LeaveType | undefined {
  const index = leaveTypes.findIndex((lt) => lt.id === id);
  if (index !== -1) {
    leaveTypes[index] = { ...leaveTypes[index], ...updates };
    return JSON.parse(JSON.stringify(leaveTypes[index]));
  }
  return undefined;
}

// Function to delete a leave type
export function deleteLeaveType(id: string): boolean {
  const index = leaveTypes.findIndex((lt) => lt.id === id);
  // Add check: Prevent deletion if requests or balances use this type?
  const isUsed = leaveRequests.some(req => req.leaveTypeId === id) || leaveBalances.some(bal => bal.leaveTypeId === id);
  if (isUsed) {
      console.warn(`Attempted to delete leave type ${id} which is currently in use.`);
      return false; // Prevent deletion if in use
  }

  if (index !== -1) {
    leaveTypes.splice(index, 1);
    return true;
  }
  return false;
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
  // TODO: If auto-approved, deduct balance immediately? Or on approval for Pending?
  return JSON.parse(JSON.stringify(newRequest));
}

// Function to update a leave request (e.g., change status)
export function updateLeaveRequest(id: string, updates: Partial<Omit<LeaveRequest, 'id' | 'employeeId' | 'leaveTypeId' | 'requestDate'>>): LeaveRequest | undefined {
  const index = leaveRequests.findIndex((req) => req.id === id);
  if (index !== -1) {
    const currentRequest = leaveRequests[index];
    const previousStatus = currentRequest.status;
    const newStatus = updates.status;

    leaveRequests[index] = {
        ...currentRequest,
        ...updates,
        // Preserve original core IDs and dates
        employeeId: currentRequest.employeeId,
        leaveTypeId: currentRequest.leaveTypeId,
        requestDate: currentRequest.requestDate,
    };
    // Add approval date if status changes to Approved/Rejected and not already set
    if ( (updates.status === 'Approved' || updates.status === 'Rejected') && !leaveRequests[index].approvalDate) {
        leaveRequests[index].approvalDate = new Date().toISOString();
    }

    // Handle balance deduction/refund logic
    // Example: Deduct balance when moved to Approved from Pending
    // if (previousStatus === 'Pending' && newStatus === 'Approved') {
    //     adjustLeaveBalance(currentRequest.employeeId, currentRequest.leaveTypeId, -calculateLeaveDays(currentRequest));
    // }
    // Example: Refund balance if moved from Approved to Cancelled/Rejected
    // else if (previousStatus === 'Approved' && (newStatus === 'Cancelled' || newStatus === 'Rejected')) {
    //     adjustLeaveBalance(currentRequest.employeeId, currentRequest.leaveTypeId, calculateLeaveDays(currentRequest));
    // }

    return JSON.parse(JSON.stringify(leaveRequests[index]));
  }
  return undefined;
}

// Function to delete a leave request (used internally for cancellation logic sometimes)
// Generally, prefer updating status to 'Cancelled'
export function deleteLeaveRequest(id: string): boolean {
   console.warn("Direct deletion of leave requests is discouraged. Consider cancelling instead.");
  const index = leaveRequests.findIndex((req) => req.id === id && req.status === 'Pending'); // Stronger check maybe needed
  if (index !== -1) {
    leaveRequests.splice(index, 1);
    return true;
  }
  return false;
}

// --- Mock Leave Balances ---
// Initialize balances based on default values from leave types
let leaveBalances: { employeeId: string; leaveTypeId: string; balance: number }[] = [];

function initializeEmployeeBalances(employeeId: string) {
  leaveTypes.forEach(lt => {
    if (!leaveBalances.some(b => b.employeeId === employeeId && b.leaveTypeId === lt.id)) {
        leaveBalances.push({ employeeId, leaveTypeId: lt.id, balance: lt.defaultBalance ?? 0 });
    }
  });
}
// Initialize for existing employees
getAllEmployees().forEach(emp => initializeEmployeeBalances(emp.id));

// Helper to initialize balances for a newly added leave type across all employees
function initializeBalancesForNewType(leaveTypeId: string, defaultBalance: number) {
  getAllEmployees().forEach(emp => {
     if (!leaveBalances.some(b => b.employeeId === emp.id && b.leaveTypeId === leaveTypeId)) {
         leaveBalances.push({ employeeId: emp.id, leaveTypeId, balance: defaultBalance });
     }
  });
}


export function getLeaveBalancesForEmployee(employeeId: string) {
    // Ensure balances are initialized for the employee if they somehow weren't
    initializeEmployeeBalances(employeeId);
    return JSON.parse(JSON.stringify(leaveBalances.filter(bal => bal.employeeId === employeeId)));
}

// Function to adjust balance (implementation depends on business logic)
function adjustLeaveBalance(employeeId: string, leaveTypeId: string, amount: number) {
    const balanceIndex = leaveBalances.findIndex(b => b.employeeId === employeeId && b.leaveTypeId === leaveTypeId);
    if (balanceIndex !== -1) {
        leaveBalances[balanceIndex].balance += amount;
        console.log(`Adjusted balance for ${employeeId}, type ${leaveTypeId} by ${amount}. New balance: ${leaveBalances[balanceIndex].balance}`);
    } else {
        // If balance record doesn't exist, create it (shouldn't happen with initialization)
        const leaveType = getLeaveTypeById(leaveTypeId);
        leaveBalances.push({ employeeId, leaveTypeId, balance: (leaveType?.defaultBalance ?? 0) + amount });
        console.log(`Initialized and adjusted balance for ${employeeId}, type ${leaveTypeId} by ${amount}.`);
    }
}

// Note: Functions for accrual logic (e.g., running a monthly job) would be needed.
// Placeholder for accrual - in real app, run this periodically
function runMonthlyAccrual() {
  console.log("Running monthly leave accrual...");
  getAllEmployees().forEach(emp => {
    leaveTypes.forEach(lt => {
      if (lt.accrualRate && lt.accrualRate > 0) {
        adjustLeaveBalance(emp.id, lt.id, lt.accrualRate);
      }
    });
  });
}
// Example: Simulate running accrual once on load (REMOVE in real app)
// runMonthlyAccrual();
