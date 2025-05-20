
'use server';

// Force this module to use the Node.js runtime because bcrypt needs it
// export const runtime = 'nodejs';


import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { cookies, headers } from 'next/headers';
import crypto from 'crypto';
import {
    registrationSchema,
    type RegistrationFormData,
    type Tenant,
    type User,
    type UserRole,
    type TenantLoginFormInputs,
    tenantLoginSchema,
    type TenantForgotPasswordFormInputs,
    tenantForgotPasswordSchema,
    rootForgotPasswordSchema,
    type RootForgotPasswordFormInputs,
    type SessionData,
} from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain, getUserById as dbGetUserById, getEmployeeByEmployeeIdAndTenantId } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db'; // Correctly import testDbConnection from here
import { initializeDatabase } from '@/lib/init-db'; // initializeDatabase is from init-db
import { MOCK_SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getEmailSettings as dbGetEmailSettings } from '@/modules/communication/lib/db';
import type { EmailSettings } from '@/modules/communication/types';


const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// Internal SMTP settings (used for registration and critical admin notifications if tenant SMTP fails/missing)
const INTERNAL_SMTP_HOST = process.env.INTERNAL_SMTP_HOST;
const INTERNAL_SMTP_PORT_STR = process.env.INTERNAL_SMTP_PORT;
const INTERNAL_SMTP_USER = process.env.INTERNAL_SMTP_USER;
const INTERNAL_SMTP_PASSWORD = process.env.INTERNAL_SMTP_PASSWORD;
const INTERNAL_SMTP_SECURE_STR = process.env.INTERNAL_SMTP_SECURE; // true, false, or undefined
const INTERNAL_FROM_EMAIL = process.env.INTERNAL_FROM_EMAIL || 'noreply@syntaxhivehrm.app';
const INTERNAL_FROM_NAME = process.env.INTERNAL_FROM_NAME || 'SyntaxHive Hrm System';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // For system notifications

function getInternalSmtpConfig(): { host: string; port: number; user: string; pass: string; secure: boolean; fromEmail: string; fromName: string } | null {
    if (!INTERNAL_SMTP_HOST || !INTERNAL_SMTP_PORT_STR || !INTERNAL_SMTP_USER || !INTERNAL_SMTP_PASSWORD) {
        console.warn('[Internal Email Config] Missing required internal SMTP environment variables (HOST, PORT, USER, PASS). Critical emails (like registration confirmation to admin/user) may not send.');
        return null;
    }
    const port = parseInt(INTERNAL_SMTP_PORT_STR, 10);
    if (isNaN(port)) {
         console.warn('[Internal Email Config] Invalid INTERNAL_SMTP_PORT.');
         return null;
    }

    // Determine 'secure' based on port and explicit setting
    let secure: boolean;
    if (INTERNAL_SMTP_SECURE_STR !== undefined) {
        secure = INTERNAL_SMTP_SECURE_STR === 'true';
    } else {
        secure = port === 465; // Default to true if port is 465 and secure is not explicitly set
    }

    return {
        host: INTERNAL_SMTP_HOST, port, user: INTERNAL_SMTP_USER, pass: INTERNAL_SMTP_PASSWORD, secure,
        fromEmail: INTERNAL_FROM_EMAIL, fromName: INTERNAL_FROM_NAME,
    };
}

function createInternalTransporter(): nodemailer.Transporter | null {
    const config = getInternalSmtpConfig();
    if (!config) return null;

    let transportOptions: nodemailer.TransportOptions = {
        host: config.host,
        port: config.port,
        auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 15000,
        socketTimeout: 15000,
        secure: config.secure, // Use the determined 'secure' value
    };

    // Explicitly set requireTLS for port 587 if not using secure: true (for STARTTLS)
    if (config.port === 587 && !config.secure) {
        transportOptions.requireTLS = true;
    }

    return nodemailer.createTransport(transportOptions);
}

export async function sendAdminNotification(subject: string, textBody: string, htmlBody?: string): Promise<boolean> {
    if (!ADMIN_EMAIL) {
        console.error("[sendAdminNotification] Admin email (ADMIN_EMAIL) not configured. Cannot send system notification.");
        return false;
    }
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendAdminNotification] Failed to create internal email transporter for admin notification.');
        return false;
    }
    const config = getInternalSmtpConfig(); // Get config again for fromEmail/fromName
    const mailOptions = {
        from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
        to: ADMIN_EMAIL,
        subject: `[SyntaxHive Hrm System] ${subject}`,
        text: textBody,
        html: htmlBody || `<p>${textBody.replace(/\n/g, '<br>')}</p>`,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendAdminNotification] Admin notification email sent successfully:', info.messageId);
        return true;
    } catch (error) {
        console.error('[sendAdminNotification] Error sending admin notification email:', error);
        return false;
    }
}

function constructLoginUrl(tenantDomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`; // Use the general base URL
    let portSection = '';

    try {
        const url = new URL(baseUrl); // Use the NEXT_PUBLIC_BASE_URL to determine the port for consistency
        if (url.port && url.port !== '80' && url.port !== '443') {
            portSection = `:${url.port}`;
        }
    } catch (e) {
        console.warn(`[constructLoginUrl] Could not parse NEXT_PUBLIC_BASE_URL (${baseUrl}) to extract port. Trying default port 9002 for local dev.`);
        // Fallback for local development if NEXT_PUBLIC_BASE_URL is not a full URL
        if (process.env.NODE_ENV !== 'production' && rootDomain === 'localhost') {
            const defaultPort = '9002'; // Or process.env.PORT
             if (defaultPort && defaultPort !== '80' && defaultPort !== '443') {
                 portSection = `:${defaultPort}`;
             }
        }
    }

    // Construct the URL ensuring tenantDomain is correctly placed as subdomain of ROOT_DOMAIN
    const loginUrl = `${protocol}//${tenantDomain}.${rootDomain}${portSection}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl}`);
    return loginUrl;
}


async function sendWelcomeEmail(tenantName: string, adminName: string, adminEmail: string, tenantDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for tenant ${tenantDomain}`);
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendWelcomeEmail] Failed to create internal email transporter for admin welcome.');
        await sendAdminNotification(
            `Critical: Welcome Email Failed (Internal SMTP Config Issue - Tenant: ${tenantDomain})`,
            `Failed to send welcome email to ${adminEmail} for new tenant ${tenantName} (${tenantDomain}) due to internal SMTP configuration issues. Please check .env variables.`
        );
        return false;
    }

    const loginUrl = constructLoginUrl(tenantDomain);
    const config = getInternalSmtpConfig(); // Get config for fromName/fromEmail

    const mailOptions = {
        from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Welcome to SyntaxHive Hrm - Your Account for ${tenantName}`,
        text: `Hello ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${tenantName}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nYour unique login page is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${adminName},</p><p>Welcome to <strong>SyntaxHive Hrm</strong>!</p><p>Your company account "<strong>${tenantName}</strong>" has been created.</p><p>You can log in using your email (${adminEmail}) and the password you set during registration.</p><p>Your unique login page is: <a href="${loginUrl}">${loginUrl}</a></p><p>Please bookmark this link for future access.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendWelcomeEmail] Admin welcome email sent successfully:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('[sendWelcomeEmail] Error sending admin welcome email:', error);
        await sendAdminNotification(
             `Failed to Send Welcome Email (Tenant: ${tenantDomain})`,
             `Failed to send welcome email to ${adminEmail} for tenant ${tenantName} (${tenantDomain}).\nError: ${error.message}\nPlease ensure internal SMTP settings are correct and the mail server is reachable.`
         );
        return false;
    }
}

export async function sendEmployeeWelcomeEmail(
  tenantId: string, // Pass full tenant ID for DB lookup
  employeeName: string,
  employeeEmail: string,
  employeeSystemId: string, // The database UUID of the employee
  employeeLoginId: string, // The human-readable Employee ID (EMP-001)
  temporaryPassword?: string
): Promise<boolean> {
    console.log(`[sendEmployeeWelcomeEmail] Attempting to send to ${employeeEmail} for employee ID ${employeeLoginId}`);
    const tenant = await getTenantById(tenantId); // Use the DB helper function
    if (!tenant) {
        console.error(`[sendEmployeeWelcomeEmail] Tenant not found for ID: ${tenantId}`);
        await sendAdminNotification(
            `Employee Welcome Email Failed (Tenant Not Found)`,
            `Failed to send welcome email to ${employeeEmail} (Employee Login ID: ${employeeLoginId}) because tenant with ID ${tenantId} was not found.`
        );
        return false;
    }

    // Attempt to use tenant-specific SMTP settings first
    let emailSettings = await dbGetEmailSettings(tenantId);
    let transporter;
    let mailerFromName = INTERNAL_FROM_NAME;
    let mailerFromEmail = INTERNAL_FROM_EMAIL;

    if (emailSettings && emailSettings.smtpHost) {
        console.log(`[sendEmployeeWelcomeEmail] Using tenant-specific SMTP settings for tenant ${tenant.name}`);
        let transportOptions: nodemailer.TransportOptions = {
            host: emailSettings.smtpHost,
            port: emailSettings.smtpPort,
            auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
            connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
        };
        if (emailSettings.smtpPort === 465) transportOptions.secure = true;
        else if (emailSettings.smtpPort === 587) {
            transportOptions.secure = false;
            transportOptions.requireTLS = true;
        } else transportOptions.secure = emailSettings.smtpSecure;
        transporter = nodemailer.createTransport(transportOptions);
        mailerFromName = emailSettings.fromName;
        mailerFromEmail = emailSettings.fromEmail;
    } else {
        console.warn(`[sendEmployeeWelcomeEmail] SMTP settings not configured for tenant ${tenant.name} (${tenantId}). Falling back to internal SMTP.`);
        transporter = createInternalTransporter();
        const internalConfig = getInternalSmtpConfig();
        if (internalConfig) {
            mailerFromName = internalConfig.fromName;
            mailerFromEmail = internalConfig.fromEmail;
        }
    }

    if (!transporter) {
        console.error('[sendEmployeeWelcomeEmail] Failed to create email transporter (tenant or internal). Cannot send email.');
        await sendAdminNotification(
            `Employee Welcome Email Failed (Transporter Issue - Tenant: ${tenant.domain})`,
            `Failed to send welcome email to ${employeeEmail} (Employee Login ID: ${employeeLoginId}) for tenant ${tenant.name} (${tenant.domain}) because no email transporter could be configured (neither tenant-specific nor internal SMTP worked).`
        );
        return false;
    }

    const loginUrl = constructLoginUrl(tenant.domain);
    const mailOptions = {
        from: `"${mailerFromName}" <${mailerFromEmail}>`,
        to: employeeEmail,
        subject: `Your SyntaxHive Hrm Account for ${tenant.name} is Ready!`,
        text: `Hello ${employeeName},\n\nAn account has been created for you at ${tenant.name} on SyntaxHive Hrm.\n\nYour Employee ID (for login): ${employeeLoginId}\nYour Login Email: ${employeeEmail}\n${temporaryPassword ? `Your Temporary Password: ${temporaryPassword}\n\nPlease change this password after your first login.\n` : 'Please use the password provided to you separately or contact your administrator to set your password.\n'}\n\nLogin here: ${loginUrl}\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${employeeName},</p><p>An account has been created for you at <strong>${tenant.name}</strong> on SyntaxHive Hrm.</p><p>Your Employee ID (for login): <strong>${employeeLoginId}</strong></p><p>Your Login Email: <strong>${employeeEmail}</strong></p>${temporaryPassword ? `<p>Your Temporary Password: <strong>${temporaryPassword}</strong></p><p>Please change this password after your first login.</p>` : '<p>Please use the password provided to you separately or contact your administrator to set your password.</p>'}<p>Login here: <a href="${loginUrl}">${loginUrl}</a></p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[sendEmployeeWelcomeEmail] Employee welcome email sent successfully using ${emailSettings?.smtpHost ? 'TENANT' : 'INTERNAL'} SMTP:`, info.messageId);
        return true;
    } catch (error: any) {
        console.error(`[sendEmployeeWelcomeEmail] Error sending employee welcome email using ${emailSettings?.smtpHost ? 'TENANT' : 'INTERNAL'} SMTP:`, error);
        await sendAdminNotification(
            `Employee Welcome Email Failed (Tenant: ${tenant.domain}, SMTP Error)`,
            `Failed to send welcome email to ${employeeEmail} (Employee Login ID: ${employeeLoginId}) for tenant ${tenant.name} (${tenant.domain}) using ${emailSettings?.smtpHost ? 'tenant SMTP ('+emailSettings.smtpHost+')' : 'internal SMTP'}.\nError: ${error.message}`
        );
        return false;
    }
}


export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: Omit<User, 'passwordHash'>; loginUrl?: string; errors?: { path: (string | number)[]; message: string }[] }> {
    console.log("[registerTenantAction] Starting registration process...");
    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("[registerTenantAction] Input Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors.map(e => ({ path: e.path, message: e.message })) };
    }
    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();
    let newTenant: Tenant | null = null;

    try {
        const dbTest = await testDbConnection();
        if (!dbTest.success) {
            console.error("[registerTenantAction] Database connection test failed before schema initialization:", dbTest.message);
            // Provide a user-friendly message about DB connectivity
            return { success: false, errors: [{ path: ['root'], message: `Could not connect to the database: ${dbTest.message}. Please check server logs and DB configuration.` }] };
        }
        console.log("[registerTenantAction] Database connection test successful.");

        try {
            await initializeDatabase();
            console.log("[registerTenantAction] Database schema initialized or verified.");
        } catch (initError: any) {
            console.error("[registerTenantAction] Critical error during initializeDatabase:", initError);
             await sendAdminNotification(
                'Critical: Database Schema Initialization Failed during Registration',
                `Attempt to initialize database schema for new tenant registration (${companyDomain}) failed.\nError: ${initError.message}\n\nManual intervention may be required.`
            );
            return { success: false, errors: [{ path: ['root'], message: 'A critical error occurred setting up the database. Please contact support.' }] };
        }

        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already registered.`);
            return { success: false, errors: [{ path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available. Creating tenant...`);

        newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        if (!newTenant?.id) throw new Error("Failed to create tenant or retrieve tenant ID."); // Should not happen if addTenant is correct
        console.log(`[registerTenantAction] Tenant '${companyName}' created with ID: ${newTenant.id}. Adding admin user...`);

        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        const newUser = await addUser({
            tenantId: newTenant.id, email: adminEmail, passwordHash, name: adminName, role: 'Admin', isActive: true,
        });
        console.log(`[registerTenantAction] Admin user '${adminName}' added with ID: ${newUser.id}.`);

        sendWelcomeEmail(newTenant.name, adminName, adminEmail, newTenant.domain)
            .catch(err => console.error("[registerTenantAction] Async admin welcome email sending failed after successful registration:", err));

        const loginUrl = constructLoginUrl(newTenant.domain);
        const { passwordHash: _, ...safeUser } = newUser; // Omit password hash from returned user
        return { success: true, tenant: newTenant, user: safeUser, loginUrl };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during registration transaction:", error);

        // Rollback tenant creation if admin user creation failed and tenant was created
        if (newTenant?.id && !error.message?.includes('User email already exists')) {
            console.warn(`[registerTenantAction] Rolling back tenant creation (ID: ${newTenant.id}) due to subsequent error.`);
            try {
                const client = await pool.connect();
                await client.query('DELETE FROM tenants WHERE id = $1', [newTenant.id]);
                client.release();
                console.log(`[registerTenantAction] Tenant ${newTenant.id} rolled back successfully.`);
            } catch (cleanupError) {
                console.error(`[registerTenantAction] CRITICAL: Failed to cleanup tenant ${newTenant.id} after error:`, cleanupError);
                 await sendAdminNotification(
                    'Critical: Tenant Cleanup Failed After Registration Error',
                    `Tenant ${newTenant.name} (domain: ${lowerCaseDomain}, id: ${newTenant.id}) was created but admin user creation failed. Attempt to rollback tenant failed.\nOriginal Error: ${error.message}\nCleanup Error: ${(cleanupError as Error).message}\nManual database cleanup required.`
                );
            }
        }

        let userMessage = 'Failed to register tenant due to a server error.';
        let errorPath: (string | number)[] = ['root']; // Default path for general errors

        if (error.message?.includes('already exists')) {
            userMessage = error.message; // Use specific message from DB layer
            if (error.message.includes('domain')) errorPath = ['companyDomain'];
            else if (error.message.includes('email')) errorPath = ['adminEmail'];
        } else if (error.message?.includes('Database schema not initialized') || error.message?.includes('relation "tenants" does not exist')) {
            userMessage = 'Database Error: Schema not initialized. Please contact support or run `npm run db:init` manually and check database logs.';
        } else if (error.message?.includes('Database connection issue')) {
            userMessage = error.message; // E.g., "Could not connect to the database: ..."
        } else if (error.message) {
            userMessage = `Registration failed: ${error.message}`;
        }

        return { success: false, errors: [{ path: errorPath, message: userMessage }] };
    }
}

export async function loginAction(credentials: TenantLoginFormInputs): Promise<{ success: boolean; error?: string; user?: Omit<User, 'passwordHash'> }> {
    console.log(`[loginAction] Attempting login with identifier: ${credentials.loginIdentifier}`);
    const validation = tenantLoginSchema.safeParse(credentials);
    if (!validation.success) {
        return { success: false, error: "Invalid login identifier or password format." };
    }

    const { loginIdentifier, password } = validation.data;
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0]; // Remove port for comparison

    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomainFromHost = match ? match[1] : null;

    if (!tenantDomainFromHost) {
        // Check if it's the root domain or common dev equivalents like localhost, 127.0.0.1
        const isRootEquivalent =
            normalizedHost === rootDomain ||
            normalizedHost === 'localhost' ||
            normalizedHost === '127.0.0.1' ||
            normalizedHost.match(/^192\.168\.\d+\.\d+$/) ||
            normalizedHost.match(/^10\.\d+\.\d+\.\d+$/) ||
            normalizedHost.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/);

        if (isRootEquivalent) {
            return { success: false, error: "Login not allowed on the root domain. Please use your company's specific login URL (e.g., your-company.syntaxhivehrm.app)." };
        }
        // If not root and not a valid subdomain, it's an invalid URL
        return { success: false, error: "Invalid login URL. Could not identify company domain." };
    }


    try {
        const tenant = await getTenantByDomain(tenantDomainFromHost);
        if (!tenant) {
            console.warn(`[loginAction] Tenant not found for domain: ${tenantDomainFromHost}`);
            return { success: false, error: "Invalid company domain or login URL." };
        }

        let user: User | undefined;

        // Try to find by email first
        if (loginIdentifier.includes('@')) {
            console.log(`[loginAction] Attempting to find user by email: ${loginIdentifier} for tenant ${tenant.id}`);
            user = await getUserByEmail(loginIdentifier, tenant.id);
        }

        // If not found by email, or if it doesn't look like an email, try by Employee ID
        if (!user) {
            console.log(`[loginAction] User not found by email or identifier is not an email. Attempting by Employee ID: ${loginIdentifier} for tenant ${tenant.id}`);
            const employeeProfile = await getEmployeeByEmployeeIdAndTenantId(loginIdentifier, tenant.id);
            if (employeeProfile && employeeProfile.userId) {
                user = await dbGetUserById(employeeProfile.userId);
                // Ensure the found user belongs to the correct tenant (important if userId was from a different tenant's employee record somehow)
                if (user && user.tenantId !== tenant.id) {
                    console.warn(`[loginAction] User ${user.id} found via employee ID ${loginIdentifier} belongs to tenant ${user.tenantId}, but login is for tenant ${tenant.id}. Denying access.`);
                    user = undefined;
                }
            }
        }

        if (!user || !user.isActive) {
            console.log(`[loginAction] User not found or inactive for identifier: ${loginIdentifier}`);
            return { success: false, error: "Invalid credentials or inactive account." };
        }

        console.log(`[loginAction] User found: ${user.id}. Comparing password...`);
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            console.log(`[loginAction] Password mismatch for user: ${user.id}`);
            return { success: false, error: "Invalid credentials." };
        }

        console.log(`[loginAction] Login successful for user: ${user.id}. Setting session cookie.`);
        const sessionData: SessionData = {
            userId: user.id,
            tenantId: user.tenantId,
            tenantDomain: tenant.domain, // Store the actual domain from DB for consistency
            userRole: user.role,
        };

        const cookieOptions: any = { // Let TypeScript infer for now
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax' as const, // Ensure this is a literal type
            maxAge: 60 * 60 * 24 * 7, // 1 week
        };

        // Set cookie domain only for actual root domains, not for localhost or IPs
        if (rootDomain !== 'localhost' && !normalizedHost.match(/^(127\.0\.0\.1|::1|(\d{1,3}\.){3}\d{1,3})$/)) {
            cookieOptions.domain = `.${rootDomain}`; // Prepend with a dot
        }

        cookies().set(MOCK_SESSION_COOKIE, JSON.stringify(sessionData), cookieOptions);

        const { passwordHash: _, ...safeUser } = user; // Omit password hash before returning
        return { success: true, user: safeUser };

    } catch (error: any) {
        console.error("[loginAction] Error during login:", error);
        return { success: false, error: "An unexpected server error occurred during login." };
    }
}


export async function logoutAction() {
    console.log("[logoutAction] Logging out user...");
    let tenantDomain: string | null = null;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'; // Match logic in loginAction
    const currentHost = headers().get('host')?.split(':')[0] || ''; // Get current host without port

    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);
        if (sessionCookie?.value) {
            try {
                 const sessionData: SessionData = JSON.parse(sessionCookie.value);
                 tenantDomain = sessionData.tenantDomain; // Get tenant domain from session
            } catch (parseError) { console.error("[logoutAction] Error parsing session cookie:", parseError); }
        }

        const cookieDeleteOptions: { name: string; path: string; domain?: string } = {
             name: MOCK_SESSION_COOKIE,
             path: '/',
        };

        // Apply domain to cookie deletion only if it's not localhost or an IP
        if (rootDomain !== 'localhost' && !currentHost.match(/^(127\.0\.0\.1|::1|(\d{1,3}\.){3}\d{1,3})$/)) {
            cookieDeleteOptions.domain = `.${rootDomain}`;
        }

        cookies().delete(cookieDeleteOptions);
        console.log("[logoutAction] Session cookie deleted with options:", cookieDeleteOptions);

    } catch (error) { console.error("[logoutAction] Error clearing cookie:", error); }

    // Redirect to the tenant-specific login page if tenantDomain was found in session,
    // otherwise redirect to the root registration page (as a fallback if no session context)
    const redirectUrl = tenantDomain ? constructLoginUrl(tenantDomain) : '/register';
    console.log(`[logoutAction] Redirecting to: ${redirectUrl}`);
    redirect(redirectUrl);
}


// Helper to get the tenant ID from the current session
export async function getTenantIdFromSession(): Promise<string | null> {
    const session = await getSessionData();
    return session?.tenantId ?? null;
}

// Helper to get the user ID from the current session
export async function getUserIdFromSession(): Promise<string | null> {
    const session = await getSessionData();
    return session?.userId ?? null;
}

// Helper to get the user's role from session
export async function getUserRoleFromSession(): Promise<UserRole | null> {
    const session = await getSessionData();
    return session?.userRole ?? null;
}

// Helper to check if the current user is an admin
export async function isAdminFromSession(): Promise<boolean> {
    const role = await getUserRoleFromSession();
    return role === 'Admin';
}

// Helper to get full user data from session
export async function getUserFromSession(): Promise<Omit<User, 'passwordHash'> | null> {
    const session = await getSessionData();
    if (!session?.userId || !session.tenantId) {
        return null;
    }
    try {
        const user = await dbGetUserById(session.userId); // Use aliased import
        if (user && user.tenantId === session.tenantId) {
            const { passwordHash, ...safeUser } = user;
            return safeUser;
        }
    } catch (error) {
        console.error("[getUserFromSession] Error fetching user:", error);
    }
    return null;
}

// Helper function to read session data from cookie
export async function getSessionData(): Promise<SessionData | null> {
    try {
        // console.log("[getSessionData] Attempting to read session cookie...");
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);

        if (sessionCookie?.value) {
            // console.log("[getSessionData] Session cookie found:", sessionCookie.value);
            const sessionData: SessionData = JSON.parse(sessionCookie.value);

            // Basic validation of session data structure
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (sessionData &&
                uuidRegex.test(sessionData.userId) &&
                uuidRegex.test(sessionData.tenantId) &&
                sessionData.tenantDomain &&
                sessionData.userRole) {
                // console.log("[getSessionData] Valid session data parsed:", sessionData);
                return sessionData;
            }
            console.warn("[getSessionData] Invalid session data structure in cookie.");
        } else {
            // console.log("[getSessionData] Session cookie not found.");
        }
    } catch (error) {
        console.error("[getSessionData] Error reading/parsing session cookie:", error);
    }
    return null;
}


async function getTenantById(id: string): Promise<Tenant | undefined> { // Duplicated to avoid circular dependency with auth/lib/db
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM tenants WHERE id = $1', [id]);
        return res.rows.length > 0 ? {
            id: res.rows[0].id,
            name: res.rows[0].name,
            domain: res.rows[0].domain,
            createdAt: new Date(res.rows[0].created_at).toISOString(),
        } : undefined;
    } catch (error) {
        console.error(`[getTenantById - auth/actions] Error fetching tenant ${id}:`, error);
        throw error; // Re-throw to be handled by caller
    } finally {
        client.release();
    }
}

// Tenant Forgot Password Action
export async function tenantForgotPasswordAction(formData: TenantForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    // Tenant domain is implicitly derived from the current request's subdomain
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomain = match ? match[1] : null;

    if (!tenantDomain) {
        return { success: false, message: "Could not identify company domain from the URL." };
    }

    const validation = tenantForgotPasswordSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, message: validation.error.errors[0]?.message || "Invalid email format." };
    }
    return forgotPasswordLogic(validation.data.email, tenantDomain);
}

// Root Forgot Password Action (when company domain is explicitly provided)
export async function rootForgotPasswordAction(formData: RootForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    const validation = rootForgotPasswordSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, message: validation.error.errors[0]?.message || "Invalid input." };
    }
    return forgotPasswordLogic(validation.data.email, validation.data.companyDomain.toLowerCase());
}

async function forgotPasswordLogic(email: string, tenantDomain: string): Promise<{ success: boolean; message: string }> {
    const userMessage = `If an account exists for ${email} at ${tenantDomain}, you will receive reset instructions.`;
    try {
        const tenant = await getTenantByDomain(tenantDomain);
        if (!tenant) {
            console.log(`[forgotPasswordLogic] Tenant not found for domain: ${tenantDomain}.`);
            return { success: true, message: userMessage }; // Don't reveal if tenant exists
        }

        const user = await getUserByEmail(email, tenant.id);
        if (!user || !user.isActive) {
            console.log(`[forgotPasswordLogic] User not found or inactive for email ${email} in tenant ${tenant.id}.`);
            return { success: true, message: userMessage }; // Don't reveal if user exists or is inactive
        }

        // TODO: Implement actual token generation, storage (with expiry), and validation
        const resetToken = crypto.randomBytes(32).toString('hex'); // Generate a secure random token
        const tokenExpiry = new Date(Date.now() + 3600000); // Token expires in 1 hour

        // TODO: Store the resetToken (hashed) and tokenExpiry in the database associated with the user.
        // For example, add `password_reset_token TEXT`, `password_reset_token_expires_at TIMESTAMP WITH TIME ZONE` columns to `users` table.
        // await pool.query('UPDATE users SET password_reset_token = $1, password_reset_token_expires_at = $2 WHERE id = $3', [hashedToken, tokenExpiry, user.id]);

        console.log(`[forgotPasswordLogic] Generated reset token for ${user.email}: ${resetToken} (this is a mock, implement DB storage)`);

        const transporter = createInternalTransporter();
        if (!transporter) {
             console.error(`[forgotPasswordLogic] Failed to create internal SMTP transporter for tenant ${tenantDomain}. Cannot send reset email.`);
             await sendAdminNotification(
                `Password Reset Failed (Internal SMTP Config Issue - Tenant: ${tenantDomain})`,
                `Failed to send password reset email to ${email} for tenant ${tenant.name} (${tenantDomain}) due to internal SMTP configuration issues.`
             );
            return { success: false, message: 'Server configuration error prevents sending email. Please contact support.' };
        }

        // Construct the reset URL specific to the tenant's domain
        const resetUrlBase = constructLoginUrl(tenantDomain).replace('/login', '/reset-password'); // Ensure it points to the tenant's domain
        const resetUrl = `${resetUrlBase}?token=${resetToken}`;

        const internalConfig = getInternalSmtpConfig(); // For fromEmail/fromName
        const mailOptions = {
            from: `"${internalConfig?.fromName || INTERNAL_FROM_NAME}" <${internalConfig?.fromEmail || INTERNAL_FROM_EMAIL}>`,
            to: user.email,
            subject: `Password Reset Request for SyntaxHive Hrm (${tenant.name})`,
            text: `Hello ${user.name},\n\nYou requested a password reset for SyntaxHive Hrm for your account at ${tenant.name}.\n\nClick here to reset your password: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
            html: `<p>Hello ${user.name},</p><p>You requested a password reset for <strong>SyntaxHive Hrm</strong> for your account at <strong>${tenant.name}</strong>.</p><p>Click here to reset your password: <a href="${resetUrl}">Reset Password</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, please ignore this email.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[forgotPasswordLogic] Password reset email sent to ${user.email} for tenant ${tenant.domain}.`);
        return { success: true, message: userMessage };

    } catch (error: any) {
        console.error('[forgotPasswordLogic] Error:', error);
        await sendAdminNotification(
            `Password Reset Failed (Error - Tenant: ${tenantDomain})`,
            `Password reset for ${email} (Tenant: ${tenantDomain}) failed.\nError: ${error.message}`
        );
        return { success: false, message: 'Error processing password reset. Please try again later or contact support.' };
    }
}
