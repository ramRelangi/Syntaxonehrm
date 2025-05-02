
import { NextRequest, NextResponse } from 'next/server';
import { getEmailSettings, updateEmailSettings } from '@/modules/communication/lib/mock-db';
import { emailSettingsSchema } from '@/modules/communication/types';

// GET route to fetch current settings
export async function GET(request: NextRequest) {
  try {
    const settings = getEmailSettings();
    // Return settings or an empty object/null if not configured yet
    return NextResponse.json(settings || {});
  } catch (error) {
    console.error('Error fetching email settings:', error);
    return NextResponse.json({ error: 'Failed to fetch email settings' }, { status: 500 });
  }
}

// PUT route to update/create settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    // Validate the request body against the schema
    const validation = emailSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    // Update the settings in the mock DB
    const updatedSettings = updateEmailSettings(validation.data);
    return NextResponse.json(updatedSettings);

  } catch (error) {
    console.error('Error updating email settings:', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
