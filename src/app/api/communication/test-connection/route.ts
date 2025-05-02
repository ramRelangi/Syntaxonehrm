import { NextRequest, NextResponse } from 'next/server';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';
import { testSmtpConnectionAction } from '@/modules/communication/actions'; // Import the server action

// Import the admin notification helper function if needed separately
// import { sendAdminNotification } from './notificationHelper'; // Assuming you create this file

// Define admin email - fetch from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'; // Fallback for local dev

// Function to send notification email (Keep or move to a helper)
async function sendAdminNotification(settings: EmailSettings | null, error: any) {
    // ... (implementation remains the same as before, consider moving to helper)
     if (!ADMIN_EMAIL) {
        console.error("Admin email not configured. Cannot send failure notification.");
        return;
    }
     // Placeholder for Nodemailer setup and sending logic
     console.log(`[Notification] Simulating sending notification to ${ADMIN_EMAIL} about error: ${error.message}`);
     // In real code:
     // 1. Setup Nodemailer transporter (potentially fallback if main settings are bad)
     // 2. Construct email content
     // 3. Send email
}


export async function POST(request: NextRequest) {
  let settings: EmailSettings | null = null; // Define settings outside try for use in catch/finally
  try {
    const body = await request.json();
    console.log('[Test Connection API] Received request with body:', body ? JSON.stringify({...body, smtpPassword: '***'}) : 'empty'); // Log received data safely

    // Validate the provided settings against the schema
    const validation = emailSettingsSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Test Connection API] Invalid input:', validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', message: 'SMTP settings are incomplete or invalid.', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    settings = validation.data; // Assign validated data
    console.log(`[Test Connection API] Using validated settings for action: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser}, secure=${settings.smtpSecure}`);

    // Call the server action to perform the test
    const result = await testSmtpConnectionAction(settings);

    if (result.success) {
        console.log('[Test Connection API] Action reported success.');
        return NextResponse.json({ message: result.message }, { status: 200 });
    } else {
        console.error(`[Test Connection API] Action reported failure: ${result.message}`);
        // Determine appropriate status code based on the error message if needed
        let statusCode = 400; // Default to Bad Request for connection issues
        if (result.message.includes('Authentication failed')) {
             statusCode = 401; // Unauthorized
        } else if (result.message.includes('timed out')) {
            statusCode = 408; // Request Timeout
        }
         // --- Send notification on failure ---
         // Send notification based on the action's result
         await sendAdminNotification(settings, { message: result.message }); // Pass simplified error object
         // ---------------------------------
        return NextResponse.json({ error: 'Connection failed', message: result.message, details: result.message }, { status: statusCode });
    }

  } catch (error: any) {
    // Catch errors from request parsing or unexpected issues
    console.error('[Test Connection API] Unexpected Error:', error);
     let errorMessage = 'An unexpected error occurred during the connection test.';
     let statusCode = 500;

     if (error instanceof SyntaxError) {
        errorMessage = 'Invalid request format received.';
        statusCode = 400;
    } else {
        errorMessage = error.message || errorMessage;
    }

    // Optionally send notification for unexpected errors too
    await sendAdminNotification(settings, error);

    console.error(`[Test Connection API] Responding with status ${statusCode}: ${errorMessage}`);
    return NextResponse.json({ error: 'Connection Test Error', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
