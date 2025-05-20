
import { NextRequest, NextResponse } from 'next/server';
// Import server actions instead of DB functions directly for API routes
import { getLeaveRequests as getLeaveRequestsAction, addLeaveRequest as addLeaveRequestAction } from '@/modules/leave/actions';
import { type LeaveRequestFormData, type LeaveRequestStatus } from '@/modules/leave/types'; // Use refined schema

export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/leave/requests - API route invoked...`);

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') as LeaveRequestStatus || undefined;

    console.log(`[API GET /api/leave/requests] Calling getLeaveRequestsAction with filters:`, { employeeId, status });
    // Call server action (action derives tenant internally and performs authorization)
    const requests = await getLeaveRequestsAction({ employeeId, status });
    console.log(`[API GET /api/leave/requests] Action successful, fetched ${requests.length} requests.`);
    return NextResponse.json(requests);

  } catch (error: any) {
    console.error(`Error fetching leave requests (API GET):`, error);
    let message = 'Failed to fetch leave requests';
    let status = 500;

    if (error.message?.includes('Tenant context not found') || error.message?.includes('Unauthorized')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401;
    } else if (error.message?.includes('invalid input syntax for type uuid') || error.message?.includes('Invalid identifier')) {
        message = 'Internal server error: Invalid identifier.';
        status = 500; 
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
   try {
     console.log(`POST /api/leave/requests - API route invoked...`);
     const body = await request.json();

     // The server action `addLeaveRequestAction` expects Omit<LeaveRequestFormData, 'tenantId' | 'employeeId'>.
     // `LeaveRequestFormData` is derived from `refinedLeaveRequestSchema`, which includes `employeeId`.
     // The form submits `employeeId`, `leaveTypeId`, `startDate`, `endDate`, `reason`, `attachmentUrl`.
     // The action will use `employeeId` from the session, so we don't need to pass `employeeId` from the body to it.
     // We also don't pass `tenantId` as the action derives it.
     const {
         employeeId: bodyEmployeeId, // This will be ignored by the action if present in body
         tenantId: bodyTenantId,     // This will be ignored by the action if present in body
         ...actionDataToPass // This should contain leaveTypeId, startDate, endDate, reason, attachmentUrl
     } = body as LeaveRequestFormData & { tenantId?: string };

     console.log(`[API POST /api/leave/requests] Calling addLeaveRequestAction with data:`, actionDataToPass);

     // Call the server action
     const result = await addLeaveRequestAction(actionDataToPass);

     if (result.success && result.request) {
       console.log(`[API POST /api/leave/requests] Action successful.`);
       return NextResponse.json(result.request, { status: 201 });
     } else {
       console.error(`[API POST /api/leave/requests] Action failed:`, result.errors);
       let errorMessage = result.errors?.[0]?.message || 'Failed to add leave request';
       let statusCode = 400; // Default bad request

       if (errorMessage.includes('Insufficient leave balance')) {
           // Keep 400
       } else if (errorMessage.includes('Tenant context not found') || errorMessage.includes('Could not identify employee') || errorMessage.includes('Unauthorized')) {
           statusCode = 401; // Unauthorized or bad context
           errorMessage = 'Unauthorized or missing context.';
       } else if (!result.errors) {
           statusCode = 500;
           errorMessage = 'An unexpected error occurred.';
       }
       return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
     }
   } catch (error: any) {
     console.error(`Error in POST /api/leave/requests (API):`, error);
     let message = 'Internal server error';
     let status = 500;
     if (error instanceof SyntaxError) {
        message = 'Invalid JSON payload';
        status = 400;
     } else if (error.message?.includes('Insufficient leave balance')) {
         message = error.message;
         status = 400;
     } else if (error.message?.includes('Tenant context not found') || error.message?.includes('Could not identify employee')) {
         message = 'Unauthorized or missing context.';
         status = 401;
     } else {
         message = error.message || message;
     }
     return NextResponse.json({ error: message }, { status: status });
   }
}
