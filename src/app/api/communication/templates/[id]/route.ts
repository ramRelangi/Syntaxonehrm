
import { NextRequest, NextResponse } from 'next/server';
import { getTemplateById, updateTemplate, deleteTemplate } from '@/modules/communication/lib/mock-db';
import { emailTemplateSchema } from '@/modules/communication/types';

interface Params {
  params: { id: string };
}

// Optional GET by ID - useful for fetching details before edit if needed elsewhere
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const template = getTemplateById(params.id);
    if (!template) {
      return NextResponse.json({ error: 'Email template not found' }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    console.error(`Error fetching email template ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch email template' }, { status: 500 });
  }
}


export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    // Validate against partial schema, cannot update 'id'
    const validation = emailTemplateSchema
      .omit({ id: true }) // Cannot change ID
      .partial() // Allow partial updates
      .safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const updatedTemplate = updateTemplate(params.id, validation.data);

    if (!updatedTemplate) {
      return NextResponse.json({ error: 'Email template not found' }, { status: 404 });
    }

    return NextResponse.json(updatedTemplate);

  } catch (error) {
    console.error(`Error updating email template ${params.id}:`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const deleted = deleteTemplate(params.id);
    if (deleted) {
      return NextResponse.json({ message: 'Email template deleted successfully' }, { status: 200 }); // Or 204
    } else {
      // Could be 404 (not found) or 400 (e.g., template in use - if checks added)
      return NextResponse.json({ error: 'Email template not found or could not be deleted' }, { status: 404 });
    }
  } catch (error) {
    console.error(`Error deleting email template ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
