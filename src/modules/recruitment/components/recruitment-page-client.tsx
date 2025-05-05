// src/modules/recruitment/components/recruitment-page-client.tsx
"use client"; // This page needs client-side interactivity for dialogs and data fetching

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, PlusCircle, Link as LinkIcon, Copy, ExternalLink } from "lucide-react";
import { JobPostingList } from "@/modules/recruitment/components/job-posting-list";
import { JobPostingForm } from "@/modules/recruitment/components/job-posting-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { JobPosting } from "@/modules/recruitment/types";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useParams } from "next/navigation"; // Import useParams

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Recruitment Page Client - fetchData] Fetching from ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Recruitment Page Client - fetchData] Response status for ${fullUrl}: ${response.status}`);
        if (!response.ok) {
            let errorPayload = { message: `HTTP error! status: ${response.status}`, error: '' };
             let errorText = '';
             try {
                 errorText = await response.text();
                 if (errorText) errorPayload = JSON.parse(errorText);
             } catch (e) {
                  console.warn(`[Recruitment Page Client - fetchData] Failed to parse error JSON. Raw text: ${errorText}`);
                  errorPayload.message = errorText || errorPayload.message;
             }
            console.error(`[Recruitment Page Client - fetchData] Fetch error:`, errorPayload);
            throw new Error(errorPayload.error || errorPayload.message);
        }
        const data = await response.json();
         console.log(`[Recruitment Page Client - fetchData] Successfully fetched ${Array.isArray(data) ? data.length : 'item'}`);
         return data as T;
    } catch (error: any) {
           console.error(`[Recruitment Page Client - fetchData] Error caught: ${error.message}`);
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
    }
}


export default function TenantRecruitmentPageClient() {
  const params = useParams();
  const tenantDomain = params.domain as string; // Get tenant domain
  const [jobPostings, setJobPostings] = React.useState<JobPosting[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingPosting, setEditingPosting] = React.useState<JobPosting | null>(null);
  const { toast } = useToast();
  const [publicJobBoardUrl, setPublicJobBoardUrl] = React.useState('');
  const [rootDomain, setRootDomain] = React.useState('localhost'); // State for root domain

  // Get the base URL for the public job board link
  React.useEffect(() => {
    // Ensure this runs only on the client
    const currentRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const currentPort = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol;

    setRootDomain(currentRootDomain);
    // Construct the public job board URL relative to the *root* domain
    setPublicJobBoardUrl(`${protocol}//${currentRootDomain}${currentPort}/jobs`);
     console.log(`[Recruitment Page Client] Public job board URL set to: ${publicJobBoardUrl}`);
  }, [publicJobBoardUrl]); // Re-run if publicJobBoardUrl changes (though it shouldn't after mount)


  const fetchJobPostings = React.useCallback(async () => {
    console.log("[Recruitment Page Client] Starting fetchJobPostings...");
    setIsLoading(true);
    setError(null);
    try {
      // API route handles tenant context via header
      const data = await fetchData<JobPosting[]>('/api/recruitment/postings');
      setJobPostings(data);
       console.log("[Recruitment Page Client] Fetched job postings successfully.");
    } catch (err: any) {
      console.error("[Recruitment Page Client] Error fetching job postings:", err);
      setError(err.message || "Failed to load job postings.");
      toast({
        title: "Error Loading Postings",
        description: err.message || "Could not fetch job postings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log("[Recruitment Page Client] fetchJobPostings finished.");
    }
  }, [toast]);

  React.useEffect(() => {
    fetchJobPostings();
  }, [fetchJobPostings]);

  const handleFormSuccess = () => {
    console.log("[Recruitment Page Client] Form success, closing dialog and refetching.");
    setIsFormOpen(false); // Close dialog
    setEditingPosting(null); // Clear editing state
    fetchJobPostings(); // Refetch data
  };

   const handleEdit = (posting: JobPosting) => {
     console.log("[Recruitment Page Client] Editing posting:", posting.id);
     setEditingPosting(posting);
     setIsFormOpen(true);
   };

   const handleAddNew = () => {
     console.log("[Recruitment Page Client] Adding new posting.");
     setEditingPosting(null); // Ensure not in edit mode
     setIsFormOpen(true);
   };

    const handleDialogClose = (open: boolean) => {
        console.log("[Recruitment Page Client] Dialog open state change:", open);
        if (!open) {
            // Reset editing state when dialog is closed externally
            setEditingPosting(null);
        }
        setIsFormOpen(open);
    }

     const copyToClipboard = () => {
        navigator.clipboard.writeText(publicJobBoardUrl).then(() => {
            toast({ title: "Link Copied", description: "Public job board URL copied to clipboard." });
        }).catch(err => {
             toast({ title: "Copy Failed", description: "Could not copy link.", variant: "destructive" });
             console.error("[Recruitment Page Client] Failed to copy job board URL:", err);
        });
    };


  return (
    <div className="flex flex-col gap-8"> {/* Increased gap */}
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Briefcase className="h-6 w-6" /> Recruitment Management
        </h1>
         {/* Using Dialog for Add/Edit */}
         <Dialog open={isFormOpen} onOpenChange={handleDialogClose}>
             <DialogTrigger asChild>
                 <Button onClick={handleAddNew} className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4"/> Create Job Posting
                 </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"> {/* Adjust width/height */}
                 <DialogHeader>
                     <DialogTitle>{editingPosting ? 'Edit Job Posting' : 'Create New Job Posting'}</DialogTitle>
                     <DialogDescription>
                         {editingPosting ? 'Update the details for this job posting.' : 'Fill in the details to create a new job posting.'}
                     </DialogDescription>
                 </DialogHeader>
                 <JobPostingForm
                    jobPosting={editingPosting ?? undefined}
                    onSuccess={handleFormSuccess}
                    // tenantDomain removed - actions handle context
                  />
             </DialogContent>
         </Dialog>
      </div>

       {/* Public Job Board Link Section */}
        <Card className="shadow-sm border-dashed border-primary/50 bg-primary/5">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-primary"><LinkIcon className="h-5 w-5" /> Public Job Board</CardTitle>
                <CardDescription>Share this link on your website or social media to display open job postings to candidates.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-4">
                 <div className="flex-grow w-full sm:w-auto">
                    <Label htmlFor="public-job-link" className="sr-only">Public Job Board Link</Label>
                    <Input
                        id="public-job-link"
                        type="text"
                        value={publicJobBoardUrl}
                        readOnly
                        className="bg-background text-sm"
                    />
                 </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={copyToClipboard} className="flex-1 sm:flex-none">
                        <Copy className="mr-2 h-4 w-4" /> Copy Link
                    </Button>
                     <Button variant="default" asChild className="flex-1 sm:flex-none">
                         <Link href={publicJobBoardUrl || '/jobs'} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" /> Preview
                         </Link>
                     </Button>
                </div>
            </CardContent>
        </Card>


      {/* Job Postings List Section */}
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Manage Job Postings</CardTitle>
            <CardDescription>View, edit, or manage your company's job postings for {tenantDomain}.</CardDescription>
         </CardHeader>
         <CardContent>
            {isLoading && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-[250px] w-full rounded-lg" />
                    <Skeleton className="h-[250px] w-full rounded-lg" />
                    <Skeleton className="h-[250px] w-full rounded-lg" />
                </div>
            )}
            {error && <p className="text-center text-destructive py-10">{error}</p>}
            {!isLoading && !error && (
                 jobPostings.length === 0 ? (
                     <div className="text-center py-10 text-muted-foreground">
                         No job postings created yet. Click "Create Job Posting" to add one.
                     </div>
                 ) : (
                     <JobPostingList
                        jobPostings={jobPostings}
                        onEdit={handleEdit}
                        onDeleteSuccess={fetchJobPostings} // Pass refetch function as delete success callback
                        tenantDomain={tenantDomain} // Pass tenantDomain for linking within the list
                     />
                 )
            )}
         </CardContent>
      </Card>

    </div>
  );
}
