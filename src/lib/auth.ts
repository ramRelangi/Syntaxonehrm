// src/lib/auth.ts
// Placeholder for authentication logic

import { headers } from 'next/headers';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function to resolve domain
import type { User } from '@/modules/auth/types';

/**
 * Gets the tenant ID from the current request context (e.g., subdomain or header).
 * In a real app with sessions, this might fetch the tenant ID associated with the user's session.
 *
 * @returns {Promise<string | null>} The tenant ID UUID or null if not found or identifiable.
 */
export async function getTenantIdFromAuth(): Promise<string | null> {
    console.log("[getTenantIdFromAuth] Attempting to resolve tenant ID from request context...");
    try {
        const headersList = headers();
        const tenantDomainHeader = headersList.get('X-Tenant-Domain'); // Header set by middleware

        if (tenantDomainHeader) {
            console.log(`[getTenantIdFromAuth] Found X-Tenant-Domain header: ${tenantDomainHeader}`);
            const tenant = await getTenantByDomain(tenantDomainHeader);
            if (tenant) {
                console.log(`[getTenantIdFromAuth] Resolved tenant ID: ${tenant.id}`);
                return tenant.id; // Return the actual UUID
            } else {
                console.warn(`[getTenantIdFromAuth] Tenant not found in DB for domain: ${tenantDomainHeader}`);
                return null;
            }
        }

        // Fallback: Try inferring from host if header is missing (might happen in some direct calls)
        const host = headersList.get('host') || '';
        const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
        const normalizedHost = host.split(':')[0];
        const match = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
        const subdomain = match ? match[1] : null;

        if (subdomain && !['www', 'api'].includes(subdomain)) {
             console.log(`[getTenantIdFromAuth] Inferred subdomain from host: ${subdomain}`);
             const tenant = await getTenantByDomain(subdomain);
             if (tenant) {
                 console.log(`[getTenantIdFromAuth] Resolved tenant ID from host: ${tenant.id}`);
                 return tenant.id; // Return the actual UUID
             } else {
                 console.warn(`[getTenantIdFromAuth] Tenant not found in DB for inferred domain: ${subdomain}`);
                return null;
            }
        }

        console.warn("[getTenantIdFromAuth] Could not determine tenant context from headers or host.");
        return null;

    } catch (error) {
        console.error("[getTenantIdFromAuth] Error resolving tenant ID:", error);
        return null; // Return null on error
    }
}

/**
 * Simulates getting the current user's ID from the session.
 * Replace with actual implementation.
 * **NOTE:** This is still a mock. Replace with real session logic.
 * @returns {Promise<string | null>} User ID (mocked UUID) or null.
 */
export async function getUserIdFromAuth(): Promise<string | null> {
     console.warn("[getUserIdFromAuth] Using MOCK user ID. Replace with actual auth logic.");
     // Try to find the user associated with the tenant (e.g., the first admin user)
     const tenantId = await getTenantIdFromAuth();
     if (tenantId) {
        // Placeholder: Fetch the first user of the tenant as the mock user
        // In real app: Get user ID from session
        // const users = await getUsersForTenant(tenantId); // Need a db function for this
        // if (users && users.length > 0) return users[0].id;
     }
     // Return a placeholder UUID if no tenant context or no users found in mock logic
     return "00000000-0000-0000-0000-000000000001"; // Placeholder UUID
}


/**
 * Simulates checking if the current user is an admin for their tenant.
 * Replace with actual implementation.
 * **NOTE:** This is still a mock. Replace with real role checking.
 * @returns {Promise<boolean>} True if admin (mocked), false otherwise.
 */
export async function isUserAdmin(): Promise<boolean> {
    console.warn("[isUserAdmin] Using MOCK admin status (true). Replace with actual auth logic.");
    // In real app: Get user from session, check their role against the tenant context
    // const userId = await getUserIdFromAuth();
    // const tenantId = await getTenantIdFromAuth();
    // if (!userId || !tenantId) return false;
    // const user = await getUserById(userId); // Fetch user details
    // return user?.role === 'Admin';
    const mockIsAdmin = true; // Keep mock as true for now
    return mockIsAdmin;
}

/**
 * Simulates getting the full User object from the session.
 * Replace with actual implementation.
 * **NOTE:** This is still a mock. Replace with real session logic.
 * @returns {Promise<User | null>} User object or null.
 */
export async function getUserFromAuth(): Promise<User | null> {
    console.warn("[getUserFromAuth] Using MOCK user data. Replace with actual auth logic.");
    const tenantId = await getTenantIdFromAuth();
    const userId = await getUserIdFromAuth(); // Gets mock ID
    const isAdmin = await isUserAdmin(); // Gets mock status

    if (!tenantId || !userId) return null;

    // Return mock user data consistent with other mocks
    return {
        id: userId,
        tenantId: tenantId,
        email: isAdmin ? "admin@mock.com" : "employee@mock.com", // Mock email
        passwordHash: "mock_hash", // Never use this in real app
        name: isAdmin ? "Mock Admin" : "Mock Employee",
        role: isAdmin ? "Admin" : "Employee",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}
