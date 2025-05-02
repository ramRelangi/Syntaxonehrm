import { NextRequest, NextResponse } from 'next/server';
import { cancelLeaveRequest } from '@/modules/leave/actions';

interface Params {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
     // TODO: Get userId from authentication context/session on the SERVER
     const mockUserId = 'emp-001'; // Replace with actual logged-in user ID

     // Call the server action
     const result = await cancelLeaveRequest(params.id, mockUserId);

     if (result.success) {
       // Optionally return the updated request or just success message
       return NextResponse.json({ message: 'Leave request cancelled successfully' });
     } else {
       // Use error message from action
       const statusCode = result.error?.includes('authorized') ? 403 : (result.error?.includes('Only pending') ? 400 : (result.error?.includes('not found') ? 404 : 500));
       return NextResponse.json({ error: result.error || 'Failed to cancel leave request.' }, { status: statusCode });
     }
  } catch (error: any) {
    console.error(`Error cancelling leave request ${params.id} (API):`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
