
'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import nodemailer from 'nodemailer';
import { cookies, headers } from 'next/headers';
import type {
    RegistrationFormData,
    Tenant,
    User,
    UserRole,
    TenantLoginFormInputs,
    SessionData,
} from '@/modules/auth/types';
import { registrationSchema, tenantLoginSchema, userRoleSchema } from '@/modules/auth/types';
import {
    addTenant as dbAddTenant,
    getUserByEmail as dbGetUserByEmail,
    addUser as dbAddUserInternal,
    getTenantByDomain as dbGetTenantByDomain,
    getUserById as dbGetUserByIdInternal,
    getUserByUsername as dbGetUserByUsername,
    getEmployeeByEmployeeIdAndTenantId as dbGetEmployeeByHumanId,
    getEmployeeByUserId as dbGetAuthEmployeeByUserId,
    deleteUserById as dbDeleteUserById,
} from '@/modules/auth/lib/db';
import pool from '@/lib/db';
import { testDbConnection } from '@/lib/db';
import { initializeDatabase } from '@/lib/init-db';
// Removed import of syntaxHiveHrmSession from '@/lib/auth'
import { redirect } from 'next/navigation';
import { getEmailSettings as dbGetEmailSettings } from '@/modules/communication/lib/db';
import type { EmailSettings } from '@/modules/communication/types';
import type { Employee } from '@/modules/employees/types';

// Define the cookie name directly in this module
const syntaxHiveHrmSession = 'syntaxHiveHrmSession';

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
        console.warn('[Internal Email Config] Missing required internal SMTP environment variables (HOST, PORT, USER, PASS). Critical emails may not send.');
        return null;
    }
    const port = parseInt(INTERNAL_SMTP_PORT_STR, 10);
    if (isNaN(port)) {
         console.warn('[Internal Email Config] Invalid INTERNAL_SMTP_PORT.');
         return null;
    }
    let secure: boolean;
    if (INTERNAL_SMTP_SECURE_STR !== undefined) {
        secure = INTERNAL_SMTP_SECURE_STR === 'true';
    } else {
        secure = port === 465;
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
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        secure: config.secure,
    };

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
    const config = getInternalSmtpConfig();
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

function constructLoginUrl(subdomain: string): string {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
    
    // Attempt to get port from NEXT_PUBLIC_BASE_URL, otherwise default
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let portSection = '';
    try {
        const url = new URL(baseUrl);
        if (url.port && url.port !== '80' && url.port !== '443') {
            portSection = `:${url.port}`;
        }
    } catch (e) {
        console.warn(`[constructLoginUrl] Could not parse NEXT_PUBLIC_BASE_URL (${baseUrl}) to extract port. Falling back to default or no port.`);
        // Fallback to a common dev port if parsing fails and no explicit port in rootDomain
        if (!rootDomain.includes(':') && process.env.PORT && process.env.PORT !== '80' && process.env.PORT !== '443') {
            portSection = `:${process.env.PORT}`;
        } else if (!rootDomain.includes(':') && baseUrl.includes(':')) { // Try to get port from baseUrl if rootDomain doesn't have one
             const portMatch = baseUrl.match(/:(\d+)/);
             if (portMatch && portMatch[1] !== '80' && portMatch[1] !== '443') {
                 portSection = `:${portMatch[1]}`;
             }
        }
    }

    const loginUrl = `${protocol}//${subdomain}.${rootDomain}${portSection}/login`;
    console.log(`[constructLoginUrl] Constructed: ${loginUrl} for subdomain ${subdomain}`);
    return loginUrl;
}

async function sendNewTenantWelcomeEmail(tenantName: string, adminName: string, adminEmail: string, adminUsername: string, tenantSubdomain: string): Promise<boolean> {
    console.log(`[sendNewTenantWelcomeEmail] Attempting to send welcome email to ${adminEmail} for tenant ${tenantSubdomain}`);
    const transporter = createInternalTransporter();
    if (!transporter) {
        console.error('[sendNewTenantWelcomeEmail] Failed to create internal email transporter for admin welcome.');
        await sendAdminNotification(
            `Critical: Tenant Welcome Email Failed (Internal SMTP Config Issue - Tenant: ${tenantSubdomain})`,
            `Failed to send welcome email to ${adminEmail} for new tenant ${tenantName} (${tenantSubdomain}) due to internal SMTP configuration issues. Please check .env variables.`
        );
        return false;
    }

    const loginUrl = constructLoginUrl(tenantSubdomain);
    const config = getInternalSmtpConfig();

    const mailOptions = {
        from: `"${config?.fromName || INTERNAL_FROM_NAME}" <${config?.fromEmail || INTERNAL_FROM_EMAIL}>`,
        to: adminEmail,
        subject: `Welcome to SyntaxHive Hrm - Your Account for ${tenantName}`,
        text: `Hello ${adminName},\n\nWelcome to SyntaxHive Hrm!\n\nYour company account "${tenantName}" has been created.\n\nYour Username: ${adminUsername}\nYou can also log in using your email: ${adminEmail}\nPassword: (The password you set during registration)\n\nYour unique login page is: ${loginUrl}\n\nPlease bookmark this link for future access.\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${adminName},</p><p>Welcome to <strong>SyntaxHive Hrm</strong>!</p><p>Your company account "<strong>${tenantName}</strong>" has been created.</p><p>Your Username: <strong>${adminUsername}</strong><br>You can also log in using your email: <strong>${adminEmail}</strong><br>Password: (The password you set during registration)</p><p>Your unique login page is: <a href="${loginUrl}">${loginUrl}</a></p><p>Please bookmark this link for future access.</p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[sendNewTenantWelcomeEmail] Admin welcome email sent successfully:', info.messageId);
        return true;
    } catch (error: any) {
        console.error('[sendNewTenantWelcomeEmail] Error sending admin welcome email:', error);
        await sendAdminNotification(
             `Failed to Send Tenant Welcome Email (Tenant: ${tenantSubdomain})`,
             `Failed to send welcome email to ${adminEmail} for tenant ${tenantName} (${tenantSubdomain}).\nError: ${error.message}\nPlease ensure internal SMTP settings are correct and the mail server is reachable.`
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
    const { companyName, companySubdomain, adminName, adminUsername, adminEmail, adminPassword } = validation.data;
    const lowerCaseSubdomain = companySubdomain.toLowerCase();
    let newTenant: Tenant | null = null;
    try {
        const dbTestResult = await testDbConnection();
        if (!dbTestResult.success) {
            console.error("[registerTenantAction] Database connection test failed:", dbTestResult.message);
            throw new Error(`Database connection failed: ${dbTestResult.message}. Please ensure the database is running and accessible.`);
        }
        console.log("[registerTenantAction] Database connection test successful.");

        try {
            await initializeDatabase();
            console.log("[registerTenantAction] Database schema initialized or verified.");
        } catch (initError: any) {
            console.error("[registerTenantAction] Critical error during initializeDatabase:", initError.message, initError.stack);
            await sendAdminNotification(
                'Critical: Database Schema Initialization Failed during Registration',
                `Attempt to initialize database schema for new tenant registration (${lowerCaseSubdomain}) failed.\nError: ${initError.message}\n\nManual intervention may be required.`
            );
            return { success: false, errors: [{ path: ['root'], message: 'A critical error occurred setting up the database. Please contact support or try again later.' }] };
        }

        console.log(`[registerTenantAction] Checking if subdomain '${lowerCaseSubdomain}' exists...`);
        const existingTenant = await dbGetTenantByDomain(lowerCaseSubdomain);
        if (existingTenant) {
            console.warn(`[registerTenantAction] Subdomain '${lowerCaseSubdomain}' already registered.`);
            return { success: false, errors: [{ path: ['companySubdomain'], message: 'This subdomain is already registered.' }] };
        }
        console.log(`[registerTenantAction] Subdomain '${lowerCaseSubdomain}' is available. Creating tenant...`);
        newTenant = await dbAddTenant({ name: companyName, subdomain: lowerCaseSubdomain });
        if (!newTenant?.tenant_id) throw new Error("Failed to create tenant or retrieve tenant ID.");

        console.log(`[registerTenantAction] Tenant '${companyName}' created with ID: ${newTenant.tenant_id}. Adding admin user...`);
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);
        const newUser = await dbAddUserInternal({
            tenant_id: newTenant.tenant_id,
            username: adminUsername.toLowerCase(), // Store username in lowercase for consistency
            passwordHash,
            email: adminEmail.toLowerCase(),
            name: adminName,
            role: 'Admin',
            is_active: true,
            // employee_id: null, // Not linking to employees table directly at user creation by default
        });
        console.log(`[registerTenantAction] Admin user '${adminName}' added with user_id: ${newUser.user_id}.`);

        sendNewTenantWelcomeEmail(newTenant.name, adminName, adminEmail, adminUsername, newTenant.subdomain)
            .then(sent => {
                 if (sent) console.log(`[registerTenantAction] Admin welcome email for ${newTenant!.subdomain} queued successfully.`);
                 else console.error(`[registerTenantAction] Admin welcome email for ${newTenant!.subdomain} failed to send (logged separately).`);
            })
            .catch(err => console.error("[registerTenantAction] Async admin welcome email sending failed after successful registration:", err));

        const loginUrl = constructLoginUrl(newTenant.subdomain);
        const { passwordHash: _, ...safeUser } = newUser;
        return { success: true, tenant: newTenant, user: safeUser, loginUrl };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during tenant registration:", error.message, error.stack);
        if (newTenant?.tenant_id && !error.message?.includes('already exists')) {
            console.warn(`[registerTenantAction] Rolling back tenant creation (ID: ${newTenant.tenant_id}) due to subsequent error.`);
            try {
                const client = await pool.connect();
                await client.query('DELETE FROM tenants WHERE tenant_id = $1', [newTenant.tenant_id]);
                client.release();
                console.log(`[registerTenantAction] Tenant ${newTenant.tenant_id} rolled back successfully.`);
            } catch (cleanupError) {
                console.error(`[registerTenantAction] CRITICAL: Failed to cleanup tenant ${newTenant.tenant_id} after error:`, cleanupError);
                 await sendAdminNotification(
                    'Critical: Tenant Cleanup Failed After Registration Error',
                    `Tenant ${newTenant.name} (subdomain: ${lowerCaseSubdomain}, id: ${newTenant.tenant_id}) was created but admin user creation failed. Attempt to rollback tenant failed.\nOriginal Error: ${error.message}\nCleanup Error: ${(cleanupError as Error).message}\nManual database cleanup required.`
                );
            }
        }
        let userMessage = 'Failed to register tenant due to a server error.';
        let errorPath: (string | number)[] = ['root'];
        if (error.message?.includes('already exists')) {
            userMessage = error.message;
            if (error.message.includes('subdomain')) errorPath = ['companySubdomain'];
            else if (error.message.includes('email')) errorPath = ['adminEmail'];
            else if (error.message.includes('username')) errorPath = ['adminUsername'];
        } else if (error.message?.includes('Database schema not initialized') || error.message?.includes('relation "tenants" does not exist')) {
            userMessage = 'Database Error: Schema not initialized. Please ensure the database setup script (db:init) has run successfully or contact support.';
        } else if (error.message?.includes('Database connection failed') || error.message?.includes('connection refused')) {
            userMessage = `Database connection issue: ${error.message}. Please check database server status and configuration.`;
        } else if (error.message) {
            userMessage = `Registration failed: ${error.message}`;
        }
        return { success: false, errors: [{ path: errorPath, message: userMessage }] };
    }
}

export async function loginAction(credentials: TenantLoginFormInputs): Promise<{ success: boolean; error?: string; user?: Omit<User, 'passwordHash'> }> {
    const headersList = headers();
    const cookieStore = cookies();
    const currentCookieName = syntaxHiveHrmSession;

    console.log(`[loginAction] Attempting login with identifier: ${credentials.loginIdentifier}`);
    const validation = tenantLoginSchema.safeParse(credentials);
    if (!validation.success) {
        return { success: false, error: "Invalid login identifier or password format." };
    }
    const { loginIdentifier, password } = validation.data;

    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];

    const match = normalizedHost.match(new RegExp(`^(.*)\\.${rootDomain.replace(/\./g, '\\.')}$`));
    let tenantSubdomainFromHost = match ? match[1] : null;

    const isDirectLocalAccess = normalizedHost === rootDomain ||
                           normalizedHost === 'localhost' ||
                           normalizedHost === '127.0.0.1' ||
                           normalizedHost.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/);

    if (isDirectLocalAccess && !tenantSubdomainFromHost) { // If it's root domain, no subdomain
        console.warn(`[loginAction] Attempted login from root context (${normalizedHost}). Denying.`);
        return { success: false, error: "Login not allowed directly on the root domain or IP. Please use your company's specific login URL (e.g., your-company.localhost)." };
    }
    if (!tenantSubdomainFromHost && !isDirectLocalAccess) { // Some other unhandled host
        console.warn(`[loginAction] Login attempt from unrecognized host: ${normalizedHost}. Cannot determine tenant.`);
        return { success: false, error: "Invalid login URL. Cannot determine company." };
    }

    try {
        const tenant = await dbGetTenantByDomain(tenantSubdomainFromHost!);
        if (!tenant || !tenant.tenant_id) {
            console.warn(`[loginAction] Tenant not found for subdomain: ${tenantSubdomainFromHost}`);
            return { success: false, error: "Invalid company subdomain or login URL." };
        }

        let user: User | undefined;
        let employeeForStatusCheck: Employee | undefined;
        const lowerCaseLoginIdentifier = loginIdentifier.toLowerCase();

        if (lowerCaseLoginIdentifier.includes('@')) {
            console.log(`[loginAction] Attempting to find user by email: ${lowerCaseLoginIdentifier} for tenant ${tenant.tenant_id}`);
            user = await dbGetUserByEmail(lowerCaseLoginIdentifier, tenant.tenant_id);
        } else {
            console.log(`[loginAction] Attempting to find user by username: ${lowerCaseLoginIdentifier} for tenant ${tenant.tenant_id}`);
            user = await dbGetUserByUsername(lowerCaseLoginIdentifier, tenant.tenant_id);
            if (!user) {
                console.log(`[loginAction] User not found by username, trying by Employee ID: ${loginIdentifier}`);
                const employeeByStringId = await dbGetEmployeeByHumanId(loginIdentifier, tenant.tenant_id); // This uses VARCHAR employee_id
                if (employeeByStringId && employeeByStringId.user_id) { // employeeByStringId.user_id is the UUID from users table
                    console.log(`[loginAction] Employee found by Employee ID, corresponding user_id: ${employeeByStringId.user_id}`);
                    user = await dbGetUserByIdInternal(employeeByStringId.user_id); // Fetch user by UUID user_id
                } else {
                    console.log(`[loginAction] No employee found with Employee ID: ${loginIdentifier}`);
                }
            }
        }
        
        console.log('[loginAction] User object after DB lookup:', user ? { userId: user.user_id, username: user.username, email: user.email, role: user.role, is_active: user.is_active } : 'undefined');

        if (!user || !user.is_active) {
            console.log(`[loginAction] User not found or globally inactive for identifier: ${loginIdentifier}`);
            return { success: false, error: "Invalid credentials or inactive account." };
        }

        if (user.user_id) {
            employeeForStatusCheck = await dbGetAuthEmployeeByUserId(user.user_id, tenant.tenant_id);
        }
        
        if (employeeForStatusCheck && employeeForStatusCheck.status === 'Inactive') {
            console.log(`[loginAction] Employee ${employeeForStatusCheck.id} (User: ${user.user_id}) is Inactive. Denying login.`);
            return { success: false, error: "This employee account is Inactive. Please contact your administrator." };
        }

        if (user.role === 'Employee' && (!employeeForStatusCheck || employeeForStatusCheck.status !== 'Active')) {
             console.log(`[loginAction] User ${user.user_id} has 'Employee' role but no linked active employee profile found. Denying login.`);
             return { success: false, error: "Employee profile not found or inactive. Please contact your administrator." };
        }

        console.log(`[loginAction] User found: ${user.user_id} (Username: ${user.username}). Comparing password...`);
        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) {
            console.log(`[loginAction] Password mismatch for user: ${user.user_id}`);
            return { success: false, error: "Invalid credentials." };
        }

        console.log(`[loginAction] Login successful for user: ${user.user_id}. Setting session cookie.`);
        const sessionData: SessionData = {
            userId: user.user_id,
            tenantId: user.tenant_id!,
            tenantDomain: tenant.subdomain,
            userRole: user.role,
            username: user.username,
        };
        
        console.log('[loginAction] SessionData object BEFORE stringify for cookie:', JSON.stringify(sessionData));

        const cookieOptions: Parameters<typeof cookieStore.set>[2] = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax' as const,
            maxAge: 60 * 60 * 24 * 7, // 1 week
        };

        console.log("[loginAction] Setting cookie with options (domain attribute omitted for localhost flexibility):", cookieOptions);
        cookieStore.set(currentCookieName, JSON.stringify(sessionData), cookieOptions);
        
        const setCookie = cookieStore.get(currentCookieName); // Read back immediately
        console.log(`[loginAction] Cookie immediately after set: Name=${setCookie?.name}, Value=${setCookie?.value ? 'Exists' : 'MISSING'}, Domain=${setCookie?.domain}, Path=${setCookie?.path}, RawValue=${setCookie?.value}`);


        const { passwordHash: _, ...safeUser } = user;
        return { success: true, user: safeUser };
    } catch (error: any) {
        console.error("[loginAction] Error during login:", error);
        return { success: false, error: "An unexpected server error occurred during login." };
    }
}

export async function logoutAction() {
    const currentCookieName = syntaxHiveHrmSession;
    console.log("[logoutAction] Logging out user...");
    const headersList = headers();
    const cookieStore = cookies();

    let tenantSubdomain: string | null = null;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const currentHost = headersList.get('host')?.split(':')[0] || '';

    try {
        const sessionCookie = cookieStore.get(currentCookieName);
        if (sessionCookie?.value) {
            try {
                 const sessionData: SessionData = JSON.parse(sessionCookie.value);
                 tenantSubdomain = sessionData.tenantDomain;
            } catch (parseError) { console.error("[logoutAction] Error parsing session cookie:", parseError); }
        }
        const cookieDeleteOptions: { name: string; path: string; domain?: string } = {
             name: currentCookieName,
             path: '/',
        };
        cookies().delete(cookieDeleteOptions);
        console.log("[logoutAction] Session cookie deleted with options:", cookieDeleteOptions);
    } catch (error) { console.error("[logoutAction] Error clearing cookie:", error); }

    const redirectUrl = tenantSubdomain ? constructLoginUrl(tenantSubdomain) : '/login';
    console.log(`[logoutAction] Redirecting to: ${redirectUrl}`);
    redirect(redirectUrl);
}

export async function _parseSessionCookie(): Promise<SessionData | null> {
  const currentCookieName = syntaxHiveHrmSession;
  console.log(`[_parseSessionCookie] Attempting to get and parse session cookie: '${currentCookieName}'`);
  const headersList = headers();
  console.log(`[_parseSessionCookie] Current request host: ${headersList.get('host')}`);
  const allCookies = cookies().getAll();
  console.log("[_parseSessionCookie] All cookies visible in this context:", allCookies.map(c => ({ name: c.name, value: c.name === currentCookieName ? `Found! Length: ${c.value?.length}` : 'OtherCookie', domain: c.domain, path: c.path })));

  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(currentCookieName);

    if (sessionCookie?.value) {
      console.log(`[_parseSessionCookie] Found '${currentCookieName}'. Raw Value: "${sessionCookie.value}"`);
      let sessionData: SessionData;
      try {
        sessionData = JSON.parse(sessionCookie.value);
      } catch (parseError: any) {
        console.error(`[_parseSessionCookie] JSON Parsing failed for raw cookie value: "${sessionCookie.value}". Error: ${parseError.message}`);
        return null;
      }
      
      console.log(`[_parseSessionCookie] Parsed sessionData from cookie:`, JSON.stringify(sessionData));

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        sessionData &&
        typeof sessionData.userId === 'string' && uuidRegex.test(sessionData.userId) &&
        (sessionData.tenantId === null || (typeof sessionData.tenantId === 'string' && uuidRegex.test(sessionData.tenantId))) &&
        typeof sessionData.tenantDomain === 'string' && sessionData.tenantDomain.length > 0 &&
        typeof sessionData.userRole === 'string' && userRoleSchema.safeParse(sessionData.userRole).success &&
        typeof sessionData.username === 'string' && sessionData.username.length > 0
      ) {
        console.log("[_parseSessionCookie] Session data parsed and validated successfully:", JSON.stringify(sessionData));
        return sessionData;
      }
      console.warn("[_parseSessionCookie] Invalid session data structure or content in cookie after parsing. Data:", JSON.stringify(sessionData));
    } else {
      console.log(`[_parseSessionCookie] Cookie '${currentCookieName}' NOT FOUND or has no value.`);
    }
  } catch (error: any) {
    console.error(`[_parseSessionCookie] Error reading/parsing session cookie: Name: ${error.name}, Message: ${error.message}, Stack: ${error.stack ? error.stack : '(no stack)'}`);
  }
  return null;
}


export async function getSessionData(): Promise<SessionData | null> {
    console.log("[getSessionData action] Attempting to get full session data by calling _parseSessionCookie...");
    try {
        const session = await _parseSessionCookie();
        console.log(`[getSessionData action] Resolved session data:`, session);
        return session;
    } catch (error: any) {
        console.error(`[getSessionData action] Error calling _parseSessionCookie: ${error.message}`, error);
        return null;
    }
}

export async function getTenantIdFromSession(): Promise<string | null> {
    console.log("[getTenantIdFromSession] Attempting to get tenantId by calling _parseSessionCookie...");
    try {
        const session = await _parseSessionCookie();
        const tenantId = session?.tenantId ?? null;
        console.log(`[getTenantIdFromSession] Resolved tenantId: ${tenantId}`);
        return tenantId;
    } catch (error: any) {
        console.error(`[getTenantIdFromSession] Error calling _parseSessionCookie: ${error.message}`, error);
        return null;
    }
}

export async function getUserIdFromSession(): Promise<string | null> {
    console.log("[getUserIdFromSession] Attempting to get userId by calling _parseSessionCookie...");
    try {
        const session = await _parseSessionCookie();
        const userId = session?.userId ?? null;
        console.log(`[getUserIdFromSession] Resolved userId: ${userId}`);
        return userId;
    } catch (error: any) {
        console.error(`[getUserIdFromSession] Error calling _parseSessionCookie: ${error.message}`, error);
        return null;
    }
}

export async function getUserRoleFromSession(): Promise<UserRole | null> {
    console.log("[getUserRoleFromSession] Attempting to get userRole by calling _parseSessionCookie...");
    try {
        const session = await _parseSessionCookie();
        const userRole = session?.userRole ?? null;
        console.log(`[getUserRoleFromSession] Resolved userRole: ${userRole}`);
        return userRole;
    } catch (error: any) {
        console.error(`[getUserRoleFromSession] Error calling _parseSessionCookie: ${error.message}`, error);
        return null;
    }
}

export async function isAdminFromSession(): Promise<boolean> {
    const role = await getUserRoleFromSession();
    return role === 'Admin';
}

export async function getUserFromSession(): Promise<Omit<User, 'passwordHash'> | null> {
    console.log("[getUserFromSession] Attempting to get full user from session by calling _parseSessionCookie...");
    try {
        const session = await _parseSessionCookie();
        if (!session?.userId) {
            console.log("[getUserFromSession] Incomplete session data (userId missing).");
            return null;
        }
        const user = await dbGetUserByIdInternal(session.userId);
        if (user) {
            const { passwordHash: _, ...safeUser } = user;
            console.log(`[getUserFromSession] User ${safeUser.user_id} found.`);
            return safeUser;
        }
        console.log("[getUserFromSession] User not found for userId:", session.userId);
    } catch (error: any) {
        console.error(`[getUserFromSession] Error calling _parseSessionCookie or db: ${error.message}`, error);
    }
    return null;
}

export async function getEmployeeProfileForCurrentUser(): Promise<Employee | null> {
    console.log("[getEmployeeProfileForCurrentUser] Attempting to fetch current user's employee profile...");
    try {
        const session = await getSessionData();
        if (!session?.userId || !session.tenantId) {
            console.log("[getEmployeeProfileForCurrentUser] userId or tenantId missing from session. Session:", JSON.stringify(session));
            return null;
        }
        const employee = await dbGetAuthEmployeeByUserId(session.userId, session.tenantId);
        if (employee) {
            console.log(`[getEmployeeProfileForCurrentUser] Employee profile found for user ${session.userId}. Employee PK: ${employee.id}`);
            return employee;
        } else {
            console.log(`[getEmployeeProfileForCurrentUser] No employee profile found for user ${session.userId} in tenant ${session.tenantId}.`);
            return null;
        }
    } catch (error: any) {
        console.error(`[getEmployeeProfileForCurrentUser] Error: ${error.message}`, error);
        return null;
    }
}

export async function sendEmployeeWelcomeEmail(
  tenantId: string,
  employeeName: string,
  employeeEmail: string,
  employeeUserId: string,
  employeeLoginId: string, // This is the human-readable Employee ID (e.g., EMP-001)
  temporaryPassword?: string,
  tenantSubdomain?: string
): Promise<boolean> {
    console.log(`[sendEmployeeWelcomeEmail] Initiating for ${employeeEmail} (Login ID: ${employeeLoginId}, UserID: ${employeeUserId}) for tenant ID ${tenantId}, subdomain: ${tenantSubdomain}`);

    if (!tenantSubdomain) {
        console.error(`[sendEmployeeWelcomeEmail] Tenant subdomain not provided for tenant ID: ${tenantId}. Cannot construct login URL.`);
        await sendAdminNotification(
            `Employee Welcome Email Failed (Missing Tenant Subdomain)`,
            `Failed to send welcome email to ${employeeEmail} (Login ID: ${employeeLoginId}) for tenant ID ${tenantId} because the tenant subdomain was not provided.`
        );
        return false;
    }

    const tenant = await dbGetTenantByDomain(tenantSubdomain);
    if (!tenant) {
        console.error(`[sendEmployeeWelcomeEmail] Tenant not found for subdomain: ${tenantSubdomain}. Cannot send welcome email to ${employeeEmail}.`);
        await sendAdminNotification(
            `Employee Welcome Email Failed (Tenant Not Found for subdomain ${tenantSubdomain})`,
            `Failed to send welcome email to ${employeeEmail} (Login ID: ${employeeLoginId}).`
        );
        return false;
    }
    console.log(`[sendEmployeeWelcomeEmail] Tenant found: ${tenant.name} (Subdomain: ${tenant.subdomain})`);

    let emailSettings = await dbGetEmailSettings(tenantId);
    let transporter;
    let mailerFromName = INTERNAL_FROM_NAME;
    let mailerFromEmail = INTERNAL_FROM_EMAIL;
    let usingSmtpType = "Internal Fallback SMTP";

    if (emailSettings && emailSettings.smtpHost && emailSettings.smtpPort && emailSettings.smtpUser && emailSettings.smtpPassword) {
        console.log(`[sendEmployeeWelcomeEmail] Using tenant-specific SMTP settings for tenant ${tenant.name}: Host ${emailSettings.smtpHost}:${emailSettings.smtpPort}, User: ${emailSettings.smtpUser}`);
        usingSmtpType = `Tenant SMTP (${emailSettings.smtpHost})`;
        let transportOptions: nodemailer.TransportOptions = {
            host: emailSettings.smtpHost,
            port: emailSettings.smtpPort,
            auth: {
                user: emailSettings.smtpUser,
                pass: emailSettings.smtpPassword,
            },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 15000,
            logger: process.env.NODE_ENV === 'development',
            debug: process.env.NODE_ENV === 'development',
        };

        if (emailSettings.smtpPort === 465) {
            transportOptions.secure = true;
        } else if (emailSettings.smtpPort === 587) {
            transportOptions.secure = false;
            transportOptions.requireTLS = true;
        } else {
            transportOptions.secure = emailSettings.smtpSecure;
        }
        transporter = nodemailer.createTransport(transportOptions);
        mailerFromName = emailSettings.fromName;
        mailerFromEmail = emailSettings.fromEmail;
    } else {
        console.warn(`[sendEmployeeWelcomeEmail] SMTP settings not configured or incomplete for tenant ${tenant.name} (${tenantId}). Falling back to internal SMTP.`);
        transporter = createInternalTransporter();
        const internalConfig = getInternalSmtpConfig();
        if (internalConfig) {
            mailerFromName = internalConfig.fromName;
            mailerFromEmail = internalConfig.fromEmail;
        }
    }

    if (!transporter) {
        console.error(`[sendEmployeeWelcomeEmail] Failed to create ANY email transporter (tenant or internal) for ${employeeEmail}. Cannot send email.`);
        await sendAdminNotification(
            `Employee Welcome Email Failed (No Transporter - Tenant: ${tenant.subdomain})`,
            `Failed to send welcome email to ${employeeEmail} (Login ID: ${employeeLoginId}) for tenant ${tenant.name} (${tenant.subdomain}) because no email transporter could be configured.`
        );
        return false;
    }
    console.log(`[sendEmployeeWelcomeEmail] Transporter created using: ${usingSmtpType}`);

    const loginUrl = constructLoginUrl(tenantSubdomain);
    const mailOptions = {
        from: `"${mailerFromName}" <${mailerFromEmail}>`,
        to: employeeEmail,
        subject: `Your SyntaxHive Hrm Account for ${tenant.name} is Ready!`,
        text: `Hello ${employeeName},\n\nAn account has been created for you at ${tenant.name} on SyntaxHive Hrm.\n\nYour Employee ID (also your username for login): ${employeeLoginId}\nYour Login Email: ${employeeEmail}\n${temporaryPassword ? `Your Temporary Password: ${temporaryPassword}\n\nPlease change this password after your first login.\n` : 'Please use the password provided to you separately or contact your administrator to set your password.\n'}\n\nLogin here: ${loginUrl}\n\nBest regards,\nThe SyntaxHive Hrm Team`,
        html: `<p>Hello ${employeeName},</p><p>An account has been created for you at <strong>${tenant.name}</strong> on SyntaxHive Hrm.</p><p>Your Employee ID (also your username for login): <strong>${employeeLoginId}</strong></p><p>Your Login Email: <strong>${employeeEmail}</strong></p>${temporaryPassword ? `<p>Your Temporary Password: <strong>${temporaryPassword}</strong></p><p>Please change this password after your first login.</p>` : '<p>Please use the password provided to you separately or contact your administrator to set your password.</p>'}<p>Login here: <a href="${loginUrl}">${loginUrl}</a></p><p>Best regards,<br>The SyntaxHive Hrm Team</p>`,
    };

    try {
        console.log(`[sendEmployeeWelcomeEmail] Attempting to send email to ${employeeEmail} via ${usingSmtpType}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[sendEmployeeWelcomeEmail] Employee welcome email sent successfully using ${usingSmtpType}: Message ID ${info.messageId}`);
        return true;
    } catch (error: any) {
        console.error(`[sendEmployeeWelcomeEmail] Error sending employee welcome email using ${usingSmtpType}:`, error);
        console.error(`[sendEmployeeWelcomeEmail] Nodemailer error details: Name: ${error.name}, Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
        await sendAdminNotification(
            `Employee Welcome Email Failed (Tenant: ${tenant.subdomain}, SMTP Error)`,
            `Failed to send welcome email to ${employeeEmail} (Login ID: ${employeeLoginId}) for tenant ${tenant.name} (${tenant.subdomain}) using ${usingSmtpType}.\nError Name: ${error.name}\nError Message: ${error.message}\nError Code: ${error.code}\nStack: ${error.stack}`
        );
        return false;
    }
}

    