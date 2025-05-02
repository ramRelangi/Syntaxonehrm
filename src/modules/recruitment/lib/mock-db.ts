
import type { JobPosting, Candidate, JobPostingStatus, CandidateStatus } from '@/modules/recruitment/types';
import { formatISO } from 'date-fns';

// --- Mock Job Postings ---
let jobPostings: JobPosting[] = [
  {
    id: 'job-001',
    title: 'Senior Frontend Engineer',
    description: 'Looking for an experienced Frontend Engineer to join our dynamic team. Proficient in React, Next.js, and Tailwind CSS.',
    department: 'Technology',
    location: 'Remote',
    salaryRange: '$120,000 - $160,000',
    status: 'Open',
    datePosted: formatISO(new Date(2024, 6, 1)), // July 1, 2024
    closingDate: formatISO(new Date(2024, 7, 31)), // Aug 31, 2024
  },
  {
    id: 'job-002',
    title: 'HR Manager',
    description: 'Seeking an experienced HR Manager to oversee all aspects of human resources practices and processes.',
    department: 'Human Resources',
    location: 'New York Office',
    status: 'Open',
    datePosted: formatISO(new Date(2024, 5, 15)), // June 15, 2024
  },
  {
    id: 'job-003',
    title: 'Marketing Intern',
    description: 'Exciting internship opportunity for a student passionate about digital marketing and social media.',
    department: 'Marketing',
    location: 'Remote',
    status: 'Closed', // Example of a closed position
    datePosted: formatISO(new Date(2024, 4, 1)), // May 1, 2024
    closingDate: formatISO(new Date(2024, 4, 31)), // May 31, 2024
  },
   {
    id: 'job-004',
    title: 'Backend Developer (Node.js)',
    description: 'Develop and maintain server-side logic using Node.js.',
    department: 'Technology',
    location: 'Remote',
    salaryRange: '$100,000 - $140,000',
    status: 'Draft', // Example of a draft position
    datePosted: formatISO(new Date()),
  },
];

// --- Mock Candidates ---
let candidates: Candidate[] = [
    {
        id: 'cand-001',
        name: 'John Doe',
        email: 'john.doe@email.com',
        phone: '111-222-3333',
        jobPostingId: 'job-001',
        applicationDate: formatISO(new Date(2024, 6, 5)),
        status: 'Interviewing',
        resumeUrl: '/mock-resume-johndoe.pdf', // Placeholder URL
        notes: 'Strong technical skills, good fit for team culture.',
    },
    {
        id: 'cand-002',
        name: 'Jane Smith',
        email: 'jane.smith@email.com',
        jobPostingId: 'job-001',
        applicationDate: formatISO(new Date(2024, 6, 8)),
        status: 'Screening',
        resumeUrl: '/mock-resume-janesmith.pdf',
    },
    {
        id: 'cand-003',
        name: 'Peter Jones',
        email: 'peter.jones@email.com',
        jobPostingId: 'job-002',
        applicationDate: formatISO(new Date(2024, 6, 10)),
        status: 'Applied',
    },
];

// --- Job Posting DB Operations ---

export function getAllJobPostings(filters?: { status?: JobPostingStatus }): JobPosting[] {
  let filteredPostings = [...jobPostings];
   if (filters?.status) {
     filteredPostings = filteredPostings.filter(job => job.status === filters.status);
   }
   // Sort by datePosted descending by default
   filteredPostings.sort((a, b) => {
     const dateA = a.datePosted ? new Date(a.datePosted).getTime() : 0;
     const dateB = b.datePosted ? new Date(b.datePosted).getTime() : 0;
     return dateB - dateA;
   });
  return JSON.parse(JSON.stringify(filteredPostings));
}

export function getJobPostingById(id: string): JobPosting | undefined {
  const posting = jobPostings.find((job) => job.id === id);
  return posting ? JSON.parse(JSON.stringify(posting)) : undefined;
}

export function addJobPosting(jobData: Omit<JobPosting, 'id' | 'datePosted'>): JobPosting {
  const newId = `job-${String(jobPostings.length + 1).padStart(3, '0')}`;
  const currentDate = formatISO(new Date());
  const newJobPosting: JobPosting = {
    ...jobData,
    id: newId,
    status: jobData.status || 'Draft', // Ensure status defaults to Draft if not provided
    datePosted: (jobData.status && jobData.status !== 'Draft') ? currentDate : undefined, // Set datePosted only if status is not Draft
    closingDate: jobData.closingDate || undefined, // Ensure optional fields are handled
    salaryRange: jobData.salaryRange || undefined,
  };
  jobPostings.push(newJobPosting);
  return JSON.parse(JSON.stringify(newJobPosting));
}

export function updateJobPosting(id: string, updates: Partial<Omit<JobPosting, 'id' | 'datePosted'>>): JobPosting | undefined {
  const index = jobPostings.findIndex((job) => job.id === id);
  if (index !== -1) {
    const currentPosting = jobPostings[index];
    const wasDraft = currentPosting.status === 'Draft';

    // Update the posting
    jobPostings[index] = { ...currentPosting, ...updates };

     // If status changes from Draft to something else, set the datePosted
     if (wasDraft && updates.status && updates.status !== 'Draft') {
        jobPostings[index].datePosted = formatISO(new Date());
     }
     // If status changes TO Draft, clear the datePosted? (Optional rule)
     // if (!wasDraft && updates.status === 'Draft') {
     //    jobPostings[index].datePosted = undefined;
     // }

    return JSON.parse(JSON.stringify(jobPostings[index]));
  }
  return undefined;
}

export function deleteJobPosting(id: string): boolean {
  const initialLength = jobPostings.length;
  // Optional: Check if candidates are linked before deleting
  const hasCandidates = candidates.some(c => c.jobPostingId === id);
  if (hasCandidates) {
      console.warn(`Attempted to delete job posting ${id} which has associated candidates.`);
      // Optionally throw an error or return false based on desired behavior
      return false; // Prevent deletion if candidates are linked
  }

  jobPostings = jobPostings.filter((job) => job.id !== id);
  return jobPostings.length < initialLength;
}


// --- Candidate DB Operations ---

export function getAllCandidates(filters?: { jobPostingId?: string, status?: CandidateStatus }): Candidate[] {
   let filteredCandidates = [...candidates];
   if (filters?.jobPostingId) {
     filteredCandidates = filteredCandidates.filter(c => c.jobPostingId === filters.jobPostingId);
   }
   if (filters?.status) {
     filteredCandidates = filteredCandidates.filter(c => c.status === filters.status);
   }
   // Sort by application date descending
   filteredCandidates.sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime());
   return JSON.parse(JSON.stringify(filteredCandidates));
}

export function getCandidateById(id: string): Candidate | undefined {
  const candidate = candidates.find((c) => c.id === id);
  return candidate ? JSON.parse(JSON.stringify(candidate)) : undefined;
}

export function addCandidate(candidateData: Omit<Candidate, 'id' | 'applicationDate'>): Candidate {
  const newId = `cand-${String(candidates.length + 1).padStart(3, '0')}`;
  const newCandidate: Candidate = {
    ...candidateData,
    id: newId,
    applicationDate: formatISO(new Date()),
    status: candidateData.status || 'Applied',
  };
  candidates.push(newCandidate);
  return JSON.parse(JSON.stringify(newCandidate));
}

export function updateCandidate(id: string, updates: Partial<Omit<Candidate, 'id' | 'applicationDate' | 'jobPostingId'>>): Candidate | undefined {
  const index = candidates.findIndex((c) => c.id === id);
  if (index !== -1) {
    candidates[index] = { ...candidates[index], ...updates };
    return JSON.parse(JSON.stringify(candidates[index]));
  }
  return undefined;
}

// Often, candidates are not "deleted" but maybe marked as "Withdrawn" or archived.
// A true delete might be needed for GDPR compliance, etc.
export function deleteCandidate(id: string): boolean {
  const initialLength = candidates.length;
  candidates = candidates.filter((c) => c.id !== id);
  return candidates.length < initialLength;
}
