
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
        const validation = emailSettingsSchema.safeParse(body); // Validates the full schema, including tenantId

        if (!validation.success) {
            const flatErrors = validation.error.flatten();
            // Attempt to get a more specific message from Zod's field errors
            const fieldErrorValues = Object.values(flatErrors.fieldErrors);
            const firstFieldMessage = fieldErrorValues.length > 0 && fieldErrorValues[0].length > 0 ? fieldErrorValues[0][0] : undefined;
            const genericMessage = "Invalid input";
            const messageToReturn = firstFieldMessage || genericMessage;

            console.error('[Settings API - PUT] Validation failed:', flatErrors);
            return NextResponse.json({
                error: messageToReturn, // Use more specific error if available
                message: messageToReturn, // Keep for compatibility if form uses error.message
                details: flatErrors.fieldErrors
            }, { status: 400 });
        }
        console.log('[Settings API - PUT] Validation successful.');

        // Call the server action to update settings
        // Note: validation.data here includes tenantId, but updateEmailSettingsAction expects it to be omitted
        // and derives tenantId from session. This might be a mismatch if this route is hit.
        // For direct server action calls, tenantId is not in the form data.
        const { tenantId: extractedTenantId, ...actionData } = validation.data;
        console.log(`[Settings API - PUT] Calling updateEmailSettingsAction for tenant (from body): ${extractedTenantId}...`);
        // This call path is problematic if the action is also called directly from client components.
        // Prefer actions to derive tenantId consistently.
        // For now, we'll assume if this API route is hit, body.tenantId *should* be valid
        // but the action will re-derive it. This needs careful review if actions are also direct.
        const result = await updateEmailSettingsAction(actionData); // Pass data without tenantId

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
