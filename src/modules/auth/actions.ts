'use server';

// export const runtime = 'nodejs'; // Removed - bcrypt should work in default runtime now

import { z } from 'zod';
import bcrypt from 'bcrypt';
// import nodemailer from 'nodemailer'; // Removed - Not sending email from here anymore
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db';
import pool, { testDbConnection } from '@/lib/db'; // Import pool and test function
// import { getEmailSettings, updateEmailSettings } from '@/modules/communication/lib/db'; // Removed dependency
// import type { EmailSettings } from '@/modules/communication/types'; // Removed dependency
import { redirect } from 'next/navigation'; // Import redirect
import { headers } from 'next/headers'; // Import headers to potentially get domain in logout
import { initializeDatabase } from '@/lib/init-db'; // Import initializeDatabase

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

// Removed createTransporter function as it's no longer needed here

// Removed sendWelcomeEmail function as it's no longer called from here


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


        // 8. Initialize default Email Settings for the new tenant (Removed - No longer done here)
        /*
         console.log(`[registerTenantAction] Initializing default email settings for tenant ${newTenant.id}...`);
         const defaultSettings: Omit<EmailSettings, 'smtpPassword'> & { smtpPassword?: string } = { // Make password optional for initial save
             tenantId: newTenant.id, // Ensure tenantId is here
             smtpHost: 'smtp.example.com', // Placeholder - user MUST configure this later
             smtpPort: 587,
             smtpUser: 'user@example.com',
             smtpPassword: '', // Leave empty for user to set
             smtpSecure: false, // Default to false (use TLS for port 587)
             fromEmail: `noreply@${lowerCaseDomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}`, // More specific default
             fromName: `${companyName} (SyntaxHive Hrm)`,
         };
         // updateEmailSettings requires the full EmailSettings object including password
         // We need to ensure the types match or adjust updateEmailSettings
         const settingsToSave: EmailSettings = {
             ...defaultSettings,
             smtpPassword: defaultSettings.smtpPassword || '' // Ensure password is a string
         };

         if (!settingsToSave.tenantId) {
             throw new Error("Tenant ID is missing before saving email settings.");
         }

         await updateEmailSettings(settingsToSave.tenantId, settingsToSave); // Pass tenantId explicitly
         console.log(`[registerTenantAction] Default email settings initialized for tenant ${newTenant.id}.`);
        */

        // 9. Send Welcome Email (Removed - No longer sent from here)
        /*
         console.log("[registerTenantAction] Triggering welcome email sending...");
         sendWelcomeEmail(newTenant.id, adminName, adminEmail, lowerCaseDomain).then(sent => {
             if (sent) {
                 console.log("[registerTenantAction] Welcome email sending initiated successfully (async).");
             } else {
                  console.error("[registerTenantAction] Welcome email sending failed or was skipped due to configuration (async). User must configure SMTP settings.");
             }
         }).catch(err => {
              console.error("[registerTenantAction] Unexpected error during async welcome email sending:", err);
         });
        */
        console.log("[registerTenantAction] Skipping welcome email sending.");


        // 10. Return Success (don't return password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        console.log("[registerTenantAction] Registration completed successfully.");
        // Return the tenant domain so the UI can display the login link hint
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
      // Option 1: From session data (if stored there) - Ideal
      // const session = await getSession(); // Replace with your session retrieval logic
      // if (session?.user?.tenantDomain) {
      //   tenantDomain = session.user.tenantDomain;
      // }

      // Option 2: Infer from request headers (more reliable if middleware sets it)
      const headersList = headers();
      const host = headersList.get('host') || '';
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const match = host.match(`^(.*)\\.${rootDomain}$`);
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
      // Construct the tenant-specific login URL (subdomain root)
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const port = process.env.NODE_ENV !== 'production' ? `:${process.env.PORT || 9002}` : ''; // Add port for non-production
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      // Redirect specifically to the subdomain's root (which should redirect to login)
      redirectUrl = `${protocol}://${tenantDomain}.${rootDomain}${port}/`; // Redirect to subdomain root
      console.log(`[logoutAction] Redirecting to tenant root: ${redirectUrl}`);
  } else {
       // If logging out from the root domain, redirect to root login
       console.log(`[logoutAction] Tenant domain not found, redirecting to root login: ${redirectUrl}`);
       // Keep redirectUrl as '/login'
  }

  // Redirect to the appropriate login page after clearing session
  redirect(redirectUrl);
}
