import { NextRequest, NextResponse } from 'next/server';
// Import DB function directly for GET
import { addJobPostingAction, getJobPostings as dbGetAllJobPostings } from '@/modules/recruitment/lib/db';
import { jobPostingSchema, type JobPostingFormData } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';
import { getTenantId } from '@/api/utils/get-tenant-id'; // Keep using API util for tenant context
// Removed server action import for GET
// import { getJobPostings as getJobPostingsAction, addJobPostingAction } from '@/modules/recruitment/actions';


export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/recruitment/postings - Fetching...`);

    // Resolve tenantId using the utility function from the request context
    const tenantId = await getTenantId(request);
    if (!tenantId) {
        // Public job board might hit this without tenant context.
        // The DB function needs to handle fetching ONLY open postings if tenantId is null/undefined.
        // For now, we'll return an error if tenantId is missing, assuming internal access requires it.
        console.error(`[API GET /api/recruitment/postings] Failed to resolve tenant ID from request.`);
        return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobPostingStatus | undefined;

    // Call DB function directly with resolved tenantId and status filter
    const postings = await dbGetAllJobPostings(tenantId, { status });
    return NextResponse.json(postings);

  } catch (error: any) {
    console.error(`Error fetching job postings (API):`, error);
    let message = 'Failed to fetch job postings';
    let status = 500;

     // Handle specific DB errors
    if (error.code === '22P02' && error.message?.includes('uuid')) {
         message = 'Internal server error: Invalid identifier format.';
         console.error("UUID Syntax Error in GET /api/recruitment/postings - Check tenantId handling.");
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log(`POST /api/recruitment/postings - Adding...`);

     // Resolve tenantId for adding the posting
     const tenantId = await getTenantId(request);
     if (!tenantId) {
         console.error(`[API POST /api/recruitment/postings] Failed to resolve tenant ID from request.`);
         return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 });
     }


    const body = await request.json();
    // Validate in the API route before calling the action (exclude tenantId)
    const validation = jobPostingSchema.omit({ id: true, datePosted: true, tenantId: true }).safeParse(body);

    if (!validation.success) {
       console.error("POST /api/recruitment/postings Validation Error:", validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Add tenantId before calling DB function directly
    const dataWithTenant: JobPostingFormData = { ...validation.data, tenantId };

    // Call DB function directly
    const newJobPosting = await dbAddJobPosting(dataWithTenant);

    // TODO: Revalidation logic needs to be moved to where this API is called from,
    // or trigger revalidation via a separate mechanism if needed server-side.
    // revalidatePath(`/${tenantId}/recruitment`);
    // revalidatePath('/jobs');

    return NextResponse.json(newJobPosting, { status: 201 });

  } catch (error: any) {
    console.error('Error adding job posting (API):', error);
    let message = 'Internal server error';
    let status = 500;
    if (error instanceof SyntaxError) {
       message = 'Invalid JSON payload';
       status = 400;
    } else if (error.message?.includes('Tenant ID is required')) {
        message = 'Tenant ID is required.';
        status = 400;
    } else {
        message = error.message || message;
    }
    return NextResponse.json({ error: message }, { status: status });
  }
}
