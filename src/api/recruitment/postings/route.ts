
import { NextRequest, NextResponse } from 'next/server';
import { getJobPostings, addJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema, type JobPostingFormData } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';
import { getTenantId } from '../../utils/get-tenant-id'; // Import utility

export async function GET(request: NextRequest) {
  // Get tenantId for context if needed, action derives it
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      // For public job board access (e.g., /jobs), this might be okay if action handles it
      // For internal access (/recruitment), this is an error. Let's assume internal requires context.
      // The middleware should prevent unauthenticated access to internal routes.
      // However, the public /jobs route might hit this without a tenant header.
      // The action `getJobPostings` needs to handle fetching *only open* postings without tenantId if applicable.
      // console.warn('GET /api/recruitment/postings - Tenant context is missing.');
      // Let the action handle authorization and filtering based on context.
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as JobPostingStatus | undefined;

  try {
    // Action derives tenantId internally if needed for filtering or auth
    const postings = await getJobPostings({ status }); // Call server action
    return NextResponse.json(postings);
  } catch (error: any) {
    console.error('Error fetching job postings (API):', error);
    // Distinguish between auth errors and general errors if possible
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch job postings' }, { status });
  }
}

export async function POST(request: NextRequest) {
  // tenantId derived by action
  // const tenantId = await getTenantId(request);
  // if (!tenantId) { ... }

  try {
    const body = await request.json();
    // Validate in the API route before calling the action (exclude tenantId)
    const validation = jobPostingSchema.omit({ id: true, datePosted: true, tenantId: true }).safeParse(body);

    if (!validation.success) {
       console.error("POST /api/recruitment/postings Validation Error:", validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action (action adds tenantId)
    const result = await addJobPostingAction(validation.data);

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting, { status: 201 });
    } else {
      console.error("POST /api/recruitment/postings Action Error:", result.errors);
      const isAuthError = result.errors?.some(e => e.message?.includes('Unauthorized'));
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add job posting' }, { status: isAuthError ? 403 : (result.errors ? 400 : 500) });
    }
  } catch (error: any) {
    console.error('Error adding job posting (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
