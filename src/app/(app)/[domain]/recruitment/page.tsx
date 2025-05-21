
// src/app/(app)/[domain]/recruitment/page.tsx (Server Component Wrapper)
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { getSessionData, isAdminFromSession } from '@/modules/auth/actions';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

const TenantRecruitmentPageClient = dynamic(() => import('@/modules/recruitment/components/recruitment-page-client'), {
  loading: () => (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Skeleton className="h-8 w-1/2 md:w-1/3" />
        <Skeleton className="h-10 w-40" />
      </div>
       <Skeleton className="h-28 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

interface TenantRecruitmentPageProps {
  params: { domain: string };
}

export default async function TenantRecruitmentPage({ params }: TenantRecruitmentPageProps) {
   const session = await getSessionData();
   if (!session?.userId) {
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

   const isAdmin = await isAdminFromSession();
   if (!isAdmin) {
       // If not admin, show an unauthorized message or redirect
       return (
           <div className="flex flex-col items-center justify-center min-h-[400px]">
               <Alert variant="destructive" className="max-w-md">
                  <AlertTriangle className="h-5 w-5" />
                  <AlertTitle>Unauthorized Access</AlertTitle>
                  <AlertDescription>
                      You do not have permission to view this page. Please contact your administrator if you believe this is an error.
                  </AlertDescription>
              </Alert>
           </div>
       );
   }

  return <TenantRecruitmentPageClient />;
}
