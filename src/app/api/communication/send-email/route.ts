import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
// Import the DB function to get settings, not the action
import { getEmailSettings as dbGetEmailSettings } from '@/modules/communication/lib/db';
import { sendEmailSchema, type SendEmailFormData } from '@/modules/communication/types';
import type { EmailSettings } from '@/modules/communication/types';
import { getTenantIdFromSession } from '@/modules/auth/actions'; // Import session helper

// Helper function to create transporter (can be shared or kept here)
function createTransporter(settings: EmailSettings): nodemailer.Transporter {
    console.log(`[Send Email API - createTransporter] Creating transporter with settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser ? '***' : 'null'}, secure=${settings.smtpSecure}`);
    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost,
        port: settings.smtpPort,
        auth: {
            user: settings.smtpUser,
            // IMPORTANT: Password must be the decrypted one fetched from the DB
            pass: settings.smtpPassword,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    // Automatically configure secure/requireTLS based on common ports
    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
        console.log('[Send Email API - createTransporter] Using secure=true for port 465');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // Often needs STARTTLS
        transportOptions.requireTLS = true; // Explicitly require STARTTLS
        console.log('[Send Email API - createTransporter] Using secure=false, requireTLS=true for port 587');
    } else {
        // For other ports, rely on the saved smtpSecure value, but warn if ambiguous
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Send Email API - createTransporter] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}. Verify provider requirements.`);
        // If secure is false for non-587 ports, TLS might still be required/used implicitly by Nodemailer
        // but explicit requireTLS is usually for port 587 STARTTLS.
    }


    return nodemailer.createTransport(transportOptions);
}


export async function POST(request: NextRequest) {
  console.log('[Send Email API] Received POST request.');
  let settings: EmailSettings | null = null; // Hold fetched settings
  try {
    // 1. Get Tenant ID from session/authentication context
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) {
      console.error('[Send Email API] Unauthorized: Could not determine tenant ID from session.');
      return NextResponse.json({ error: 'Unauthorized', message: 'Unable to determine tenant context.' }, { status: 401 });
    }
    console.log(`[Send Email API] Processing request for tenant: ${tenantId}`);


    // 2. Get Email Settings from Database for the specific tenant
    console.log(`[Send Email API] Attempting to retrieve email settings from DB for tenant ${tenantId}...`);
    settings = await dbGetEmailSettings(tenantId); // Fetch from DB (includes decrypted password)
    console.log('[Send Email API] Settings retrieved from DB:', settings ? JSON.stringify({ ...settings, smtpPassword: '***' }) : 'null'); // Mask password

    // 3. Validate Settings Retrieved from DB
    // Check if settings exist and have essential fields (including the decrypted password)
     const isSettingsValid =
         settings && settings.smtpHost && settings.smtpPort && settings.smtpUser &&
         settings.smtpPassword && // Password MUST exist and be non-empty after decryption
         settings.fromEmail && settings.fromName;

     console.log(`[Send Email API] Checking retrieved DB settings validity: ${isSettingsValid}`);

    if (!isSettingsValid) {
      console.error('[Send Email API] Settings validation failed. Settings are null, incomplete, or invalid in DB for tenant', tenantId);
       // Return 503 Service Unavailable as the service isn't configured properly
       return NextResponse.json({ error: 'Configuration Error', message: 'Email sending is not configured or settings are incomplete/invalid. Please check Communication Settings.' }, { status: 503 });
    }
    console.log('[Send Email API] Settings retrieved and validated successfully.');


    // 4. Parse and Validate Request Body (To, Subject, Body)
    console.log('[Send Email API] Parsing request body...');
    const body = await request.json();
    console.log('[Send Email API] Request body parsed:', body);
    const validation = sendEmailSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Send Email API] Invalid input:', validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }
    console.log('[Send Email API] Input validation passed.');

    const { to, subject, body: emailBody } = validation.data;

    // --- Template Processing Placeholder ---
    // (Keep existing template logic if you implement it)
    // const templateId = body.templateId;
    // if (templateId) { ... } else { ... }
    const finalSubject = subject;
    const finalBody = emailBody;
    // --- End Placeholder ---


    // 5. Create Nodemailer Transporter using DB settings
    console.log(`[Send Email API] Creating transporter for ${settings.smtpHost}:${settings.smtpPort}`);
    const transporter = createTransporter(settings); // Pass DB settings (with decrypted password)

    // 6. Define Mail Options using settings from DB
    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`, // Use fromName and fromEmail from DB settings
      to: to,
      subject: finalSubject,
      // Use 'text' for plain text, 'html' for HTML content
      [finalBody.trim().startsWith('<') && finalBody.trim().endsWith('>') ? 'html' : 'text']: finalBody,
    };
     console.log('[Send Email API] Mail options prepared:', JSON.stringify({ ...mailOptions, from: mailOptions.from }, null, 2)); // Log mail options

    // 7. Send Mail
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
     } else if (error.message?.includes('Email sending is not configured') || error.message?.includes('settings are incomplete')) {
         statusCode = 503; // Service Unavailable
         errorMessage = error.message;
     } else if (error.message?.includes('Unauthorized') || error.message?.includes('tenant context')) {
        statusCode = 401;
        errorMessage = error.message;
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
             case 'ESOCKETTIMEDOUT':
                 errorMessage = 'Connection to SMTP server timed out. Check network/firewall.';
                 statusCode = 504; // Gateway Timeout
                 break;
              case 'EDNS':
              case 'ENOTFOUND':
                errorMessage = `Could not resolve SMTP host '${settings?.smtpHost}'. Check the hostname.`;
                statusCode = 502;
                break;
              case 'ESOCKET':
                 // Check for specific TLS/SSL errors within the message
                 if (error.message?.includes('wrong version number')) {
                     errorMessage = `SSL/TLS Handshake Error: Incorrect protocol version. Verify port (${settings?.smtpPort}) and encryption settings (Secure: ${settings?.smtpSecure}). Details: ${error.message}`;
                 } else {
                    errorMessage = `Socket error connecting to SMTP server. Check host/port/firewall/TLS settings. (Detail: ${error.message})`;
                 }
                 statusCode = 502;
                 break;
            default:
                errorMessage = `SMTP Error: ${error.message} (Code: ${error.code})`;
        }
     } else if (error.responseCode) { // SMTP response errors
         errorMessage = `SMTP Server Error (${error.responseCode}): ${error.message}`;
         statusCode = 502;
     } else {
        // General error
        errorMessage = error.message || 'An unknown error occurred while sending the email.';
     }


    console.error(`[Send Email API] Responding with error - Status: ${statusCode}, Message: ${errorMessage}`);
    return NextResponse.json({ error: 'Email Sending Error', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
