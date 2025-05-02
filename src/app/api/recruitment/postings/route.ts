
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllJobPostings as dbGetAllJobPostings,
  addJobPosting as dbAddJobPosting,
} from '@/modules/recruitment/lib/mock-db';
import { jobPostingSchema } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as JobPostingStatus | undefined;

  try {
    const postings = dbGetAllJobPostings({ status });
    return NextResponse.json(postings);
  } catch (error) {
    console.error('Error fetching job postings:', error);
    return NextResponse.json({ error: 'Failed to fetch job postings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate everything except id and datePosted (which are set by the DB layer)
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    // Pass validated data (which includes optional fields like closingDate, salaryRange correctly typed)
    const newPosting = dbAddJobPosting(validation.data);

    return NextResponse.json(newPosting, { status: 201 });

  } catch (error) {
    console.error('Error adding job posting:', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
