
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllCandidates as dbGetAllCandidates,
  addCandidate as dbAddCandidate,
} from '@/modules/recruitment/lib/mock-db';
import { candidateSchema } from '@/modules/recruitment/types';
import type { CandidateStatus } from '@/modules/recruitment/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobPostingId = searchParams.get('jobPostingId') || undefined;
  const status = searchParams.get('status') as CandidateStatus | undefined;

  try {
    // Pass potential jobPostingId to the DB function
    const candidates = dbGetAllCandidates({ jobPostingId, status });
    return NextResponse.json(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate everything except id and applicationDate
    const validation = candidateSchema.omit({ id: true, applicationDate: true }).safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    // TODO: Check if jobPostingId exists before adding?

    const newCandidate = dbAddCandidate(validation.data);
    return NextResponse.json(newCandidate, { status: 201 });

  } catch (error) {
    console.error('Error adding candidate:', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
