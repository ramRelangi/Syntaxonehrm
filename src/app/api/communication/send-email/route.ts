
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getEmailSettings } from '@/modules/communication/lib/mock-db';
import { sendEmailSchema, type SendEmailFormData } from '@/modules/communication/types';
import type { EmailSettings } from '@/modules/communication/types';

// Helper function to create transporter
function createTransporter(settings: EmailSettings): nodemailer.Transporter {
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
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // STARTTLS
        transportOptions.requireTLS = true;
    } else {
        // For non-standard ports, rely on the 'smtpSecure' setting from DB
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Send Email] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }

    return nodemailer.createTransport(transportOptions);
}


export async function POST(request: NextRequest) {
  let settings: EmailSettings | null = null;
  try {
    // 1. Get Email Settings
    settings = getEmailSettings();
    if (!settings || !settings.smtpHost || !settings.fromEmail) {
      console.error('[Send Email] Email settings are not configured.');
      return NextResponse.json({ error: 'Configuration Error', message: 'Email sending is not configured. Please set up SMTP details in Communication Settings.' }, { status: 503 }); // 503 Service Unavailable
    }

    // 2. Parse and Validate Request Body
    const body = await request.json();
    const validation = sendEmailSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Send Email] Invalid input:', validation.error.errors);
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const { to, subject, body: emailBody } = validation.data;

    // 3. Create Nodemailer Transporter
     console.log(`[Send Email] Creating transporter for ${settings.smtpHost}:${settings.smtpPort}`);
    const transporter = createTransporter(settings);

    // Optional: Verify connection before sending (can add overhead)
    // try {
    //     await transporter.verify();
    //     console.log("[Send Email] SMTP connection verified successfully.");
    // } catch (verifyError: any) {
    //     console.error("[Send Email] SMTP connection verification failed:", verifyError);
    //     return NextResponse.json({ error: 'Configuration Error', message: `Failed to connect to SMTP server: ${verifyError.message}` }, { status: 502 }); // 502 Bad Gateway
    // }

    // 4. Define Mail Options
    const mailOptions = {
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: to,
      subject: subject,
      // Use 'text' for plain text, 'html' for HTML content
      // Basic detection: If body looks like HTML, send as HTML
      [emailBody.trim().startsWith('<') && emailBody.trim().endsWith('>') ? 'html' : 'text']: emailBody,
    };

    // 5. Send Mail
    console.log(`[Send Email] Attempting to send email to ${to} via ${settings.smtpHost}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('[Send Email] Email sent successfully:', info.messageId);
    // console.log('[Send Email] Preview URL (Ethereal): %s', nodemailer.getTestMessageUrl(info)); // Only if using Ethereal

    return NextResponse.json({ message: 'Email sent successfully', messageId: info.messageId }, { status: 200 });

  } catch (error: any) {
    console.error('[Send Email] Error:', error);

    // Determine appropriate error response
    let errorMessage = 'Failed to send email.';
    let statusCode = 500; // Default to Internal Server Error

     if (error instanceof SyntaxError) {
         errorMessage = 'Invalid request format.';
         statusCode = 400;
     } else if (error.code) { // Nodemailer/network errors often have codes
        switch (error.code) {
            case 'EAUTH':
                errorMessage = 'Authentication failed. Check SMTP username/password in settings.';
                statusCode = 502; // Bad Gateway (upstream auth failed)
                break;
            case 'ECONNREFUSED':
                 errorMessage = 'Connection refused by SMTP server. Check host/port/firewall.';
                 statusCode = 502;
                 break;
             case 'ETIMEDOUT':
                 errorMessage = 'Connection to SMTP server timed out. Check network/firewall.';
                 statusCode = 504; // Gateway Timeout
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


    return NextResponse.json({ error: 'Email Sending Error', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
