
"use client";

import * as React from 'react';
import type { JobPosting } from '@/modules/recruitment/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"; // Added CardFooter
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { format, parseISO, differenceInDays } from 'date-fns';
import { Briefcase, Calendar, MapPin, DollarSign, AlertCircle, CheckCircle, Archive, Users, Edit, Trash2, Loader2, Type, BarChart } from 'lucide-react'; // Added Type and BarChart icons
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';

const getStatusVariant = (status: JobPosting['status']): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case 'Open': return 'default';
    case 'Closed': return 'destructive';
    case 'Draft': return 'secondary';
    case 'Archived': return 'outline';
    default: return 'outline';
  }
};

const getStatusIcon = (status: JobPosting['status']) => {
  switch (status) {
    case 'Open': return <CheckCircle className="h-3 w-3" />;
    case 'Closed': return <AlertCircle className="h-3 w-3" />;
    case 'Draft': return <Edit className="h-3 w-3" />;
    case 'Archived': return <Archive className="h-3 w-3" />;
    default: return null;
  }
};

const formatDateSafe = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  try { return format(parseISO(dateString), 'MMM d, yyyy'); }
  catch { return 'Invalid Date'; }
};

const getDaysRemaining = (closingDate?: string): string | null => {
    if (!closingDate) return null;
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const close = parseISO(closingDate);
        const days = differenceInDays(close, today);
        if (days < 0) return "Closed";
        if (days === 0) return "Closes Today";
        if (days === 1) return "Closes Tomorrow";
        return `${days} days left`;
    } catch { return null; }
};

interface JobPostingListProps {
  jobPostings: JobPosting[];
  onEdit: (posting: JobPosting) => void;
  onDeleteSuccess: () => void;
  tenantDomain: string;
}

export function JobPostingList({ jobPostings, onEdit, onDeleteSuccess, tenantDomain }: JobPostingListProps) {
    const { toast } = useToast();
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const handleDelete = async (id: string, title: string) => {
        setDeletingId(id);
        console.log(`[Job Posting List] Deleting posting ${id} via API...`);
        try {
            const response = await fetch(`/api/recruitment/postings/${id}`, { method: 'DELETE' });

             let result: any;
             let responseText: string | null = null;
             try {
                responseText = await response.text();
                 if(responseText) result = JSON.parse(responseText);
             } catch(e){
                if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
                result = {};
             }

            if (!response.ok) {
                 console.error("[Job Posting List] API Delete Error:", result);
                throw new Error(result?.error || result?.message || `Failed to delete ${title}`);
            }

            console.log("[Job Posting List] API Delete Success:", result);

            toast({
                title: "Job Posting Deleted",
                description: `${title} has been successfully deleted.`,
                className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
            });
            onDeleteSuccess();

        } catch (error: any) {
             console.error("[Job Posting List] Delete error:", error);
            toast({
                title: "Deletion Failed",
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setDeletingId(null);
        }
    };

  if (jobPostings.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No job postings found. Create one to get started!
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {jobPostings.map((job) => {
        const daysRemainingText = getDaysRemaining(job.closingDate);
        return (
          <Card key={job.id} className="shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col">
            <CardHeader>
              <div className="flex justify-between items-start gap-2">
                 <CardTitle className="text-lg">{job.title}</CardTitle>
                 <Badge variant={getStatusVariant(job.status)} className="flex items-center gap-1 text-xs h-6 shrink-0">
                    {getStatusIcon(job.status)}
                    {job.status}
                 </Badge>
              </div>
              <CardDescription className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                <Briefcase className="h-3 w-3" /> {job.department} <span className="mx-1">|</span> <MapPin className="h-3 w-3" /> {job.location}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">{job.description}</p>
              <div className="space-y-1 text-xs text-muted-foreground">
                 {job.employmentType && (
                    <div className="flex items-center gap-1.5">
                        <Type className="h-3.5 w-3.5" /> Type: {job.employmentType}
                    </div>
                 )}
                  {job.experienceLevel && (
                    <div className="flex items-center gap-1.5">
                        <BarChart className="h-3.5 w-3.5" /> Level: {job.experienceLevel}
                    </div>
                 )}
                 {job.salaryRange && (
                    <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Salary: {job.salaryRange}
                    </div>
                 )}
                 <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Posted: {formatDateSafe(job.datePosted)}
                 </div>
                 {job.closingDate && (
                    <div className={`flex items-center gap-1.5 ${daysRemainingText === 'Closed' ? 'text-destructive' : ''}`}>
                        <Calendar className="h-3.5 w-3.5" /> Closing: {formatDateSafe(job.closingDate)}
                         {daysRemainingText && <Badge variant="outline" className="ml-auto text-xs">{daysRemainingText}</Badge>}
                    </div>
                 )}
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-between p-4 border-t"> {/* Use CardFooter for consistent padding */}
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/${tenantDomain}/recruitment/${job.id}`}>
                        <Users className="mr-2 h-4 w-4" /> View Candidates
                    </Link>
                </Button>
                 <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(job)} className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Button>
                    <AlertDialog>
                       <AlertDialogTrigger asChild>
                           <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8" disabled={deletingId === job.id}>
                               {deletingId === job.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                               <span className="sr-only">Delete</span>
                           </Button>
                       </AlertDialogTrigger>
                       <AlertDialogContent>
                         <AlertDialogHeader>
                           <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                           <AlertDialogDescription>
                             This will permanently delete the job posting "<strong>{job.title}</strong>". This action cannot be undone and might fail if candidates are associated with it.
                           </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                           <AlertDialogCancel disabled={deletingId === job.id}>Cancel</AlertDialogCancel>
                           <AlertDialogAction onClick={() => handleDelete(job.id!, job.title)} disabled={deletingId === job.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              {deletingId === job.id ? "Deleting..." : "Delete"}
                           </AlertDialogAction>
                         </AlertDialogFooter>
                       </AlertDialogContent>
                     </AlertDialog>
                 </div>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
