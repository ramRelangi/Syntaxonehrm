// src/lib/auth.ts
// Placeholder for actual Authentication logic, including tenant and user identification

import { headers } from 'next/headers';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function to resolve domain
import type { User } from '@/modules/auth/types';

// --- Placeholder for Session Data Structure ---
// Replace this with the actual structure provided by your session library
interface SessionData {
    userId: string;
    tenantId: string;
    tenantDomain: string;
    userRole: string; // e.g., 'Admin', 'Employee'
    // Add other relevant session fields
}

/**
 * Placeholder function to get session data.
 * **REPLACE THIS WITH YOUR ACTUAL SESSION MANAGEMENT LOGIC.**
 * (e.g., using next-auth, lucia-auth, iron-session cookies, etc.)
 *
 * @returns {Promise<SessionData | null>} The session data or null if not authenticated.
 */
async function getSession(): Promise<SessionData | null> {
    console.warn("[getSession] Using MOCK session data. REPLACE with actual session logic.");
    // --- Mock Implementation ---
    // 1. Try to get tenant domain from header (set by middleware)
    const headersList = headers();
    const tenantDomainHeader = headersList.get('X-Tenant-Domain');

    if (tenantDomainHeader) {
         // 2. Look up tenant by domain
         const tenant = await getTenantByDomain(tenantDomainHeader);
         if (tenant) {
             // 3. Simulate getting the *first* user of that tenant as the logged-in user
             //    In a real app, you'd verify a session token/cookie and get the user ID from there.
             const client = await (await import('@/lib/db')).default.connect();
             try {
                const userRes = await client.query('SELECT id, role FROM users WHERE tenant_id = $1 LIMIT 1', [tenant.id]);
                if (userRes.rows.length > 0) {
                    const mockSession: SessionData = {
                        userId: userRes.rows[0].id,
                        tenantId: tenant.id,
                        tenantDomain: tenant.domain,
                        userRole: userRes.rows[0].role,
                    };
                    console.log("[getSession] Returning MOCK session:", mockSession);
                    return mockSession;
                }
             } finally {
                 client.release();
             }
         }
    }
     // --- End Mock Implementation ---

    console.log("[getSession] No valid session or tenant found based on mock logic.");
    return null; // Return null if no session exists
}


/**
 * Gets the tenant ID UUID from the current authenticated session.
 *
 * @returns {Promise<string | null>} The tenant ID UUID or null if not authenticated.
 */
export async function getTenantIdFromAuth(): Promise<string | null> {
    console.log("[getTenantIdFromAuth] Attempting to resolve tenant ID from session...");
    try {
        const session = await getSession();
        if (session) {
            console.log(`[getTenantIdFromAuth] Resolved tenant ID from session: ${session.tenantId}`);
            return session.tenantId;
        }
        console.warn("[getTenantIdFromAuth] No active session found.");
        return null;
    } catch (error) {
        console.error("[getTenantIdFromAuth] Error resolving tenant ID from session:", error);
        return null; // Return null on error
    }
}

/**
 * Gets the current user's ID from the session.
 *
 * @returns {Promise<string | null>} User ID or null if not authenticated.
 */
export async function getUserIdFromAuth(): Promise<string | null> {
     console.log("[getUserIdFromAuth] Attempting to resolve user ID from session...");
    try {
        const session = await getSession();
        if (session) {
            console.log(`[getUserIdFromAuth] Resolved user ID from session: ${session.userId}`);
            return session.userId;
        }
        console.warn("[getUserIdFromAuth] No active session found.");
        return null;
    } catch (error) {
        console.error("[getUserIdFromAuth] Error resolving user ID from session:", error);
        return null; // Return null on error
    }
}


/**
 * Checks if the current user has an 'Admin' role based on the session.
 *
 * @returns {Promise<boolean>} True if admin, false otherwise or if not authenticated.
 */
export async function isUserAdmin(): Promise<boolean> {
    console.log("[isUserAdmin] Checking admin status from session...");
     try {
        const session = await getSession();
        const isAdmin = session?.userRole === 'Admin';
        console.log(`[isUserAdmin] Admin status determined from session: ${isAdmin}`);
        return isAdmin;
    } catch (error) {
        console.error("[isUserAdmin] Error checking admin status from session:", error);
        return false; // Return false on error
    }
}

/**
 * Simulates getting the full User object based on the current session.
 * **Note:** Fetching the full user object on every request might be inefficient.
 * Usually, the session contains the necessary IDs and roles.
 * Consider if this function is truly needed or if session data suffices.
 *
 * @returns {Promise<User | null>} User object or null if not authenticated.
 */
export async function getUserFromAuth(): Promise<User | null> {
    console.log("[getUserFromAuth] Attempting to fetch full user object from session...");
    try {
        const session = await getSession();
        if (!session?.userId || !session?.tenantId) {
            console.warn("[getUserFromAuth] No active session found to fetch user.");
            return null;
        }

        // Fetch user from DB using session info
        const client = await (await import('@/lib/db')).default.connect();
        try {
             const query = 'SELECT * FROM users WHERE id = $1 AND tenant_id = $2';
             const res = await client.query(query, [session.userId, session.tenantId]);
             if (res.rows.length > 0) {
                 // Map row to User object (ensure mapRowToUser is defined/imported)
                  // eslint-disable-next-line @typescript-eslint/no-use-before-define
                 const user = mapRowToUser(res.rows[0]);
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                 const { passwordHash, ...safeUser } = user; // Omit hash
                 console.log("[getUserFromAuth] Fetched user from DB based on session:", safeUser);
                 return safeUser;
             } else {
                 console.warn(`[getUserFromAuth] User ID ${session.userId} not found in DB for tenant ${session.tenantId}. Session might be stale.`);
                 return null;
             }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("[getUserFromAuth] Error fetching user based on session:", error);
        return null;
    }
}

// Helper function (move to appropriate DB file if preferred)
function mapRowToUser(row: any): User {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        email: row.email,
        passwordHash: row.password_hash, // Included, but should be omitted before returning
        name: row.name,
        role: row.role,
        isActive: row.is_active,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
    };
}
