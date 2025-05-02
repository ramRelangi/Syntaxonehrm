
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { emailSettingsSchema } from '@/modules/communication/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('[Test Connection] Received request with body:', body); // Log received data

    // Validate the provided settings against the schema
    const validation = emailSettingsSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Test Connection] Invalid input:', validation.error.errors);
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const settings = validation.data;
    console.log(`[Test Connection] Using validated settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser}, secure=${settings.smtpSecure}`);

    // Create a Nodemailer transporter object using the validated settings
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure, // Use the boolean value directly
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
      // Add reasonable timeout options
      connectionTimeout: 15000, // 15 seconds
      greetingTimeout: 15000,   // 15 seconds
      socketTimeout: 15000,     // 15 seconds
      // Enable logging for debugging nodemailer issues
      logger: true,
      debug: true, // Enable debug output from nodemailer
      // Explicit TLS options (often helpful for debugging)
      tls: {
        // Do not fail on invalid certs (USE WITH CAUTION - ONLY FOR TESTING if necessary)
        // rejectUnauthorized: false
      }
    });

    console.log('[Test Connection] Attempting transporter.verify()...');
    // Verify connection configuration
    await transporter.verify();
    console.log('[Test Connection] SMTP connection verified successfully.');

    return NextResponse.json({ message: 'Connection successful' }, { status: 200 });

  } catch (error: any) {
    console.error('[Test Connection] Error:', error); // Log the full error object

    // Provide more specific error messages based on common nodemailer error codes
    let errorMessage = `Failed to connect to SMTP server (${settings.smtpHost}:${settings.smtpPort}).`;
    let statusCode = 500; // Default to Internal Server Error

    if (error.code) {
       switch (error.code) {
           case 'ECONNREFUSED':
               errorMessage = `Connection refused by ${error.address || settings.smtpHost}:${error.port || settings.smtpPort}. Check host, port, and firewall settings.`;
               statusCode = 400; // Bad request (likely wrong host/port)
               break;
           case 'ETIMEDOUT':
           case 'ESOCKETTIMEDOUT':
               errorMessage = 'Connection timed out. Check network connectivity, firewall, host, and port.';
               statusCode = 408; // Request Timeout
               break;
           case 'EAUTH': // General authentication error
               errorMessage = 'Authentication failed. Check username and password.';
               statusCode = 401; // Unauthorized
               break;
           case 'ENOTFOUND':
               errorMessage = `Could not resolve hostname '${settings.smtpHost}'. Check the SMTP host address.`;
               statusCode = 400; // Bad request
               break;
           case 'EHOSTUNREACH':
               errorMessage = `Host unreachable '${settings.smtpHost}'. Check network or host address.`;
               statusCode = 400;
               break;
           default:
               errorMessage += ` Error code: ${error.code}.`;
       }
    } else if (error.responseCode) {
         // Handle SMTP response codes
         switch (error.responseCode) {
             case 535:
                 errorMessage = 'Authentication failed (SMTP 535). Check username and password.';
                 statusCode = 401; // Unauthorized
                 break;
             case 550:
                 errorMessage = `Mailbox unavailable (SMTP 550). Might indicate issues with 'From' address or server config.`;
                 statusCode = 400;
                 break;
              case 501:
                 errorMessage = `Syntax error in parameters or arguments (SMTP 501). Review settings.`;
                 statusCode = 400;
                 break;
             // Add more SMTP codes as needed
             default:
                 errorMessage += ` SMTP Response Code: ${error.responseCode}.`;
         }
    }

    // Include the original error message for debugging
    errorMessage += ` (Details: ${error.message || 'Unknown error'})`;

    console.error(`[Test Connection] Responding with status ${statusCode}: ${errorMessage}`);
    // Return status code based on error type
    return NextResponse.json({ error: 'Connection failed', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
