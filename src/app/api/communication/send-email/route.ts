
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getEmailSettings } from '@/modules/communication/lib/mock-db';
import { sendEmailSchema, type SendEmailFormData } from '@/modules/communication/types';
import type { EmailSettings } from '@/modules/communication/types';

// Helper function to create transporter
function createTransporter(settings: EmailSettings): nodemailer.Transporter {
    console.log(`[Send Email - createTransporter] Creating transporter with settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser}, secure=${settings.smtpSecure}`);
    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost,
        port: settings.smtpPort,
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPassword,
        },
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 15000,   // 15 seconds
        socketTimeout: 15000,     // 15 seconds
        logger: process.env.NODE_ENV === 'development', // Log only in dev
        debug: process.env.NODE_ENV === 'development',  // Debug only in dev
    };

    // Auto-configure security based on standard ports
    if (settings.smtpPort === 465) {
        transportOptions.secure = true; // SSL/TLS
        console.log('[Send Email - createTransporter] Using secure=true for port 465');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // STARTTLS
        transportOptions.requireTLS = true;
        console.log('[Send Email - createTransporter] Using secure=false, requireTLS=true for port 587');
    } else {
        // For non-standard ports, rely on the 'smtpSecure' setting from DB
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Send Email - createTransporter] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }

    return nodemailer.createTransport(transportOptions);
}


export async function POST(request: NextRequest) {
  console.log('[Send Email API] Received POST request.');
  let settings: EmailSettings | null = null;
  try {
    // 1. Get Email Settings
    console.log('[Send Email API] Attempting to retrieve email settings from mock DB...');
    settings = getEmailSettings(); // This function already logs internally
    console.log('[Send Email API] Retrieved settings from getEmailSettings:', settings ? JSON.stringify(settings) : 'null'); // Log what was actually returned

    // 2. Validate Settings Retrieved by THIS Request
    if (!settings || !settings.smtpHost || !settings.fromEmail || !settings.smtpUser || !settings.smtpPassword || !(settings.smtpPort > 0) ) {
      console.error('[Send Email API] Email settings check failed within this request. Settings are considered unconfigured.');
      console.error(`[Send Email API] Validation Failure Details: settings=${!!settings}, host=${!!settings?.smtpHost}, from=${!!settings?.fromEmail}, user=${!!settings?.smtpUser}, pass=${!!settings?.smtpPassword}, port=${settings?.smtpPort}`);
      return NextResponse.json({ error: 'Configuration Error', message: 'Email sending is not configured. Please set up SMTP details in Communication Settings.' }, { status: 503 }); // 503 Service Unavailable
    }
    console.log('[Send Email API] Settings validation passed within this request. Proceeding...');


    // 3. Parse and Validate Request Body
    console.log('[Send Email API] Parsing request body...');
    const body = await request.json();
    console.log('[Send Email API] Request body parsed:', body);
    const validation = sendEmailSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Send Email API] Invalid input:', validation.error.errors);
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }
    console.log('[Send Email API] Input validation passed.');

    const { to, subject, body: emailBody } = validation.data;

    // 4. Create Nodemailer Transporter
     console.log(`[Send Email API] Creating transporter for ${settings.smtpHost}:${settings.smtpPort}`);
    const transporter = createTransporter(settings);

    // 5. Define Mail Options
    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: to,
      subject: subject,
      // Use 'text' for plain text, 'html' for HTML content
      // Basic detection: If body looks like HTML, send as HTML
      [emailBody.trim().startsWith('<') && emailBody.trim().endsWith('>') ? 'html' : 'text']: emailBody,
    };
     console.log('[Send Email API] Mail options prepared:', JSON.stringify(mailOptions, null, 2)); // Log mail options (excluding body for brevity if needed)

    // 6. Send Mail
    console.log(`[Send Email API] Attempting to send email to ${to} via ${settings.smtpHost}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('[Send Email API] Email sent successfully:', info.messageId);

    return NextResponse.json({ message: 'Email sent successfully', messageId: info.messageId }, { status: 200 });

  } catch (error: any) {
    console.error('[Send Email API] Error during processing:', error);

    // Determine appropriate error response
    let errorMessage = 'Failed to send email.';
    let statusCode = 500; // Default to Internal Server Error

     if (error instanceof SyntaxError && error.message.includes('JSON')) {
         errorMessage = 'Invalid request format (JSON expected).';
         statusCode = 400;
     } else if (error.code) { // Nodemailer/network errors often have codes
        switch (error.code) {
            case 'EAUTH':
                errorMessage = 'Authentication failed. Check SMTP username/password in settings.';
                statusCode = 502; // Bad Gateway (upstream auth failed)
                break;
            case 'ECONNREFUSED':
                 errorMessage = `Connection refused by SMTP server (${settings?.smtpHost}:${settings?.smtpPort}). Check host/port/firewall.`;
                 statusCode = 502;
                 break;
             case 'ETIMEDOUT':
                 errorMessage = 'Connection to SMTP server timed out. Check network/firewall.';
                 statusCode = 504; // Gateway Timeout
                 break;
              case 'EDNS': // Added DNS error code
                errorMessage = `Could not resolve SMTP host '${settings?.smtpHost}'. Check the hostname.`;
                statusCode = 502;
                break;
              case 'ESOCKET': // Added generic socket error
                errorMessage = `Socket error connecting to SMTP server. Check host/port/firewall/TLS settings. (Detail: ${error.message})`;
                statusCode = 502;
                break;
             // Add more specific Nodemailer error codes as needed
            default:
                errorMessage = `SMTP Error: ${error.message}`;
        }
     } else if (error.responseCode) { // SMTP response errors
         errorMessage = `SMTP Server Error (${error.responseCode}): ${error.message}`;
         statusCode = 502;
     } else if (error.message?.includes('Email sending is not configured')) {
        statusCode = 503; // Service Unavailable
        errorMessage = error.message;
     } else {
        // General error
        errorMessage = error.message || 'An unknown error occurred while sending the email.';
     }


    console.error(`[Send Email API] Responding with error - Status: ${statusCode}, Message: ${errorMessage}`);
    return NextResponse.json({ error: 'Email Sending Error', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
