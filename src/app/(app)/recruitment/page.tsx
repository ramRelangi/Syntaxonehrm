
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
  const [publicJobBoardUrl, setPublicJobBoardUrl] = React.useState('');

  // Get the base URL for the public job board link
  React.useEffect(() => {
    // Ensure this runs only on the client
    setPublicJobBoardUrl(`${window.location.origin}/jobs`);
  }, []);


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

     const copyToClipboard = () => {
        navigator.clipboard.writeText(publicJobBoardUrl).then(() => {
            toast({ title: "Link Copied", description: "Public job board URL copied to clipboard." });
        }).catch(err => {
             toast({ title: "Copy Failed", description: "Could not copy link.", variant: "destructive" });
             console.error("Failed to copy:", err);
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
            <CardDescription>View, edit, or manage your company's job postings.</CardDescription>
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
                     />
                 )
            )}
         </CardContent>
      </Card>

    </div>
  );
}

```</description>
  </change>
  <change>
    <file>src/app/jobs/layout.tsx</file>
    <description>Create a simple layout for the public job board page.</description>
    <content><![CDATA[
import type { Metadata } from 'next';
import '../globals.css'; // Reuse global styles
import { Toaster } from '@/components/ui/toaster'; // Might be useful for potential future interactions

// Basic metadata for the public page
export const metadata: Metadata = {
  title: 'Careers - StreamlineHR', // Adjust title as needed
  description: 'View open positions and apply to join our team.',
};

export default function PublicJobBoardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
           {/* Simple Header */}
            <header className="border-b sticky top-0 bg-card z-10">
                <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
                     <a href="/" className="flex items-center gap-2 font-semibold text-lg text-primary">
                         {/* Re-use placeholder logo or add company logo */}
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 3v18M3 12h18"/></svg>
                         <span className="">StreamlineHR Careers</span> {/* Or Company Name */}
                     </a>
                     {/* Optional: Add link back to main company site */}
                     {/* <a href="https://yourcompany.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">Company Site</a> */}
                </nav>
            </header>

            {/* Main Content Area */}
            <main className="container mx-auto px-4 py-8 md:py-12">
                 {children}
            </main>

            {/* Simple Footer */}
            <footer className="border-t mt-12 py-6 text-center text-sm text-muted-foreground">
                © {new Date().getFullYear()} StreamlineHR. All rights reserved. {/* Adjust company name */}
            </footer>

            <Toaster />
      </body>
    </html>
  );
}
```