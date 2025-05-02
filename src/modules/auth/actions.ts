'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import { registrationSchema, type RegistrationFormData, type Tenant, type User } from '@/modules/auth/types';
import { addTenant, getUserByEmail, addUser, getTenantByDomain } from '@/modules/auth/lib/db'; // Assuming DB functions exist

const SALT_ROUNDS = 10; // Cost factor for bcrypt hashing

export async function registerTenantAction(formData: RegistrationFormData): Promise<{ success: boolean; tenant?: Tenant; user?: User; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    // 1. Validate Input Data
    const validation = registrationSchema.safeParse(formData);
    if (!validation.success) {
        console.error("Registration Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }

    const { companyName, companyDomain, adminName, adminEmail, adminPassword } = validation.data;
    const lowerCaseDomain = companyDomain.toLowerCase();

    try {
        // 2. Check if domain already exists
        const existingTenant = await getTenantByDomain(lowerCaseDomain);
        if (existingTenant) {
            return { success: false, errors: [{ code: 'custom', path: ['companyDomain'], message: 'This domain is already registered.' }] };
        }

        // 3. Check if admin email already exists (globally, or within a tenant context if needed later)
        const existingUser = await getUserByEmail(adminEmail);
        if (existingUser) {
            // Decide on policy: allow same email for different tenants? For now, assume globally unique admin email during registration.
            return { success: false, errors: [{ code: 'custom', path: ['adminEmail'], message: 'This email address is already in use.' }] };
        }

        // 4. Create the Tenant
        const newTenant = await addTenant({ name: companyName, domain: lowerCaseDomain });

        // 5. Hash the Admin Password
        const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

        // 6. Create the Initial Admin User
        const newUser = await addUser({
            tenantId: newTenant.id,
            email: adminEmail,
            passwordHash: passwordHash,
            name: adminName,
            role: 'Admin', // Initial user is always Admin
            isActive: true,
        });

        // 7. Return Success (don't return password hash)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { passwordHash: _, ...safeUser } = newUser;
        return { success: true, tenant: newTenant, user: safeUser };

    } catch (error: any) {
        console.error("Error during tenant registration (action):", error);
         // Handle potential database errors more specifically if needed
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: error.message || 'Failed to register tenant due to a server error.' }] };
    }
}

// Placeholder for Login action (to be implemented)
// export async function loginAction(...) { ... }

// Placeholder for Forgot Password action (to be implemented)
// export async function forgotPasswordAction(...) { ... }
