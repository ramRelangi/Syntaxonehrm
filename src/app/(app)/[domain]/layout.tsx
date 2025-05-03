// src/app/(app)/[domain]/layout.tsx
'use client'; // Add 'use client' directive

import * as React from 'react';
// Removed db import, verification should happen client-side or via API if needed
// import { getTenantByDomain } from '@/modules/auth/lib/db';
import { notFound, redirect, useParams, usePathname } from 'next/navigation';
// import { headers } from 'next/headers'; // Can't use headers in client component
import { useIsMobile } from '@/hooks/use-mobile'; // For sidebar logic

interface TenantAppLayoutProps {
  children: React.ReactNode;
  // Params are accessed via hook in client component
  // params: { domain: string };
}

// Helper function to extract tenant domain from hostname (client-side)
function getTenantDomainFromHost(): string | null {
    if (typeof window === 'undefined') {
        return null; // Cannot access hostname on server
    }
    const hostname = window.location.hostname;
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const normalizedHost = hostname.split(':')[0];

    // Check if it's the root domain or common dev equivalents
     const isRoot =
       normalizedHost === rootDomain ||
       normalizedHost === 'localhost' ||
       normalizedHost === '127.0.0.1'; // Simplify for client-side check

    if(isRoot) return null;

    const subdomainMatch = normalizedHost.match(`^(.*)\\.${rootDomain}$`);
    const subdomain = subdomainMatch ? subdomainMatch[1] : null;

    // Ignore common non-tenant subdomains
    const IGNORED_SUBDOMAINS = ['www', 'api'];
    if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
      return subdomain;
    }

    return null;
}

export default function TenantAppLayout({ children }: TenantAppLayoutProps) {
  // Use hooks to get params and pathname
  const params = useParams();
  const pathname = usePathname();
  const tenantDomainFromParams = params?.domain as string | undefined;
  const [tenantDomainFromHost, setTenantDomainFromHost] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isValidTenant, setIsValidTenant] = React.useState(false);
  const isMobile = useIsMobile(); // Get mobile status

  React.useEffect(() => {
    const hostDomain = getTenantDomainFromHost();
    setTenantDomainFromHost(hostDomain);
    console.log(`[TenantAppLayout Effect] Domain from params: ${tenantDomainFromParams}, Domain from host: ${hostDomain}`);

    // 1. Verify Consistency
    if (!tenantDomainFromParams || !hostDomain || tenantDomainFromParams !== hostDomain) {
      console.warn(`[TenantAppLayout Effect] Domain mismatch or missing. Params: ${tenantDomainFromParams}, Host: ${hostDomain}. Redirecting to root login.`);
      // Construct root login URL carefully
      const rootLoginUrl = new URL('/login', window.location.origin);
      // Adjust host if necessary to ensure it's the root domain
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const currentPort = window.location.port ? `:${window.location.port}` : '';
      rootLoginUrl.host = `${rootDomain}${currentPort}`;
      window.location.href = rootLoginUrl.toString(); // Use window.location for full redirect
      return; // Stop further processing
    }

    // 2. Verify Tenant Domain Existence (Client-side - maybe just assume valid if domains match)
    // In a real app, you might make an API call here to verify the domain exists in the DB
    // For now, we'll assume if the domain matches, it's valid.
    // If an API call failed, you could redirect or show an error.
    setIsValidTenant(true); // Assume valid for now
    setIsLoading(false);

  }, [tenantDomainFromParams, pathname]); // Rerun on param or path change

  if (isLoading) {
    // TODO: Replace with a proper loading skeleton for the layout
    return <div>Loading Tenant Context...</div>;
  }

  if (!isValidTenant) {
     // This state could be reached if the useEffect determines inconsistency or future API check fails
     // Consider redirecting to an error page or root login
     console.error("[TenantAppLayout] Invalid tenant state reached after loading.");
     return <div>Error: Invalid Tenant Context.</div>;
     // Optionally redirect:
     // React.useEffect(() => { window.location.href = '/login'; }, []);
     // return null;
  }

  // Render children only if tenant is valid and context matches
  return <>{children}</>;
}
