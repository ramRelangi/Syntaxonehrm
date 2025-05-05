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
// Import new session helpers from auth actions
import { getTenantIdFromSession, isAdminFromSession } from '@/modules/auth/actions';

// --- Helper Functions ---
async function checkRecruitmentPermission(): Promise<string> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) throw new Error("Tenant context not found.");
    const isAdmin = await isAdminFromSession(); // Use new session helper (or check specific role)
    if (!isAdmin) throw new Error("Unauthorized to manage recruitment.");
    return tenantId;
}


// --- Job Posting Server Actions ---

export async function getJobPostings(filters?: { status?: JobPosting['status'] }): Promise<JobPosting[]> {
    const tenantId = await getTenantIdFromSession(); // Get tenant ID from session
    if (!tenantId) {
        console.error("[Action getJobPostings] Tenant ID could not be determined from session.");
        // Public board might allow fetching 'Open' without tenantId, but API routes usually require it.
        // Throwing error as this action likely serves internal views needing auth.
        throw new Error("Unauthorized or missing tenant context.");
    }
    console.log(`[Action getJobPostings] Fetching for tenant ${tenantId}, filters:`, filters);
    try {
        // Pass tenantId to the DB function
        return dbGetAllJobPostings(tenantId, filters);
    } catch (dbError: any) {
        console.error(`[Action getJobPostings] Database error for tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch job postings: ${dbError.message}`);
    }
}

export async function getJobPostingById(id: string): Promise<JobPosting | undefined> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) {
        console.error("[Action getJobPostingById] Tenant ID could not be determined from session.");
        // Public job detail page might fetch without auth, DB layer handles tenant check if needed
        // For internal access, require tenantId.
         throw new Error("Tenant context not found.");
    }
     console.log(`[Action getJobPostingById] Fetching posting ${id} for tenant ${tenantId}`);
    // TODO: Auth check - Can the user view this posting?
    try {
        return dbGetJobPostingById(id, tenantId);
    } catch (dbError: any) {
         console.error(`[Action getJobPostingById] Database error for posting ${id}, tenant ${tenantId}:`, dbError);
         throw new Error(`Failed to fetch job posting details: ${dbError.message}`);
     }
}

export async function addJobPostingAction(formData: Omit<JobPostingFormData, 'tenantId'>): Promise<{ success: boolean; jobPosting?: JobPosting; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        return { success: false, errors: [{ code: 'custom', path: [], message: authError.message }] };
    }

    const dataWithTenant = { ...formData, tenantId };
    const validation = jobPostingSchema.omit({ id: true, datePosted: true }).safeParse(dataWithTenant);

    if (!validation.success) {
        console.error("Add Job Posting Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newJobPosting = await dbAddJobPosting(validation.data);
        revalidatePath(`/${tenantId}/recruitment`);
        revalidatePath('/jobs'); // Revalidate public job board
        return { success: true, jobPosting: newJobPosting };
    } catch (error: any) {
        console.error("Error adding job posting (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['title'], message: error.message || 'Failed to add job posting.' }] };
    }
}

export async function updateJobPostingAction(id: string, formData: Partial<Omit<JobPostingFormData, 'tenantId'>>): Promise<{ success: boolean; jobPosting?: JobPosting; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, errors: [{ code: 'custom', path: [], message: authError.message }] };
     }

    const validation = jobPostingSchema.omit({ id: true, datePosted: true, tenantId: true }).partial().safeParse(formData);
    if (!validation.success) {
         console.error("Update Job Posting Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedJobPosting = await dbUpdateJobPosting(id, tenantId, validation.data);
        if (updatedJobPosting) {
            revalidatePath(`/${tenantId}/recruitment`);
            revalidatePath(`/${tenantId}/recruitment/${id}`);
            revalidatePath('/jobs');
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
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, error: authError.message };
     }

    try {
        const deleted = await dbDeleteJobPosting(id, tenantId);
        if (deleted) {
            revalidatePath(`/${tenantId}/recruitment`);
            revalidatePath('/jobs');
            return { success: true };
        } else {
             return { success: false, error: 'Job posting not found.' };
        }
    } catch (error: any) {
        console.error("Error deleting job posting (action):", error);
        return { success: false, error: error.message || 'Failed to delete job posting.' };
    }
}


// --- Candidate Server Actions ---

export async function getCandidates(filters?: { jobPostingId?: string, status?: CandidateStatus }): Promise<Candidate[]> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
         console.error("Auth error in getCandidates:", authError);
         throw new Error(`Failed to fetch candidates: ${authError.message}`);
    }
    try {
        return dbGetAllCandidates(tenantId, filters);
    } catch (dbError: any) {
         console.error(`[Action getCandidates] Database error for tenant ${tenantId}:`, dbError);
         throw new Error(`Failed to fetch candidates: ${dbError.message}`);
    }
}

export async function getCandidateById(id: string): Promise<Candidate | undefined> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        console.error("Auth error in getCandidateById:", authError);
        throw new Error(`Failed to fetch candidate: ${authError.message}`);
    }
     console.log(`[Action getCandidateById] Fetching candidate ${id} for tenant ${tenantId}`);
    try {
        return dbGetCandidateById(id, tenantId);
    } catch (dbError: any) {
         console.error(`[Action getCandidateById] Database error for candidate ${id}, tenant ${tenantId}:`, dbError);
         throw new Error(`Failed to fetch candidate details: ${dbError.message}`);
    }
}

export async function addCandidateAction(formData: Omit<CandidateFormData, 'tenantId'>): Promise<{ success: boolean; candidate?: Candidate; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, errors: [{ code: 'custom', path: [], message: authError.message }] };
     }

     const dataWithTenant = { ...formData, tenantId };
     const validation = candidateSchema.omit({ id: true, applicationDate: true }).safeParse(dataWithTenant);
     if (!validation.success) {
         console.error("Add Candidate Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newCandidate = await dbAddCandidate(validation.data);
        revalidatePath(`/${tenantId}/recruitment/${formData.jobPostingId}`);
        return { success: true, candidate: newCandidate };
    } catch (error: any) {
        console.error("Error adding candidate (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add candidate.' }] };
    }
}

export async function updateCandidateAction(id: string, formData: Partial<Omit<Candidate, 'id' | 'applicationDate' | 'jobPostingId' | 'tenantId'>>): Promise<{ success: boolean; candidate?: Candidate; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, errors: [{ code: 'custom', path: [], message: authError.message }] };
     }

    const validation = candidateSchema.omit({ id: true, applicationDate: true, jobPostingId: true, tenantId: true }).partial().safeParse(formData);
     if (!validation.success) {
        console.error("Update Candidate Validation Errors:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedCandidate = await dbUpdateCandidate(id, tenantId, validation.data);
        if (updatedCandidate) {
             revalidatePath(`/${tenantId}/recruitment/${updatedCandidate.jobPostingId}`);
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
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, errors: [{ code: 'custom', path: [], message: authError.message }] };
     }
    try {
        const updatedCandidate = await dbUpdateCandidate(id, tenantId, { status });
        if (updatedCandidate) {
             revalidatePath(`/${tenantId}/recruitment/${updatedCandidate.jobPostingId}`);
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
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, error: authError.message };
     }
    try {
        const candidate = await dbGetCandidateById(id, tenantId);
        if (!candidate) {
            return { success: false, error: 'Candidate not found.' };
        }
        const jobPostingId = candidate.jobPostingId;

        const deleted = await dbDeleteCandidate(id, tenantId);
        if (deleted) {
            revalidatePath(`/${tenantId}/recruitment/${jobPostingId}`);
            return { success: true, jobPostingId };
        } else {
             return { success: false, error: 'Candidate not found during deletion.' };
        }
    } catch (error: any) {
        console.error("Error deleting candidate (action):", error);
        return { success: false, error: error.message || 'Failed to delete candidate.' };
    }
}

    