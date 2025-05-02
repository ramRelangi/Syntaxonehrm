
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';

export async function POST(request: NextRequest) {
  let settings: EmailSettings | null = null; // Define settings outside try for use in catch
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
        // Add reasonable timeout options
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 15000,   // 15 seconds
        socketTimeout: 15000,     // 15 seconds
        // Enable logging for debugging nodemailer issues
        logger: process.env.NODE_ENV === 'development', // Only log in dev
        debug: process.env.NODE_ENV === 'development', // Only debug in dev
    };

    // Specific configurations for common ports
    if (settings.smtpPort === 465) {
        transportOptions.secure = true; // Use SSL/TLS from the start
        console.log('[Test Connection] Configuring for Port 465 (SSL/TLS)');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // STARTTLS happens after connection
        transportOptions.requireTLS = true; // Force STARTTLS upgrade
        console.log('[Test Connection] Configuring for Port 587 (STARTTLS)');
    } else {
        // For other ports, rely on the 'smtpSecure' value from the form, but log a warning
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Test Connection] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }
     // Allow overriding TLS options if needed for specific servers (e.g., self-signed certs - USE WITH CAUTION)
     // transportOptions.tls = {
     //    rejectUnauthorized: process.env.NODE_ENV !== 'development' // Allow self-signed in dev ONLY
     // };
    // --- End transport option adjustment ---


    // Create a Nodemailer transporter object using the adjusted options
    const transporter = nodemailer.createTransport(transportOptions);


    console.log('[Test Connection] Attempting transporter.verify()...');
    // Verify connection configuration
    await transporter.verify();
    console.log('[Test Connection] SMTP connection verified successfully.');

    return NextResponse.json({ message: 'Connection successful' }, { status: 200 });

  } catch (error: any) {
    console.error('[Test Connection] Error:', error); // Log the full error object

    // Determine host/port for error message, using fallbacks
    const host = settings?.smtpHost ?? 'the specified host';
    const port = settings?.smtpPort ?? 'the specified port';

    // Provide more specific error messages based on common nodemailer error codes
    let errorMessage = `Failed to connect to SMTP server (${host}:${port}).`;
    let statusCode = 500; // Default to Internal Server Error
    let details = error.message || 'Unknown error during connection test.'; // Default details

    // Check for specific SSL/TLS errors
    if (error.code === 'ESOCKET' && error.message?.includes('wrong version number')) {
        errorMessage = `SSL/TLS handshake failed with ${host}:${port}. The server might be expecting a different security protocol (SSL/TLS vs STARTTLS) for this port. Check port and 'Use Encryption' settings.`;
        statusCode = 400; // Bad request (likely configuration error)
        details = error.message;
    } else if (error.code) {
       // Handle other common error codes
       switch (error.code) {
           case 'ECONNREFUSED':
               errorMessage = `Connection refused by ${error.address || host}:${error.port || port}. Check host, port, and firewall settings.`;
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
               errorMessage = `Could not resolve hostname '${host}'. Check the SMTP host address.`;
               statusCode = 400; // Bad request
               break;
           case 'EHOSTUNREACH':
               errorMessage = `Host unreachable '${host}'. Check network or host address.`;
               statusCode = 400;
               break;
            case 'ECONNECTION': // Generic connection issue
                errorMessage = `Could not establish connection to ${host}:${port}. Check host, port, and network.`;
                statusCode = 400;
                break;
           default:
               errorMessage += ` Error code: ${error.code}.`;
               details = error.message || details;
       }
    } else if (error.responseCode) {
         // Handle SMTP response codes after connection is established
         switch (error.responseCode) {
             case 535:
                 errorMessage = 'Authentication failed (SMTP 535). Check username and password.';
                 statusCode = 401; // Unauthorized
                 break;
             case 550:
                 errorMessage = `Mailbox unavailable or access denied (SMTP 550). Check 'From' address or server permissions.`;
                 statusCode = 400;
                 break;
              case 501:
                 errorMessage = `Syntax error in parameters or arguments (SMTP 501). Review settings.`;
                 statusCode = 400;
                 break;
             // Add more SMTP codes as needed
             default:
                 errorMessage += ` SMTP Response Code: ${error.responseCode}.`;
                 details = error.message || details;
         }
    } else if (error instanceof SyntaxError) {
        // Handle potential JSON parsing errors if the request body was invalid
        errorMessage = 'Invalid request format received.';
        statusCode = 400;
        details = error.message;
    }

    // Include the original error message for debugging if available and not already set
    errorMessage += ` (Details: ${details})`;

    console.error(`[Test Connection] Responding with status ${statusCode}: ${errorMessage}`);
    // Return status code based on error type, ensuring JSON format
    // Using error.toString() for details might provide more context in some cases.
    return NextResponse.json({ error: 'Connection failed', message: errorMessage, details: error.toString() }, { status: statusCode });
  }
}
