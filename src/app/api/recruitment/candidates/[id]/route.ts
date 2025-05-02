
import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidateById as dbGetCandidateById,
  updateCandidate as dbUpdateCandidate,
  deleteCandidate as dbDeleteCandidate,
} from '@/modules/recruitment/lib/mock-db';
import { candidateSchema } from '@/modules/recruitment/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const candidate = dbGetCandidateById(params.id);
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json(candidate);
  } catch (error) {
    console.error(`Error fetching candidate ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch candidate' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    // Validate against partial schema, excluding fields not updatable here
    const validation = candidateSchema
      .omit({ id: true, applicationDate: true, jobPostingId: true }) // Cannot change job posting via this route
      .partial() // Allow partial updates
      .safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const updatedCandidate = dbUpdateCandidate(params.id, validation.data);

    if (!updatedCandidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    return NextResponse.json(updatedCandidate);

  } catch (error) {
    console.error(`Error updating candidate ${params.id}:`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const deleted = dbDeleteCandidate(params.id);
    if (deleted) {
      return NextResponse.json({ message: 'Candidate deleted successfully' }, { status: 200 }); // Or 204
    } else {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
  } catch (error) {
    console.error(`Error deleting candidate ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
