import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
// Import the DB function to get settings, not the action
import { getEmailSettings } from '@/modules/communication/lib/db';
import { sendEmailSchema, type SendEmailFormData } from '@/modules/communication/types';
import type { EmailSettings } from '@/modules/communication/types';
// Placeholder for template compilation if using templates
// import { compileTemplate } from '@/lib/template-engine'; // Assuming a template engine exists

// Helper function to create transporter (can be shared or kept here)
function createTransporter(settings: EmailSettings): nodemailer.Transporter {
    console.log(`[Send Email API - createTransporter] Creating transporter with settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser ? '***' : 'null'}, secure=${settings.smtpSecure}`);
    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost,
        port: settings.smtpPort,
        auth: {
            user: settings.smtpUser,
            // IMPORTANT: Password should be retrieved securely (e.g., from secrets manager or decrypted)
            // For now, assuming it's available decrypted in the settings object from DB
            pass: settings.smtpPassword,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
        console.log('[Send Email API - createTransporter] Using secure=true for port 465');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
        console.log('[Send Email API - createTransporter] Using secure=false, requireTLS=true for port 587');
    } else {
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Send Email API - createTransporter] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }

    return nodemailer.createTransport(transportOptions);
}


export async function POST(request: NextRequest) {
  console.log('[Send Email API] Received POST request.');
  let settings: EmailSettings | null = null;
  try {
    // 1. Get Email Settings from Database
    console.log('[Send Email API] Attempting to retrieve email settings from DB...');
    settings = await getEmailSettings(); // Fetch from DB
    console.log('[Send Email API] Settings retrieved from DB:', settings ? JSON.stringify({ ...settings, smtpPassword: '***' }) : 'null'); // Mask password

    // 2. Validate Settings Retrieved by THIS Request
     const isSettingsValid =
         settings && settings.smtpHost && settings.smtpPort && settings.smtpUser &&
         settings.smtpPassword && // Password must exist (even if empty string initially from DB before encryption)
         settings.fromEmail && settings.fromName;

     console.log(`[Send Email API] Checking retrieved settings validity: ${isSettingsValid}`);

    if (!isSettingsValid) {
      console.error('[Send Email API] Settings validation failed. Settings are null, incomplete, or invalid in DB.');
       return NextResponse.json({ error: 'Configuration Error', message: 'Email sending is not configured or settings are incomplete. Please check Communication Settings.' }, { status: 503 });
    }
    console.log('[Send Email API] Settings retrieved and validated successfully.');

    // 3. Parse and Validate Request Body
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
    // If using templates:
    // const templateId = body.templateId; // Assuming templateId is passed in request
    // if (templateId) {
    //    const template = await getTemplateById(templateId); // Fetch from DB
    //    if (!template) throw new Error ('Template not found');
    //    const context = body.context || {}; // Get context variables from request
    //    finalSubject = compileTemplate(template.subject, context);
    //    finalBody = compileTemplate(template.body, context);
    // } else {
       const finalSubject = subject;
       const finalBody = emailBody;
    // }
    // --- End Placeholder ---


    // 4. Create Nodemailer Transporter using DB settings
    console.log(`[Send Email API] Creating transporter for ${settings.smtpHost}:${settings.smtpPort}`);
    const transporter = createTransporter(settings); // Pass DB settings

    // 5. Define Mail Options
    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: to,
      subject: finalSubject, // Use potentially compiled subject
      // Use 'text' for plain text, 'html' for HTML content
      [finalBody.trim().startsWith('<') && finalBody.trim().endsWith('>') ? 'html' : 'text']: finalBody, // Use potentially compiled body
    };
     console.log('[Send Email API] Mail options prepared:', JSON.stringify({ ...mailOptions, from: mailOptions.from }, null, 2)); // Log mail options

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
     } else if (error.message?.includes('Email sending is not configured')) {
         statusCode = 503;
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
                errorMessage = `Socket error connecting to SMTP server. Check host/port/firewall/TLS settings. (Detail: ${error.message})`;
                 statusCode = 502;
                 break;
             // Add more specific Nodemailer error codes as needed
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
