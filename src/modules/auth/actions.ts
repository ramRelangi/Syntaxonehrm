'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { cookies } from 'next/headers'; // Import cookies
import {
    registrationSchema,
    type RegistrationFormData,
    type Tenant,
    type User,
    type TenantLoginFormInputs,
    tenantLoginSchema,
    type TenantForgotPasswordFormInputs,
    tenantForgotPasswordSchema,
    rootForgotPasswordSchema,
    type RootForgotPasswordFormInputs,
    type SessionData, // Import SessionData type
} from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain, getUserById as dbGetUserById } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db'; // Import pool and test function
import { redirect } from 'next/navigation';
import { initializeDatabase } from '@/lib/init-db';
import { MOCK_SESSION_COOKIE } from '@/lib/auth'; // Keep constant import

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// --- Internal Email Sending Configuration (for Registration/Admin) ---
const INTERNAL_SMTP_HOST = process.env.INTERNAL_SMTP_HOST;
const INTERNAL_SMTP_PORT_STR = process.env.INTERNAL_SMTP_PORT;
const INTERNAL_SMTP_USER = process.env.INTERNAL_SMTP_USER;
const INTERNAL_SMTP_PASSWORD = process.env.INTERNAL_SMTP_PASSWORD;
const INTERNAL_SMTP_SECURE_STR = process.env.INTERNAL_SMTP_SECURE;
const INTERNAL_FROM_EMAIL = process.env.INTERNAL_FROM_EMAIL || 'noreply@syntaxhivehrm.app';
const INTERNAL_FROM_NAME = process.env.INTERNAL_FROM_NAME || 'SyntaxHive Hrm Registration';

function getInternalSmtpConfig(): { host: string; port: number; user: string; pass: string; secure: boolean; fromEmail: string; fromName: string } | null {
    if (!INTERNAL_SMTP_HOST || !INTERNAL_SMTP_PORT_STR || !INTERNAL_SMTP_USER || !INTERNAL_SMTP_PASSWORD) {
        console.warn('[Internal Email Config] Missing required internal SMTP environment variables (HOST, PORT, USER, PASS).');
        return null;
    }
    const port = parseInt(INTERNAL_SMTP_PORT_STR, 10);
    if (isNaN(port)) {
         console.warn('[Internal Email Config] Invalid INTERNAL_SMTP_PORT.');
         return null;
    }
    const secure = INTERNAL_SMTP_SECURE_STR !== undefined
        ? INTERNAL_SMTP_SECURE_STR === 'true'
        : (port === 465);

    return {
        host: INTERNAL_SMTP_HOST,
        port: port,
        user: INTERNAL_SMTP_USER,
        pass: INTERNAL_SMTP_PASSWORD,
        secure: secure,
        fromEmail: INTERNAL_FROM_EMAIL,
        fromName: INTERNAL_FROM_NAME,
    };
}

// --- Helper Functions ---

function createInternalTransporter(): nodemailer.Transporter | null {
    const config = getInternalSmtpConfig();
    if (!config) {
        return null;
    }
    let transportOptions: nodemailer.TransportOptions = {
        host: config.host, port: config.port, auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
        secure: config.secure,
    };
    if (config.port === 587 && !config.secure) {
        transportOptions.requireTLS = true;
    }
    console.log(`[Internal Email] Creating transporter with options: host=${transportOptions.host}, port=${transportOptions.port}, user=${transportOptions.auth.user ? '***' : 'N/A'}, secure=${transportOptions.secure}, requireTLS=${transportOptions.requireTLS}`);
    return nodemailer.createTransport(transportOptions);
}

function constructLoginUrl(tenantDomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let port = '';
     try {
         const url = new URL(baseUrl);
         if (url.port && url.port !== '80' && url.port !== '443') {
             port = `:${url.port}`;
         }
     } catch (e) {
         console.warn("Could not parse NEXT_PUBLIC_BASE_URL to extract port, using default behavior.");
         if (process.env.NODE_ENV !== 'production') {
              port = ':9002'; // Default dev port
         }
     }
    const loginUrl = `${protocol}://${tenantDomain}.${rootDomain}${port}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl}`);
    return loginUrl;
}

async function sendWelcomeEmail(tenantName: string, adminName: string, adminEmail: string, tenantDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Attempting to send welcome email to ${adminEmail} for ${tenantDomain}`);
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendWelcomeEmail] Failed to create internal email transporter. Check INTERNAL SMTP config.');
        return false;
    }
    const loginUrl = constructLoginUrl(tenantDomain);
    const config = getInternalSmtpConfig();
    const mailOptions = {
        from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Welcome to SyntaxHive Hrm - Your Account for ${tenantName}`,
        text: `Hello ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${tenantName}" has been created.\n\nYou can log in using your email (${adminEmail}) and the password you set during registration.\n\nYour unique login page is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${adminName},</p><p>Welcome to <strong>SyntaxHive Hrm</strong>!</p><p>Your company account "<strong>${tenantName}</strong>" has been created.</p><p>You can log in using your email (${adminEmail}) and the password you set during registration.</p><p>Your unique login page is: <a href="${loginUrl}">${loginUrl}</a></p><p>Please bookmark this link for future access.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };
    try {
        console.log(`[sendWelcomeEmail] Sending email via ${config?.host}...`);
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

    const dbCheck = await testDbConnection();
    if (!dbCheck.success) {
        console.error("[registerTenantAction] Database connection check failed:", dbCheck.message);
        return { success: false, errors: [{ path: ['root'], message: `Database connection issue: ${dbCheck.message}` }] };
    }
    console.log("[registerTenantAction] Database connection successful.");

    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("[registerTenantAction] Registration Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();

    try {
        console.log("[registerTenantAction] Checking if 'tenants' table exists...");
        await pool.query('SELECT 1 FROM tenants LIMIT 1');
        console.log("[registerTenantAction] 'tenants' table exists. Schema seems initialized.");
    } catch (schemaError: any) {
        if (schemaError.code === '42P01') {
            console.warn("[registerTenantAction] 'tenants' table not found. Schema initialization failed or not run.");
            return { success: false, errors: [{ path: ['root'], message: 'Database schema is not initialized. Please run `npm run db:init` first.' }] };
        } else {
            console.error("[registerTenantAction] Unexpected error checking database schema:", schemaError);
            return { success: false, errors: [{ path: ['root'], message: `Database Error: Failed to verify schema. Details: ${schemaError.message}` }] };
        }
    }

    let newTenant: Tenant | null = null;
    try {
        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already registered.`);
            return { success: false, errors: [{ path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available.`);

        console.log(`[registerTenantAction] Creating tenant '${companyName}' with domain '${lowerCaseDomain}'...`);
        newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        if (!newTenant?.id) throw new Error("Failed to create tenant or retrieve tenant ID.");
        console.log(`[registerTenantAction] Tenant created successfully. ID: ${newTenant.id}`);

        console.log(`[registerTenantAction] Hashing password for admin user...`);
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        console.log(`[registerTenantAction] Password hashed.`);

        console.log(`[registerTenantAction] Creating admin user '${adminName}' (${adminEmail}) for tenant ${newTenant.id}...`);
        const newUser = await addUser({
            tenantId: newTenant.id, email: adminEmail, passwordHash: passwordHash,
            name: adminName, role: 'Admin', isActive: true,
        });
        console.log(`[registerTenantAction] Admin user created successfully. ID: ${newUser.id}`);

        console.log(`[registerTenantAction] Scheduling welcome email to ${adminEmail}...`);
        sendWelcomeEmail(newTenant.name, adminName, adminEmail, newTenant.domain).catch(err => {
            console.error("[registerTenantAction] Async welcome email sending failed:", err);
        });

        const loginUrl = constructLoginUrl(newTenant.domain);
        console.log(`[registerTenantAction] Login URL constructed: ${loginUrl}`);

        console.log(`[registerTenantAction] Registration process completed successfully for tenant ${newTenant.id}.`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        return { success: true, tenant: newTenant, user: safeUser, loginUrl: loginUrl };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during registration transaction:", error);

        let userMessage = 'Failed to register tenant due to a server error.';
        let errorPath: (string | number)[] = ['root'];

        if (error.message?.includes('already exists')) {
            userMessage = error.message;
            if (error.message.includes('domain')) errorPath = ['companyDomain'];
            else if (error.message.includes('email')) errorPath = ['adminEmail'];
        } else if (error.code === '42P01') {
            userMessage = `Database relation "${error.table || 'required'}" does not exist. Schema initialization might be incomplete. Run \`npm run db:init\`.`;
        } else if (error.message) {
            userMessage = error.message;
        }

        return { success: false, errors: [{ path: errorPath, message: userMessage }] };
    }
}

// --- Login Action ---
export async function loginAction(credentials: TenantLoginFormInputs): Promise<{ success: boolean; error?: string; user?: Omit<User, 'passwordHash'> }> {
    console.log(`[loginAction] Attempting login for email: ${credentials.email}`);

    const validation = tenantLoginSchema.safeParse(credentials);
    if (!validation.success) {
         console.warn("[loginAction] Invalid login credentials format:", validation.error);
         return { success: false, error: "Invalid email or password format." };
    }
    const { email, password } = validation.data;

    const cookieStore = cookies();
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomain = match ? match[1] : null;

    if (!tenantDomain) {
        console.error("[loginAction] Could not determine tenant domain from host:", host);
        if (normalizedHost === rootDomain || normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') {
             return { success: false, error: "Login not allowed on the root domain. Please use your company's login URL." };
        }
        return { success: false, error: "Invalid login URL. Could not identify company domain." };
    }

     console.log(`[loginAction] Inferred tenant domain: ${tenantDomain}`);

    try {
        const tenant = await getTenantByDomain(tenantDomain);
        if (!tenant) {
            console.warn(`[loginAction] Tenant not found for domain: ${tenantDomain}`);
            return { success: false, error: "Invalid company domain or login URL." };
        }
        console.log(`[loginAction] Found tenant: ${tenant.id} (${tenant.name})`);

        const user = await getUserByEmail(email, tenant.id);
        if (!user || !user.isActive) {
            console.warn(`[loginAction] User not found or inactive for email: ${email} in tenant: ${tenant.id}`);
            return { success: false, error: "Invalid email or password." };
        }
        console.log(`[loginAction] Found active user: ${user.id} (${user.name})`);

        console.log(`[loginAction] Verifying password for user: ${user.id}`);
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            console.warn(`[loginAction] Password mismatch for user: ${user.id}`);
            return { success: false, error: "Invalid email or password." };
        }
        console.log(`[loginAction] Password verified for user: ${user.id}`);

        const sessionData: SessionData = {
            userId: user.id,
            tenantId: user.tenantId,
            tenantDomain: tenant.domain,
            userRole: user.role,
        };

        cookieStore.set(MOCK_SESSION_COOKIE, JSON.stringify(sessionData), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            // Set domain to allow access across subdomains of the root domain
            domain: `.${rootDomain}`, // Prepend dot for subdomain compatibility
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 1 week
        });
        console.log(`[loginAction] Mock session cookie set for domain: .${rootDomain}`);

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

    let tenantDomain: string | null = null;
    let redirectUrl = '/login'; // Default to root login page
    const cookieStore = cookies(); // Get cookies instance
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

    try {
        // Retrieve domain from session cookie *before* deleting it
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);
        if (sessionCookie?.value) {
            const sessionData: SessionData = JSON.parse(sessionCookie.value);
            tenantDomain = sessionData.tenantDomain;
        }

        if (tenantDomain) {
            redirectUrl = constructLoginUrl(tenantDomain);
        }

        // Clear the session cookie
        cookieStore.delete({
             name: MOCK_SESSION_COOKIE,
             path: '/',
             domain: `.${rootDomain}` // Use the same domain scope used for setting
        });
        console.log(`[logoutAction] Mock session cookie cleared for domain: .${rootDomain}`);

    } catch (error) {
        console.error("[logoutAction] Error reading cookie or constructing redirect URL:", error);
        // Attempt to clear cookie even if retrieval failed
        try { cookieStore.delete({name: MOCK_SESSION_COOKIE, path: '/', domain: `.${rootDomain}`}); } catch {}
    }

    console.log(`[logoutAction] Redirecting to: ${redirectUrl}`);
    redirect(redirectUrl);
}

// --- Forgot Password Action (Tenant Specific) ---
export async function tenantForgotPasswordAction(formData: TenantForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomain = match ? match[1] : null;

     if (!tenantDomain) {
         console.error("[tenantForgotPasswordAction] Could not determine tenant domain from host:", host);
         return { success: false, message: "Could not identify company domain from the URL." };
     }
     console.log(`[tenantForgotPasswordAction] Processing request for tenant: ${tenantDomain}`);

    const validation = tenantForgotPasswordSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, message: validation.error.errors[0]?.message || "Invalid email format." };
    }
    const { email } = validation.data;
    return forgotPasswordLogic(email, tenantDomain);
}

// --- Forgot Password Action (Root) ---
export async function rootForgotPasswordAction(formData: RootForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    const validation = rootForgotPasswordSchema.safeParse(formData);
    if (!validation.success) {
        return { success: false, message: validation.error.errors[0]?.message || "Invalid input format." };
    }
    const { companyDomain, email } = validation.data;
    return forgotPasswordLogic(email, companyDomain.toLowerCase());
}

// --- Shared Forgot Password Logic ---
async function forgotPasswordLogic(email: string, tenantDomain: string): Promise<{ success: boolean; message: string }> {
    console.log(`[forgotPasswordLogic] Request for email: ${email}, domain: ${tenantDomain}`);
    const userMessage = `If an account exists for ${email} at ${tenantDomain}, you will receive reset instructions.`;

    let tenantId: string | null = null;
    try {
        const tenant = await getTenantByDomain(tenantDomain);
        if (!tenant) {
             console.warn(`[forgotPasswordLogic] Tenant not found for domain: ${tenantDomain}`);
             return { success: true, message: userMessage };
        }
        tenantId = tenant.id;
        console.log(`[forgotPasswordLogic] Found tenant: ${tenantId}`);

        const user = await getUserByEmail(email, tenantId);
        if (!user) {
            console.warn(`[forgotPasswordLogic] User not found for email: ${email} in tenant: ${tenantId}`);
            return { success: true, message: userMessage };
        }
         console.log(`[forgotPasswordLogic] Found user: ${user.id}`);

        const resetToken = `fake-reset-token-${Date.now()}`;
        console.log(`[forgotPasswordLogic] Generated reset token for user ${user.id}`);

        const transporter = createInternalTransporter();
        if (!transporter) {
             console.error('[forgotPasswordLogic] Failed to create internal transporter for reset email.');
            return { success: false, message: 'Failed to send reset email due to server configuration.' };
        }
        const resetUrlBase = constructLoginUrl(tenantDomain).replace('/login', '/reset-password');
        const resetUrl = `${resetUrlBase}?token=${resetToken}`;
        console.log(`[forgotPasswordLogic] Reset URL: ${resetUrl}`);

        const config = getInternalSmtpConfig();
        const mailOptions = {
            from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
            to: user.email,
            subject: `Password Reset Request for SyntaxHive Hrm (${tenant.name})`,
            text: `Hello ${user.name},\n\nYou requested a password reset for your SyntaxHive Hrm account associated with ${tenant.name}.\n\nClick the link below to reset your password:\n${resetUrl}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
            html: `<p>Hello ${user.name},</p><p>You requested a password reset for your <strong>SyntaxHive Hrm</strong> account associated with <strong>${tenant.name}</strong>.</p><p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
        };
        await transporter.sendMail(mailOptions);
        console.log(`[forgotPasswordLogic] Password reset email sent to ${user.email}`);
        return { success: true, message: userMessage };

    } catch (error: any) {
        console.error('[forgotPasswordLogic] Error:', error);
        return { success: false, message: 'An error occurred while processing the password reset request.' };
    }
}

// --- Helpers using getSessionData ---
export async function getSessionData(): Promise<SessionData | null> {
    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);

        if (sessionCookie?.value) {
            const sessionData: SessionData = JSON.parse(sessionCookie.value);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (
                sessionData &&
                sessionData.userId && uuidRegex.test(sessionData.userId) &&
                sessionData.tenantId && uuidRegex.test(sessionData.tenantId) &&
                sessionData.tenantDomain &&
                sessionData.userRole
            ) {
                // console.log("[getSessionData] Valid session data found:", sessionData);
                return sessionData;
            }
            console.warn("[getSessionData] Invalid session data found in cookie.");
        } else {
            // console.log("[getSessionData] No session cookie found.");
        }
    } catch (error) {
        console.error("[getSessionData] Error reading or parsing session cookie:", error);
    }
    return null;
}

export async function getTenantIdFromSession(): Promise<string | null> {
    const session = await getSessionData();
    if (!session) console.log("[getTenantIdFromSession] No session found.");
    // else console.log("[getTenantIdFromSession] Found session, returning tenantId:", session.tenantId);
    return session?.tenantId ?? null;
}

export async function getUserIdFromSession(): Promise<string | null> {
    const session = await getSessionData();
    return session?.userId ?? null;
}

export async function getUserRoleFromSession(): Promise<string | null> {
    const session = await getSessionData();
    return session?.userRole ?? null;
}

export async function isAdminFromSession(): Promise<boolean> {
    const role = await getUserRoleFromSession();
    return role === 'Admin';
}

export async function getUserFromSession(): Promise<Omit<User, 'passwordHash'> | null> {
    const session = await getSessionData();
    if (!session?.userId || !session.tenantId) {
        return null;
    }
    try {
        const user = await dbGetUserById(session.userId); // Only userId needed now
        if (user && user.tenantId === session.tenantId) { // Verify tenant match
            const { passwordHash, ...safeUser } = user;
            return safeUser;
        }
    } catch (error) {
        console.error("[getUserFromSession] Error fetching user from DB:", error);
    }
    return null;
}