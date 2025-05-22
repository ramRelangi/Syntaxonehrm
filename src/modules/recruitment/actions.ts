
'use server';

import type {
    JobOpening,
    Candidate,
    JobOpeningFormData,
    CandidateFormData,
    CandidateApplicationStatus,
    JobApplication,
} from '@/modules/recruitment/types';
import { jobOpeningSchema, candidateSchema } from '@/modules/recruitment/types';
import {
    getAllJobOpenings as dbGetAllJobOpenings,
    getJobOpeningById as dbGetJobOpeningById,
    addJobOpening as dbAddJobOpening,
    updateJobOpening as dbUpdateJobOpening,
    deleteJobOpening as dbDeleteJobOpening,
    // getAllCandidates is less relevant now, use getApplicationsForJobOpening
    getCandidateById as dbGetCandidateById,
    addCandidateAndApplyForJob as dbAddCandidateAndApplyForJob,
    updateCandidate as dbUpdateCandidate,
    deleteCandidate as dbDeleteCandidate,
    getApplicationsForJobOpening as dbGetApplicationsForJobOpening,
    updateApplicationStatus as dbUpdateApplicationStatus,
} from '@/modules/recruitment/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getTenantIdFromSession, isAdminFromSession } from '@/modules/auth/actions';

async function checkRecruitmentPermission(): Promise<string> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId) throw new Error("Tenant context not found.");
    const isAdmin = await isAdminFromSession();
    if (!isAdmin) throw new Error("Unauthorized to manage recruitment.");
    return tenantId;
}

// --- Job Opening Server Actions ---

export async function getJobOpenings(filters?: { status?: JobOpening['status'] }): Promise<JobOpening[]> {
    const tenantId = await getTenantIdFromSession();
    if (!tenantId && filters?.status !== 'Open') { // Public open jobs might not need tenantId from session if handled by domain
        console.warn("[Action getJobOpenings] Tenant ID missing for non-public query. This might be an issue.");
        // Depending on public job board strategy, might allow fetching 'Open' without tenantId
        if (filters?.status !== 'Open') throw new Error("Tenant context required to fetch these job openings.");
    }
    console.log(`[Action getJobOpenings] Fetching for tenant ${tenantId || 'public'}, filters:`, filters);
    try {
        return dbGetAllJobOpenings(tenantId!, filters); // tenantId can be null for public open jobs
    } catch (dbError: any) {
        console.error(`[Action getJobOpenings] Database error for tenant ${tenantId}:`, dbError);
        throw new Error(`Failed to fetch job openings: ${dbError.message}`);
    }
}

export async function getJobOpeningById(id: string): Promise<JobOpening | undefined> {
    const tenantId = await getTenantIdFromSession(); // For internal access, tenantId is needed
    // For public job detail page, tenantId might not be in session, DB layer handles it
    if (!tenantId) {
        console.warn(`[Action getJobOpeningById] Tenant ID missing for fetching job opening ${id}. Assuming public access attempt.`);
    }
    console.log(`[Action getJobOpeningById] Fetching opening ${id} for tenant ${tenantId || 'public'}`);
    try {
        // If tenantId is null/undefined, dbGetJobOpeningById must handle fetching public record or fail
        return dbGetJobOpeningById(id, tenantId!);
    } catch (dbError: any) {
         console.error(`[Action getJobOpeningById] Database error for opening ${id}, tenant ${tenantId}:`, dbError);
         throw new Error(`Failed to fetch job opening details: ${dbError.message}`);
     }
}

export async function addJobOpeningAction(formData: Omit<JobOpeningFormData, 'tenantId'>): Promise<{ success: boolean; jobOpening?: JobOpening; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: authError.message }] };
    }

    const dataWithTenant = { ...formData, tenantId };
    // Validate against the schema that expects tenantId
    const validation = jobOpeningSchema.omit({ id: true, created_at: true, updated_at: true, date_posted: true }).safeParse(dataWithTenant);

    if (!validation.success) {
        console.error("Add Job Opening Validation Errors:", validation.error.flatten().fieldErrors);
        return { success: false, errors: validation.error.errors };
    }
    try {
        // Pass validated data which now includes tenantId correctly. dbAddJobOpening expects tenantId.
        const newJobOpening = await dbAddJobOpening(validation.data as JobOpeningFormData & { tenantId: string });
        revalidatePath(`/${tenantId}/recruitment`);
        revalidatePath('/jobs');
        return { success: true, jobOpening: newJobOpening };
    } catch (error: any) {
        console.error("Error adding job opening (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['job_title'], message: error.message || 'Failed to add job opening.' }] };
    }
}

export async function updateJobOpeningAction(id: string, formData: Partial<Omit<JobOpeningFormData, 'tenantId'>>): Promise<{ success: boolean; jobOpening?: JobOpening; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, errors: [{ code: 'custom', path: ['root'], message: authError.message }] };
     }

    const validation = jobOpeningSchema.omit({ id: true, created_at: true, updated_at: true, date_posted: true, tenantId: true }).partial().safeParse(formData);
    if (!validation.success) {
         console.error("Update Job Opening Validation Errors:", validation.error.flatten().fieldErrors);
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedJobOpening = await dbUpdateJobOpening(id, tenantId, validation.data);
        if (updatedJobOpening) {
            revalidatePath(`/${tenantId}/recruitment`);
            revalidatePath(`/${tenantId}/recruitment/${id}`);
            revalidatePath('/jobs');
            revalidatePath(`/jobs/${id}`);
            return { success: true, jobOpening: updatedJobOpening };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Job opening not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating job opening (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['job_title'], message: error.message || 'Failed to update job opening.' }] };
    }
}

export async function deleteJobOpeningAction(id: string): Promise<{ success: boolean; error?: string }> {
     let tenantId: string;
     try {
         tenantId = await checkRecruitmentPermission();
     } catch (authError: any) {
         return { success: false, error: authError.message };
     }

    try {
        const deleted = await dbDeleteJobOpening(id, tenantId);
        if (deleted) {
            revalidatePath(`/${tenantId}/recruitment`);
            revalidatePath('/jobs');
            return { success: true };
        } else {
             return { success: false, error: 'Job opening not found.' };
        }
    } catch (error: any) {
        console.error("Error deleting job opening (action):", error);
        return { success: false, error: error.message || 'Failed to delete job opening.' };
    }
}

// --- Candidate & Application Server Actions ---

// Get applications for a specific job opening (which includes candidate details)
export async function getApplicationsForJobOpeningAction(jobOpeningId: string, filters?: { status?: CandidateApplicationStatus }): Promise<JobApplication[]> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
         console.error("Auth error in getApplicationsForJobOpeningAction:", authError);
         throw new Error(`Failed to fetch applications: ${authError.message}`);
    }
    try {
        return dbGetApplicationsForJobOpening(jobOpeningId, tenantId, filters);
    } catch (dbError: any) {
         console.error(`[Action getApplicationsForJobOpeningAction] Database error for tenant ${tenantId}, job ${jobOpeningId}:`, dbError);
         throw new Error(`Failed to fetch job applications: ${dbError.message}`);
    }
}

// Add a candidate and create their application for a job
export async function addCandidateAndApplyForJobAction(
    candidateData: Omit<CandidateFormData, 'tenantId' | 'name' | 'job_posting_id'>, // job_posting_id is not on candidate form
    jobOpeningId: string
): Promise<{ success: boolean; application?: JobApplication; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission(); // Or a more granular permission for applying
    } catch (authError: any) {
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: authError.message }] };
    }

    // Validate candidateData portion
    const candidateValidationSchema = candidateSchema.omit({
        id: true, tenantId: true, name: true, job_posting_id: true, application_date: true, created_at: true, updated_at: true, status: true
    });
    const validation = candidateValidationSchema.safeParse(candidateData);

    if (!validation.success) {
        console.error("Add Candidate Validation Errors:", validation.error.flatten().fieldErrors);
        return { success: false, errors: validation.error.errors };
    }

    try {
        const newApplication = await dbAddCandidateAndApplyForJob(validation.data, jobOpeningId, tenantId);
        revalidatePath(`/${tenantId}/recruitment/${jobOpeningId}`);
        return { success: true, application: newApplication };
    } catch (error: any) {
        console.error("Error adding candidate and application (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to add candidate application.' }] };
    }
}

// Update candidate's master details (not specific application status)
export async function updateCandidateAction(candidateId: string, formData: Partial<Omit<CandidateFormData, 'job_posting_id' | 'name'>>): Promise<{ success: boolean; candidate?: Candidate; errors?: z.ZodIssue[] | { code: string; path: string[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: authError.message }] };
    }

    const validationSchema = candidateSchema.omit({
        id: true, tenantId: true, name: true, job_posting_id: true, application_date: true, created_at: true, updated_at: true, status: true
    }).partial();
    const validation = validationSchema.safeParse(formData);

    if (!validation.success) {
        console.error("Update Candidate Validation Errors:", validation.error.flatten().fieldErrors);
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedCandidate = await dbUpdateCandidate(candidateId, tenantId, validation.data);
        if (updatedCandidate) {
            // Revalidating all job openings this candidate might have applied to is complex.
            // For now, revalidate the main recruitment page or rely on specific application page revalidation.
            revalidatePath(`/${tenantId}/recruitment`);
            return { success: true, candidate: updatedCandidate };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Candidate not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating candidate (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: error.message || 'Failed to update candidate.' }] };
    }
}

// Update a specific job application's status
export async function updateApplicationStatusAction(applicationId: string, status: CandidateApplicationStatus, notes?: string): Promise<{ success: boolean; application?: JobApplication; errors?: { code: string; path: string[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: authError.message }] };
    }
    try {
        const updatedApplication = await dbUpdateApplicationStatus(applicationId, tenantId, status, notes);
        if (updatedApplication) {
            revalidatePath(`/${tenantId}/recruitment/${updatedApplication.job_id}`); // Revalidate the specific job opening page
            return { success: true, application: updatedApplication };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Application not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating application status (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['status'], message: error.message || 'Failed to update application status.' }] };
    }
}

export async function deleteCandidateAction(candidateId: string): Promise<{ success: boolean; error?: string }> {
    let tenantId: string;
    try {
        tenantId = await checkRecruitmentPermission();
    } catch (authError: any) {
        return { success: false, error: authError.message };
    }
    try {
        const candidate = await dbGetCandidateById(candidateId, tenantId);
        if (!candidate) {
            return { success: false, error: 'Candidate not found.' };
        }
        // Deleting a candidate will cascade delete their applications.
        const deleted = await dbDeleteCandidate(candidateId, tenantId);
        if (deleted) {
            // Need to revalidate all job openings pages where this candidate might have appeared.
            // A general revalidation of the recruitment section is safer here.
            revalidatePath(`/${tenantId}/recruitment`, 'layout');
            return { success: true };
        } else {
            return { success: false, error: 'Candidate not found during deletion.' };
        }
    } catch (error: any) {
        console.error("Error deleting candidate (action):", error);
        return { success: false, error: error.message || 'Failed to delete candidate.' };
    }
}
