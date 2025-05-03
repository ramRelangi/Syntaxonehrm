import { NextRequest, NextResponse } from 'next/server';
import { getLeaveRequests as getLeaveRequestsAction, addLeaveRequest } from '@/modules/leave/actions';
import { refinedLeaveRequestSchema, type LeaveRequestFormData } from '@/modules/leave/types'; // Use refined schema
import type { LeaveRequestStatus } from '@/modules/leave/types';
// Removed import of getTenantId util
import { getTenantIdFromAuth } from '@/lib/auth'; // Import auth helper directly

export async function GET(request: NextRequest) {
  let tenantIdForContext: string | null = null;
  try {
    // Get tenant ID for context/logging
    tenantIdForContext = await getTenantIdFromAuth();
    if (!tenantIdForContext) {
        console.error('GET /api/leave/requests - Tenant context could not be determined.');
        return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
    }
    console.log(`GET /api/leave/requests - Fetching for tenant: ${tenantIdForContext}`);

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId') || undefined;
    const status = searchParams.get('status') as LeaveRequestStatus || undefined;

    // Call server action (action derives tenant internally and performs authorization)
    const requests = await getLeaveRequestsAction({ employeeId, status });
    return NextResponse.json(requests);

  } catch (error: any) {
    console.error(`Error fetching leave requests (API) for tenant ${tenantIdForContext || 'unknown'}:`, error);
    let message = 'Failed to fetch leave requests';
    let status = 500;

    if (error.message?.includes('Tenant context not found')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401;
    } else if (error.message?.includes('invalid input syntax for type uuid')) {
        message = 'Internal server error: Invalid identifier.';
        status = 500; // Keep 500 for internal errors
        console.error("UUID Syntax Error in GET /api/leave/requests - Check tenantId/employeeId handling.");
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
    let tenantIdForContext: string | null = null;
   try {
     // Get tenant context for logging if needed, action derives it for logic
     tenantIdForContext = await getTenantIdFromAuth();
     if (!tenantIdForContext) {
        return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
     }

    const body = await request.json();
    // Action handles validation, tenantId, employeeId derivation

    // Cast body to exclude tenantId/employeeId as the action adds them from context
    const formData = body as Omit<LeaveRequestFormData, 'tenantId' | 'employeeId'>;

    // Call server action
    const result = await addLeaveRequest(formData);

    if (result.success && result.request) {
      return NextResponse.json(result.request, { status: 201 });
    } else {
        console.error(`POST /api/leave/requests Action Error for tenant ${tenantIdForContext}:`, result.errors);
        let errorMessage = result.errors?.[0]?.message || 'Failed to add leave request';
        let statusCode = 400; // Default bad request

        // Handle specific errors from the action
        if (errorMessage.includes('Insufficient leave balance')) {
            // Keep 400 Bad Request
        } else if (errorMessage.includes('Tenant context not found') || errorMessage.includes('Could not identify employee')) {
            statusCode = 401; // Unauthorized or bad context
            errorMessage = 'Unauthorized or missing context.';
        } else if (!result.errors) {
            statusCode = 500;
            errorMessage = 'An unexpected error occurred.';
        }

        return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error adding leave request (API) for tenant ${tenantIdForContext || 'unknown'}:`, error);
    let message = 'Internal server error';
    let status = 500;
    if (error instanceof SyntaxError) {
       message = 'Invalid JSON payload';
       status = 400;
    } else if (error.message?.includes('Insufficient leave balance')) { // Catch error thrown directly
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
