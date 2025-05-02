import { NextRequest, NextResponse } from 'next/server';
import { updateLeaveRequestStatus } from '@/modules/leave/actions';
import { z } from 'zod';
import type { LeaveRequestStatus } from '@/modules/leave/types';

interface Params {
  params: { id: string };
}

const updateStatusSchema = z.object({
  status: z.enum(['Approved', 'Rejected']), // Only allow these via API
  comments: z.string().optional(),
  // approverId: z.string().optional(), // Should come from auth session on server
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    const validation = updateStatusSchema.safeParse(body);

    if (!validation.success) {
        console.error(`PATCH /api/leave/requests/${params.id}/status Validation Error:`, validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // TODO: Get approverId from authentication context/session on the SERVER
    const mockApproverId = 'admin-001'; // Replace with actual logged-in user ID from session/auth

    // Call server action
    const result = await updateLeaveRequestStatus(
      params.id,
      validation.data.status,
      validation.data.comments,
      mockApproverId // Pass approver ID from server context
    );

    if (result.success && result.request) {
      return NextResponse.json(result.request);
    } else {
        console.error(`PATCH /api/leave/requests/${params.id}/status Action Error:`, result.errors);
        const notFoundOrUpdateable = result.errors?.some(e => e.message?.includes('not found or cannot be updated') || e.message?.includes('status might have changed'));
        if (notFoundOrUpdateable) {
           return NextResponse.json({ error: result.errors?.[0]?.message || 'Leave request not found or cannot be updated.' }, { status: 404 });
        }
        return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update leave request status' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating leave request ${params.id} status (API):`, error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
