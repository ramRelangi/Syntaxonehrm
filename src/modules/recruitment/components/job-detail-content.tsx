
// src/modules/recruitment/components/job-detail-content.tsx
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton"; // Import skeleton for internal loading state
import { Briefcase, MapPin, Calendar, DollarSign, ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from 'date-fns';
import type { JobPosting } from "@/modules/recruitment/types";
import { useToast } from '@/hooks/use-toast';
import { JobDetailSkeleton } from '@/app/jobs/[id]/page'; // Assuming skeleton is exported

interface JobDetailContentProps {
  jobId: string;
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T | undefined> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Job Detail Client Fetch] Fetching from ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
         console.log(`[Job Detail Client Fetch] Response status: ${response.status}`);
        if (response.status === 404) {
            return undefined; // Return undefined for 404
        }
        if (!response.ok) {
             const errorText = await response.text();
             console.error(`[Job Detail Client Fetch] Error for ${fullUrl}: ${errorText}`);
             let errorPayload: { message?: string; error?: string } = {};
             try { errorPayload = JSON.parse(errorText || '{}'); } catch {}
             throw new Error(errorPayload.error || errorPayload.message || `Failed to fetch job details. Status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Job Detail Client Fetch] Error fetching ${fullUrl}:`, error);
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
    return format(parseISO(dateString), 'MMMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
};

export default function JobDetailContent({ jobId }: JobDetailContentProps) {
  const [job, setJob] = React.useState<JobPosting | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchJob = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // API route might need tenant context depending on how it's accessed
        const data = await fetchData<JobPosting | undefined>(`/api/recruitment/postings/${jobId}`);

        if (!data) {
          setError('Job posting not found.');
          return;
        }
         if (data.status !== 'Open') {
             setError('This position is no longer available.');
             // Still set the job data if you want to display limited info for closed jobs
             // setJob(data);
             return;
         }
        setJob(data);
      } catch (err: any) {
        setError(err.message || "Failed to load job details.");
        toast({
          title: "Error Loading Job",
          description: err.message || "Could not fetch job details.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (jobId) {
      fetchJob();
    }
  }, [jobId, toast]);

  if (isLoading) {
    // Use the same skeleton structure as defined in the page component
    return <JobDetailSkeleton />;
  }

  if (error) {
     return (
        <div className="flex flex-col items-center justify-center text-center py-12">
             <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
             <h2 className="text-xl font-semibold text-destructive">{error}</h2>
             <p className="text-muted-foreground mt-2">Please check the URL or go back to the careers page.</p>
             <Button variant="outline" asChild className="mt-6">
                <Link href="/jobs">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Careers
                </Link>
             </Button>
         </div>
     );
  }

  if (!job) {
     // This case should ideally be caught by the error state, but added as fallback
     return (
         <div className="text-center py-10 text-muted-foreground">
             Job posting details could not be loaded.
         </div>
     );
   }

  // Render the actual job details
  return (
    <>
      <div className="mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href="/jobs">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Careers
          </Link>
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
            <CardTitle className="text-2xl md:text-3xl">{job.title}</CardTitle>
            <Badge variant="secondary" className="shrink-0 mt-1 sm:mt-0">{job.location}</Badge>
          </div>
          {/* Improved responsive layout for details */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 whitespace-nowrap"><Briefcase className="h-4 w-4" /> {job.department}</span>
            {job.salaryRange && <span className="flex items-center gap-1.5 whitespace-nowrap"><DollarSign className="h-4 w-4" /> {job.salaryRange}</span>}
            <span className="flex items-center gap-1.5 whitespace-nowrap"><Calendar className="h-4 w-4" /> Posted: {formatDateSafe(job.datePosted)}</span>
            {job.closingDate && <span className="flex items-center gap-1.5 whitespace-nowrap"><Calendar className="h-4 w-4" /> Closes: {formatDateSafe(job.closingDate)}</span>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Render description with whitespace preservation and prose styling */}
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none whitespace-pre-wrap break-words">
            {job.description}
          </div>

          {/* Application Button/Link */}
          <div className="pt-6 border-t">
            {/* TODO: Replace '#' with the actual application link or system */}
            <Button size="lg" asChild className="w-full sm:w-auto">
              <a href="#" target="_blank" rel="noopener noreferrer">
                Apply Now <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Click "Apply Now" to submit your application.</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// Export the skeleton component from the page file to be used here.
// We need to define it again here or ensure it's exported from the page file.
// Re-defining skeleton here for simplicity:
const JobDetailSkeleton = () => (
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
