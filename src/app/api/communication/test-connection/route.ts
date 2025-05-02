
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { emailSettingsSchema } from '@/modules/communication/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Received test connection request with body:', body); // Log received data

    // Validate the provided settings against the schema
    const validation = emailSettingsSchema.safeParse(body);

    if (!validation.success) {
      console.error('Invalid test connection input:', validation.error.errors);
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const settings = validation.data;

    // Create a Nodemailer transporter object using the provided settings
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure, // true for 465, false for other ports (like 587 with STARTTLS)
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
      // Add timeout options if needed
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000, // 10 seconds
      socketTimeout: 10000, // 10 seconds
      // Add explicit TLS options if required by provider, e.g., ignore self-signed certs (NOT recommended for prod)
      // tls: {
      //   rejectUnauthorized: false
      // }
    });

    console.log('Attempting to verify SMTP connection...');
    // Verify connection configuration
    await transporter.verify();
    console.log('SMTP connection verified successfully.');

    return NextResponse.json({ message: 'Connection successful' }, { status: 200 });

  } catch (error: any) {
    console.error('Error testing SMTP connection:', error);
    // Provide a more specific error message if possible
    let errorMessage = 'Failed to connect to SMTP server. Check credentials, host, port, and security settings.';
    if (error.code === 'ECONNREFUSED') {
        errorMessage = `Connection refused by ${error.address}:${error.port}. Check host and port.`;
    } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timed out. Check network connectivity and firewall rules.';
    } else if (error.command === 'AUTH') {
        errorMessage = 'Authentication failed. Check username and password.';
    } else if (error.responseCode === 535) {
         errorMessage = 'Authentication failed (535). Check username and password.';
    }
    // Include the original error message for debugging if it exists
     errorMessage += ` (Error: ${error.message || 'Unknown error'})`;

    return NextResponse.json({ error: 'Connection failed', message: errorMessage, details: error.toString() }, { status: 500 });
  }
}
