import { NextRequest, NextResponse } from 'next/server';
// Import DB function directly for GET
import { addLeaveRequest, getLeaveRequests as dbGetAllLeaveRequests } from '@/modules/leave/lib/db';
import { refinedLeaveRequestSchema, type LeaveRequestFormData } from '@/modules/leave/types'; // Use refined schema
import type { LeaveRequestStatus } from '@/modules/leave/types';
import { getTenantId } from '@/api/utils/get-tenant-id'; // Keep using API util for tenant context
// Removed server action import for GET
// import { getLeaveRequests as getLeaveRequestsAction, addLeaveRequest } from '@/modules/leave/actions';

export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/leave/requests - Fetching...`);

    // Resolve tenantId using the utility function from the request context
    const tenantId = await getTenantId(request);
    if (!tenantId) {
        console.error(`[API GET /api/leave/requests] Failed to resolve tenant ID from request.`);
        return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') as LeaveRequestStatus || undefined;

    // Call DB function directly with resolved tenantId and filters
    const requests = await dbGetAllLeaveRequests(tenantId, { employeeId, status });
    return NextResponse.json(requests);

  } catch (error: any) {
    console.error(`Error fetching leave requests (API):`, error);
    let message = 'Failed to fetch leave requests';
    let status = 500;

    // Handle specific DB errors
    if (error.code === '22P02' && error.message?.includes('uuid')) {
         message = 'Internal server error: Invalid identifier format.';
         console.error("UUID Syntax Error in GET /api/leave/requests - Check tenantId/employeeId handling.");
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
   try {
     console.log(`POST /api/leave/requests - Adding...`);

     // Resolve tenantId for adding the request
     const tenantId = await getTenantId(request);
     if (!tenantId) {
        console.error(`[API POST /api/leave/requests] Failed to resolve tenant ID from request.`);
        return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 });
     }

     const body = await request.json();

     // TODO: Resolve employeeId based on authenticated user making the request (likely from session/token)
     // For now, assume it might be passed or default to a mock/placeholder.
     // In a real scenario, NEVER trust employeeId from the client body for adding a request.
     const mockEmployeeId = 'PLACEHOLDER_EMPLOYEE_ID'; // Replace with actual logic

     const dataWithContext = {
         ...body,
         tenantId: tenantId,
         employeeId: body.employeeId || mockEmployeeId, // Use body.employeeId ONLY if allowed, otherwise use resolved ID
     };

     // Validate against the refined schema which includes tenantId and employeeId
     const validation = refinedLeaveRequestSchema.safeParse(dataWithContext);
     if (!validation.success) {
        console.error("POST /api/leave/requests Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

     // Call DB function directly (it handles balance checks, etc.)
     const newRequest = await dbAddLeaveRequest(validation.data);

     return NextResponse.json(newRequest, { status: 201 });

   } catch (error: any) {
     console.error(`Error adding leave request (API):`, error);
     let message = 'Internal server error';
     let status = 500;
     if (error instanceof SyntaxError) {
        message = 'Invalid JSON payload';
        status = 400;
     } else if (error.message?.includes('Insufficient leave balance')) {
         message = error.message;
         status = 400; // Bad Request due to business logic failure
     } else if (error.message?.includes('Tenant ID is required')) {
         message = 'Tenant ID is required.';
         status = 400;
     } else {
         message = error.message || message;
     }
     return NextResponse.json({ error: message }, { status: status });
   }
}
