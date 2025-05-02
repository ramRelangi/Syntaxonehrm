
'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db'; // Import default pool and test function
import { getEmailSettings, updateEmailSettings } from '@/modules/communication/lib/db'; // Import function to get settings
import type { EmailSettings } from '@/modules/communication/types'; // Import EmailSettings type
import { redirect } from 'next/navigation'; // Import redirect
import { headers } from 'next/headers'; // Import headers to potentially get domain in logout
import { initializeDatabase } from '@/lib/init-db'; // Import initializeDatabase

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
async function sendWelcomeEmail(tenantId: string, adminName: string, adminEmail: string, companyDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for domain ${companyDomain} (Tenant ID: ${tenantId}).`);
    let settings: EmailSettings | null = null;
    try {
        // Fetch settings specific to the newly created tenant using tenantId
        console.log(`[sendWelcomeEmail] Fetching email settings from DB for tenant ${tenantId}...`);
        // Use the DB function directly, passing tenantId
        settings = await getEmailSettings(tenantId); // Pass tenantId here

        // Log retrieved settings (mask password)
        console.log('[sendWelcomeEmail] Retrieved settings:', settings ? JSON.stringify({ ...settings, smtpPassword: '***' }) : 'null');

        // Validate essential settings
        const isSettingsValid = settings && settings.smtpHost && settings.smtpPort && settings.smtpUser && settings.smtpPassword && settings.fromEmail && settings.fromName;

        if (!isSettingsValid) {
            console.error('[sendWelcomeEmail] Email settings are incomplete or not configured in DB for this tenant. Cannot send welcome email.');
            // Optionally, send a fallback email from a central address here
            return false; // Indicate failure to send
        }
        console.log('[sendWelcomeEmail] Email settings validated.');


        console.log('[sendWelcomeEmail] Creating Nodemailer transporter...');
        const transporter = createTransporter(settings); // Pass validated settings

        // Construct tenant-specific login URL using tenant domain and root domain
        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'; // Use configured root domain
        // Construct the subdomain URL
        const port = process.env.NODE_ENV !== 'production' ? `:${process.env.PORT || 9002}` : ''; // Add port for non-production
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const loginUrl = `${protocol}://${companyDomain}.${rootDomain}${port}/login`; // Construct subdomain login URL
        console.log(`[sendWelcomeEmail] Constructed Tenant Login URL: ${loginUrl}`);

        const mailOptions = {
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: adminEmail,
            subject: 'Welcome to SyntaxHive Hrm!',
            text: `Hi ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${companyDomain}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nYour unique login URL is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nThanks,\nThe SyntaxHive Hrm Team`,
            html: `<p>Hi ${adminName},</p>
                   <p>Welcome to SyntaxHive Hrm!</p>
                   <p>Your company account "<strong>${companyDomain}</strong>" has been created.</p>
                   <p>You can log in using your email (<strong>${adminEmail}</strong>) and the password you set during registration.</p>
                   <p>Your unique login URL is: <a href="${loginUrl}">${loginUrl}</a></p>
                   <p>Please bookmark this link for future access.</p>
                   <p>Thanks,<br/>The SyntaxHive Hrm Team</p>`,
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

    // 2. Ensure database schema is initialized before proceeding
    let schemaInitialized = false;
    try {
        console.log("[registerTenantAction] Verifying schema by checking 'tenants' table...");
        await pool.query('SELECT 1 FROM tenants LIMIT 1');
        console.log("[registerTenantAction] Database schema seems initialized (tenants table exists).");
        schemaInitialized = true;
    } catch (schemaError: any) {
         console.error("[registerTenantAction] Error verifying schema:", schemaError); // Log the detailed error
        if (schemaError.code === '42P01') { // undefined_table
            console.warn("[registerTenantAction] Database schema is not initialized. Relation 'tenants' does not exist.");
            // Schema is not initialized, proceed to initialize it
        } else {
            // Handle other potential errors during schema check with more detail
            const verifyErrorMessage = `Failed to verify database schema. DB Error: ${schemaError.message || 'Unknown error'}`;
             console.error("[registerTenantAction]", verifyErrorMessage);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: verifyErrorMessage }] };
        }
    }

    // Initialize schema if it wasn't found
    if (!schemaInitialized) {
        console.log("[registerTenantAction] Attempting to initialize database schema...");
        try {
            await initializeDatabase();
            console.log("[registerTenantAction] Database schema initialization successful.");
        } catch (initError: any) {
            console.error("[registerTenantAction] Failed to initialize database schema:", initError);
             const initErrorMessage = `Failed to initialize database schema: ${initError.message || 'Unknown initialization error'}. Please run 'npm run db:init' manually and restart the server.`;
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: initErrorMessage }] };
        }
    }


    try {
        // 3. Check if domain already exists
        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already exists.`);
            return { success: false, errors: [{ code: 'custom', path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available.`);

        // 4. Create the Tenant
        console.log(`[registerTenantAction] Creating tenant '${companyName}' with domain '${lowerCaseDomain}'...`);
        const newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        console.log(`[registerTenantAction] Tenant created successfully with ID: ${newTenant.id}`);


        // 5. Check if admin email already exists WITHIN THIS TENANT (Redundant due to DB constraint)
        // console.log(`[registerTenantAction] Checking if email '${adminEmail}' exists for tenant ${newTenant.id}...`);
        // const existingUser = await getUserByEmail(adminEmail, newTenant.id); // Pass tenant ID
        // if (existingUser) { ... }

        // 6. Hash the Admin Password
        console.log("[registerTenantAction] Hashing admin password...");
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        console.log("[registerTenantAction] Password hashed.");

        // 7. Create the Initial Admin User
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


        // 8. Initialize default Email Settings for the new tenant
         console.log(`[registerTenantAction] Initializing default email settings for tenant ${newTenant.id}...`);
         const defaultSettings: EmailSettings = {
             tenantId: newTenant.id,
             smtpHost: 'smtp.example.com', // Placeholder - user MUST configure this later
             smtpPort: 587,
             smtpUser: 'user@example.com',
             smtpPassword: '', // Should be encrypted if set, leave empty for user to set
             smtpSecure: false, // Default to false (use TLS for port 587)
             fromEmail: `noreply@${lowerCaseDomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}`, // More specific default
             fromName: `${companyName} (SyntaxHive Hrm)`,
         };
         // Ensure updateEmailSettings accepts tenantId in its data
         await updateEmailSettings(newTenant.id, defaultSettings); // Pass tenantId and settings
         console.log(`[registerTenantAction] Default email settings initialized for tenant ${newTenant.id}.`);


        // 9. Send Welcome Email (Fire-and-forget, don't block registration on email failure)
         console.log("[registerTenantAction] Triggering welcome email sending...");
         // Pass newTenant.id to sendWelcomeEmail
         sendWelcomeEmail(newTenant.id, adminName, adminEmail, lowerCaseDomain).then(sent => {
             if (sent) {
                 console.log("[registerTenantAction] Welcome email sending initiated successfully (async).");
             } else {
                  console.error("[registerTenantAction] Welcome email sending failed or was skipped due to configuration (async). User must configure SMTP settings.");
             }
         }).catch(err => {
              console.error("[registerTenantAction] Unexpected error during async welcome email sending:", err);
         });


        // 10. Return Success (don't return password hash)
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
  console.log("[logoutAction] Logging out user...");
  // TODO: Implement actual session clearing (e.g., deleting session cookie)
  // This depends heavily on your authentication library (e.g., next-auth, lucia-auth)

  // --- Attempt to get tenant domain for redirect ---
  let tenantDomain: string | null = null;
  try {
      // Option 1: From session data (if stored there)
      // const session = await getSession(); // Replace with your session retrieval logic
      // if (session?.user?.tenantDomain) {
      //   tenantDomain = session.user.tenantDomain;
      // }

      // Option 2: Infer from request headers (more reliable if middleware sets it)
      const headersList = headers();
      const host = headersList.get('host') || '';
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const match = host.match(`^(.*)\\.${rootDomain}$`);
      tenantDomain = match ? match[1] : null;
      console.log(`[logoutAction] Inferred tenant domain from host "${host}": ${tenantDomain}`);

  } catch (error) {
      console.error("[logoutAction] Error retrieving tenant domain for redirect:", error);
  }

  // --- Redirect Logic ---
  let redirectUrl = '/login'; // Default redirect to root login page
  if (tenantDomain) {
      // Construct the tenant-specific login URL (subdomain root)
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const port = process.env.NODE_ENV !== 'production' ? `:${process.env.PORT || 9002}` : ''; // Add port for non-production
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      // Redirect specifically to the subdomain's login page
      redirectUrl = `${protocol}://${tenantDomain}.${rootDomain}${port}/login`;
      console.log(`[logoutAction] Redirecting to tenant login page: ${redirectUrl}`);
  } else {
       // If logging out from the root domain, redirect to root login
       console.log(`[logoutAction] Tenant domain not found, redirecting to root login: ${redirectUrl}`);
       const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
       const port = process.env.NODE_ENV !== 'production' ? `:${process.env.PORT || 9002}` : '';
       const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
       redirectUrl = `${protocol}://${rootDomain}${port}/login`;
       console.log(`[logoutAction] Constructing root login URL: ${redirectUrl}`);
  }

  // Redirect to the appropriate login page after clearing session
  redirect(redirectUrl);
}
