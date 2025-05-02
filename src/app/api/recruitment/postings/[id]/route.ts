
import { NextRequest, NextResponse } from 'next/server';
import {
  getJobPostingById as dbGetJobPostingById,
  updateJobPosting as dbUpdateJobPosting,
  deleteJobPosting as dbDeleteJobPosting,
} from '@/modules/recruitment/lib/mock-db';
import { jobPostingSchema } from '@/modules/recruitment/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const posting = dbGetJobPostingById(params.id);
    if (!posting) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }
    return NextResponse.json(posting);
  } catch (error) {
    console.error(`Error fetching job posting ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch job posting' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    // Validate against the full schema, but id and datePosted are not expected in the body
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).partial().safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const updatedPosting = dbUpdateJobPosting(params.id, validation.data);

    if (!updatedPosting) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }

    return NextResponse.json(updatedPosting);

  } catch (error) {
    console.error(`Error updating job posting ${params.id}:`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const deleted = dbDeleteJobPosting(params.id);
    if (deleted) {
      return NextResponse.json({ message: 'Job posting deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      // Could be 404 (not found) or 400 (e.g., has candidates)
      return NextResponse.json({ error: 'Job posting not found or could not be deleted (check for candidates)' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Error deleting job posting ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
