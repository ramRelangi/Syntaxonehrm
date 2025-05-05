// src/app/(app)/[domain]/recruitment/page.tsx (Server Component Wrapper)
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { getSessionData } from '@/modules/auth/actions';
import { redirect } from 'next/navigation';

// Dynamically import the client component
const TenantRecruitmentPageClient = dynamic(() => import('@/modules/recruitment/components/recruitment-page-client'), {
  // ssr: false, // Remove this line - ssr: false is not allowed in Server Components
  loading: () => (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Skeleton className="h-8 w-1/2 md:w-1/3" />
        <Skeleton className="h-10 w-40" />
      </div>
       <Skeleton className="h-28 w-full" /> {/* Public Job Board Link Skeleton */}
      <Skeleton className="h-64 w-full" /> {/* Job Postings List Skeleton */}
    </div>
  ),
});

interface TenantRecruitmentPageProps {
  params: { domain: string };
}

export default async function TenantRecruitmentPage({ params }: TenantRecruitmentPageProps) {
   // Basic authentication check (can be refined)
   const session = await getSessionData();
   if (!session?.userId) {
     // Construct login URL based on domain
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
     console.warn(`[Recruitment Page Server] No user session. Redirecting to ${loginUrl}`);
     redirect(loginUrl);
   }

  // Render the dynamically imported client component
  // Props like tenantDomain can be passed if needed by the client component,
  // though it can also derive it from useParams.
  return <TenantRecruitmentPageClient />;
}
