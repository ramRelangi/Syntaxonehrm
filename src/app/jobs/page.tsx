
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from 'date-fns';
import type { JobPosting } from "@/modules/recruitment/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";
import dynamic from "next/dynamic"; // Import dynamic

// Helper to fetch data from API routes - SERVER SIDE VERSION
// This function might need adjustment based on how the public API route handles tenant context
// if it's serving postings from *multiple* tenants (unlikely for a root /jobs page).
// If /jobs is meant to show only ONE tenant's jobs based on the domain (e.g. careers.company.com),
// the middleware/API needs to handle that context. Assuming /jobs shows ALL open jobs for now.
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'; // Ensure fallback for local
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;
    console.log(`[Public Jobs Page Fetch] Fetching from ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, {
            // cache: 'no-store', // Avoid no-store for potentially public, less frequently changing data
             next: { revalidate: 300 }, // Revalidate every 5 minutes for public job board
            ...options
        });
        console.log(`[Public Jobs Page Fetch] Response status: ${response.status}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Public Jobs Page Fetch] Error for ${fullUrl}: ${errorText}`);
            // Avoid throwing detailed errors on public pages
            throw new Error(`Failed to load job postings.`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Public Jobs Page Fetch] Error fetching ${fullUrl}:`, error);
        if (error instanceof Error) {
           // Avoid throwing detailed errors
           throw new Error(`Could not load job postings at this time.`);
        } else {
            throw new Error(`An unexpected error occurred.`);
        }
    }
}

// Helper to format date or return 'N/A'
const formatDateSafe = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  try {
    return format(parseISO(dateString), 'MMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
};

// Async component to fetch and display job postings
async function OpenJobPostingsComponent() {
    // Fetch only 'Open' postings. The API route MUST handle how it determines
    // *which* tenant's postings to show if accessed via the root domain.
    // If it's meant to show ALL open postings across tenants, the API needs modification.
    // Assuming for now it correctly fetches relevant open postings based on request context or configuration.
    let openPostings: JobPosting[] = [];
    try {
        // This API call might need adjustment depending on multi-tenant public board strategy
        openPostings = await fetchData<JobPosting[]>('/api/recruitment/postings?status=Open');
    } catch (error: any) {
        console.error("Error loading open job postings:", error.message);
        return (
             <Card className="text-center py-12 shadow-sm border-destructive bg-destructive/10">
                 <CardHeader>
                     <CardTitle className="text-destructive">Error Loading Jobs</CardTitle>
                 </CardHeader>
                 <CardContent>
                     <p className="text-destructive/90">Could not load job postings at this time. Please try again later.</p>
                 </CardContent>
             </Card>
        );
    }


    if (!openPostings || openPostings.length === 0) {
        return (
            <Card className="text-center py-12 shadow-sm">
                <CardHeader>
                    <CardTitle>No Open Positions</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">There are currently no open positions. Please check back later.</p>
                </CardContent>
            </Card>
        );
    }

    return (
         <div className="space-y-6">
            {openPostings.map((job) => (
                <Card key={job.id} className="shadow-sm hover:shadow-md transition-shadow duration-200">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                            <CardTitle className="text-xl lg:text-2xl">{job.title}</CardTitle>
                            {/* Optional: Show location/remote status prominently */}
                            <Badge variant="outline" className="shrink-0 mt-1 sm:mt-0">{job.location}</Badge>
                        </div>
                         <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {job.department}</span>
                            <span className="hidden sm:inline">|</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Posted: {formatDateSafe(job.datePosted)}</span>
                             {job.closingDate && <> <span className="hidden sm:inline">|</span> <span className="flex items-center gap-1">Closing: {formatDateSafe(job.closingDate)}</span> </>}
                         </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{job.description}</p>
                         {/* Link to a dedicated detail page */}
                         <Button asChild variant="default">
                             <Link href={`/jobs/${job.id}`}>
                                View Details & Apply <ExternalLink className="ml-2 h-4 w-4" />
                             </Link>
                         </Button>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Skeleton loader for job postings
function JobPostingsSkeleton() {
    return (
        <div className="space-y-6">
            {[1, 2, 3].map((i) => (
                <Card key={i} className="shadow-sm">
                    <CardHeader>
                         <div className="flex justify-between items-start gap-2">
                            <Skeleton className="h-6 w-3/5 rounded-md" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                         </div>
                         <Skeleton className="h-4 w-2/5 mt-2 rounded-md" />
                    </CardHeader>
                    <CardContent>
                         <Skeleton className="h-4 w-full rounded-md mb-2" />
                         <Skeleton className="h-4 w-full rounded-md mb-2" />
                         <Skeleton className="h-4 w-4/5 rounded-md mb-4" />
                         <Skeleton className="h-10 w-40 rounded-md" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// Dynamically import the data-fetching component
const OpenJobPostings = dynamic(() => Promise.resolve(OpenJobPostingsComponent), {
  ssr: true, // Enable SSR for better SEO and initial load
  loading: () => <JobPostingsSkeleton />,
});


export default function PublicJobBoardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
         <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Join Our Team</h1>
         <p className="mt-2 text-lg text-muted-foreground">Explore exciting career opportunities at SyntaxHive Hrm.</p>
      </div>

      {/* Job Listings Section */}
      {/* Suspense is handled by dynamic import's loading state */}
      <OpenJobPostings />
    </div>
  );
}
