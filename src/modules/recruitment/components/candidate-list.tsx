"use client";

import * as React from 'react';
import type { Candidate, CandidateStatus } from '@/modules/recruitment/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { MoreHorizontal, User, Mail, Phone, FileText, Trash2, Edit, Eye, Loader2 } from 'lucide-react'; // Added Loader2
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
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
import Link from 'next/link';

interface CandidateListProps {
  candidates: Candidate[];
  jobPostingId: string;
  onUpdate: () => void;
}

const candidateStatuses: CandidateStatus[] = [
    'Applied', 'Screening', 'Interviewing', 'Offer Extended', 'Hired', 'Rejected', 'Withdrawn'
];

const getStatusVariant = (status: CandidateStatus): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case 'Hired': case 'Offer Extended': return 'default';
    case 'Interviewing': case 'Screening': return 'secondary';
    case 'Applied': return 'outline';
    case 'Rejected': case 'Withdrawn': return 'destructive';
    default: return 'outline';
  }
};

export function CandidateList({ candidates, jobPostingId, onUpdate }: CandidateListProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const handleStatusChange = async (candidateId: string, newStatus: CandidateStatus) => {
    const loadingKey = `${candidateId}_status`;
    setActionLoading(prev => ({ ...prev, [loadingKey]: true }));
    console.log(`[Candidate List] Updating status for ${candidateId} to ${newStatus} via API...`);
    try {
      // Use the specific API endpoint for status update if available, otherwise use PUT on candidate
      const response = await fetch(`/api/recruitment/candidates/${candidateId}`, { // Assuming PUT updates status
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      let result: any;
      let responseText: string | null = null;
      try {
          responseText = await response.text();
          if(responseText) result = JSON.parse(responseText);
      } catch(e){
          if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
          result = {}; // OK, no body
      }

      if (!response.ok) {
        console.error("[Candidate List] API Status Update Error:", result);
        throw new Error(result?.error || result?.message || `Failed to update status`);
      }
      console.log("[Candidate List] API Status Update Success:", result);
      toast({ title: "Status Updated", description: `Candidate status changed to ${newStatus}.` });
      onUpdate(); // Refresh list

    } catch (error: any) {
       console.error("[Candidate List] Status update error:", error);
      toast({ title: "Error Updating Status", description: error.message, variant: "destructive" });
    } finally {
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleDelete = async (candidateId: string, candidateName: string) => {
    setDeletingId(candidateId);
    console.log(`[Candidate List] Deleting candidate ${candidateId} via API...`);
    try {
      const response = await fetch(`/api/recruitment/candidates/${candidateId}`, { method: 'DELETE' });

       let result: any;
       let responseText: string | null = null;
       try {
          responseText = await response.text();
          if(responseText) result = JSON.parse(responseText);
       } catch(e){
          if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
          result = {}; // OK, no body
       }

       if (!response.ok) {
           console.error("[Candidate List] API Delete Error:", result);
         throw new Error(result?.error || result?.message || `Failed to delete candidate`);
       }
        console.log("[Candidate List] API Delete Success:", result);
      toast({ title: "Candidate Deleted", description: `${candidateName} has been removed.` });
      onUpdate(); // Refresh list

    } catch (error: any) {
      console.error("[Candidate List] Delete error:", error);
      toast({ title: "Error Deleting Candidate", description: error.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };


  if (candidates.length === 0) {
    return <p className="text-muted-foreground text-center py-6">No candidates found for this job posting.</p>;
  }

  return (
    <div className="border rounded-md shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Applied</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => {
              const isLoadingStatus = actionLoading[`${candidate.id}_status`];
              const isCurrentDeleting = deletingId === candidate.id;
            return (
                <TableRow key={candidate.id}>
                <TableCell className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" /> {candidate.name}
                </TableCell>
                <TableCell>
                    <a href={`mailto:${candidate.email}`} className="text-primary hover:underline flex items-center gap-1">
                        <Mail className="h-4 w-4 text-muted-foreground" /> {candidate.email}
                    </a>
                    {candidate.phone && (
                        <span className="text-xs text-muted-foreground block mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {candidate.phone}
                        </span>
                    )}
                </TableCell>
                <TableCell>{format(parseISO(candidate.applicationDate), 'MMM d, yyyy')}</TableCell>
                <TableCell>
                    <Badge variant={getStatusVariant(candidate.status)}>{candidate.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                    <AlertDialog> {/* Wrap Dropdown and Dialog Trigger */}
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isLoadingStatus || isCurrentDeleting}>
                         {(isLoadingStatus || isCurrentDeleting) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        <span className="sr-only">Candidate Actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions for {candidate.name}</DropdownMenuLabel>
                        {candidate.resumeUrl && (
                            <DropdownMenuItem asChild>
                            <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-2 h-4 w-4" /> View Resume
                            </a>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={isLoadingStatus}>
                            Change Status
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup
                            value={candidate.status}
                            onValueChange={(newStatus) => handleStatusChange(candidate.id!, newStatus as CandidateStatus)}
                            >
                            {candidateStatuses.map((status) => (
                                <DropdownMenuRadioItem key={status} value={status} disabled={isLoadingStatus}>
                                {status}
                                </DropdownMenuRadioItem>
                            ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator />
                        <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" disabled={isCurrentDeleting || isLoadingStatus}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Candidate
                        </DropdownMenuItem>
                        </AlertDialogTrigger>
                    </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Delete Confirmation Dialog */}
                    <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the candidate record for <strong>{candidate.name}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isCurrentDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(candidate.id!, candidate.name)} disabled={isCurrentDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        {isCurrentDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                    </AlertDialogContent>
                    </AlertDialog> {/* End AlertDialog Wrapper */}
                </TableCell>
                </TableRow>
            );
           })}
        </TableBody>
      </Table>
    </div>
  );
}
