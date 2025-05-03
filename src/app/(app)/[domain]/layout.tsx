
// src/app/(app)/[domain]/layout.tsx

import * as React from 'react';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';

interface TenantAppLayoutProps {
  children: React.ReactNode;
  params: { domain: string };
}

// Helper function to extract tenant domain from request headers
function getTenantDomainFromHeaders(): string | null {
    const headersList = headers();
    const host = headersList.get('host') || '';
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = host.split(':')[0];

    const subdomainMatch = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    return subdomainMatch ? subdomainMatch[1] : null;
}


export default async function TenantAppLayout({ children, params }: TenantAppLayoutProps) {
  // `params.domain` comes from the URL segment like `/[domain]/dashboard`
  const tenantDomainFromParams = params.domain;
  // Get domain also from headers (set by middleware) for verification
  const tenantDomainFromHeaders = getTenantDomainFromHeaders();

  console.log(`[TenantAppLayout] Domain from params: ${tenantDomainFromParams}, Domain from headers: ${tenantDomainFromHeaders}`);


  // 1. Verify Consistency: Ensure the domain in the URL params matches the one from the headers/host.
  // If they don't match, something is wrong with the routing or middleware. Redirect to a safe place (root login).
  // Allow params.domain to be used if header is missing during initial SSR/build? Maybe safer to redirect.
  if (!tenantDomainFromHeaders || tenantDomainFromParams !== tenantDomainFromHeaders) {
      console.warn(`[TenantAppLayout] Domain mismatch or missing header. Params: ${tenantDomainFromParams}, Header: ${tenantDomainFromHeaders}. Redirecting to root login.`);
      const rootLoginUrl = new URL('/login', `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}:${process.env.PORT || 9002}`);
      redirect(rootLoginUrl.toString());
      // return null; // Stop rendering further
  }

  // Use the verified domain (from params/headers, they match here)
  const tenantDomain = tenantDomainFromParams;


  // 2. Verify Tenant Domain Exists in DB
  try {
    const tenant = await getTenantByDomain(tenantDomain);
    if (!tenant) {
      console.warn(`[TenantAppLayout] Tenant domain "${tenantDomain}" not found in DB. Triggering 404.`);
      notFound(); // If tenant doesn't exist, show 404
    }
    console.log(`[TenantAppLayout] Tenant "${tenantDomain}" verified.`);
    // Optionally, pass tenant info down via context if needed by deeper server components
  } catch (error: any) {
    console.error(`[TenantAppLayout] Error verifying tenant domain "${tenantDomain}":`, error);
    // Handle database errors during verification
    if (error.message?.includes('ECONNREFUSED')) {
        // Render a specific error page for DB connection issues
        return (
             <div className="flex h-screen items-center justify-center bg-background p-4">
                 <div className="text-center">
                     <h1 className="text-2xl font-bold text-destructive">Database Connection Error</h1>
                     <p className="text-muted-foreground">Could not connect to the database. Please check the server status and configuration.</p>
                 </div>
             </div>
         );
    }
    // For other errors, show 404 as the tenant context is invalid/unavailable
    notFound();
  }

  // Render children if tenant is valid
  return <>{children}</>;
}
