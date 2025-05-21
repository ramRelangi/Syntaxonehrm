// src/app/(app)/[domain]/leave/page.tsx (Server Component Wrapper)
import { redirect } from 'next/navigation';
import { getSessionData, isAdminFromSession } from '@/modules/auth/actions'; // Import server-side helpers
import dynamic from 'next/dynamic'; // Import dynamic
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for loading state

// Dynamically import the client component
const LeavePageClient = dynamic(() => import('@/modules/leave/components/leave-page-client'), {
  // ssr: false, // REMOVED: ssr: false is not allowed in Server Components
  loading: () => (
    // Basic skeleton loader for the entire leave page content area
    <div className="flex flex-col gap-6">
       <Skeleton className="h-8 w-1/2" /> {/* Title skeleton */}
       <Skeleton className="h-24 w-full" /> {/* Balances skeleton */}
       <Skeleton className="h-10 w-full" /> {/* Tabs skeleton */}
       <Skeleton className="h-64 w-full" /> {/* Tab content skeleton */}
    </div>
  ),
});


interface TenantLeavePageProps {
  params: { domain: string };
}

export default async function TenantLeavePage({ params }: TenantLeavePageProps) {
  const session = await getSessionData(); // Fetch session data server-side

  if (!session?.userId || !session.tenantId || !session.tenantDomain) {
    // Redirect to login if no user ID in session
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let port = '';
    try {
      const url = new URL(baseUrl);
      if (url.port && url.port !== '80' && url.port !== '443') {
        port = `:${url.port}`;
      }
    } catch {}
    const loginUrl = `${protocol}//${params.domain}.${rootDomain}${port}/login`;
    console.warn(`[Leave Page Server] No user session found or incomplete session. Redirecting to ${loginUrl}`);
    redirect(loginUrl);
  }

  const isAdmin = session.userRole === 'Admin';

  // Render the dynamically imported client component, passing session data as props
  return (
    <LeavePageClient
      userId={session.userId}
      isAdmin={isAdmin}
      tenantDomain={session.tenantDomain}
    />
  );
}
