import { NextRequest, NextResponse } from 'next/server';
import { updateLeaveTypeAction, deleteLeaveTypeAction } from '@/modules/leave/actions';
import { z } from 'zod'; // For potential validation of request body if needed

interface Params {
  params: { id: string };
}

// Simple Zod schema for updating (all fields optional)
const updateLeaveTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  defaultBalance: z.number().min(0).optional(),
  accrualRate: z.number().min(0).optional(),
}).partial(); // Make all fields optional for PUT/PATCH


export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
     const validation = updateLeaveTypeSchema.safeParse(body); // Validate input

    if (!validation.success) {
       return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const result = await updateLeaveTypeAction(params.id, validation.data);

    if (result.success && result.leaveType) {
      return NextResponse.json(result.leaveType);
    } else if (result.errors?.some(e => e.message === 'Leave type not found')) {
        return NextResponse.json({ error: 'Leave type not found' }, { status: 404 });
    } else {
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update leave type' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error) {
    console.error(`Error updating leave type ${params.id}:`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await deleteLeaveTypeAction(params.id);
    if (result.success) {
      return NextResponse.json({ message: 'Leave type deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      // Could be 404 (not found) or 400 (e.g., type in use)
      return NextResponse.json({ error: 'Leave type not found or could not be deleted (might be in use)' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Error deleting leave type ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
