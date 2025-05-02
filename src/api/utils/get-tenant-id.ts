
import { NextRequest } from 'next/server';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Assuming this can be used server-side

/**
 * Extracts the tenant ID from the request, typically from a custom header
 * set by middleware or by resolving the domain from the Host header.
 *
 * @param request The NextRequest object.
 * @returns The tenant ID string or null if not found/identifiable.
 */
export async function getTenantId(request: NextRequest): Promise<string | null> {
    // Option 1: Get from a custom header set by middleware
    const tenantIdFromHeader = request.headers.get('X-Tenant-Id');
    if (tenantIdFromHeader) {
        console.log(`[API Util] Found Tenant ID in header: ${tenantIdFromHeader}`);
        // TODO: Potentially validate the UUID format here
        return tenantIdFromHeader;
    }

    // Option 2: (Less ideal for API routes) Try to resolve from Host header if needed
    // This relies on the API route *also* running on the correct domain, which might not always be the case.
    // Middleware rewrite approach is generally preferred.
    // const host = request.headers.get('host') || '';
    // const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'streamlinehr.app';
    // const match = host.match(`^(.*)\\.${rootDomain}$`);
    // const subdomain = match ? match[1] : null;

    // if (subdomain) {
    //     console.log(`[API Util] Trying to resolve Tenant ID from subdomain: ${subdomain}`);
    //     try {
    //         const tenant = await getTenantByDomain(subdomain);
    //         if (tenant) {
    //             console.log(`[API Util] Resolved Tenant ID from subdomain: ${tenant.id}`);
    //             return tenant.id;
    //         }
    //     } catch (error) {
    //         console.error(`[API Util] Error resolving tenant from subdomain ${subdomain}:`, error);
    //     }
    // }

    console.warn('[API Util] Tenant ID not found in headers.');
    return null;
}
