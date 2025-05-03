
import { NextRequest, NextResponse } from 'next/server';
import { getLeaveRequests, addLeaveRequest } from '@/modules/leave/actions';
import { refinedLeaveRequestSchema, type LeaveRequestFormData } from '@/modules/leave/types'; // Use refined schema
import type { LeaveRequestStatus } from '@/modules/leave/types';
import { getTenantId } from '../../utils/get-tenant-id'; // Import utility

export async function GET(request: NextRequest) {
  const tenantId = await getTenantId(request); // Get tenantId for filtering
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId') || undefined;
  const status = searchParams.get('status') as LeaveRequestStatus || undefined;

  try {
    // Pass tenantId explicitly if the action requires it for filtering
    // Assuming getLeaveRequests action now uses getTenantIdFromAuth internally, remove tenantId param
    // const requests = await getLeaveRequests(tenantId, { employeeId, status });
    const requests = await getLeaveRequests({ employeeId, status }); // Call server action (derives tenant internally)
    return NextResponse.json(requests);
  } catch (error: any) {
    console.error(`Error fetching leave requests for tenant ${tenantId} (API):`, error);
    return NextResponse.json({ error: error.message || 'Failed to fetch leave requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // tenantId will be derived by the action from auth context
  // const tenantId = await getTenantId(request);
  // if (!tenantId) {
  //     return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  // }

  try {
    const body = await request.json();
    // Validation might be partially duplicated here and in action, decide on source of truth
    // Action will add tenantId and employeeId from context, schema needs them for validation check
    // We don't have them here, so skip validation or pass mock data?
    // Let's rely on the action's validation which includes context.
    // const validation = refinedLeaveRequestSchema.safeParse(body);
    // if (!validation.success) { ... }

    // Call server action (action adds tenantId and employeeId from context)
    // Cast body to exclude tenantId/employeeId if needed by the action signature
    const result = await addLeaveRequest(body as Omit<LeaveRequestFormData, 'tenantId' | 'employeeId'>);

    if (result.success && result.request) {
      return NextResponse.json(result.request, { status: 201 });
    } else {
        console.error("POST /api/leave/requests Action Error:", result.errors);
        // Handle specific errors like insufficient balance
        const balanceError = result.errors?.find(e => e.message?.includes('Insufficient leave balance'));
        if (balanceError) {
            return NextResponse.json({ error: balanceError.message }, { status: 400 });
        }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add leave request' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding leave request (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
     // Handle potential balance errors thrown directly by the action
    if (error.message?.includes('Insufficient leave balance')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
