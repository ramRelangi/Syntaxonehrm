// This file can likely be removed or repurposed.
// API routes cannot directly use `next/headers` like Server Components.
// Tenant context for API routes should ideally be derived from:
// 1. Session/Authentication: If the user is logged in, their session should contain the tenant ID.
// 2. Explicit Parameter: If the API is designed to accept a tenant ID or domain as part of the URL path or query string.
// 3. Custom Header (Set by Middleware?): If middleware adds a header like X-Tenant-Id based on the request host/session.

// If using sessions, you would fetch the session within the API route handler.
// Example (conceptual):
/*
import { getSession } from 'next-auth/react'; // Or your auth library's equivalent

export async function GET(request: NextRequest) {
    const session = await getSession({ req: request }); // Get session associated with the request
    if (!session?.user?.tenantId) {
        return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
    }
    const tenantId = session.user.tenantId;
    // ... rest of your API logic using tenantId ...
}
*/

// If using a custom header set by middleware:
/*
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const tenantId = request.headers.get('X-Tenant-Id'); // Get header set by middleware
    if (!tenantId) {
         return NextResponse.json({ error: 'Tenant context header missing.' }, { status: 400 });
    }
    // ... rest of your API logic using tenantId ...
}
*/

// Removing the previous implementation as it's not applicable to standard API routes.
console.warn("getTenantId utility in src/api/utils is deprecated for API routes. Use session or custom headers.");

export async function getTenantId(request: any): Promise<string | null> {
    console.error("getTenantId utility should not be used directly in API routes.");
    return null;
}
