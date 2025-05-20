
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
import { ArrowLeft, Briefcase, MapPin, DollarSign, Calendar, Users, PlusCircle, Type, BarChart, Info } from 'lucide-react'; // Added Type, BarChart, Info icons
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { CandidateList } from '@/modules/recruitment/components/candidate-list';
import { JobDetailSkeleton } from '@/app/jobs/[id]/page'; // Use public job skeleton for consistency

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (response.status === 404) return undefined as T;
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error: any) {
        throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
    }
}

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
  const tenantDomain = params.domain as string;
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
      const [postingData, candidatesData] = await Promise.all([
        fetchData<JobPosting | undefined>(`/api/recruitment/postings/${jobId}`),
        fetchData<Candidate[]>(`/api/recruitment/candidates?jobPostingId=${jobId}`)
      ]);

      if (!postingData) {
        notFound();
        return;
      }

      setJobPosting(postingData);
      setCandidates(candidatesData || []);

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
    return <JobDetailSkeleton />; // Use imported skeleton
  }

  if (error) {
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!jobPosting) {
     return <p className="text-center py-10">Job Posting not found.</p>;
  }

  const InfoItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value?: string | null }) => {
    if (!value) return null;
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}:</span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
         <div className="flex items-center gap-2">
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
      </div>

       <Card className="shadow-sm">
         <CardHeader>
           <CardTitle>Job Details</CardTitle>
           <CardDescription>Information about the "{jobPosting.title}" position.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <InfoItem icon={Briefcase} label="Department" value={jobPosting.department} />
                <InfoItem icon={MapPin} label="Location" value={jobPosting.location} />
                <InfoItem icon={Type} label="Employment Type" value={jobPosting.employmentType} />
                <InfoItem icon={BarChart} label="Experience Level" value={jobPosting.experienceLevel} />
                <InfoItem icon={DollarSign} label="Salary" value={jobPosting.salaryRange} />
                <InfoItem icon={Calendar} label="Posted" value={formatDateSafe(jobPosting.datePosted)} />
                <InfoItem icon={Calendar} label="Closes" value={formatDateSafe(jobPosting.closingDate)} />
            </div>
            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-2 text-md flex items-center gap-2"><Info className="h-5 w-5 text-primary" />Description</h3>
              <p className="text-sm whitespace-pre-wrap">{jobPosting.description}</p>
            </div>
         </CardContent>
       </Card>

        <Card className="shadow-sm">
         <CardHeader>
           <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Candidates ({candidates.length})</CardTitle>
           <CardDescription>Applicants for the "{jobPosting.title}" position.</CardDescription>
         </CardHeader>
         <CardContent>
            <CandidateList
                candidates={candidates}
                jobPostingId={jobId}
                onUpdate={fetchDetails}
                tenantDomain={tenantDomain}
            />
         </CardContent>
       </Card>
    </div>
  );
}
