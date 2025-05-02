import { NextRequest, NextResponse } from 'next/server';
import { cancelLeaveRequest } from '@/modules/leave/actions';

interface Params {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
     // TODO: Add authorization checks - ensure user can cancel this request (self or admin)
    const result = await cancelLeaveRequest(params.id);

    if (result.success) {
      // Optionally return the updated request or just success
      return NextResponse.json({ message: 'Leave request cancelled successfully' });
    } else {
      // Could be 404 (not found) or 403 (forbidden) or 400 (bad request, e.g., already processed)
      return NextResponse.json({ error: 'Failed to cancel leave request. It might not exist or is already processed.' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Error cancelling leave request ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
