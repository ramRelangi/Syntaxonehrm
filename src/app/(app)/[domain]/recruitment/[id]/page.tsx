
// src/app/(app)/[domain]/recruitment/[id]/page.tsx
"use client";

import * as React from 'react';
import { useParams, notFound, useRouter } from 'next/navigation';
import type { JobPosting, Candidate } from '@/modules/recruitment/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Briefcase, MapPin, DollarSign, Calendar, Users, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CandidateList } from '@/modules/recruitment/components/candidate-list'; // Assuming this exists

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    try {
        // API route handles tenant context via header
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (response.status === 404) return undefined as T; // Handle not found specifically
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error: any) {
        throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
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

export default function JobPostingDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  const tenantDomain = params.domain as string; // Get tenant domain
  const router = useRouter();
  const { toast } = useToast();

  const [jobPosting, setJobPosting] = React.useState<JobPosting | null>(null);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDetails = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // API route handles tenant context via header
      const [postingData, candidatesData] = await Promise.all([
        fetchData<JobPosting | undefined>(`/api/recruitment/postings/${jobId}`),
        fetchData<Candidate[]>(`/api/recruitment/candidates?jobPostingId=${jobId}`)
      ]);

      if (!postingData) {
        notFound(); // Trigger 404 if job posting not found
        return;
      }

      setJobPosting(postingData);
      setCandidates(candidatesData || []); // Handle case where candidates might be null/undefined

    } catch (err: any) {
      setError("Failed to load job posting details or candidates.");
      toast({
        title: "Error Loading Data",
        description: err.message || "Could not fetch details.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [jobId, toast]);

  React.useEffect(() => {
    if (jobId) {
      fetchDetails();
    }
  }, [jobId, fetchDetails]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-8 w-1/2" />
        </div>
        <Card><CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-2/3 mt-2" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-1/4" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!jobPosting) {
     // Should be caught by notFound(), but as a fallback
     return <p className="text-center py-10">Job Posting not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
         <div className="flex items-center gap-2">
           {/* Link uses tenantDomain */}
           <Button variant="outline" size="icon" asChild>
             <Link href={`/${tenantDomain}/recruitment`}>
               <ArrowLeft className="h-4 w-4" />
               <span className="sr-only">Back to Recruitment</span>
             </Link>
           </Button>
           <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <Briefcase className="h-6 w-6" /> {jobPosting.title}
           </h1>
           <Badge variant="secondary">{jobPosting.status}</Badge>
         </div>
          {/* TODO: Add "Add Candidate" Button using a Dialog */}
          {/* <Dialog>
              <DialogTrigger asChild>
                  <Button>
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Candidate
                  </Button>
              </DialogTrigger>
              <DialogContent>...</DialogContent>
          </Dialog> */}
      </div>

       {/* Job Posting Details */}
       <Card className="shadow-sm">
         <CardHeader>
           <CardTitle>Job Details</CardTitle>
           <CardDescription>Information about the "{jobPosting.title}" position.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
            <p className="text-sm">{jobPosting.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-4 w-4" />Department: <span className="text-foreground">{jobPosting.department}</span></div>
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />Location: <span className="text-foreground">{jobPosting.location}</span></div>
                {jobPosting.salaryRange && <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" />Salary: <span className="text-foreground">{jobPosting.salaryRange}</span></div>}
                <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />Posted: <span className="text-foreground">{formatDateSafe(jobPosting.datePosted)}</span></div>
                {jobPosting.closingDate && <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />Closes: <span className="text-foreground">{formatDateSafe(jobPosting.closingDate)}</span></div>}
            </div>
         </CardContent>
       </Card>

        {/* Candidate List */}
        <Card className="shadow-sm">
         <CardHeader>
           <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Candidates ({candidates.length})</CardTitle>
           <CardDescription>Applicants for the "{jobPosting.title}" position.</CardDescription>
         </CardHeader>
         <CardContent>
            {/* Pass candidates, jobPostingId, and tenantDomain to CandidateList */}
            <CandidateList
                candidates={candidates}
                jobPostingId={jobId}
                onUpdate={fetchDetails} // Refetch details if candidate status changes etc.
                tenantDomain={tenantDomain} // Pass tenantDomain
            />
         </CardContent>
       </Card>

    </div>
  );
}
