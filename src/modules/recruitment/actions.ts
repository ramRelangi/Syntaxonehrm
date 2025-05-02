'use server';

import type { JobPosting, Candidate, JobPostingFormData, CandidateFormData, CandidateStatus } from '@/modules/recruitment/types';
import { jobPostingSchema, candidateSchema } from '@/modules/recruitment/types'; // Assuming schemas are defined correctly
import {
  getAllJobPostings as dbGetAllJobPostings,
  getJobPostingById as dbGetJobPostingById,
  addJobPosting as dbAddJobPosting,
  updateJobPosting as dbUpdateJobPosting,
  deleteJobPosting as dbDeleteJobPosting,
  getAllCandidates as dbGetAllCandidates,
  getCandidateById as dbGetCandidateById,
  addCandidate as dbAddCandidate,
  updateCandidate as dbUpdateCandidate,
  deleteCandidate as dbDeleteCandidate,
} from '@/modules/recruitment/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

// --- Job Posting Server Actions ---

export async function getJobPostings(filters?: { status?: JobPosting['status'] }): Promise<JobPosting[]> {
    return dbGetAllJobPostings(filters);
}

export async function getJobPostingById(id: string): Promise<JobPosting | undefined> {
    return dbGetJobPostingById(id);
}

export async function addJobPostingAction(formData: JobPostingFormData): Promise<{ success: boolean; jobPosting?: JobPosting; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).safeParse(formData);
    if (!validation.success) {
        console.error("Add Job Posting Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newJobPosting = await dbAddJobPosting(validation.data);
        revalidatePath('/recruitment');
        revalidatePath('/jobs'); // Revalidate public job board
        return { success: true, jobPosting: newJobPosting };
    } catch (error: any) {
        console.error("Error adding job posting (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['title'], message: error.message || 'Failed to add job posting.' }] };
    }
}

export async function updateJobPostingAction(id: string, formData: Partial<JobPostingFormData>): Promise<{ success: boolean; jobPosting?: JobPosting; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    // Use partial validation for updates
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).partial().safeParse(formData);
    if (!validation.success) {
         console.error("Update Job Posting Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedJobPosting = await dbUpdateJobPosting(id, validation.data);
        if (updatedJobPosting) {
            revalidatePath('/recruitment');
            revalidatePath(`/recruitment/${id}`);
            revalidatePath('/jobs'); // Revalidate public job board
            revalidatePath(`/jobs/${id}`);
            return { success: true, jobPosting: updatedJobPosting };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Job posting not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating job posting (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['title'], message: error.message || 'Failed to update job posting.' }] };
    }
}

export async function deleteJobPostingAction(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const deleted = await dbDeleteJobPosting(id);
        if (deleted) {
            revalidatePath('/recruitment');
            revalidatePath('/jobs'); // Revalidate public job board
            return { success: true };
        } else {
            // Should be caught by db function error now if candidates exist
             return { success: false, error: 'Job posting not found.' };
        }
    } catch (error: any) {
        console.error("Error deleting job posting (action):", error);
        return { success: false, error: error.message || 'Failed to delete job posting.' };
    }
}


// --- Candidate Server Actions ---

export async function getCandidates(filters?: { jobPostingId?: string, status?: CandidateStatus }): Promise<Candidate[]> {
    return dbGetAllCandidates(filters);
}

export async function getCandidateById(id: string): Promise<Candidate | undefined> {
    return dbGetCandidateById(id);
}

export async function addCandidateAction(formData: CandidateFormData): Promise<{ success: boolean; candidate?: Candidate; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    const validation = candidateSchema.omit({ id: true, applicationDate: true }).safeParse(formData);
     if (!validation.success) {
         console.error("Add Candidate Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newCandidate = await dbAddCandidate(validation.data);
        revalidatePath(`/recruitment/${formData.jobPostingId}`); // Revalidate the specific job posting page
        return { success: true, candidate: newCandidate };
    } catch (error: any) {
        console.error("Error adding candidate (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add candidate.' }] };
    }
}

export async function updateCandidateAction(id: string, formData: Partial<Omit<Candidate, 'id' | 'applicationDate' | 'jobPostingId'>>): Promise<{ success: boolean; candidate?: Candidate; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    // Use partial validation for updates
    const validation = candidateSchema.omit({ id: true, applicationDate: true, jobPostingId: true }).partial().safeParse(formData);
     if (!validation.success) {
        console.error("Update Candidate Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedCandidate = await dbUpdateCandidate(id, validation.data);
        if (updatedCandidate) {
             revalidatePath(`/recruitment/${updatedCandidate.jobPostingId}`); // Revalidate the specific job posting page
            return { success: true, candidate: updatedCandidate };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Candidate not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating candidate (action):", error);
         return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to update candidate.' }] };
    }
}

// Action specifically for updating candidate status (common operation)
export async function updateCandidateStatusAction(id: string, status: CandidateStatus): Promise<{ success: boolean; candidate?: Candidate; errors?: { code: string; path: string[]; message: string }[] }> {
    try {
        const updatedCandidate = await dbUpdateCandidate(id, { status });
        if (updatedCandidate) {
             revalidatePath(`/recruitment/${updatedCandidate.jobPostingId}`);
            return { success: true, candidate: updatedCandidate };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Candidate not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating candidate status (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['status'], message: error.message || 'Failed to update candidate status.' }] };
    }
}


export async function deleteCandidateAction(id: string): Promise<{ success: boolean; jobPostingId?: string; error?: string }> {
    try {
        const candidate = await dbGetCandidateById(id); // Get posting ID before deleting
        if (!candidate) {
            return { success: false, error: 'Candidate not found.' };
        }
        const jobPostingId = candidate.jobPostingId;

        const deleted = await dbDeleteCandidate(id);
        if (deleted) {
            revalidatePath(`/recruitment/${jobPostingId}`); // Revalidate the specific job posting page
            return { success: true, jobPostingId };
        } else {
             return { success: false, error: 'Candidate not found during deletion.' };
        }
    } catch (error: any) {
        console.error("Error deleting candidate (action):", error);
        return { success: false, error: error.message || 'Failed to delete candidate.' };
    }
}
