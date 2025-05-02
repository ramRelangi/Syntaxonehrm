import { NextRequest, NextResponse } from 'next/server';
import { getLeaveRequests, addLeaveRequest } from '@/modules/leave/actions';
import { leaveRequestSchema } from '@/modules/leave/types';
import type { LeaveRequestStatus } from '@/modules/leave/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId') || undefined;
  const status = searchParams.get('status') as LeaveRequestStatus || undefined;

  try {
    const requests = await getLeaveRequests({ employeeId, status });
    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    return NextResponse.json({ error: 'Failed to fetch leave requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = leaveRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const result = await addLeaveRequest(validation.data);

    if (result.success && result.request) {
      return NextResponse.json(result.request, { status: 201 });
    } else {
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add leave request' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error) {
    console.error('Error adding leave request:', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
