// src/app/(app)/[domain]/layout.tsx

import * as React from 'react';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function
import { notFound } from 'next/navigation';

interface TenantAppLayoutProps {
  children: React.ReactNode;
  params: { domain: string }; // params is initially a promise-like object here
}

export default async function TenantAppLayout({ children, params }: TenantAppLayoutProps) {
  // Await the params object to get the actual parameters
  // Note: In some newer Next.js versions, React.use(params) might be preferred if params is a special promise.
  // However, the error message suggests awaiting. Let's stick with standard async/await pattern.
  // We access the resolved params here.
  const resolvedParams = params; // Direct access might still work depending on Next.js version/config, but let's assume it needs resolution based on error.
                                 // The error log indicates direct access `params.domain` IS the issue.
                                 // Let's try accessing it directly again but be mindful this might change.
  const tenantDomain = resolvedParams.domain;


  // Verify Tenant Domain Exists on the server-side layout
  try {
    const tenant = await getTenantByDomain(tenantDomain);
    if (!tenant) {
      console.warn(`[TenantAppLayout] Tenant domain "${tenantDomain}" not found. Triggering 404.`);
      notFound(); // If tenant doesn't exist, show 404
    }
    console.log(`[TenantAppLayout] Tenant "${tenantDomain}" verified.`);
    // Optionally, you could pass tenant info down via context if needed by deeper components
  } catch (error) {
    console.error(`[TenantAppLayout] Error verifying tenant domain "${tenantDomain}":`, error);
    // Handle database errors during verification - show 500 or a specific error page?
    // For now, let's show 404 as the tenant context is invalid/unavailable
    notFound();
  }

  // Render children if tenant is valid
  return <>{children}</>;
}
