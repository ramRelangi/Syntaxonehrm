
import { NextRequest, NextResponse } from 'next/server';
// Import DB function directly for GET and POST
import { addLeaveRequest as dbAddLeaveRequest, getAllLeaveRequests as dbGetAllLeaveRequests } from '@/modules/leave/lib/db';
import { refinedLeaveRequestSchema, type LeaveRequestFormData, type LeaveRequestStatus } from '@/modules/leave/types'; // Use refined schema
// Import session helpers directly
import { getTenantIdFromSession, getUserIdFromSession } from '@/modules/auth/actions';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/leave/requests - API route invoked...`);

    // 1. Get Tenant ID from session within API route context
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
        console.error(`[API GET /api/leave/requests] Unauthorized: Tenant ID missing from session.`);
        return NextResponse.json({ error: "Unauthorized or tenant context missing." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') as LeaveRequestStatus || undefined;

    console.log(`[API GET /api/leave/requests] Calling dbGetAllLeaveRequests for tenant ${tenantId}, filters:`, { employeeId, status });
    // 2. Call DB function directly with resolved tenantId and filters
    const requests = await dbGetAllLeaveRequests(tenantId, { employeeId, status });
    console.log(`[API GET /api/leave/requests] DB call successful, fetched ${requests.length} requests.`);
    return NextResponse.json(requests);

  } catch (error: any) {
    console.error(`Error fetching leave requests (API GET):`, error);
    let message = 'Failed to fetch leave requests';
    let status = 500;

    if (error.message?.includes('Tenant context not found') || error.message?.includes('Unauthorized')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401;
    } else if (error.message?.includes('invalid input syntax for type uuid') || error.message?.includes('Invalid identifier')) {
        message = 'Internal server error: Invalid identifier format.'; // More specific
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

     // 1. Get Tenant and User ID from session within API route context
     const tenantId = await getTenantIdFromSession();
     if (!tenantId) {
         console.error(`[API POST /api/leave/requests] Unauthorized: Tenant ID missing.`);
         return NextResponse.json({ error: "Tenant context not found.", details: [{path: ['tenantId'], message: "Tenant context not found."}] }, { status: 401 });
     }
     const employeeId = await getUserIdFromSession();
     if (!employeeId) {
         console.error(`[API POST /api/leave/requests] Unauthorized: User ID missing.`);
         return NextResponse.json({ error: "User identification failed.", details: [{path: ['employeeId'], message: "User identification failed."}] }, { status: 401 });
     }

     // 2. Prepare data for validation (includes tenantId and employeeId from session)
     const dataWithContext = {
         ...body, // Contains leaveTypeId, startDate, endDate, reason, attachmentUrl
         tenantId: tenantId,
         employeeId: employeeId,
     };

     // 3. Validate against the refined schema which includes tenantId and employeeId
     const validation = refinedLeaveRequestSchema.safeParse(dataWithContext);
     if (!validation.success) {
        console.error("[API POST /api/leave/requests] Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

     console.log(`[API POST /api/leave/requests] Calling dbAddLeaveRequest with validated data for tenant ${tenantId}, employee ${employeeId}.`);
     // 4. Call DB function directly
     const newRequest = await dbAddLeaveRequest(validation.data);

     console.log(`[API POST /api/leave/requests] DB call successful. Revalidating paths...`);
     // 5. Revalidate paths
     revalidatePath(`/${tenantId}/leave`);
     revalidatePath(`/api/leave/balances/${employeeId}`); // Revalidate balance endpoint for the user

     return NextResponse.json(newRequest, { status: 201 });

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
     } else if (error.message?.includes('Tenant context not found') || error.message?.includes('User identification failed')) {
         message = 'Unauthorized or missing context.';
         status = 401;
     } else if (error.message?.includes('Invalid tenant identifier') || error.message?.includes('Invalid employee identifier') || error.message?.includes('Invalid leave type identifier')) {
         message = 'Internal server error: Invalid identifier used.';
         status = 500;
     } else {
         message = error.message || message;
     }
     return NextResponse.json({ error: message, details: [{path: ['root'], message: message}] }, { status: status });
   }
}
