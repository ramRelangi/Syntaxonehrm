
import { NextRequest, NextResponse } from 'next/server';
import { getEmailTemplatesAction, addEmailTemplateAction } from '@/modules/communication/actions';
import { emailTemplateSchema } from '@/modules/communication/types';

export async function GET(request: NextRequest) {
  try {
    const templates = await getEmailTemplatesAction(); // Call server action
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching email templates (API):', error);
    return NextResponse.json({ error: 'Failed to fetch email templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate the request body against the schema (excluding 'id' and 'tenantId')
    // The action will add tenantId from the session.
    const validation = emailTemplateSchema.omit({ id: true, tenantId: true }).safeParse(body);

    if (!validation.success) {
        console.error("POST /api/communication/templates Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call server action - it expects data without tenantId, and adds it internally
    const result = await addEmailTemplateAction(validation.data);

    if (result.success && result.template) {
      return NextResponse.json(result.template, { status: 201 });
    } else {
      console.error("POST /api/communication/templates Action Error:", result.errors);
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add email template' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding email template (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
