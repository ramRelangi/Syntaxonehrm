// src/app/(app)/[domain]/layout.tsx
import * as React from 'react';
import { getTenantByDomain } from '@/modules/auth/lib/db';
import { notFound, redirect } from 'next/navigation';
import AppLayout from '@/app/(app)/layout'; // Import the main AppLayout
import { getSessionData } from '@/modules/auth/actions'; // Import session helper

interface TenantAppLayoutProps {
  children: React.ReactNode;
  params: { domain: string };
}

export default async function TenantAppLayout({ children, params }: TenantAppLayoutProps) {
  const tenantDomain = params.domain;

  // 1. Verify Tenant Domain Exists
  let tenant;
  try {
    tenant = await getTenantByDomain(tenantDomain);
    if (!tenant) {
      console.warn(`[TenantAppLayout] Tenant not found for domain: ${tenantDomain}. Redirecting to root.`);
      // Redirect to the root domain's registration or main page
      const rootRegisterUrl = new URL('/register', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002');
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
      const currentPort = rootRegisterUrl.port ? `:${rootRegisterUrl.port}` : '';
      rootRegisterUrl.host = `${rootDomain}${currentPort}`;
      redirect(rootRegisterUrl.toString());
    }
  } catch (error) {
    console.error(`[TenantAppLayout] Error fetching tenant for domain ${tenantDomain}:`, error);
    notFound(); // Or handle error more gracefully
  }

  // 2. Fetch Session Data (User Role, User ID)
  const sessionData = await getSessionData();

  if (!sessionData?.userId) {
    console.warn(`[TenantAppLayout] No active session for domain ${tenantDomain}. Redirecting to login.`);
    // Construct the login URL for the current tenant's domain
    const loginUrl = new URL('/login', `http://${tenantDomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost'}:${process.env.PORT || 9002}`);
    redirect(loginUrl.toString());
  }

  // 3. Pass tenant and session info to the main AppLayout
  return (
    <AppLayout
      tenantId={tenant.id}
      tenantDomain={tenant.domain}
      userRole={sessionData.userRole}
      userId={sessionData.userId}
    >
      {children}
    </AppLayout>
  );
}
