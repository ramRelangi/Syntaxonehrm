import { NextRequest, NextResponse } from 'next/server';
// Import server action for GET
import { getJobPostings, addJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema, type JobPostingFormData, type JobPostingStatus } from '@/modules/recruitment/types';
// Removed DB function and auth helper import as action handles it


export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/recruitment/postings - Fetching...`);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobPostingStatus | undefined;

    // Call server action (action handles tenant context and auth internally)
    const postings = await getJobPostings({ status });
    return NextResponse.json(postings);

  } catch (error: any) {
    console.error(`Error fetching job postings (API):`, error);
    let message = 'Failed to fetch job postings';
    let status = 500;

    // Distinguish between auth errors and general errors caught here
    if (error.message?.includes('Unauthorized') || error.message?.includes('Tenant context not found')) {
        message = 'Unauthorized or missing tenant context.';
        status = 401; // Or 403 Forbidden if appropriate
    } else {
        message = error.message || message;
    }

    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log(`POST /api/recruitment/postings - Adding...`);

    // Action handles tenantId derivation and validation internally
    const body = await request.json();
    // Pass raw form data (without tenantId) to the action
    const formData = body as Omit<JobPostingFormData, 'tenantId'>;
    const result = await addJobPostingAction(formData); // Use the imported server action

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting, { status: 201 });
    } else {
      console.error(`POST /api/recruitment/postings Action Error:`, result.errors);
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
    console.error(`Error adding job posting (API):`, error);
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

    