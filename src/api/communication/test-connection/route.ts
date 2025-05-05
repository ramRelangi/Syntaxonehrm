import { NextRequest, NextResponse } from 'next/server';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';
import { testSmtpConnectionAction } from '@/modules/communication/actions'; // Import the server action

// Import the admin notification helper function if needed separately
// import { sendAdminNotification } from './notificationHelper'; // Assuming you create this file

// Define admin email - fetch from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'; // Fallback for local dev

// Function to send notification email (Keep or move to a helper)
async function sendAdminNotification(settings: Partial<EmailSettings> | null, error: any) {
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
  let settingsData: Partial<EmailSettings> | null = null; // Data received from request
  try {
    const body = await request.json();
    console.log('[Test Connection API] Received request with body:', body ? JSON.stringify({...body, smtpPassword: '***'}) : 'empty'); // Log received data safely

    // The validation and password handling logic is now primarily within the action.
    // We just pass the body data to the action.
    settingsData = body;

    // Call the server action to perform the test
    const result = await testSmtpConnectionAction(settingsData || {}); // Pass parsed body or empty object

    if (result.success) {
        console.log('[Test Connection API] Action reported success.');
        return NextResponse.json({ message: result.message }, { status: 200 });
    } else {
        console.error(`[Test Connection API] Action reported failure: ${result.message}`);
        // Use status code based on action's error message (if needed, action primarily returns message)
        let statusCode = 400; // Default to Bad Request
        if (result.message.includes('Authentication failed')) {
             statusCode = 401; // Unauthorized
        } else if (result.message.includes('timed out')) {
            statusCode = 408; // Request Timeout
        } else if (result.message.includes('Validation Error')) {
            statusCode = 400; // Bad Request for validation
        } else if (result.message.includes('Password missing')) {
            statusCode = 400; // Bad Request for missing password
        }
         // --- Send notification on failure ---
         // Send notification based on the action's result
         await sendAdminNotification(settingsData, { message: result.message }); // Pass simplified error object
         // ---------------------------------
        return NextResponse.json({ error: 'Connection failed', message: result.message, details: result.message }, { status: statusCode });
    }

  } catch (error: any) {
    // Catch errors from request parsing or unexpected issues in the API route itself
    console.error('[Test Connection API] Unexpected Error:', error);
     let errorMessage = 'An unexpected error occurred during the connection test.';
     let statusCode = 500;

     if (error instanceof SyntaxError && error.message.includes('JSON')) {
        errorMessage = 'Invalid request format received.';
        statusCode = 400;
    } else {
        errorMessage = error.message || errorMessage;
    }

    // Optionally send notification for unexpected errors too
    await sendAdminNotification(settingsData, error);

    console.error(`[Test Connection API] Responding with status ${statusCode}: ${errorMessage}`);
    return NextResponse.json({ error: 'Connection Test Error', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}

