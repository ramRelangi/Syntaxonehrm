
// src/app/(app)/[domain]/page.tsx
// This acts as the entry point for tenant-specific routes after middleware rewrite.
// We will likely redirect immediately to the dashboard or another default tenant page.

import { redirect } from 'next/navigation';

interface TenantRootPageProps {
  params: { domain: string };
}

export default function TenantRootPage({ params }: TenantRootPageProps) {
    // The middleware rewrites subdomain.domain.com/some/path to domain.com/[subdomain]/some/path
    // This page catches requests like domain.com/[subdomain] (i.e., subdomain.domain.com/)
    // Redirect to the tenant's dashboard.
    // The dashboard page component itself will handle fetching tenant-specific data.
    console.log(`[Tenant Root Page] Redirecting for domain "${params.domain}" to dashboard.`);
    redirect(`/${params.domain}/dashboard`);

    // You could potentially add logic here to verify the tenant domain exists
    // before redirecting, but the dashboard page should handle that if data loading fails.

    // return null; // Or a loading indicator if preferred, but redirect is cleaner.
}
