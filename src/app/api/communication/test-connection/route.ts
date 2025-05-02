
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';

// Define admin email - fetch from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'; // Fallback for local dev

// Function to send notification email
async function sendAdminNotification(settings: EmailSettings | null, error: any) {
    if (!ADMIN_EMAIL) {
        console.error("Admin email not configured. Cannot send failure notification.");
        return;
    }

    // Use a default simple transport if settings are invalid/missing for the notification itself
    let notificationTransporter: nodemailer.Transporter;
    try {
        // Attempt to use provided settings first, might fail if they are the cause of the error
        if (settings && settings.smtpHost && settings.smtpPort && settings.smtpUser && settings.smtpPassword) {
             let transportOptions: nodemailer.TransportOptions = {
                 host: settings.smtpHost,
                 port: settings.smtpPort,
                 auth: { user: settings.smtpUser, pass: settings.smtpPassword },
                 connectionTimeout: 10000, // Shorter timeout for notification
             };
             if (settings.smtpPort === 465) { transportOptions.secure = true; }
             else if (settings.smtpPort === 587) { transportOptions.secure = false; transportOptions.requireTLS = true; }
             else { transportOptions.secure = settings.smtpSecure; }
             notificationTransporter = nodemailer.createTransport(transportOptions);
             // Quick verify, but don't block notification if verify fails (might be the issue!)
             await notificationTransporter.verify().catch(verifyErr => console.warn("Could not verify settings for sending admin notification:", verifyErr.message));
        } else {
            // Fallback: Use a simple, less secure method if main settings are bad/missing
            // This is a placeholder - ideally, use a separate, reliable email service for notifications
            console.warn("Main SMTP settings unavailable/invalid, using fallback transport for admin notification (this may fail).");
            // Example using ethereal.email for testing - replace in production
            // let testAccount = await nodemailer.createTestAccount();
            // notificationTransporter = nodemailer.createTransport({
            //     host: "smtp.ethereal.email",
            //     port: 587,
            //     secure: false,
            //     auth: { user: testAccount.user, pass: testAccount.pass },
            // });
            // Or use SendGrid/Mailgun API key directly if available as env vars
             throw new Error("Fallback email transport not implemented.");
        }

    } catch (setupError: any) {
         console.error("Failed to create transporter for admin notification:", setupError.message);
         return; // Cannot send notification
    }


    const mailOptions = {
        from: settings?.fromEmail || '"StreamlineHR Alert" <noreply@example.com>', // Use configured or fallback From
        to: ADMIN_EMAIL,
        subject: 'SMTP Connection Failure Alert - StreamlineHR',
        text: `An attempt to connect to the configured SMTP server failed.\n\nHost: ${settings?.smtpHost || 'N/A'}\nPort: ${settings?.smtpPort || 'N/A'}\nUser: ${settings?.smtpUser || 'N/A'}\n\nError Code: ${error.code || 'N/A'}\nError Message: ${error.message || 'Unknown error'}\n\nPlease check the communication settings in StreamlineHR.`,
        html: `<p>An attempt to connect to the configured SMTP server failed.</p>
               <p><strong>Host:</strong> ${settings?.smtpHost || 'N/A'}<br/>
               <strong>Port:</strong> ${settings?.smtpPort || 'N/A'}<br/>
               <strong>User:</strong> ${settings?.smtpUser || 'N/A'}</p>
               <p><strong>Error Code:</strong> ${error.code || 'N/A'}<br/>
               <strong>Error Message:</strong> ${error.message || 'Unknown error'}</p>
               <p>Please check the communication settings in StreamlineHR.</p>`,
    };

    try {
        console.log(`Sending failure notification to ${ADMIN_EMAIL}...`);
        let info = await notificationTransporter.sendMail(mailOptions);
        console.log('Admin notification email sent: %s', info.messageId);
         // Log Ethereal URL if testing
         // if (notificationTransporter.options.host === 'smtp.ethereal.email') {
         //    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
         // }
    } catch (sendError) {
        console.error('Error sending admin notification email:', sendError);
    }
}


export async function POST(request: NextRequest) {
  let settings: EmailSettings | null = null; // Define settings outside try for use in catch/finally
  try {
    const body = await request.json();
    console.log('[Test Connection] Received request with body:', body); // Log received data

    // Validate the provided settings against the schema
    const validation = emailSettingsSchema.safeParse(body);

    if (!validation.success) {
      console.error('[Test Connection] Invalid input:', validation.error.errors);
      return NextResponse.json({ error: 'Invalid input', message: 'SMTP settings are incomplete or invalid.', details: validation.error.errors }, { status: 400 });
    }

    settings = validation.data; // Assign validated data
    console.log(`[Test Connection] Using validated settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser}, secure=${settings.smtpSecure}`);

    // --- Adjust transport options based on port ---
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
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
        console.log('[Test Connection] Configuring for Port 465 (SSL/TLS)');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // STARTTLS happens after connection
        transportOptions.requireTLS = true; // Force STARTTLS upgrade
        console.log('[Test Connection] Configuring for Port 587 (STARTTLS)');
    } else {
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Test Connection] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }

    const transporter = nodemailer.createTransport(transportOptions);

    console.log('[Test Connection] Attempting transporter.verify()...');
    await transporter.verify();
    console.log('[Test Connection] SMTP connection verified successfully.');

    return NextResponse.json({ message: 'Connection successful' }, { status: 200 });

  } catch (error: any) {
    console.error('[Test Connection] Error:', error); // Log the full error object

    // Determine host/port for error message, using fallbacks
    const host = settings?.smtpHost ?? 'the specified host';
    const port = settings?.smtpPort ?? 'the specified port';

    let errorMessage = `Failed to connect to SMTP server (${host}:${port}).`;
    let statusCode = 500; // Default to Internal Server Error
    let details = error.message || 'Unknown error during connection test.';

    // Handle specific Nodemailer/network errors
    if (error.code) {
       switch (error.code) {
           case 'ESOCKET':
               if (error.message?.includes('wrong version number')) {
                   errorMessage = `SSL/TLS handshake failed with ${host}:${port}. The server might be expecting a different security protocol (SSL/TLS vs STARTTLS) for this port. Check port and 'Use Encryption' settings.`;
                   statusCode = 400;
               } else {
                    errorMessage = `Socket error connecting to ${host}:${port}. Check host/port/firewall.`;
                    statusCode = 400;
               }
               break;
           case 'ECONNREFUSED':
               errorMessage = `Connection refused by ${error.address || host}:${error.port || port}. Check host, port, and firewall settings.`;
               statusCode = 400;
               break;
           case 'ETIMEDOUT':
           case 'ESOCKETTIMEDOUT':
               errorMessage = 'Connection timed out. Check network connectivity, firewall, host, and port.';
               statusCode = 408;
               break;
           case 'EAUTH':
               errorMessage = 'Authentication failed. Check username and password.';
               statusCode = 401;
               break;
           case 'ENOTFOUND':
               errorMessage = `Could not resolve hostname '${host}'. Check the SMTP host address.`;
               statusCode = 400;
               break;
           case 'EHOSTUNREACH':
               errorMessage = `Host unreachable '${host}'. Check network or host address.`;
               statusCode = 400;
               break;
            case 'ECONNECTION':
                errorMessage = `Could not establish connection to ${host}:${port}. Check host, port, and network.`;
                statusCode = 400;
                break;
           default:
               errorMessage += ` Error code: ${error.code}.`;
       }
        details = error.message || details;
    } else if (error.responseCode) {
         // Handle SMTP response codes after connection
         switch (error.responseCode) {
             case 535:
                 errorMessage = 'Authentication failed (SMTP 535). Check username and password.';
                 statusCode = 401;
                 break;
             case 550:
                 errorMessage = `Mailbox unavailable or access denied (SMTP 550). Check 'From' address or server permissions.`;
                 statusCode = 400;
                 break;
              case 501:
                 errorMessage = `Syntax error in parameters or arguments (SMTP 501). Review settings.`;
                 statusCode = 400;
                 break;
             default:
                 errorMessage += ` SMTP Response Code: ${error.responseCode}.`;
         }
         details = error.message || details;
    } else if (error instanceof SyntaxError) {
        errorMessage = 'Invalid request format received.';
        statusCode = 400;
        details = error.message;
    }

    errorMessage += ` (Details: ${details})`;

    // --- Send notification on failure ---
    // Check if the error indicates a connection/auth failure (not just bad input)
    if (statusCode >= 400 && statusCode !== 400 && !(error instanceof SyntaxError)) { // Avoid notifying for simple input errors
        await sendAdminNotification(settings, error);
    }
    // ---------------------------------

    console.error(`[Test Connection] Responding with status ${statusCode}: ${errorMessage}`);
    return NextResponse.json({ error: 'Connection failed', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}

