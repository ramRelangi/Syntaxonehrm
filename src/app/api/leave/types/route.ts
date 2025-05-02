import { NextRequest, NextResponse } from 'next/server';
import { getLeaveTypes, addLeaveTypeAction } from '@/modules/leave/actions';
import { z } from 'zod'; // For potential validation of request body if needed

// Simple Zod schema for adding (adjust based on required fields)
const addLeaveTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  requiresApproval: z.boolean().optional().default(true),
  defaultBalance: z.coerce.number().min(0).optional().default(0), // Use coerce for number input
  accrualRate: z.coerce.number().min(0).optional().default(0), // Use coerce for number input
});


export async function GET(request: NextRequest) {
  try {
    const types = await getLeaveTypes(); // Call server action
    return NextResponse.json(types);
  } catch (error) {
    console.error('Error fetching leave types (API):', error);
    return NextResponse.json({ error: 'Failed to fetch leave types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = addLeaveTypeSchema.safeParse(body); // Validate input

    if (!validation.success) {
       console.error("POST /api/leave/types Validation Error:", validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await addLeaveTypeAction(validation.data);

    if (result.success && result.leaveType) {
      return NextResponse.json(result.leaveType, { status: 201 });
    } else {
        console.error("POST /api/leave/types Action Error:", result.errors);
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add leave type' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding leave type (API):', error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
