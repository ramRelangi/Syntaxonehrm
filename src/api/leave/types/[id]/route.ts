
import { NextRequest, NextResponse } from 'next/server';
import { updateLeaveTypeAction, deleteLeaveTypeAction } from '@/modules/leave/actions';
import { z } from 'zod'; // For potential validation of request body if needed
import { getTenantId } from '../../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { id: string };
}

// Simple Zod schema for updating (all fields optional, excludes tenantId)
const updateLeaveTypeSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").optional(),
  description: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  defaultBalance: z.coerce.number().min(0).optional(), // Use coerce
  accrualRate: z.coerce.number().min(0).optional(), // Use coerce
}).partial(); // Make all fields optional for PUT/PATCH


export async function PUT(request: NextRequest, { params }: Params) {
  // Get tenantId for logging/context, action derives it for logic
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
     const validation = updateLeaveTypeSchema.safeParse(body); // Validate input

    if (!validation.success) {
       console.error(`PUT /api/leave/types/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action (action derives tenantId)
    const result = await updateLeaveTypeAction(params.id, validation.data);

    if (result.success && result.leaveType) {
      return NextResponse.json(result.leaveType);
    } else if (result.errors?.some(e => e.message === 'Leave type not found')) {
        return NextResponse.json({ error: 'Leave type not found' }, { status: 404 });
    } else if (result.errors?.some(e => e.message?.includes('Unauthorized'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
     else {
       console.error(`PUT /api/leave/types/${params.id} Action Error:`, result.errors);
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update leave type' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating leave type ${params.id} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  // Get tenantId for logging/context, action derives it for logic
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // Call server action (action derives tenantId)
    const result = await deleteLeaveTypeAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Leave type deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      // Use error from action (e.g., "in use" error or "Unauthorized")
      let statusCode = 500;
      if (result.error?.includes('in use')) statusCode = 400;
      else if (result.error === 'Leave type not found.') statusCode = 404;
      else if (result.error === 'Unauthorized.') statusCode = 403;

      return NextResponse.json({ error: result.error || 'Failed to delete leave type' }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error deleting leave type ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
