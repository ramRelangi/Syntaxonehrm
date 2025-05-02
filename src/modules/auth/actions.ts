
'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db';
import { testDbConnection } from '@/lib/db'; // Import only the test function
import { getEmailSettings } from '@/modules/communication/lib/db'; // Import function to get settings
import type { EmailSettings } from '@/modules/communication/types'; // Import EmailSettings type
import { redirect } from 'next/navigation'; // Import redirect

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// Helper function to create transporter (similar to the one in communication module)
function createTransporter(settings: EmailSettings): nodemailer.Transporter {
    console.log(`[Auth Action - createTransporter] Creating transporter with settings: host=${settings.smtpHost}, port=${settings.smtpPort}, user=${settings.smtpUser ? '***' : 'null'}, secure=${settings.smtpSecure}`);
    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost,
        port: settings.smtpPort,
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPassword, // Assuming password from DB is decrypted/usable
        },
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development', // Log SMTP commands in development
        debug: process.env.NODE_ENV === 'development', // Log connection details in development
    };

    // Explicitly handle common ports 465 (SSL) and 587 (TLS)
    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
        console.log('[Auth Action - createTransporter] Using secure=true for port 465');
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false; // STARTTLS will be used automatically by Nodemailer
        transportOptions.requireTLS = true; // Often needed for port 587
        console.log('[Auth Action - createTransporter] Using secure=false, requireTLS=true for port 587');
    } else {
        // For other ports, rely on the 'smtpSecure' flag from settings
        transportOptions.secure = settings.smtpSecure;
        console.warn(`[Auth Action - createTransporter] Using provided 'secure' value (${settings.smtpSecure}) for non-standard port ${settings.smtpPort}.`);
    }


    return nodemailer.createTransport(transportOptions);
}

// Function to send the welcome email
async function sendWelcomeEmail(adminName: string, adminEmail: string, companyDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for domain ${companyDomain}.`);
    let settings: EmailSettings | null = null;
    try {
        console.log('[sendWelcomeEmail] Fetching email settings from DB...');
        settings = await getEmailSettings();

        // Log retrieved settings (mask password)
        console.log('[sendWelcomeEmail] Retrieved settings:', settings ? JSON.stringify({ ...settings, smtpPassword: '***' }) : 'null');

        // Validate essential settings
        const isSettingsValid = settings && settings.smtpHost && settings.smtpPort && settings.smtpUser && settings.smtpPassword && settings.fromEmail && settings.fromName;

        if (!isSettingsValid) {
            console.error('[sendWelcomeEmail] Email settings are incomplete or not configured in DB. Cannot send welcome email.');
            return false; // Indicate failure to send
        }
        console.log('[sendWelcomeEmail] Email settings validated.');


        console.log('[sendWelcomeEmail] Creating Nodemailer transporter...');
        const transporter = createTransporter(settings); // Pass validated settings

        // Construct login URL using environment variable
        const loginUrl = process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL}/login` : 'http://localhost:9002/login'; // Fallback
        console.log(`[sendWelcomeEmail] Constructed Login URL: ${loginUrl}`);

        const mailOptions = {
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: adminEmail,
            subject: 'Welcome to StreamlineHR!',
            text: `Hi ${adminName},\n\nWelcome to StreamlineHR!\n\nYour account for company domain "${companyDomain}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nLogin URL: ${loginUrl}\n\nPlease remember to enter your company domain "${companyDomain}" on the login page.\n\nThanks,\nThe StreamlineHR Team`,
            html: `<p>Hi ${adminName},</p>
                   <p>Welcome to StreamlineHR!</p>
                   <p>Your account for company domain "<strong>${companyDomain}</strong>" has been created.</p>
                   <p>You can log in using your email (<strong>${adminEmail}</strong>) and the password you set during registration.</p>
                   <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                   <p>Please remember to enter your company domain "<strong>${companyDomain}</strong>" on the login page.</p>
                   <p>Thanks,<br/>The StreamlineHR Team</p>`,
        };

        console.log('[sendWelcomeEmail] Prepared mail options (recipient/sender only):', { from: mailOptions.from, to: mailOptions.to, subject: mailOptions.subject });
        console.log('[sendWelcomeEmail] Attempting to send mail via Nodemailer...');
        const info = await transporter.sendMail(mailOptions);
        console.log(`[sendWelcomeEmail] Welcome email sent successfully to ${adminEmail}. Message ID: ${info.messageId}`);
        return true; // Indicate success

    } catch (error: any) {
        console.error(`[sendWelcomeEmail] Failed to send welcome email to ${adminEmail}:`, error);
        // Log specific SMTP errors if available
        if (error.code) {
            console.error(`[sendWelcomeEmail] SMTP Error Code: ${error.code}, Command: ${error.command}`);
        }
        if (error.responseCode) {
            console.error(`[sendWelcomeEmail] SMTP Response Code: ${error.responseCode}, Response: ${error.response}`);
        }
        // Don't fail the whole registration if email sending fails, but log it.
        return false; // Indicate failure to send
    }
}


export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: User; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    console.log("[registerTenantAction] Starting registration process...");

    // 0. Check Database Connection First
    console.log("[registerTenantAction] Testing database connection...");
    const dbCheck = await testDbConnection();
    if (!dbCheck.success) {
        console.error("[registerTenantAction] Database connection check failed:", dbCheck.message);
        // Ensure the error message clearly states it's a DB connection issue
        const dbErrorMessage = `Registration failed due to a database connection issue: ${dbCheck.message}. Please ensure the database server is running, accessible, and the database exists. Check your .env file.`;
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: dbErrorMessage }] };
    }
    console.log("[registerTenantAction] Database connection successful.");


    // 1. Validate Input Data
    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("[registerTenantAction] Registration Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    console.log("[registerTenantAction] Input validation successful.");

    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();

    try {
        // 2. Check if domain already exists
        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already exists.`);
            return { success: false, errors: [{ code: 'custom', path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available.`);

        // 3. Check if admin email already exists (globally)
        console.log(`[registerTenantAction] Checking if email '${adminEmail}' exists...`);
        const existingUser = await getUserByEmail(adminEmail);
        if (existingUser) {
            console.warn(`[registerTenantAction] Email '${adminEmail}' already exists.`);
            return { success: false, errors: [{ code: 'custom', path: ['adminEmail'], message: 'This email address is already in use.' }] };
        }
        console.log(`[registerTenantAction] Email '${adminEmail}' is available.`);

        // 4. Create the Tenant
        console.log(`[registerTenantAction] Creating tenant '${companyName}' with domain '${lowerCaseDomain}'...`);
        const newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        console.log(`[registerTenantAction] Tenant created successfully with ID: ${newTenant.id}`);

        // 5. Hash the Admin Password
        console.log("[registerTenantAction] Hashing admin password...");
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        console.log("[registerTenantAction] Password hashed.");

        // 6. Create the Initial Admin User
        console.log(`[registerTenantAction] Creating admin user '${adminName}' (${adminEmail}) for tenant ${newTenant.id}...`);
        const newUser = await addUser({
            tenantId: newTenant.id,
            email: adminEmail,
            passwordHash: passwordHash,
            name: adminName,
            role: 'Admin', // Initial user is always Admin
            isActive: true,
        });
        console.log(`[registerTenantAction] Admin user created successfully with ID: ${newUser.id}`);

        // 7. Send Welcome Email (Fire-and-forget, don't block registration on email failure)
         console.log("[registerTenantAction] Triggering welcome email sending...");
         sendWelcomeEmail(adminName, adminEmail, lowerCaseDomain).then(sent => {
             if (sent) {
                 console.log("[registerTenantAction] Welcome email sending initiated successfully (async).");
             } else {
                  console.error("[registerTenantAction] Welcome email sending failed or was skipped due to configuration (async).");
             }
         }).catch(err => {
              console.error("[registerTenantAction] Unexpected error during async welcome email sending:", err);
              // Optionally, add a background job/queue for retrying failed emails.
         });


        // 8. Return Success (don't return password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        console.log("[registerTenantAction] Registration completed successfully.");
        return { success: true, tenant: newTenant, user: safeUser };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during tenant registration:", error);
         let errorMessage = error.message || 'Failed to register tenant due to a server error.';

         // Refine error message for missing tables or other DB issues
         if (error.code === '42P01' || error.message?.includes('relation') && error.message?.includes('does not exist')) {
             const relationMatch = error.message?.match(/relation "([^"]+)" does not exist/);
             const missingTable = relationMatch ? relationMatch[1] : 'required tables';
             errorMessage = `Database schema is not initialized (relation "${missingTable}" does not exist). Please run 'npm run db:init' and restart the server.`;
         } else if (error.code === 'ECONNREFUSED') {
              errorMessage = `Database connection refused. Ensure the database server is running and accessible at ${process.env.DB_HOST}:${process.env.DB_PORT || 5432}.`;
         } else if (error.code === '28P01') {
             errorMessage = 'Database authentication failed. Check DB_USER and DB_PASS.';
         } else if (error.code === '3D000') {
            errorMessage = `Database "${process.env.DB_NAME}" does not exist. Please create it manually before running the application or db:init.`;
         } else if (error.message?.includes('schema not initialized')) {
             // Catch specific schema error from underlying DB functions
              errorMessage = error.message;
         }

        return { success: false, errors: [{ code: 'custom', path: ['root'], message: errorMessage }] };
    }
}

// Simple Logout Action
export async function logoutAction() {
  // 'use server'; // Indicate this is a server action
  console.log("[logoutAction] Logging out user...");
  // In a real app, you would clear the session/cookie here.
  // For example, if using next-auth: await signOut();
  // If using custom session management: destroy session cookie

  // Redirect to login page after clearing session
  redirect('/login');
}


// Placeholder for Login action (to be implemented)
// export async function loginAction(...) { ... }

// Placeholder for Forgot Password action (to be implemented)
// export async function forgotPasswordAction(...) { ... }
