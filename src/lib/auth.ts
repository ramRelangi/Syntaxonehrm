
// src/lib/auth.ts
// Placeholder for actual Authentication logic, including tenant and user identification

import { headers, cookies } from 'next/headers'; // Import cookies
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function to resolve domain
import type { User } from '@/modules/auth/types';
import pool from '@/lib/db'; // Import pool for direct DB access in mock

// --- Placeholder for Session Data Structure ---
// Replace this with the actual structure provided by your session library
interface SessionData {
    userId: string; // Should be a valid UUID
    tenantId: string; // Should be a valid UUID
    tenantDomain: string;
    userRole: string; // e.g., 'Admin', 'Employee'
    // Add other relevant session fields
}

// --- Mock Session Cookie Name ---
const MOCK_SESSION_COOKIE = 'mockSession';

/**
 * Placeholder function to get session data.
 * **REPLACE THIS WITH YOUR ACTUAL SESSION MANAGEMENT LOGIC.**
 * (e.g., using next-auth, lucia-auth, iron-session cookies, etc.)
 *
 * Simulates reading a simple cookie containing basic session info.
 *
 * @returns {Promise<SessionData | null>} The session data or null if not authenticated.
 */
async function getSession(): Promise<SessionData | null> {
    // console.warn("[getSession] Using MOCK session data from cookie. REPLACE with actual session logic."); // Reduce noise

    const cookieStore = cookies();
    const sessionCookie = cookieStore.get(MOCK_SESSION_COOKIE);

    if (!sessionCookie?.value) {
        console.log("[getSession] Mock session cookie not found.");
        // Fallback: Try resolving based on header/domain for initial login context?
        // Or just return null if no cookie. Let's return null for now.
        return null;
    }

    try {
        const sessionData: SessionData = JSON.parse(sessionCookie.value);
        console.log("[getSession] Parsed mock session data from cookie:", sessionData);
        // Basic validation - ensure IDs look like UUIDs (simple check)
         const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (
            sessionData &&
            sessionData.userId && uuidRegex.test(sessionData.userId) &&
            sessionData.tenantId && uuidRegex.test(sessionData.tenantId) &&
            sessionData.tenantDomain &&
            sessionData.userRole
        ) {
            // Optionally re-verify tenant and user existence in DB here for added safety
            // const tenant = await getTenantByDomain(sessionData.tenantDomain);
            // const user = await getUserById(sessionData.userId); // Need getUserById in auth/lib/db
            // if (tenant && user && user.tenantId === tenant.id) {
            return sessionData;
            // }
        }
        console.warn("[getSession] Invalid or incomplete session data found in cookie:", sessionData);
        // Clear the invalid cookie
        cookieStore.delete(MOCK_SESSION_COOKIE);
        return null;
    } catch (error) {
        console.error("[getSession] Error parsing mock session cookie:", error);
        cookieStore.delete(MOCK_SESSION_COOKIE); // Clear potentially corrupted cookie
        return null;
    }
}


/**
 * Gets the tenant ID UUID from the current authenticated session.
 *
 * @returns {Promise<string | null>} The tenant ID UUID or null if not authenticated or ID is invalid.
 */
export async function getTenantIdFromAuth(): Promise<string | null> {
    console.log("[getTenantIdFromAuth] Attempting to resolve tenant ID from session...");
    try {
        const session = await getSession();
        if (session?.tenantId) { // Check specifically for tenantId
            console.log(`[getTenantIdFromAuth] Resolved tenant ID from session: ${session.tenantId}`);
            return session.tenantId; // Return the UUID string
        }
        console.warn("[getTenantIdFromAuth] No active session or valid tenant ID found.");
        return null;
    } catch (error) {
        console.error("[getTenantIdFromAuth] Error resolving tenant ID from session:", error);
        return null; // Return null on error
    }
}

/**
 * Gets the current user's ID from the session.
 *
 * @returns {Promise<string | null>} User ID UUID or null if not authenticated or ID is invalid.
 */
export async function getUserIdFromAuth(): Promise<string | null> {
     console.log("[getUserIdFromAuth] Attempting to resolve user ID from session...");
    try {
        const session = await getSession();
        if (session?.userId) { // Check specifically for userId
            console.log(`[getUserIdFromAuth] Resolved user ID from session: ${session.userId}`);
            return session.userId; // Return the UUID string
        }
        console.warn("[getUserIdFromAuth] No active session or valid user ID found.");
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
        const isAdmin = session?.userRole === 'Admin'; // Check role specifically
        console.log(`[isUserAdmin] Admin status determined from session: ${isAdmin}`);
        return isAdmin; // Returns true or false
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
        const client = await pool.connect();
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
                  // Clear invalid cookie if user/tenant mismatch
                 cookies().delete(MOCK_SESSION_COOKIE);
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


/**
 * **MOCK FUNCTION:** Sets a simple session cookie.
 * **REPLACE WITH ACTUAL SESSION MANAGEMENT.**
 */
export async function setMockSession(sessionData: SessionData) {
    // console.warn("[setMockSession] Setting MOCK session cookie. REPLACE with actual session logic."); // Reduce noise
    cookies().set(MOCK_SESSION_COOKIE, JSON.stringify(sessionData), {
        httpOnly: true, // Basic security
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // Example: 1 week
    });
     console.log("[setMockSession] Mock session cookie set:", sessionData);
}

/**
 * **MOCK FUNCTION:** Clears the simple session cookie.
 * **REPLACE WITH ACTUAL SESSION MANAGEMENT.**
 */
export async function clearMockSession() {
    // console.warn("[clearMockSession] Clearing MOCK session cookie. REPLACE with actual session logic."); // Reduce noise
    cookies().delete(MOCK_SESSION_COOKIE);
     console.log("[clearMockSession] Mock session cookie cleared.");
}
