
import { NextRequest, NextResponse } from 'next/server';
import { getCandidates, addCandidateAction } from '@/modules/recruitment/actions';
import { candidateSchema, type CandidateFormData } from '@/modules/recruitment/types';
import type { CandidateStatus } from '@/modules/recruitment/types';
import { getTenantId } from '../../utils/get-tenant-id'; // Import utility

export async function GET(request: NextRequest) {
  // Get tenantId for filtering, action also derives for auth
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const jobPostingId = searchParams.get('jobPostingId') || undefined;
  const status = searchParams.get('status') as CandidateStatus | undefined;

  try {
    // Action derives tenantId internally
    const candidates = await getCandidates({ jobPostingId, status });
    return NextResponse.json(candidates);
  } catch (error: any) {
    console.error('Error fetching candidates (API):', error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch candidates' }, { status });
  }
}

export async function POST(request: NextRequest) {
  // tenantId derived by action
  // const tenantId = await getTenantId(request);
  // if (!tenantId) { ... }

  try {
    const body = await request.json();
    // Validate in API route (exclude tenantId)
    const validation = candidateSchema.omit({ id: true, applicationDate: true, tenantId: true }).safeParse(body);

    if (!validation.success) {
        console.error("POST /api/recruitment/candidates Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action (action adds tenantId)
    const result = await addCandidateAction(validation.data);

    if (result.success && result.candidate) {
      return NextResponse.json(result.candidate, { status: 201 });
    } else {
      console.error("POST /api/recruitment/candidates Action Error:", result.errors);
       let statusCode = result.errors ? 400 : 500;
       if (result.errors?.some(e => e.message?.includes('already applied'))) {
            statusCode = 409; // 409 Conflict
       } else if (result.errors?.some(e => e.message?.includes('Unauthorized'))) {
           statusCode = 403;
       }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add candidate' }, { status: statusCode });
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
