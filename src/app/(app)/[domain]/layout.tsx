
// src/app/(app)/[domain]/layout.tsx
import * as React from 'react';
import { getTenantByDomain } from '@/modules/auth/lib/db';
import { notFound, redirect } from 'next/navigation';
import AppLayout from '@/app/(app)/layout'; // Import the main AppLayout
import { getSessionData } from '@/modules/auth/actions'; // Import session helper
import type { UserRole } from '@/modules/auth/types'; // For UserRole type

interface TenantAppLayoutProps {
  children: React.ReactNode;
  params: { domain: string }; // 'domain' here is the subdomain from the URL segment
}

export default async function TenantAppLayout({ children, params }: TenantAppLayoutProps) {
  const tenantSubdomain = params.domain; // The URL segment is the subdomain

  console.log(`[TenantAppLayout] Entered for dynamic segment: ${tenantSubdomain}`);

  // 1. Verify Tenant Subdomain Exists
  let tenant;
  try {
    tenant = await getTenantByDomain(tenantSubdomain);
    if (!tenant || !tenant.tenant_id) {
      console.warn(`[TenantAppLayout] Tenant not found for subdomain: ${tenantSubdomain}. Redirecting to root.`);
      const rootRegisterUrl = new URL('/register', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002');
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const currentPort = rootRegisterUrl.port && rootRegisterUrl.port !== '80' && rootRegisterUrl.port !== '443' ? `:${rootRegisterUrl.port}` : '';
      rootRegisterUrl.host = `${rootDomain}${currentPort}`; // Ensure host is just root domain
      redirect(rootRegisterUrl.toString());
    }
     console.log(`[TenantAppLayout] Tenant found: ${tenant.name} (ID: ${tenant.tenant_id}) for subdomain: ${tenantSubdomain}`);
  } catch (error) {
    console.error(`[TenantAppLayout] Error fetching tenant for subdomain ${tenantSubdomain}:`, error);
    notFound();
  }

  // 2. Fetch Session Data (User Role, User ID)
  const sessionData = await getSessionData();

  if (!sessionData?.userId || sessionData.tenantId !== tenant.tenant_id || sessionData.tenantDomain !== tenant.subdomain) {
    console.warn(`[TenantAppLayout] No active session, or session mismatch, for subdomain ${tenantSubdomain}. Session:`, sessionData, "Tenant Expected:", tenant);
    const loginUrl = new URL(`/login`, `http://${tenantSubdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}:${process.env.PORT || 9002}`);
    redirect(loginUrl.toString());
  }
  console.log(`[TenantAppLayout] Session validated for user ${sessionData.userId} in tenant ${tenant.name}`);


  // 3. Pass tenant and session info to the main AppLayout
  // Ensure UserRole type from auth/types is used.
  const userRole: UserRole | null = sessionData.userRole || null;

  return (
    <AppLayout
      tenantId={tenant.tenant_id} // Pass tenant_id (UUID)
      tenantDomain={tenant.subdomain} // Pass subdomain
      userRole={userRole}
      userId={sessionData.userId} // Pass user_id (UUID)
      username={sessionData.username} // Pass username
    >
      {children}
    </AppLayout>
  );
}
