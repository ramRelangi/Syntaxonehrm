import { NextRequest, NextResponse } from 'next/server';
import { getEmailSettingsAction, updateEmailSettingsAction } from '@/modules/communication/actions';
import { emailSettingsSchema } from '@/modules/communication/types';

// GET route to fetch current settings
export async function GET(request: NextRequest) {
    console.log('[Settings API - GET] Received request.');
    try {
        console.log('[Settings API - GET] Calling getEmailSettingsAction...');
        // Action returns settings without password
        const settings = await getEmailSettingsAction();
        console.log('[Settings API - GET] Retrieved safe settings from action:', settings ? JSON.stringify(settings) : 'null');

        // Return settings or an empty object if not configured yet
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
        console.log('[Settings API - PUT] Request body parsed:', JSON.stringify({ ...body, smtpPassword: '***' })); // Mask password in log

        // Validate the request body against the schema
        console.log('[Settings API - PUT] Validating request body...');
        const validation = emailSettingsSchema.safeParse(body);

        if (!validation.success) {
            console.error('[Settings API - PUT] Validation failed:', validation.error.flatten());
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
        }
        console.log('[Settings API - PUT] Validation successful.');

        // Call the server action to update settings
        console.log('[Settings API - PUT] Calling updateEmailSettingsAction...');
        const result = await updateEmailSettingsAction(validation.data);

        if (result.success && result.settings) {
             console.log('[Settings API - PUT] Settings updated via action. Responding with safe settings:', JSON.stringify(result.settings));
             return NextResponse.json(result.settings); // Action returns without password
        } else {
             console.error('[Settings API - PUT] Action failed:', result.errors);
             return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to save settings' }, { status: result.errors ? 400 : 500 });
        }

    } catch (error: any) {
        console.error('[Settings API - PUT] Error updating email settings:', error);
        if (error instanceof SyntaxError && error.message.includes('JSON')) {
            console.error('[Settings API - PUT] Invalid JSON payload.');
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
