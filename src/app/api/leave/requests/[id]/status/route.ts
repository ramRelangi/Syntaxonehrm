import { NextRequest, NextResponse } from 'next/server';
import { updateLeaveRequestStatus } from '@/modules/leave/actions';
import { z } from 'zod';
import type { LeaveRequestStatus } from '@/modules/leave/types';

interface Params {
  params: { id: string };
}

const updateStatusSchema = z.object({
  status: z.enum(['Approved', 'Rejected', 'Cancelled']),
  comments: z.string().optional(),
  approverId: z.string().optional(), // Should ideally come from auth session on server
});

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    const validation = updateStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    // TODO: Get approverId from authentication context/session
    const mockApproverId = 'admin-001'; // Replace with actual logged-in user ID

    const result = await updateLeaveRequestStatus(
      params.id,
      validation.data.status,
      validation.data.comments,
      validation.data.approverId || mockApproverId // Use provided or mock ID
    );

    if (result.success && result.request) {
      return NextResponse.json(result.request);
    } else if (result.errors?.some(e => e.message === 'Leave request not found or cannot be updated.')) {
        return NextResponse.json({ error: 'Leave request not found or cannot be updated.' }, { status: 404 });
    }
    else {
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update leave request status' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error) {
    console.error(`Error updating leave request ${params.id} status:`, error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
