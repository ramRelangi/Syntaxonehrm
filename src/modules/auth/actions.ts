'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db'; // Assuming DB functions exist
import { testDbConnection } from '@/lib/db'; // Import the DB connection test function

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: User; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    console.log("[registerTenantAction] Starting registration process...");

    // 0. Check Database Connection First
    console.log("[registerTenantAction] Testing database connection...");
    const dbCheck = await testDbConnection();
    if (!dbCheck.success) {
        console.error("[registerTenantAction] Database connection check failed:", dbCheck.message);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: dbCheck.message }] }; // Return DB connection error
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

        // 7. Return Success (don't return password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        console.log("[registerTenantAction] Registration completed successfully.");
        return { success: true, tenant: newTenant, user: safeUser };

    } catch (error: any) {
        console.error("[registerTenantAction] Error during tenant registration:", error);
         // Handle potential database errors more specifically if needed
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: error.message || 'Failed to register tenant due to a server error.' }] };
    }
}

// Placeholder for Login action (to be implemented)
// export async function loginAction(...) { ... }

// Placeholder for Forgot Password action (to be implemented)
// export async function forgotPasswordAction(...) { ... }
