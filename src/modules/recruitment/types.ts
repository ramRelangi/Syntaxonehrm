
import { z } from 'zod';

// ENUM types based on your new schema
export const jobOpeningStatusSchema = z.enum(['Draft', 'Open', 'Closed', 'Archived']);
export type JobOpeningStatus = z.infer<typeof jobOpeningStatusSchema>;

export const employmentTypeSchema = z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const experienceLevelSchema = z.enum(['Entry-Level', 'Mid-Level', 'Senior-Level', 'Lead', 'Principal', 'Manager', 'Director']);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const candidateApplicationStatusSchema = z.enum([
    'Applied',
    'Screening',
    'Interviewing',
    'Offer Extended',
    'Hired',
    'Rejected',
    'Withdrawn',
]);
export type CandidateApplicationStatus = z.infer<typeof candidateApplicationStatusSchema>;


// --- Job Opening (was JobPosting) ---
export const jobOpeningSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  job_title: z.string().min(3, "Job title must be at least 3 characters"), // Column name from new schema
  description: z.string().min(10, "Description must be at least 10 characters").optional().nullable(),
  department: z.string().optional().nullable(),
  location: z.string().min(2, "Location is required").optional().nullable(),
  salary_range: z.string().optional().nullable(),
  status: jobOpeningStatusSchema.default('Draft'),
  date_posted: z.string().datetime().optional().nullable(),
  closing_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Closing date must be YYYY-MM-DD").optional().nullable(),
  employment_type: employmentTypeSchema.optional().nullable(),
  experience_level: experienceLevelSchema.optional().nullable(),
  no_of_vacancies: z.coerce.number().int().min(1, "Number of vacancies must be at least 1").default(1),
  requirements: z.string().optional().nullable(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type JobOpening = z.infer<typeof jobOpeningSchema>;
// FormData typically omits server-set fields like id, tenantId, created_at, updated_at, date_posted
export type JobOpeningFormData = Omit<JobOpening, 'id' | 'tenantId' | 'created_at' | 'updated_at' | 'date_posted'>;


// --- Candidate ---
export const candidateSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  job_posting_id: z.string().uuid(), // This will link to job_openings.id
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  name: z.string().optional(), // Auto-generated: first_name + ' ' + last_name
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().nullable(),
  resume_url: z.string().url("Invalid resume URL").optional().nullable(),
  cover_letter: z.string().optional().nullable(),
  application_date: z.string().datetime().optional(), // Set by DB
  status: candidateApplicationStatusSchema.default('Applied'), // Default from new schema (was CandidateStatus)
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  current_company: z.string().optional().nullable(),
  current_designation: z.string().optional().nullable(),
  total_experience: z.coerce.number().min(0).optional().nullable(),
  notice_period: z.coerce.number().int().min(0).optional().nullable(),
  current_salary: z.string().optional().nullable(), // Kept as string for flexibility
  expected_salary: z.string().optional().nullable(), // Kept as string
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Candidate = z.infer<typeof candidateSchema>;
export type CandidateFormData = Omit<Candidate, 'id' | 'tenantId' | 'application_date' | 'created_at' | 'updated_at' | 'name'>;


// --- Job Application ---
export const jobApplicationSchema = z.object({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid(),
  candidate_id: z.string().uuid(),
  job_opening_id: z.string().uuid(),
  applied_date: z.string().datetime().optional(),
  current_stage: candidateApplicationStatusSchema.default('Applied'),
  // status: candidateApplicationStatusSchema.default('ACTIVE'), // From your schema, seems to overlap with current_stage
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type JobApplication = z.infer<typeof jobApplicationSchema>;
export type JobApplicationFormData = Omit<JobApplication, 'id' | 'tenantId' | 'applied_date' | 'created_at' | 'updated_at'>;

// Legacy types (can be removed once fully migrated)
export type { JobPostingStatus as LegacyJobPostingStatus } from './types'; // Assuming old status enum
export type { CandidateStatus as LegacyCandidateStatus } from './types';   // Assuming old status enum

