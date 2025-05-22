
// src/app/(app)/[domain]/leave/page.tsx (Server Component Wrapper)
import { redirect } from 'next/navigation';
import { getSessionData, getEmployeeProfileForCurrentUser } from '@/modules/auth/actions'; // Import server-side helpers
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { Gender } from '@/modules/employees/types'; // Import Gender type

const LeavePageClient = dynamic(() => import('@/modules/leave/components/leave-page-client'), {
  loading: () => (
    <div className="flex flex-col gap-6">
       <Skeleton className="h-8 w-1/2" />
       <Skeleton className="h-24 w-full" />
       <Skeleton className="h-10 w-full" />
       <Skeleton className="h-64 w-full" />
    </div>
  ),
});


interface TenantLeavePageProps {
  params: { domain: string };
}

export default async function TenantLeavePage({ params }: TenantLeavePageProps) {
  const session = await getSessionData();

  if (!session?.userId || !session.tenantId || !session.tenantDomain) {
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
  let employeeGender: Gender | undefined = undefined;

  // Fetch employee profile to get gender
  try {
    const employeeProfile = await getEmployeeProfileForCurrentUser(); // This uses the session context internally
    if (employeeProfile) {
      employeeGender = employeeProfile.gender;
    }
  } catch (error) {
    console.error("[Leave Page Server] Error fetching employee profile for gender:", error);
    // Decide how to handle this - maybe allow proceeding without gender filtering if profile fetch fails for some reason
  }

  return (
    <LeavePageClient
      userId={session.userId}
      isAdmin={isAdmin}
      tenantDomain={session.tenantDomain}
      employeeGender={employeeGender} // Pass the gender to the client component
    />
  );
}
