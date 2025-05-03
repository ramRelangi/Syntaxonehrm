
import { NextRequest, NextResponse } from 'next/server';
import { getJobPostingById, updateJobPostingAction, deleteJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema, type JobPostingFormData } from '@/modules/recruitment/types';
import { getTenantId } from '../../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  // Get tenantId for context if needed, action derives it
  const tenantId = await getTenantId(request);
  // Public route /jobs/[id] might hit this without tenant context
  // if (!tenantId) { ... }

  try {
    // Action derives tenantId internally if required for auth/filtering
    const posting = await getJobPostingById(params.id); // Call server action
    if (!posting) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }
    // TODO: Check if posting status is 'Open' if accessed publicly?
    return NextResponse.json(posting);
  } catch (error: any) {
    console.error(`Error fetching job posting ${params.id} (API):`, error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch job posting' }, { status });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  // Get tenantId for context, action also derives it for verification
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required for update.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    // Validate against the partial schema in API route (exclude tenantId)
    const validation = jobPostingSchema.omit({ id: true, datePosted: true, tenantId: true }).partial().safeParse(body);

    if (!validation.success) {
       console.error(`PUT /api/recruitment/postings/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action (action derives tenantId)
    const result = await updateJobPostingAction(params.id, validation.data);

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting);
    } else if (result.errors?.some(e => e.message === 'Job posting not found.')) {
        return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    } else if (result.errors?.some(e => e.message?.includes('Unauthorized'))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
     else {
        console.error(`PUT /api/recruitment/postings/${params.id} Action Error:`, result.errors);
        return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update job posting' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating job posting ${params.id} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  // Get tenantId for context, action also derives it for verification
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required for delete.' }, { status: 400 });
  }

  try {
    // Call server action (action derives tenantId)
    const result = await deleteJobPostingAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Job posting deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
       console.error(`DELETE /api/recruitment/postings/${params.id} Action Error:`, result.error);
      // Use error from action (e.g., "has candidates" or "not found" or "Unauthorized")
      let statusCode = 500;
       if (result.error?.includes('candidates')) statusCode = 400;
       else if (result.error === 'Job posting not found.') statusCode = 404;
       else if (result.error?.includes('Unauthorized')) statusCode = 403;
      return NextResponse.json({ error: result.error || 'Failed to delete job posting' }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error deleting job posting ${params.id} (API):`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
