
import { NextRequest, NextResponse } from 'next/server';
// Import DB function directly for GET
import { getAllJobPostings as dbGetAllJobPostings, addJobPosting as dbAddJobPosting } from '@/modules/recruitment/lib/db'; // Use correct names from db file
import { jobPostingSchema, type JobPostingFormData } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';
import { getTenantIdFromAuth } from '@/lib/auth'; // Use auth helper to get tenant ID
// Removed server action import for GET
// import { getJobPostings as getJobPostingsAction, addJobPostingAction } from '@/modules/recruitment/actions';
import { addJobPostingAction } from '@/modules/recruitment/actions'; // Correctly import addJobPostingAction


export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/recruitment/postings - Fetching...`);

    // Resolve tenantId directly within the API route handler
    const tenantId = await getTenantIdFromAuth();
    if (!tenantId) {
        // Public job board might hit this without tenant context.
        // Let's assume for now that internal API access requires a tenant context.
        console.error(`[API GET /api/recruitment/postings] Failed to resolve tenant ID from auth context.`);
        // Return 401 Unauthorized as the context is missing
        return NextResponse.json({ error: "Unauthorized or missing tenant context." }, { status: 401 });
    }
     console.log(`[API GET /api/recruitment/postings] Resolved tenant ID: ${tenantId}`);


    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobPostingStatus | undefined;

    // Call DB function directly with resolved tenantId and status filter
    const postings = await dbGetAllJobPostings(tenantId, { status });
    return NextResponse.json(postings);

  } catch (error: any) {
    console.error(`Error fetching job postings (API):`, error);
    let message = 'Failed to fetch job postings';
    let status = 500;

     // Distinguish between auth errors and general errors caught here
    if (error.message?.includes('Unauthorized') || error.message?.includes('Tenant context not found')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401; // Or 403 Forbidden if appropriate
    } else if (error.code === '22P02' && error.message?.includes('uuid')) { // Invalid UUID format
         message = 'Internal server error: Invalid identifier format.';
         console.error("UUID Syntax Error in GET /api/recruitment/postings - Check tenantId handling.");
         status = 500; // Internal error
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
