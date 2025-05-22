
import { NextRequest, NextResponse } from 'next/server';
// Import server actions
import { getJobOpenings, addJobOpeningAction } from '@/modules/recruitment/actions'; // Corrected imports
import { jobOpeningSchema, type JobOpeningFormData, type JobOpeningStatus } from '@/modules/recruitment/types'; // Corrected type imports

export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/recruitment/postings - Fetching...`); // Log path as API defined

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobOpeningStatus | undefined;

    // Call server action (action handles tenant context and auth internally)
    const jobOpenings = await getJobOpenings({ status }); // Corrected function call
    return NextResponse.json(jobOpenings);

  } catch (error: any) {
    console.error(`Error fetching job openings (API):`, error);
    let message = 'Failed to fetch job openings';
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
    console.log(`POST /api/recruitment/postings - Adding...`); // Log path as API defined

    // Action handles tenantId derivation and validation internally
    const body = await request.json();
    // Pass raw form data (without tenantId) to the action
    const formData = body as Omit<JobOpeningFormData, 'tenantId'>; // Use JobOpeningFormData
    const result = await addJobOpeningAction(formData); // Corrected function call

    if (result.success && result.jobOpening) { // Check for jobOpening
      return NextResponse.json(result.jobOpening, { status: 201 });
    } else {
      console.error(`POST /api/recruitment/postings Action Error:`, result.errors);
      let errorMessage = result.errors?.[0]?.message || 'Failed to add job opening';
      let statusCode = 400; // Default bad request

      if (errorMessage.includes('Unauthorized')) {
          statusCode = 403; // Forbidden
          errorMessage = 'Unauthorized to add job opening.';
      } else if (!result.errors) {
          statusCode = 500;
          errorMessage = 'An unexpected error occurred.';
      }

      return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error adding job opening (API):`, error);
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
