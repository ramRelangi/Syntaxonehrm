'use server';


// Removed: export const runtime = 'nodejs';


import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { registrationSchema, type RegistrationFormData, type Tenant, type User, type TenantLoginFormInputs } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { initializeDatabase } from '@/lib/init-db';

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// --- Internal Email Sending Configuration (for Registration/Admin) ---
const INTERNAL_SMTP_HOST = process.env.INTERNAL_SMTP_HOST || process.env.SMTP_HOST;
const INTERNAL_SMTP_PORT = parseInt(process.env.INTERNAL_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
const INTERNAL_SMTP_USER = process.env.INTERNAL_SMTP_USER || process.env.SMTP_USER;
const INTERNAL_SMTP_PASSWORD = process.env.INTERNAL_SMTP_PASSWORD || process.env.SMTP_PASSWORD;
const INTERNAL_SMTP_SECURE = (process.env.INTERNAL_SMTP_SECURE || process.env.SMTP_SECURE) === 'true';
const INTERNAL_FROM_EMAIL = process.env.INTERNAL_FROM_EMAIL || process.env.ADMIN_EMAIL || 'noreply@syntaxhivehrm.app'; // Updated app name
const INTERNAL_FROM_NAME = process.env.INTERNAL_FROM_NAME || 'SyntaxHive Hrm Registration'; // Updated app name

// --- Helper Functions ---

// Create transporter for internal emails
function createInternalTransporter(): nodemailer.Transporter | null {
    if (!INTERNAL_SMTP_HOST || !INTERNAL_SMTP_USER || !INTERNAL_SMTP_PASSWORD) {
        console.warn('[Internal Email] Missing internal SMTP credentials (HOST, USER, PASS). Cannot create transporter.');
        return null;
    }
    let transportOptions: nodemailer.TransportOptions = {
        host: INTERNAL_SMTP_HOST, port: INTERNAL_SMTP_PORT, auth: { user: INTERNAL_SMTP_USER, pass: INTERNAL_SMTP_PASSWORD },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
    };
    if (INTERNAL_SMTP_PORT === 465) transportOptions.secure = true;
    else if (INTERNAL_SMTP_PORT === 587) { transportOptions.secure = false; transportOptions.requireTLS = true; }
    else transportOptions.secure = INTERNAL_SMTP_SECURE;
    console.log(`[Internal Email] Creating transporter with options: host=${transportOptions.host}, port=${transportOptions.port}, user=${transportOptions.auth.user}, secure=${transportOptions.secure}`);
    return nodemailer.createTransport(transportOptions);
}

// Construct login URL based on tenant domain
function constructLoginUrl(tenantDomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const url = new URL(baseUrl);
    const protocol = url.protocol;
    const port = url.port || (protocol === 'https:' ? '443' : '80');
    const displayPort = (port === '80' || port === '443') ? '' : `:${port}`;
    // Construct URL like http://subdomain.domain:port/login
    const loginUrl = `${protocol}//${tenantDomain}.${rootDomain}${displayPort}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl}`);
    return loginUrl;
}

// Send welcome email after registration
async function sendWelcomeEmail(tenantName: string, adminName: string, adminEmail: string, tenantDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for ${tenantDomain}`);
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendWelcomeEmail] Failed to create internal email transporter.');
        return false;
    }
    const loginUrl = constructLoginUrl(tenantDomain);
    const mailOptions = {
        from: `"${INTERNAL_FROM_NAME}" <${INTERNAL_FROM_EMAIL}>`, to: adminEmail,
        subject: `Welcome to SyntaxHive Hrm - Your Account for ${tenantName}`, // Updated app name
        text: `Hello ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${tenantName}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nYour unique login page is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nBest regards,\nThe SyntaxHive Hrm Team`, // Updated app name
        html: `<p>Hello ${adminName},</p><p>Welcome to <strong>SyntaxHive Hrm</strong>!</p><p>Your company account "<strong>${tenantName}</strong>" has been created.</p><p>You can log in using your email (${adminEmail}) and the password you set during registration.</p><p>Your unique login page is: <a href="${loginUrl}">${loginUrl}</a></p><p>Please bookmark this link for future access.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`, // Updated app name
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

// --- Registration Action ---
export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: User; loginUrl?: string; errors?: z.ZodIssue[] | { code?: string; path: (string | number)[]; message: string }[] }> {
    console.log("[registerTenantAction] Starting registration process...");

    // 1. Check Database Connection
    const dbCheck = await testDbConnection();
    if (!dbCheck.success) {
        console.error("[registerTenantAction] Database connection check failed:", dbCheck.message);
        return { success: false, errors: [{ path: ['root'], message: `Database connection issue: ${dbCheck.message}` }] };
    }
    console.log("[registerTenantAction] Database connection successful.");

    // 2. Validate Input Data
    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("[registerTenantAction] Registration Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();

    // 3. Ensure DB Schema Initialization (Attempt Initialization if needed)
    try {
        console.log("[registerTenantAction] Checking if 'tenants' table exists...");
        // Try a simple query that would fail if the table doesn't exist
        await pool.query('SELECT 1 FROM tenants LIMIT 1');
        console.log("[registerTenantAction] 'tenants' table exists. Schema seems initialized.");
    } catch (schemaError: any) {
        if (schemaError.code === '42P01') { // 'undefined_table' error code
            console.warn("[registerTenantAction] 'tenants' table not found. Attempting database schema initialization...");
            try {
                await initializeDatabase(); // Run the initialization script
                console.log("[registerTenantAction] Database schema initialization successful.");
            } catch (initError: any) {
                console.error("[registerTenantAction] Failed to initialize database schema:", initError);
                return { success: false, errors: [{ path: ['root'], message: `Database Error: Schema initialization failed. Please run 'npm run db:init' manually and restart. Details: ${initError.message}` }] };
            }
        } else {
            // Unexpected error checking schema
            console.error("[registerTenantAction] Unexpected error checking database schema:", schemaError);
            return { success: false, errors: [{ path: ['root'], message: `Database Error: Failed to verify schema. Details: ${schemaError.message}` }] };
        }
    }


    let newTenant: Tenant | null = null;
    try {
        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        // 4. Check Domain Availability
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already registered.`);
            return { success: false, errors: [{ path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available.`);

        // 5. Create Tenant
        console.log(`[registerTenantAction] Creating tenant '${companyName}' with domain '${lowerCaseDomain}'...`);
        newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        if (!newTenant?.id) throw new Error("Failed to create tenant or retrieve tenant ID.");
        console.log(`[registerTenantAction] Tenant created successfully. ID: ${newTenant.id}`);

        // 6. Hash Password
        console.log(`[registerTenantAction] Hashing password for admin user...`);
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        console.log(`[registerTenantAction] Password hashed.`);

        // 7. Create Admin User
        console.log(`[registerTenantAction] Creating admin user '${adminName}' (${adminEmail}) for tenant ${newTenant.id}...`);
        const newUser = await addUser({
            tenantId: newTenant.id, email: adminEmail, passwordHash: passwordHash,
            name: adminName, role: 'Admin', isActive: true,
        });
        console.log(`[registerTenantAction] Admin user created successfully. ID: ${newUser.id}`);

        // 8. Send Welcome Email (Async - doesn't block response)
        console.log(`[registerTenantAction] Scheduling welcome email to ${adminEmail}...`);
        sendWelcomeEmail(newTenant.name, adminName, adminEmail, newTenant.domain).catch(err => {
            // Log error, but don't fail the registration if email fails
            console.error("[registerTenantAction] Async welcome email sending failed:", err);
        });

        // 9. Construct Login URL
        const loginUrl = constructLoginUrl(newTenant.domain);
        console.log(`[registerTenantAction] Login URL constructed: ${loginUrl}`);

        // 10. Return Success
        console.log(`[registerTenantAction] Registration process completed successfully for tenant ${newTenant.id}.`);
        // Omit password hash before returning user data
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        return { success: true, tenant: newTenant, user: safeUser, loginUrl: loginUrl };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during registration transaction:", error);

        // Rollback or cleanup if necessary (though individual DB functions might handle this)
        // e.g., if user creation failed after tenant creation, potentially delete tenant? (complex)

        let userMessage = 'Failed to register tenant due to a server error.';
        let errorPath: (string | number)[] = ['root'];

        // Provide more specific feedback based on the error
        if (error.message?.includes('already exists')) {
            userMessage = error.message; // Use the specific message from DB layer
            if (error.message.includes('domain')) errorPath = ['companyDomain'];
            else if (error.message.includes('email')) errorPath = ['adminEmail'];
        } else if (error.code === '42P01') { // Handle 'undefined_table' if init failed mid-process somehow
            userMessage = `Database relation "${error.table || 'required'}" does not exist. Schema initialization might be incomplete.`;
        } else if (error.message) {
            userMessage = error.message; // Use the error message if available
        }

        return { success: false, errors: [{ path: errorPath, message: userMessage }] };
    }
}


// --- Login Action ---
export async function loginAction(credentials: TenantLoginFormInputs): Promise<{ success: boolean; error?: string; user?: Omit<User, 'passwordHash'> }> {
    console.log(`[loginAction] Attempting login for email: ${credentials.email}`);

    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    // Extract subdomain, handling potential ports
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomain = match ? match[1] : null;


    if (!tenantDomain) {
        console.error("[loginAction] Could not determine tenant domain from host:", host);
        // Check if it's the root domain itself, which shouldn't allow login
        if (normalizedHost === rootDomain || normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') {
             return { success: false, error: "Login not allowed on the root domain. Please use your company's login URL." };
        }
        return { success: false, error: "Invalid login URL. Could not identify company domain." };
    }

     console.log(`[loginAction] Inferred tenant domain: ${tenantDomain}`);

    try {
        // 1. Find Tenant by domain
        const tenant = await getTenantByDomain(tenantDomain);
        if (!tenant) {
            console.warn(`[loginAction] Tenant not found for domain: ${tenantDomain}`);
            return { success: false, error: "Company domain not found." };
        }
        console.log(`[loginAction] Found tenant: ${tenant.id} (${tenant.name})`);

        // 2. Find User by email within the tenant
        const user = await getUserByEmail(credentials.email, tenant.id);
        if (!user || !user.isActive) {
            console.warn(`[loginAction] User not found or inactive for email: ${credentials.email} in tenant: ${tenant.id}`);
            return { success: false, error: "Invalid email or password." };
        }
        console.log(`[loginAction] Found active user: ${user.id} (${user.name})`);

        // 3. Verify Password
        console.log(`[loginAction] Verifying password for user: ${user.id}`);
        const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!passwordMatch) {
            console.warn(`[loginAction] Password mismatch for user: ${user.id}`);
            return { success: false, error: "Invalid email or password." };
        }
        console.log(`[loginAction] Password verified for user: ${user.id}`);

        // 4. Login Success - TODO: Implement session management (e.g., set cookie)
        console.log(`[loginAction] Login successful for user: ${user.id}, tenant: ${tenant.id}`);
        // IMPORTANT: Use your authentication library (next-auth, lucia-auth, etc.)
        // to create a session and set the appropriate cookies/headers.
        // Example placeholder:
        // await createSession(user.id, tenant.id, tenantDomain);

        // Return safe user data (omit password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = user;
        return { success: true, user: safeUser };

    } catch (error: any) {
        console.error("[loginAction] Error during login:", error);
        return { success: false, error: "An unexpected server error occurred during login." };
    }
}


// --- Logout Action ---
export async function logoutAction() {
    console.log("[logoutAction] Logging out user...");
    // TODO: Implement actual session clearing (e.g., deleting session cookie)
    // This depends heavily on your authentication library.

    let tenantDomain: string | null = null;
    try {
        const headersList = headers();
        const host = headersList.get('host') || '';
        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
         // Extract subdomain, handling potential ports
        const normalizedHost = host.split(':')[0];
        const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
        tenantDomain = match ? match[1] : null;

    } catch (error) {
        console.error("[logoutAction] Error retrieving tenant domain for redirect:", error);
    }

    // Redirect to the tenant-specific login page if domain found, otherwise root register page
    let redirectUrl = '/register'; // Default to root register page
    if (tenantDomain) {
        redirectUrl = constructLoginUrl(tenantDomain);
    }
    console.log(`[logoutAction] Redirecting to: ${redirectUrl}`);
    redirect(redirectUrl);
}

// --- Forgot Password Action ---
export async function forgotPasswordAction(email: string, domain?: string): Promise<{ success: boolean; message: string }> {
    console.log(`[forgotPasswordAction] Received request for email: ${email}, domain: ${domain || 'N/A'}`);
    if (!domain) {
         // This case might happen if called from the root forgot password page without a domain provided
         // Ideally, the root page should require the domain.
         console.warn("[forgotPasswordAction] Domain not provided.");
         return { success: false, message: 'Company domain is required for password reset.' };
    }

    let tenantId: string | null = null;
    try {
        const tenant = await getTenantByDomain(domain);
        if (!tenant) {
             console.warn(`[forgotPasswordAction] Tenant not found for domain: ${domain}`);
             // Still return success message for security (don't reveal if domain exists)
             return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };
        }
        tenantId = tenant.id;

        const user = await getUserByEmail(email, tenantId);
        if (!user) {
            console.warn(`[forgotPasswordAction] User not found for email: ${email} in tenant: ${tenantId}`);
            return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };
        }

        // --- TODO: Generate & Store Secure Token ---
        const resetToken = `fake-reset-token-${Date.now()}`; // Replace with secure token generation
        console.log(`[forgotPasswordAction] Generated reset token for user ${user.id}`);
        // await storeResetTokenHash(user.id, resetToken); // Store hash in DB with expiry

        // --- Send Reset Email ---
        const transporter = createInternalTransporter();
        if (!transporter) {
            return { success: false, message: 'Failed to send reset email due to server configuration.' };
        }
        // Construct reset URL using the tenant's domain
        const resetUrlBase = constructLoginUrl(domain).replace('/login', '/reset-password');
        const resetUrl = `${resetUrlBase}?token=${resetToken}`;

        const mailOptions = {
            from: `"${INTERNAL_FROM_NAME}" <${INTERNAL_FROM_EMAIL}>`, to: user.email,
            subject: `Password Reset Request for SyntaxHive Hrm (${domain})`, // Updated app name
            text: `Hello ${user.name},\n\nYou requested a password reset for your SyntaxHive Hrm account associated with ${tenant.name}.\n\nClick the link below to reset your password:\n${resetUrl}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nThe SyntaxHive Hrm Team`, // Updated app name
            html: `<p>Hello ${user.name},</p><p>You requested a password reset for your <strong>SyntaxHive Hrm</strong> account associated with <strong>${tenant.name}</strong>.</p><p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`, // Updated app name
        };
        await transporter.sendMail(mailOptions);
        console.log(`[forgotPasswordAction] Password reset email sent to ${user.email}`);
        return { success: true, message: `If an account exists for ${email} at ${domain}, you will receive reset instructions.` };

    } catch (error) {
        console.error('[forgotPasswordAction] Error:', error);
        // Don't reveal specific errors in the message
        return { success: false, message: 'An error occurred while processing the password reset request.' };
    }
}
