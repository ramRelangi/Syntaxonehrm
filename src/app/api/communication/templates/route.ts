
import { NextRequest, NextResponse } from 'next/server';
import { getAllTemplates, addTemplate } from '@/modules/communication/lib/mock-db';
import { emailTemplateSchema } from '@/modules/communication/types';

export async function GET(request: NextRequest) {
  try {
    const templates = getAllTemplates();
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json({ error: 'Failed to fetch email templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate the request body against the schema (excluding 'id')
    const validation = emailTemplateSchema.omit({ id: true }).safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const newTemplate = addTemplate(validation.data);
    return NextResponse.json(newTemplate, { status: 201 });

  } catch (error) {
    console.error('Error adding email template:', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
