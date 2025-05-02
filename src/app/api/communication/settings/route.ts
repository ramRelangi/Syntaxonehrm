
import { NextRequest, NextResponse } from 'next/server';
import { getEmailSettings, updateEmailSettings } from '@/modules/communication/lib/mock-db';
import { emailSettingsSchema } from '@/modules/communication/types';

// GET route to fetch current settings
export async function GET(request: NextRequest) {
    console.log('[Settings API - GET] Received request.');
    try {
        console.log('[Settings API - GET] Calling getEmailSettings from mock DB...');
        const settings = getEmailSettings(); // This function now logs internally too
        console.log('[Settings API - GET] Retrieved settings:', settings ? JSON.stringify(settings) : 'null');
        // Return settings or an empty object if not configured yet (consistent with previous behavior)
        return NextResponse.json(settings || {});
    } catch (error) {
        console.error('[Settings API - GET] Error fetching email settings:', error);
        return NextResponse.json({ error: 'Failed to fetch email settings' }, { status: 500 });
    }
}

// PUT route to update/create settings
export async function PUT(request: NextRequest) {
    console.log('[Settings API - PUT] Received request.');
    try {
        console.log('[Settings API - PUT] Parsing request body...');
        const body = await request.json();
        console.log('[Settings API - PUT] Request body parsed:', JSON.stringify(body));

        // Validate the request body against the schema
        console.log('[Settings API - PUT] Validating request body...');
        const validation = emailSettingsSchema.safeParse(body);

        if (!validation.success) {
            console.error('[Settings API - PUT] Validation failed:', JSON.stringify(validation.error.errors));
            return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
        }
        console.log('[Settings API - PUT] Validation successful.');

        // Update the settings in the mock DB
        console.log('[Settings API - PUT] Calling updateEmailSettings in mock DB...');
        const updatedSettings = updateEmailSettings(validation.data); // This function logs internally
        console.log('[Settings API - PUT] Settings updated in mock DB. Responding with:', JSON.stringify(updatedSettings));
        return NextResponse.json(updatedSettings);

    } catch (error) {
        console.error('[Settings API - PUT] Error updating email settings:', error);
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            console.error('[Settings API - PUT] Invalid JSON payload.');
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
