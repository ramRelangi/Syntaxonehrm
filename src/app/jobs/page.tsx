
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from 'date-fns';
import type { JobPosting } from "@/modules/recruitment/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense } from "react";

// Helper to fetch data from API routes - SERVER SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'; // Ensure fallback for local
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;

    try {
        const response = await fetch(fullUrl, {
            cache: 'no-store', // Fetch fresh data for job board
             next: { revalidate: 60 }, // Revalidate every 60 seconds
            ...options
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Public fetch error for ${fullUrl}: ${errorText}`);
            throw new Error(`Failed to fetch job postings. Status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
            throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
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
async function OpenJobPostings() {
    // Fetch only 'Open' postings for the specific tenant (needs tenant context from middleware/domain)
    // The API route /api/recruitment/postings should handle tenant filtering based on the request context (e.g., header)
    const openPostings = await fetchData<JobPosting[]>('/api/recruitment/postings?status=Open');

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
                        <div className="flex justify-between items-start gap-2">
                            <CardTitle className="text-xl">{job.title}</CardTitle>
                            {/* Optional: Show location/remote status prominently */}
                            <Badge variant="outline" className="shrink-0">{job.location}</Badge>
                        </div>
                         <CardDescription className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                            <Briefcase className="h-3 w-3" /> {job.department}
                            <span className="mx-1">|</span> <Calendar className="h-3 w-3" /> Posted: {formatDateSafe(job.datePosted)}
                             {job.closingDate && <><span className="mx-1">|</span> Closing: {formatDateSafe(job.closingDate)}</>}
                         </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{job.description}</p>
                         {/* Link to a dedicated detail page (if created) or an external application link */}
                         <Button asChild variant="default">
                            {/* Placeholder link - replace with actual application URL or detail page */}
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

export default function PublicJobBoardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
         <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Join Our Team</h1>
         <p className="mt-2 text-lg text-muted-foreground">Explore exciting career opportunities at SyntaxHive Hrm.</p>
      </div>

      {/* Job Listings Section */}
      <Suspense fallback={<JobPostingsSkeleton />}>
        <OpenJobPostings />
      </Suspense>
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
