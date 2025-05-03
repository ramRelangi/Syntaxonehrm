
import { NextRequest, NextResponse } from 'next/server';
import {
  getCandidateById,
  updateCandidateAction,
  deleteCandidateAction,
} from '@/modules/recruitment/actions';
import { candidateSchema } from '@/modules/recruitment/types';
import { getTenantId } from '../../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  // Get tenantId for context, action also derives it
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // Action derives tenantId internally
    const candidate = await getCandidateById(params.id); // Call server action
    if (!candidate) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }
    return NextResponse.json(candidate);
  } catch (error: any) {
    console.error(`Error fetching candidate ${params.id} (API):`, error);
    const status = error.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: error.message || 'Failed to fetch candidate' }, { status });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  // Get tenantId for context, action also derives it
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    // Validate partial updates in API route (exclude tenantId and immutable fields)
    const validation = candidateSchema
      .omit({ id: true, applicationDate: true, jobPostingId: true, tenantId: true })
      .partial()
      .safeParse(body);

    if (!validation.success) {
        console.error(`PUT /api/recruitment/candidates/${params.id} Validation Error:`, validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action (action derives tenantId)
    const result = await updateCandidateAction(params.id, validation.data);

    if (result.success && result.candidate) {
      return NextResponse.json(result.candidate);
    } else if (result.errors?.some(e => e.message === 'Candidate not found.')) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    } else {
         let statusCode = result.errors ? 400 : 500;
         if (result.errors?.some(e => e.message?.includes('already applied'))) {
             statusCode = 409;
         } else if (result.errors?.some(e => e.message?.includes('Unauthorized'))) {
            statusCode = 403;
         }
         console.error(`PUT /api/recruitment/candidates/${params.id} Action Error:`, result.errors);
         return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update candidate' }, { status: statusCode });
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
  // Get tenantId for context, action also derives it
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // Call server action (action derives tenantId)
    const result = await deleteCandidateAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Candidate deleted successfully' }, { status: 200 }); // Or 204
    } else {
        console.error(`DELETE /api/recruitment/candidates/${params.id} Action Error:`, result.error);
        let statusCode = 500;
        if (result.error === 'Candidate not found.') statusCode = 404;
        else if (result.error?.includes('Unauthorized')) statusCode = 403;
        return NextResponse.json({ error: result.error || 'Failed to delete candidate' }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error deleting candidate ${params.id} (API):`, error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
