import { NextRequest, NextResponse } from 'next/server';
import { getLeaveRequests, addLeaveRequest } from '@/modules/leave/actions';
import { leaveRequestSchema } from '@/modules/leave/types';
import type { LeaveRequestStatus } from '@/modules/leave/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId') || undefined;
  const status = searchParams.get('status') as LeaveRequestStatus || undefined;

  try {
    const requests = await getLeaveRequests({ employeeId, status }); // Call server action
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching leave requests (API):', error);
    return NextResponse.json({ error: 'Failed to fetch leave requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validation might be partially duplicated here and in action, decide on source of truth
    const validation = leaveRequestSchema.safeParse(body);

    if (!validation.success) {
       console.error("POST /api/leave/requests Validation Error:", validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await addLeaveRequest(validation.data);

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
