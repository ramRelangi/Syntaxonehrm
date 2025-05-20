
import { z } from 'zod';

// --- Job Posting ---
export const jobPostingStatusSchema = z.enum(['Open', 'Closed', 'Draft', 'Archived']);
export type JobPostingStatus = z.infer<typeof jobPostingStatusSchema>;

export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const experienceLevelSchema = z.enum(['Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director']);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;


export const jobPostingSchema = z.object({
  id: z.string().optional(), // Optional for creation, present for existing
  tenantId: z.string().uuid(),
  title: z.string().min(3, "Job title must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  department: z.string().min(1, "Department is required"),
  location: z.string().min(2, "Location is required"),
  salaryRange: z.string().optional(),
  status: jobPostingStatusSchema.default('Draft'),
  datePosted: z.string().datetime().optional(), // ISO string, set on creation/update status
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Closing date must be in YYYY-MM-DD format").optional().nullable(), // Allow null for empty date
  employmentType: employmentTypeSchema.optional().default('Full-time'),
  experienceLevel: experienceLevelSchema.optional().default('Mid-Level'),
});

export type JobPosting = z.infer<typeof jobPostingSchema>;
export type JobPostingFormData = Omit<JobPosting, 'id' | 'datePosted'> & { tenantId?: string; closingDate?: string | null }; // Allow optional tenantId and nullable closingDate


// --- Candidate ---
export const candidateStatusSchema = z.enum([
    'Applied',
    'Screening',
    'Interviewing',
    'Offer Extended',
    'Hired',
    'Rejected',
    'Withdrawn',
]);
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;

export const candidateSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().uuid(),
  name: z.string().min(2, "Candidate name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  jobPostingId: z.string().min(1, "Associated job posting is required"),
  applicationDate: z.string().datetime(), // ISO string
  status: candidateStatusSchema.default('Applied'),
  resumeUrl: z.string().url("Invalid resume URL").optional().or(z.literal('')).nullable(),
  coverLetter: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  expectedSalary: z.string().optional().nullable(),
});

export type Candidate = z.infer<typeof candidateSchema>;
export type CandidateFormData = Omit<Candidate, 'id' | 'applicationDate'> & { tenantId?: string };
