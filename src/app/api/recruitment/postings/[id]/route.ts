import { NextRequest, NextResponse } from 'next/server';
import { getJobPostingById, updateJobPostingAction, deleteJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema } from '@/modules/recruitment/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const posting = await getJobPostingById(params.id); // Call server action
    if (!posting) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }
    return NextResponse.json(posting);
  } catch (error) {
    console.error(`Error fetching job posting ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Failed to fetch job posting' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    // Validate against the partial schema in API route
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).partial().safeParse(body);

    if (!validation.success) {
       console.error(`PUT /api/recruitment/postings/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await updateJobPostingAction(params.id, validation.data);

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting);
    } else if (result.errors?.some(e => e.message === 'Job posting not found.')) {
        return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
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
  try {
    // Call server action
    const result = await deleteJobPostingAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Job posting deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
       console.error(`DELETE /api/recruitment/postings/${params.id} Action Error:`, result.error);
      // Use error from action (e.g., "has candidates" or "not found")
      const statusCode = result.error?.includes('candidates') ? 400 : (result.error === 'Job posting not found.' ? 404 : 500);
      return NextResponse.json({ error: result.error || 'Failed to delete job posting' }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error deleting job posting ${params.id} (API):`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
