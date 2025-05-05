
// src/app/jobs/[id]/page.tsx (Server Component Wrapper)
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from 'next/navigation';
import type { JobPosting } from "@/modules/recruitment/types";
import dynamic from 'next/dynamic'; // Import dynamic

// Dynamically import the component responsible for fetching and displaying details
const JobDetailContent = dynamic(() => import('@/modules/recruitment/components/job-detail-content'), {
  ssr: true, // Keep SSR for SEO and initial view
  loading: () => <JobDetailSkeleton />, // Provide a skeleton loader
});

interface Params {
  params: { id: string };
}

// Helper function duplicated here for metadata fetching (consider extracting to a shared lib)
async function fetchMetadataData<T>(url: string): Promise<T | undefined> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;
    try {
        // Use a short revalidation for metadata to keep it reasonably fresh but cached
        const response = await fetch(fullUrl, { next: { revalidate: 600 } });
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`Failed metadata fetch: ${response.status}`);
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching metadata from ${fullUrl}:`, error);
        return undefined; // Return undefined on error
    }
}

export async function generateMetadata({ params }: Params) {
    // API route needs to handle context if needed (e.g., fetching specific tenant job if accessed via subdomain)
    // Ensure the API route doesn't require auth for this public access
    const job = await fetchMetadataData<JobPosting>(`/api/recruitment/postings/${params.id}`);
    if (!job || job.status !== 'Open') { // Also check status for metadata
        return { title: 'Job Not Found' };
    }
    return {
        title: `${job.title} - Careers | SyntaxHive Hrm`, // Updated title
        description: job.description.substring(0, 160) + '...',
    };
}

// Skeleton loader for the job detail page - EXPORT this
export function JobDetailSkeleton() {
  return (
    <>
      <div className="mb-6">
        <Skeleton className="h-9 w-40 rounded-md" /> {/* Back button skeleton */}
      </div>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
            <Skeleton className="h-8 w-3/5 rounded-md" />
            <Skeleton className="h-6 w-24 rounded-full mt-1 sm:mt-0" />
          </div>
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-3/4 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
          </div>
          <div className="pt-6 border-t">
            <Skeleton className="h-12 w-36 rounded-md" />
            <Skeleton className="h-3 w-1/2 mt-2 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}


export default function JobDetailPage({ params }: Params) {
  // The heavy lifting (fetching + rendering) is now done in the dynamically imported component
  return (
    // Responsive max-width
    <div className="max-w-xl lg:max-w-3xl mx-auto">
       {/* Pass the job ID to the client component */}
       <JobDetailContent jobId={params.id} />
    </div>
  );
}
