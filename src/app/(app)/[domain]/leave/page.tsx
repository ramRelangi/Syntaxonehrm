
// src/app/(app)/[domain]/leave/page.tsx (Server Component Wrapper)
import { redirect } from 'next/navigation';
import { getSessionData, isAdminFromSession } from '@/modules/auth/actions'; // Import server-side helpers
import LeavePageClient from '@/modules/leave/components/leave-page-client'; // Import the client component

interface TenantLeavePageProps {
  params: { domain: string };
}

export default async function TenantLeavePage({ params }: TenantLeavePageProps) {
  const session = await getSessionData();
  const isAdmin = await isAdminFromSession(); // Check admin status server-side

  if (!session?.userId) {
    // Redirect to login if no user ID in session
    // Construct the login URL based on the domain
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let port = '';
    try {
      const url = new URL(baseUrl);
      if (url.port && url.port !== '80' && url.port !== '443') {
        port = `:${url.port}`;
      }
    } catch {}
    const loginUrl = `${protocol}://${params.domain}.${rootDomain}${port}/login`;
    console.warn(`[Leave Page Server] No user session found. Redirecting to ${loginUrl}`);
    redirect(loginUrl);
  }

  // Pass tenant domain, user ID, and admin status to the client component
  return (
    <LeavePageClient
      tenantDomain={params.domain}
      userId={session.userId}
      isAdmin={isAdmin}
    />
  );
}
