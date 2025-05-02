import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidateById,
  updateCandidateAction,
  deleteCandidateAction,
} from '@/modules/recruitment/actions';
import { candidateSchema } from '@/modules/recruitment/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const candidate = await getCandidateById(params.id); // Call server action
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json(candidate);
  } catch (error) {
    console.error(`Error fetching candidate ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Failed to fetch candidate' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    // Validate partial updates in API route
    const validation = candidateSchema
      .omit({ id: true, applicationDate: true, jobPostingId: true }) // Don't allow changing job posting via this route
      .partial()
      .safeParse(body);

    if (!validation.success) {
        console.error(`PUT /api/recruitment/candidates/${params.id} Validation Error:`, validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await updateCandidateAction(params.id, validation.data);

    if (result.success && result.candidate) {
      return NextResponse.json(result.candidate);
    } else if (result.errors?.some(e => e.message === 'Candidate not found.')) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    } else {
         console.error(`PUT /api/recruitment/candidates/${params.id} Action Error:`, result.errors);
         if (result.errors?.some(e => e.message?.includes('already applied'))) {
             return NextResponse.json({ error: result.errors[0].message }, { status: 409 });
         }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update candidate' }, { status: result.errors ? 400 : 500 });
    }

  } catch (error: any) {
    console.error(`Error updating candidate ${params.id} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
     // Handle errors thrown directly
     if (error.message?.includes('already applied')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // Call server action
    const result = await deleteCandidateAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Candidate deleted successfully' }, { status: 200 }); // Or 204
    } else {
        console.error(`DELETE /api/recruitment/candidates/${params.id} Action Error:`, result.error);
        return NextResponse.json({ error: result.error || 'Failed to delete candidate' }, { status: result.error === 'Candidate not found.' ? 404 : 500 });
    }
  } catch (error: any) {
    console.error(`Error deleting candidate ${params.id} (API):`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
