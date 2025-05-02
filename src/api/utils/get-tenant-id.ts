
import { NextRequest } from 'next/server';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function

/**
 * Extracts the tenant ID from the request by resolving the domain
 * passed in the X-Tenant-Domain header (set by middleware).
 *
 * @param request The NextRequest object.
 * @returns The tenant ID string or null if not found/identifiable.
 */
export async function getTenantId(request: NextRequest): Promise<string | null> {
    // Get domain from the header set by middleware
    const tenantDomain = request.headers.get('X-Tenant-Domain');
    if (!tenantDomain) {
        console.warn('[API Util - getTenantId] X-Tenant-Domain header not found.');
        return null;
    }

    console.log(`[API Util - getTenantId] Found Tenant Domain in header: ${tenantDomain}`);

    // Resolve tenant ID from the domain using the database
    try {
        const tenant = await getTenantByDomain(tenantDomain);
        if (tenant) {
            console.log(`[API Util - getTenantId] Resolved Tenant ID from domain: ${tenant.id}`);
            return tenant.id;
        } else {
            console.warn(`[API Util - getTenantId] Tenant not found in DB for domain: ${tenantDomain}`);
            return null; // Domain in header doesn't match a tenant
        }
    } catch (error) {
        console.error(`[API Util - getTenantId] Error resolving tenant from domain ${tenantDomain}:`, error);
        return null; // DB error, treat as tenant not found for API safety
    }
}
