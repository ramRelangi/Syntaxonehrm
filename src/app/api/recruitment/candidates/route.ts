import { NextRequest, NextResponse } from 'next/server';
import { getCandidates, addCandidateAction } from '@/modules/recruitment/actions';
import { candidateSchema } from '@/modules/recruitment/types';
import type { CandidateStatus } from '@/modules/recruitment/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobPostingId = searchParams.get('jobPostingId') || undefined;
  const status = searchParams.get('status') as CandidateStatus | undefined;

  try {
    // Call server action
    const candidates = await getCandidates({ jobPostingId, status });
    return NextResponse.json(candidates);
  } catch (error) {
    console.error('Error fetching candidates (API):', error);
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate in API route
    const validation = candidateSchema.omit({ id: true, applicationDate: true }).safeParse(body);

    if (!validation.success) {
        console.error("POST /api/recruitment/candidates Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await addCandidateAction(validation.data);

    if (result.success && result.candidate) {
      return NextResponse.json(result.candidate, { status: 201 });
    } else {
      console.error("POST /api/recruitment/candidates Action Error:", result.errors);
       // Handle specific errors like duplicate application
       if (result.errors?.some(e => e.message?.includes('already applied'))) {
            return NextResponse.json({ error: result.errors[0].message }, { status: 409 }); // 409 Conflict
       }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add candidate' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding candidate (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
     // Handle errors thrown directly by the action
    if (error.message?.includes('already applied')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
