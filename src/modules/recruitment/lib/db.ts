import pool from '@/lib/db';
import type { JobPosting, Candidate, JobPostingStatus, CandidateStatus, JobPostingFormData, CandidateFormData } from '@/modules/recruitment/types';
import { formatISO } from 'date-fns';

// --- Job Posting Operations ---

function mapRowToJobPosting(row: any): JobPosting {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        department: row.department,
        location: row.location,
        salaryRange: row.salary_range ?? undefined,
        status: row.status as JobPostingStatus,
        datePosted: row.date_posted ? new Date(row.date_posted).toISOString() : undefined,
        closingDate: row.closing_date ? new Date(row.closing_date).toISOString() : undefined,
    };
}

export async function getAllJobPostings(filters?: { status?: JobPostingStatus }): Promise<JobPosting[]> {
    const client = await pool.connect();
    let query = 'SELECT * FROM job_postings';
    const conditions: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (filters?.status) {
        conditions.push(`status = $${valueIndex++}`);
        values.push(filters.status);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY date_posted DESC, created_at DESC'; // Order by post date, then creation

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToJobPosting);
    } catch (err) {
        console.error('Error fetching all job postings:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getJobPostingById(id: string): Promise<JobPosting | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM job_postings WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToJobPosting(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching job posting ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addJobPosting(jobData: JobPostingFormData): Promise<JobPosting> {
    const client = await pool.connect();
    const isDraft = (jobData.status || 'Draft') === 'Draft';
    const datePosted = isDraft ? null : new Date(); // Set post date only if not draft

    const query = `
        INSERT INTO job_postings (title, description, department, location, salary_range, status, date_posted, closing_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;
    const values = [
        jobData.title,
        jobData.description,
        jobData.department,
        jobData.location,
        jobData.salaryRange || null,
        jobData.status || 'Draft',
        datePosted,
        jobData.closingDate ? new Date(jobData.closingDate) : null, // Convert string date to Date object or null
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToJobPosting(res.rows[0]);
    } catch (err) {
        console.error('Error adding job posting:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateJobPosting(id: string, updates: Partial<JobPostingFormData>): Promise<JobPosting | undefined> {
    const client = await pool.connect();
    const currentPosting = await getJobPostingById(id); // Get current state for logic
    if (!currentPosting) return undefined;

    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof JobPostingFormData]?: string } = {
        title: 'title',
        description: 'description',
        department: 'department',
        location: 'location',
        salaryRange: 'salary_range',
        status: 'status',
        closingDate: 'closing_date'
    };

     // Handle potential status change logic for date_posted
    let datePostedUpdate = false;
    if (updates.status && updates.status !== 'Draft' && currentPosting.status === 'Draft') {
        setClauses.push(`date_posted = $${valueIndex++}`);
        values.push(new Date());
        datePostedUpdate = true;
    }


    for (const key in updates) {
         if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof JobPostingFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                 let value = updates[key as keyof JobPostingFormData];
                 if (key === 'closingDate') {
                     value = value ? new Date(value as string) : null; // Convert date string
                 } else if (key === 'salaryRange') {
                     value = value || null; // Ensure null for empty string
                 }
                values.push(value);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return currentPosting;

    values.push(id);
    const query = `
        UPDATE job_postings
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToJobPosting(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error updating job posting ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteJobPosting(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        // Check for associated candidates
        const checkCandidatesQuery = 'SELECT 1 FROM candidates WHERE job_posting_id = $1 LIMIT 1';
        const candidateRes = await client.query(checkCandidatesQuery, [id]);
        if (candidateRes.rowCount > 0) {
            throw new Error('Cannot delete job posting with associated candidates.');
        }

        const deleteQuery = 'DELETE FROM job_postings WHERE id = $1';
        const res = await client.query(deleteQuery, [id]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting job posting ${id}:`, err);
        throw err; // Re-throw custom or DB errors
    } finally {
        client.release();
    }
}


// --- Candidate Operations ---

function mapRowToCandidate(row: any): Candidate {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined,
        jobPostingId: row.job_posting_id,
        applicationDate: new Date(row.application_date).toISOString(),
        status: row.status as CandidateStatus,
        resumeUrl: row.resume_url ?? undefined,
        coverLetter: row.cover_letter ?? undefined,
        notes: row.notes ?? undefined,
    };
}

export async function getAllCandidates(filters?: { jobPostingId?: string, status?: CandidateStatus }): Promise<Candidate[]> {
    const client = await pool.connect();
    let query = 'SELECT * FROM candidates';
    const conditions: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    if (filters?.jobPostingId) {
        conditions.push(`job_posting_id = $${valueIndex++}`);
        values.push(filters.jobPostingId);
    }
    if (filters?.status) {
        conditions.push(`status = $${valueIndex++}`);
        values.push(filters.status);
    }

    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY application_date DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToCandidate);
    } catch (err) {
        console.error('Error fetching candidates:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getCandidateById(id: string): Promise<Candidate | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM candidates WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching candidate ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addCandidate(candidateData: CandidateFormData): Promise<Candidate> {
    const client = await pool.connect();
    const query = `
        INSERT INTO candidates (name, email, phone, job_posting_id, application_date, status, resume_url, cover_letter, notes)
        VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8)
        RETURNING *;
    `;
    const values = [
        candidateData.name,
        candidateData.email,
        candidateData.phone || null,
        candidateData.jobPostingId,
        candidateData.status || 'Applied',
        candidateData.resumeUrl || null,
        candidateData.coverLetter || null,
        candidateData.notes || null,
    ];
    try {
        // TODO: Verify jobPostingId exists?
        const res = await client.query(query, values);
        return mapRowToCandidate(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding candidate:', err);
         if (err.code === '23505') { // Check for unique constraint errors
             if (err.constraint === 'candidates_email_job_posting_id_key') { // Example constraint name
                  throw new Error('This email address has already applied for this job.');
             }
         }
        throw err;
    } finally {
        client.release();
    }
}

export async function updateCandidate(id: string, updates: Partial<Omit<Candidate, 'id' | 'applicationDate' | 'jobPostingId'>>): Promise<Candidate | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    // Map form keys to DB columns
    const columnMap: { [K in keyof typeof updates]?: string } = {
        name: 'name',
        email: 'email',
        phone: 'phone',
        status: 'status',
        resumeUrl: 'resume_url',
        coverLetter: 'cover_letter',
        notes: 'notes',
    };

    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof typeof updates];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                values.push(updates[key as keyof typeof updates] ?? null); // Use null for undefined/empty optional fields
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return getCandidateById(id);

    values.push(id);
    const query = `
        UPDATE candidates
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating candidate ${id}:`, err);
        if (err.code === '23505') {
             if (err.constraint === 'candidates_email_job_posting_id_key') {
                  throw new Error('This email address has already applied for this job.');
             }
         }
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteCandidate(id: string): Promise<boolean> {
    const client = await pool.connect();
    const query = 'DELETE FROM candidates WHERE id = $1';
    try {
        const res = await client.query(query, [id]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting candidate ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// --- Database Schema (for reference) ---
/*
-- Requires employees table (if linking approvers etc.)

CREATE TYPE job_posting_status AS ENUM ('Open', 'Closed', 'Draft', 'Archived');

CREATE TABLE job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    salary_range VARCHAR(100),
    status job_posting_status NOT NULL DEFAULT 'Draft',
    date_posted TIMESTAMP WITH TIME ZONE, -- Set when status becomes 'Open'
    closing_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TYPE candidate_status AS ENUM (
    'Applied',
    'Screening',
    'Interviewing',
    'Offer Extended',
    'Hired',
    'Rejected',
    'Withdrawn'
);

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE, -- Cascade delete candidate if job posting is deleted
    application_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status candidate_status NOT NULL DEFAULT 'Applied',
    resume_url TEXT, -- URL to stored resume file
    cover_letter TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Optional: Prevent duplicate applications for the same job
    UNIQUE (email, job_posting_id)
);

-- Indexes
CREATE INDEX idx_job_postings_status ON job_postings(status);
CREATE INDEX idx_candidates_job_posting_id ON candidates(job_posting_id);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_email ON candidates(email);


-- Triggers for updated_at (if not already created)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_job_postings_updated_at
BEFORE UPDATE ON job_postings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at
BEFORE UPDATE ON candidates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

*/
