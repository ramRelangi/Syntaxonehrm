import { NextRequest, NextResponse } from 'next/server';
import { getJobPostings, addJobPostingAction } from '@/modules/recruitment/actions';
import { jobPostingSchema } from '@/modules/recruitment/types';
import type { JobPostingStatus } from '@/modules/recruitment/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as JobPostingStatus | undefined;

  try {
    const postings = await getJobPostings({ status }); // Call server action
    return NextResponse.json(postings);
  } catch (error) {
    console.error('Error fetching job postings (API):', error);
    return NextResponse.json({ error: 'Failed to fetch job postings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate in the API route before calling the action
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).safeParse(body);

    if (!validation.success) {
       console.error("POST /api/recruitment/postings Validation Error:", validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await addJobPostingAction(validation.data);

    if (result.success && result.jobPosting) {
      return NextResponse.json(result.jobPosting, { status: 201 });
    } else {
      console.error("POST /api/recruitment/postings Action Error:", result.errors);
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add job posting' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding job posting (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
