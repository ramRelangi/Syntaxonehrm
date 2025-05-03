import { NextRequest, NextResponse } from 'next/server';
import { getJobPostings as getJobPostingsAction, addJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema, type JobPostingFormData } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';
// Removed import of getTenantId util
import { getTenantIdFromAuth } from '@/lib/auth'; // Import auth helper directly

export async function GET(request: NextRequest) {
  let tenantIdForContext: string | null = null;
  try {
    // Get tenantId for context. Action will re-verify auth.
    // Public job board access might not have tenant context initially, action needs to handle this.
    tenantIdForContext = await getTenantIdFromAuth();
    // We don't strictly need to block here if tenantIdForContext is null,
    // as the action might handle fetching 'Open' postings publicly.
    console.log(`GET /api/recruitment/postings - Tenant context: ${tenantIdForContext || 'None (Public?)'}`);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobPostingStatus | undefined;

    // Call server action (action derives tenantId internally for filtering/auth)
    const postings = await getJobPostingsAction({ status }); // Pass status filter
    return NextResponse.json(postings);

  } catch (error: any) {
    console.error(`Error fetching job postings (API) for tenant ${tenantIdForContext || 'unknown'}:`, error);
    let message = 'Failed to fetch job postings';
    let status = 500;

    // Distinguish between auth errors and general errors
    if (error.message?.includes('Tenant context not found') || error.message?.includes('Unauthorized')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401; // Or 403 Forbidden if appropriate
    } else if (error.message?.includes('invalid input syntax for type uuid')) {
        message = 'Internal server error: Invalid identifier.';
        status = 500;
        console.error("UUID Syntax Error in GET /api/recruitment/postings - Check tenantId handling.");
    } else {
        message = error.message || message;
    }

    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
    let tenantIdForContext: string | null = null;
  try {
    // Get tenant context for logging, action verifies auth and adds tenantId
    tenantIdForContext = await getTenantIdFromAuth();
    if (!tenantIdForContext) {
        return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
    }

    const body = await request.json();
    // Action handles validation and adding tenantId

    // Pass raw form data (without tenantId) to the action
    const formData = body as Omit<JobPostingFormData, 'tenantId'>;
    const result = await addJobPostingAction(formData);

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting, { status: 201 });
    } else {
      console.error(`POST /api/recruitment/postings Action Error for tenant ${tenantIdForContext}:`, result.errors);
      let errorMessage = result.errors?.[0]?.message || 'Failed to add job posting';
      let statusCode = 400; // Default bad request

      if (errorMessage.includes('Unauthorized')) {
          statusCode = 403; // Forbidden
          errorMessage = 'Unauthorized to add job posting.';
      } else if (!result.errors) {
          statusCode = 500;
          errorMessage = 'An unexpected error occurred.';
      }

      return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error adding job posting (API) for tenant ${tenantIdForContext || 'unknown'}:`, error);
    let message = 'Internal server error';
    let status = 500;
    if (error instanceof SyntaxError) {
       message = 'Invalid JSON payload';
       status = 400;
    } else if (error.message?.includes('Unauthorized')) { // Catch error thrown directly
        message = error.message;
        status = 403;
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}
