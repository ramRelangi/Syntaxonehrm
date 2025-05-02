'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { initializeDatabase } from '@/lib/init-db';


const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// --- Internal Email Sending for Registration ---
// Uses environment variables directly for registration/admin notifications
// Ensure these are set in your .env file for registration emails to work
const INTERNAL_SMTP_HOST = process.env.INTERNAL_SMTP_HOST || process.env.SMTP_HOST; // Fallback to general SMTP if specific not set
const INTERNAL_SMTP_PORT = parseInt(process.env.INTERNAL_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
const INTERNAL_SMTP_USER = process.env.INTERNAL_SMTP_USER || process.env.SMTP_USER;
const INTERNAL_SMTP_PASSWORD = process.env.INTERNAL_SMTP_PASSWORD || process.env.SMTP_PASSWORD;
const INTERNAL_SMTP_SECURE = (process.env.INTERNAL_SMTP_SECURE || process.env.SMTP_SECURE) === 'true'; // Default depends on port
const INTERNAL_FROM_EMAIL = process.env.INTERNAL_FROM_EMAIL || process.env.ADMIN_EMAIL || 'noreply@syntaxhivehrm.app'; // Use Admin email or a default
const INTERNAL_FROM_NAME = process.env.INTERNAL_FROM_NAME || 'SyntaxHive Hrm Registration';

function createInternalTransporter(): nodemailer.Transporter | null {
    if (!INTERNAL_SMTP_HOST || !INTERNAL_SMTP_USER || !INTERNAL_SMTP_PASSWORD) {
        console.warn('[Internal Email] Missing internal SMTP credentials (HOST, USER, PASS). Cannot create transporter.');
        return null;
    }

    let transportOptions: nodemailer.TransportOptions = {
        host: INTERNAL_SMTP_HOST,
        port: INTERNAL_SMTP_PORT,
        auth: {
            user: INTERNAL_SMTP_USER,
            pass: INTERNAL_SMTP_PASSWORD,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
    };

    // Common configurations based on port
    if (INTERNAL_SMTP_PORT === 465) {
        transportOptions.secure = true;
    } else if (INTERNAL_SMTP_PORT === 587) {
        // For port 587, secure should usually be false, STARTTLS is used implicitly by Nodemailer if server supports it
        transportOptions.secure = false;
        transportOptions.requireTLS = true; // Explicitly require STARTTLS
    } else {
        // For other ports, rely on the explicit env var or default based on common practice (e.g., secure=true for 465)
        transportOptions.secure = INTERNAL_SMTP_SECURE !== undefined ? INTERNAL_SMTP_SECURE : (INTERNAL_SMTP_PORT === 465);
    }
     console.log(`[Internal Email] Creating transporter with options: host=${transportOptions.host}, port=${transportOptions.port}, user=${transportOptions.auth.user}, secure=${transportOptions.secure}`);

    return nodemailer.createTransport(transportOptions);
}

// Helper to construct login URL
function constructLoginUrl(tenantDomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    // Use NEXT_PUBLIC_BASE_URL to get protocol, hostname, and port accurately
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const url = new URL(baseUrl);
    const protocol = url.protocol;
    const port = url.port || (protocol === 'https:' ? '443' : '80');
    const displayPort = (port === '80' || port === '443') ? '' : `:${port}`;

    const loginUrl = `${protocol}//${tenantDomain}.${rootDomain}${displayPort}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl}`);
    return loginUrl;
}


async function sendWelcomeEmail(
    tenantName: string,
    adminName: string,
    adminEmail: string,
    tenantDomain: string // e.g., 'demo'
): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for ${tenantDomain}`);
    const transporter = createInternalTransporter();

    if (!transporter) {
        console.error('[sendWelcomeEmail] Failed to create internal email transporter. Check internal SMTP env vars.');
        return false;
    }

    const loginUrl = constructLoginUrl(tenantDomain); // Use helper

    const mailOptions = {
        from: `"${INTERNAL_FROM_NAME}" <${INTERNAL_FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Welcome to SyntaxHive Hrm - Your Account for ${tenantName}`,
        text: `Hello ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${tenantName}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nYour unique login page is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${adminName},</p>
               <p>Welcome to <strong>SyntaxHive Hrm</strong>!</p>
               <p>Your company account "<strong>${tenantName}</strong>" has been created.</p>
               <p>You can log in using your email (${adminEmail}) and the password you set during registration.</p>
               <p>Your unique login page is: <a href="${loginUrl}">${loginUrl}</a></p>
               <p>Please bookmark this link for future access.</p>
               <p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        console.log(`[sendWelcomeEmail] Sending email via ${INTERNAL_SMTP_HOST}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendWelcomeEmail] Welcome email sent successfully:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('[sendWelcomeEmail] Error sending welcome email:', error);
        return false;
    }
}


export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: User; loginUrl?: string; errors?: z.ZodIssue[] | { code?: string; path: (string | number)[]; message: string }[] }> {
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


    let newTenant: Tenant | null = null; // Define newTenant outside the try block

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
        newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        if (!newTenant?.id) {
             throw new Error("Failed to create tenant or retrieve tenant ID.");
        }
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


        // 7. Send Welcome Email using internal sender
        console.log("[registerTenantAction] Triggering welcome email sending...");
        sendWelcomeEmail(newTenant.name, adminName, adminEmail, newTenant.domain).then(sent => {
             if (sent) {
                 console.log("[registerTenantAction] Welcome email sending initiated successfully (async).");
             } else {
                  console.error("[registerTenantAction] Welcome email sending failed or was skipped due to configuration (async).");
             }
         }).catch(err => {
              console.error("[registerTenantAction] Unexpected error during async welcome email sending:", err);
         });


        // 8. Construct Login URL for return
        const loginUrl = constructLoginUrl(newTenant.domain);

        // 9. Return Success (don't return password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        console.log("[registerTenantAction] Registration completed successfully.");
        return { success: true, tenant: newTenant, user: safeUser, loginUrl: loginUrl }; // Return the login URL

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
         } else if (error.message?.includes('already exists')) {
              // Catch unique constraint errors re-thrown from DB layer
              if (error.message.includes('Tenant domain')) {
                  return { success: false, errors: [{ code: 'custom', path: ['companyDomain'], message: error.message }] };
              }
               if (error.message.includes('User email')) {
                  return { success: false, errors: [{ code: 'custom', path: ['adminEmail'], message: error.message }] };
              }
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
      const headersList = headers();
      const host = headersList.get('host') || '';
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const match = host.match(`^(.*)\\.${rootDomain}(:\\d+)?$`);
      const subdomain = match ? match[1] : null;
       if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
           tenantDomain = subdomain;
       }
      console.log(`[logoutAction] Inferred tenant domain from host "${host}": ${tenantDomain}`);

  } catch (error) {
      console.error("[logoutAction] Error retrieving tenant domain for redirect:", error);
  }

  // --- Redirect Logic ---
  let redirectUrl = '/login'; // Default redirect to root login page
  if (tenantDomain) {
      redirectUrl = constructLoginUrl(tenantDomain); // Use helper to construct URL
      console.log(`[logoutAction] Redirecting to tenant login: ${redirectUrl}`);
  } else {
       console.log(`[logoutAction] Tenant domain not found, redirecting to root login: ${redirectUrl}`);
  }

  // Redirect to the appropriate login page after clearing session
  redirect(redirectUrl);
}

// Forgot Password Action (Placeholder)
export async function forgotPasswordAction(email: string, domain?: string): Promise<{ success: boolean; message: string }> {
    console.log(`[forgotPasswordAction] Received request for email: ${email}, domain: ${domain || 'root'}`);

    // 1. Find Tenant (if domain provided)
    let tenantId: string | null = null;
    if (domain) {
        const tenant = await getTenantByDomain(domain);
        if (!tenant) {
            console.warn(`[forgotPasswordAction] Tenant not found for domain: ${domain}`);
            return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };
        }
        tenantId = tenant.id;
    } else {
        console.warn('[forgotPasswordAction] Root domain password reset requested (not typically supported for tenants).');
         return { success: false, message: 'Password reset from the root domain is not supported. Please use your company\'s login page.' };
    }

    // 2. Find User by email within the tenant
    const user = await getUserByEmail(email, tenantId);
    if (!user) {
        console.warn(`[forgotPasswordAction] User not found for email: ${email} in tenant: ${tenantId}`);
         return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };
    }

    // 3. Generate Reset Token
    const resetToken = `fake-reset-token-${Date.now()}`;
    console.log(`[forgotPasswordAction] Generated reset token for user ${user.id}`);

    // 4. Store Token Hash associated with user ID
    // await storeResetToken(user.id, resetToken);

    // 5. Send Reset Email using internal sender
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[forgotPasswordAction] Failed to create internal email transporter.');
        return { success: false, message: 'Failed to send reset email due to server configuration.' };
    }

    const resetUrl = `${constructLoginUrl(domain).replace('/login', '/reset-password')}?token=${resetToken}`; // Example path

    const mailOptions = {
        from: `"${INTERNAL_FROM_NAME}" <${INTERNAL_FROM_EMAIL}>`,
        to: user.email,
        subject: `Password Reset Request for SyntaxHive Hrm (${domain})`,
        text: `Hello ${user.name},\n\nYou requested a password reset for your SyntaxHive Hrm account associated with ${domain}.\n\nClick the link below to set a new password:\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${user.name},</p><p>You requested a password reset for your SyntaxHive Hrm account associated with <strong>${domain}</strong>.</p><p>Click the link below to set a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[forgotPasswordAction] Password reset email sent to ${user.email}`);
         return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };
    } catch (error) {
        console.error('[forgotPasswordAction] Error sending password reset email:', error);
        return { success: false, message: 'Failed to send password reset email.' };
    }
}
