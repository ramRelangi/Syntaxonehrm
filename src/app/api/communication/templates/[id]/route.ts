import { NextRequest, NextResponse } from 'next/server';
import { getEmailTemplateByIdAction, updateEmailTemplateAction, deleteEmailTemplateAction } from '@/modules/communication/actions';
import { emailTemplateSchema } from '@/modules/communication/types';

interface Params {
  params: { id: string };
}

// Optional GET by ID - useful for fetching details before edit if needed elsewhere
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const template = await getEmailTemplateByIdAction(params.id); // Call server action
    if (!template) {
      return NextResponse.json({ error: 'Email template not found' }, { status: 404 });
    }
    return NextResponse.json(template);
  } catch (error) {
    console.error(`Error fetching email template ${params.id} (API):`, error);
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
        console.error(`PUT /api/communication/templates/${params.id} Validation Error:`, validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action
    const result = await updateEmailTemplateAction(params.id, validation.data);

    if (result.success && result.template) {
      return NextResponse.json(result.template);
    } else if (result.errors?.some(e => e.message === 'Template not found.')) {
        return NextResponse.json({ error: 'Email template not found' }, { status: 404 });
    } else {
       console.error(`PUT /api/communication/templates/${params.id} Action Error:`, result.errors);
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update email template' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating email template ${params.id} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // Call server action
    const result = await deleteEmailTemplateAction(params.id);

    if (result.success) {
      return NextResponse.json({ message: 'Email template deleted successfully' }, { status: 200 }); // Or 204
    } else {
      console.error(`DELETE /api/communication/templates/${params.id} Action Error:`, result.error);
      return NextResponse.json({ error: result.error || 'Failed to delete email template' }, { status: result.error === 'Template not found.' ? 404 : 500 });
    }
  } catch (error: any) {
    console.error(`Error deleting email template ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
