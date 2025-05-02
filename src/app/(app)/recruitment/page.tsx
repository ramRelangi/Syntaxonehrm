
"use client"; // This page needs client-side interactivity for dialogs and data fetching

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, PlusCircle } from "lucide-react";
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

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error: any) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
    }
}


export default function RecruitmentPage() {
  const [jobPostings, setJobPostings] = React.useState<JobPosting[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingPosting, setEditingPosting] = React.useState<JobPosting | null>(null);
  const { toast } = useToast();

  const fetchJobPostings = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchData<JobPosting[]>('/api/recruitment/postings');
      setJobPostings(data);
    } catch (err: any) {
      setError("Failed to load job postings.");
      toast({
        title: "Error",
        description: err.message || "Could not fetch job postings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchJobPostings();
  }, [fetchJobPostings]);

  const handleFormSuccess = () => {
    setIsFormOpen(false); // Close dialog
    setEditingPosting(null); // Clear editing state
    fetchJobPostings(); // Refetch data
  };

   const handleEdit = (posting: JobPosting) => {
     setEditingPosting(posting);
     setIsFormOpen(true);
   };

   const handleAddNew = () => {
     setEditingPosting(null); // Ensure not in edit mode
     setIsFormOpen(true);
   };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            // Reset editing state when dialog is closed externally
            setEditingPosting(null);
        }
        setIsFormOpen(open);
    }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Briefcase className="h-6 w-6" /> Recruitment Management
        </h1>
         {/* Using Dialog for Add/Edit */}
         <Dialog open={isFormOpen} onOpenChange={handleDialogClose}>
             <DialogTrigger asChild>
                 <Button onClick={handleAddNew}>
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
                  />
             </DialogContent>
         </Dialog>
      </div>

      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Job Postings</CardTitle>
            <CardDescription>Manage your company's open positions.</CardDescription>
         </CardHeader>
         <CardContent>
            {isLoading && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    <Skeleton className="h-[250px] w-full" />
                    <Skeleton className="h-[250px] w-full" />
                    <Skeleton className="h-[250px] w-full" />
                </div>
            )}
            {error && <p className="text-center text-destructive py-10">{error}</p>}
            {!isLoading && !error && (
                <JobPostingList
                    jobPostings={jobPostings}
                    onEdit={handleEdit}
                    onDeleteSuccess={fetchJobPostings} // Pass refetch function as delete success callback
                 />
            )}
         </CardContent>
      </Card>

       {/* Future Candidate Section Placeholder */}
       {/* <Card className="shadow-sm">
           <CardHeader>
               <CardTitle>Recent Candidates</CardTitle>
               <CardDescription>Overview of recent applications.</CardDescription>
           </CardHeader>
           <CardContent>
               <p className="text-muted-foreground">Candidate list or Kanban board will be displayed here.</p>
           </CardContent>
       </Card> */}
    </div>
  );
}
