
import { NextRequest, NextResponse } from 'next/server';
import { cancelLeaveRequest } from '@/modules/leave/actions';
import { getTenantId } from '../../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  // Get tenantId for logging/context if needed, action derives it for logic
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
     // Call the server action (action derives tenantId and userId internally)
     const result = await cancelLeaveRequest(params.id);

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
