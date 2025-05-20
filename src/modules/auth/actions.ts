
'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { cookies, headers } from 'next/headers';
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
    type SessionData,
} from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain, getUserById as dbGetUserById } from '@/modules/auth/lib/db';
import pool from '@/lib/db';
import { initializeDatabase } from '@/lib/init-db';
import { MOCK_SESSION_COOKIE } from '@/lib/auth';
import { redirect } from 'next/navigation';

const SALT_ROUNDS = 10;

const INTERNAL_SMTP_HOST = process.env.INTERNAL_SMTP_HOST;
const INTERNAL_SMTP_PORT_STR = process.env.INTERNAL_SMTP_PORT;
const INTERNAL_SMTP_USER = process.env.INTERNAL_SMTP_USER;
const INTERNAL_SMTP_PASSWORD = process.env.INTERNAL_SMTP_PASSWORD;
const INTERNAL_SMTP_SECURE_STR = process.env.INTERNAL_SMTP_SECURE;
const INTERNAL_FROM_EMAIL = process.env.INTERNAL_FROM_EMAIL || 'noreply@syntaxhivehrm.app';
const INTERNAL_FROM_NAME = process.env.INTERNAL_FROM_NAME || 'SyntaxHive Hrm System';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

function getInternalSmtpConfig(): { host: string; port: number; user: string; pass: string; secure: boolean; fromEmail: string; fromName: string } | null {
    if (!INTERNAL_SMTP_HOST || !INTERNAL_SMTP_PORT_STR || !INTERNAL_SMTP_USER || !INTERNAL_SMTP_PASSWORD) {
        console.warn('[Internal Email Config] Missing required internal SMTP environment variables (HOST, PORT, USER, PASS). Registration/reset emails may not send.');
        return null;
    }
    const port = parseInt(INTERNAL_SMTP_PORT_STR, 10);
    if (isNaN(port)) {
         console.warn('[Internal Email Config] Invalid INTERNAL_SMTP_PORT.');
         return null;
    }
    let secure = port === 465;
    if (INTERNAL_SMTP_SECURE_STR !== undefined) {
        secure = INTERNAL_SMTP_SECURE_STR === 'true';
    }
    return {
        host: INTERNAL_SMTP_HOST, port, user: INTERNAL_SMTP_USER, pass: INTERNAL_SMTP_PASSWORD, secure,
        fromEmail: INTERNAL_FROM_EMAIL, fromName: INTERNAL_FROM_NAME,
    };
}

function createInternalTransporter(): nodemailer.Transporter | null {
    const config = getInternalSmtpConfig();
    if (!config) return null;
    return nodemailer.createTransport({
        host: config.host, port: config.port, auth: { user: config.user, pass: config.pass },
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
        secure: config.secure, requireTLS: config.port === 587 && !config.secure,
    });
}

export async function sendAdminNotification(subject: string, textBody: string, htmlBody?: string): Promise<boolean> {
    if (!ADMIN_EMAIL) {
        console.error("[sendAdminNotification] Admin email (ADMIN_EMAIL) not configured.");
        return false;
    }
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendAdminNotification] Failed to create internal email transporter.');
        return false;
    }
    const config = getInternalSmtpConfig();
    const mailOptions = {
        from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
        to: ADMIN_EMAIL, subject, text: textBody, html: htmlBody || `<p>${textBody.replace(/\n/g, '<br>')}</p>`,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendAdminNotification] Admin notification email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('[sendAdminNotification] Error sending admin notification email:', error);
        return false;
    }
}

function constructLoginUrl(tenantDomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let port = '';
    try {
        const url = new URL(baseUrl);
        if (url.port && url.port !== '80' && url.port !== '443') port = `:${url.port}`;
    } catch (e) {
        console.warn("[constructLoginUrl] Could not parse NEXT_PUBLIC_BASE_URL to extract port.");
        const defaultPort = process.env.PORT || '9002';
        if (process.env.NODE_ENV !== 'production' && defaultPort !== '80' && defaultPort !== '443') port = `:${defaultPort}`;
    }
    const loginUrl = `${protocol}//${tenantDomain}.${rootDomain}${port}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl}`);
    return loginUrl;
}

async function sendWelcomeEmail(tenantName: string, adminName: string, adminEmail: string, tenantDomain: string): Promise<boolean> {
    console.log(`[sendWelcomeEmail] Sending welcome email to ${adminEmail} for ${tenantDomain}`);
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendWelcomeEmail] Failed to create internal email transporter.');
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
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendWelcomeEmail] Welcome email sent successfully:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('[sendWelcomeEmail] Error sending welcome email:', error);
        await sendAdminNotification(
             `Failed to Send Welcome Email (Tenant: ${tenantDomain})`,
             `Failed to send welcome email to ${adminEmail} for tenant ${tenantName} (${tenantDomain}).\nError: ${error.message}`
         );
        return false;
    }
}

export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: Omit<User, 'passwordHash'>; loginUrl?: string; errors?: { path: (string | number)[]; message: string }[] }> {
    console.log("[registerTenantAction] Starting registration process...");
    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("[registerTenantAction] Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors.map(e => ({ path: e.path, message: e.message })) };
    }
    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();
    let newTenant: Tenant | null = null;
    try {
        await initializeDatabase();
        console.log("[registerTenantAction] Database initialization check complete.");

        console.log(`[registerTenantAction] Checking if domain '${lowerCaseDomain}' exists...`);
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Domain '${lowerCaseDomain}' already registered.`);
            return { success: false, errors: [{ path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Domain '${lowerCaseDomain}' is available. Creating tenant...`);
        newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });
        if (!newTenant?.id) throw new Error("Failed to create tenant or retrieve tenant ID.");
        console.log(`[registerTenantAction] Tenant '${companyName}' created with ID: ${newTenant.id}. Adding admin user...`);

        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        const newUser = await addUser({
            tenantId: newTenant.id, email: adminEmail, passwordHash, name: adminName, role: 'Admin', isActive: true,
        });
        console.log(`[registerTenantAction] Admin user '${adminName}' added with ID: ${newUser.id}.`);

        sendWelcomeEmail(newTenant.name, adminName, adminEmail, newTenant.domain).catch(err => console.error("[registerTenantAction] Async welcome email sending failed:", err));
        const loginUrl = constructLoginUrl(newTenant.domain);
        const { passwordHash: _, ...safeUser } = newUser;
        return { success: true, tenant: newTenant, user: safeUser, loginUrl };
    } catch (error: any) {
        console.error("[registerTenantAction] Error during registration transaction:", error);
        if (newTenant?.id && !error.message?.includes('User email already exists')) {
            console.warn(`[registerTenantAction] Rolling back tenant creation (ID: ${newTenant.id}).`);
            try {
                const client = await pool.connect();
                await client.query('DELETE FROM tenants WHERE id = $1', [newTenant.id]);
                client.release();
            } catch (cleanupError) { console.error(`[registerTenantAction] CRITICAL: Failed to cleanup tenant ${newTenant.id}:`, cleanupError); }
        }
        let userMessage = 'Failed to register tenant due to a server error.';
        let errorPath: (string | number)[] = ['root'];
        if (error.message?.includes('already exists')) {
            userMessage = error.message;
            if (error.message.includes('domain')) errorPath = ['companyDomain'];
            else if (error.message.includes('email')) errorPath = ['adminEmail'];
        } else if (error.message?.includes('Schema not initialized') || error.message?.includes('relation "tenants" does not exist')) {
            userMessage = 'Database Error: Schema not initialized. Please run `npm run db:init` manually or check database logs.';
        } else if (error.message?.includes('Database connection issue')) {
            userMessage = error.message;
        } else if (error.message) {
            userMessage = `Registration failed: ${error.message}`;
        }
        return { success: false, errors: [{ path: errorPath, message: userMessage }] };
    }
}

export async function loginAction(credentials: TenantLoginFormInputs): Promise<{ success: boolean; error?: string; user?: Omit<User, 'passwordHash'> }> {
    console.log(`[loginAction] Attempting login for email: ${credentials.email}`);
    const validation = tenantLoginSchema.safeParse(credentials);
    if (!validation.success) return { success: false, error: "Invalid email or password format." };
    const { email, password } = validation.data;
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomainFromHost = match ? match[1] : null;

    if (!tenantDomainFromHost) {
        if (normalizedHost === rootDomain || normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') {
             return { success: false, error: "Login not allowed on the root domain. Please use your company's login URL." };
        }
        return { success: false, error: "Invalid login URL. Could not identify company domain." };
    }

    try {
        const tenant = await getTenantByDomain(tenantDomainFromHost);
        if (!tenant) return { success: false, error: "Invalid company domain or login URL." };
        const user = await getUserByEmail(email, tenant.id);
        if (!user || !user.isActive) return { success: false, error: "Invalid email or password." };
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) return { success: false, error: "Invalid email or password." };

        const sessionData: SessionData = {
            userId: user.id, tenantId: user.tenantId, tenantDomain: tenant.domain, userRole: user.role,
        };

        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax' as const,
            maxAge: 60 * 60 * 24 * 7, // 1 week
        };

        // Only set the domain attribute if not on localhost or an IP address.
        // For localhost/IPs, omitting the domain attribute scopes the cookie to the exact host.
        if (rootDomain !== 'localhost' && !normalizedHost.match(/^(127\.0\.0\.1|::1|(\d{1,3}\.){3}\d{1,3})$/)) {
            // @ts-ignore
            cookieOptions.domain = `.${rootDomain}`;
            console.log(`[loginAction] Setting session cookie with domain: .${rootDomain}`);
        } else {
            console.log(`[loginAction] Setting session cookie without explicit domain (for localhost/IP).`);
        }

        cookies().set(MOCK_SESSION_COOKIE, JSON.stringify(sessionData), cookieOptions);
        const { passwordHash: _, ...safeUser } = user;
        return { success: true, user: safeUser };
    } catch (error: any) {
        console.error("[loginAction] Error during login:", error);
        return { success: false, error: "An unexpected server error occurred during login." };
    }
}

export async function logoutAction() {
    console.log("[logoutAction] Logging out user...");
    let tenantDomain: string | null = null;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);
        if (sessionCookie?.value) {
            try {
                 const sessionData: SessionData = JSON.parse(sessionCookie.value);
                 tenantDomain = sessionData.tenantDomain;
            } catch (parseError) { console.error("[logoutAction] Error parsing session cookie:", parseError); }
        }

        const cookieDeleteOptions: { name: string; path: string; domain?: string } = {
             name: MOCK_SESSION_COOKIE,
             path: '/',
        };
        if (rootDomain !== 'localhost' && !(headers().get('host') || '').split(':')[0].match(/^(127\.0\.0\.1|::1|(\d{1,3}\.){3}\d{1,3})$/)) {
            cookieDeleteOptions.domain = `.${rootDomain}`;
        }
        cookies().delete(cookieDeleteOptions);
        console.log(`[logoutAction] Mock session cookie cleared (Domain: ${cookieDeleteOptions.domain || 'default'}).`);
    } catch (error) { console.error("[logoutAction] Error clearing cookie:", error); }
    const redirectUrl = tenantDomain ? constructLoginUrl(tenantDomain) : '/login';
    redirect(redirectUrl);
}

export async function tenantForgotPasswordAction(formData: TenantForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];
    const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const tenantDomain = match ? match[1] : null;
    if (!tenantDomain) return { success: false, message: "Could not identify company domain." };
    const validation = tenantForgotPasswordSchema.safeParse(formData);
    if (!validation.success) return { success: false, message: validation.error.errors[0]?.message || "Invalid email format." };
    return forgotPasswordLogic(validation.data.email, tenantDomain);
}

export async function rootForgotPasswordAction(formData: RootForgotPasswordFormInputs): Promise<{ success: boolean; message: string }> {
    const validation = rootForgotPasswordSchema.safeParse(formData);
    if (!validation.success) return { success: false, message: validation.error.errors[0]?.message || "Invalid input." };
    return forgotPasswordLogic(validation.data.email, validation.data.companyDomain.toLowerCase());
}

async function forgotPasswordLogic(email: string, tenantDomain: string): Promise<{ success: boolean; message: string }> {
    const userMessage = `If an account exists for ${email} at ${tenantDomain}, you will receive reset instructions.`;
    try {
        const tenant = await getTenantByDomain(tenantDomain);
        if (!tenant) return { success: true, message: userMessage };
        const user = await getUserByEmail(email, tenant.id);
        if (!user) return { success: true, message: userMessage };
        const resetToken = `fake-reset-token-${Date.now()}`; // Replace with secure implementation
        const transporter = createInternalTransporter();
        if (!transporter) {
            await sendAdminNotification(
                `Password Reset Failed (Config Issue - Tenant: ${tenantDomain})`,
                `Failed to send password reset to ${email} for tenant ${tenant.name} (${tenantDomain}) due to SMTP config.`
            );
            return { success: false, message: 'Server configuration error for sending email.' };
        }
        const resetUrlBase = constructLoginUrl(tenantDomain).replace('/login', '/reset-password');
        const resetUrl = `${resetUrlBase}?token=${resetToken}`;
        const config = getInternalSmtpConfig();
        const mailOptions = {
            from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
            to: user.email,
            subject: `Password Reset Request for SyntaxHive Hrm (${tenant.name})`,
            text: `Hello ${user.name},\n\nYou requested a password reset for SyntaxHive Hrm.\n\nClick here: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.\n\nSyntaxHive Hrm Team`,
            html: `<p>Hello ${user.name},</p><p>Password reset for <strong>SyntaxHive Hrm</strong> (${tenant.name}).</p><p><a href="${resetUrl}">Reset Password</a></p><p>Expires in 1 hour.</p><p>Ignore if not requested.</p><p>SyntaxHive Hrm Team</p>`,
        };
        await transporter.sendMail(mailOptions);
        return { success: true, message: userMessage };
    } catch (error: any) {
        console.error('[forgotPasswordLogic] Error:', error);
        await sendAdminNotification(
            `Password Reset Failed (Error - Tenant: ${tenantDomain})`,
            `Password reset for ${email} (Tenant: ${tenantDomain}) failed.\nError: ${error.message}`
        );
        return { success: false, message: 'Error processing password reset.' };
    }
}

export async function getSessionData(): Promise<SessionData | null> {
    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);
        if (sessionCookie?.value) {
            const sessionData: SessionData = JSON.parse(sessionCookie.value);
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (sessionData && uuidRegex.test(sessionData.userId) && uuidRegex.test(sessionData.tenantId) &&
                sessionData.tenantDomain && sessionData.userRole) {
                return sessionData;
            }
            console.warn("[getSessionData] Invalid session data structure in cookie.");
        } else {
            // console.log("[getSessionData] No session cookie found.");
        }
    } catch (error) { console.error("[getSessionData] Error reading/parsing session cookie:", error); }
    return null;
}

export async function getTenantIdFromSession(): Promise<string | null> {
    const session = await getSessionData();
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
    if (!session?.userId || !session.tenantId) return null;
    try {
        const user = await dbGetUserById(session.userId);
        if (user && user.tenantId === session.tenantId) {
            const { passwordHash, ...safeUser } = user;
            return safeUser;
        }
    } catch (error) { console.error("[getUserFromSession] Error fetching user:", error); }
    return null;
}
