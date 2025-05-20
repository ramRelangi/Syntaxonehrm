
import pool from '@/lib/db';
import type { JobPosting, Candidate, JobPostingStatus, CandidateStatus, JobPostingFormData, CandidateFormData } from '@/modules/recruitment/types';
import { formatISO, isValid, parseISO } from 'date-fns'; // Import date-fns functions


// --- Job Posting Operations ---

function mapRowToJobPosting(row: any): JobPosting {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        title: row.title,
        description: row.description,
        department: row.department,
        location: row.location,
        salaryRange: row.salary_range ?? undefined,
        status: row.status as JobPostingStatus,
        datePosted: row.date_posted ? new Date(row.date_posted).toISOString() : undefined,
        closingDate: row.closing_date ? formatISO(new Date(row.closing_date), { representation: 'date' }) : undefined,
        employmentType: row.employment_type ?? undefined,
        experienceLevel: row.experience_level ?? undefined,
    };
}

// Get job postings for a specific tenant
export async function getAllJobPostings(tenantId: string, filters?: { status?: JobPostingStatus }): Promise<JobPosting[]> {
    const client = await pool.connect();
    let query = 'SELECT * FROM job_postings';
    const conditions: string[] = ['tenant_id = $1']; // Always filter by tenant
    const values: any[] = [tenantId];
    let valueIndex = 2; // Start indexing from 2

    if (filters?.status) {
        conditions.push(`status = $${valueIndex++}`);
        values.push(filters.status);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY date_posted DESC, created_at DESC'; // Order by post date, then creation

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToJobPosting);
    } catch (err) {
        console.error(`Error fetching all job postings for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get job posting by ID (ensure it belongs to the tenant)
export async function getJobPostingById(id: string, tenantId: string): Promise<JobPosting | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM job_postings WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToJobPosting(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching job posting ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Add job posting for a specific tenant
export async function addJobPosting(jobData: JobPostingFormData): Promise<JobPosting> {
    if (!jobData.tenantId) {
        throw new Error("Tenant ID is required to add a job posting.");
    }
    const isDraft = (jobData.status || 'Draft') === 'Draft';
    const datePosted = isDraft ? null : new Date();

    let closingDateValue: string | null = null;
    if (jobData.closingDate) {
        try {
            const parsed = parseISO(jobData.closingDate);
            if (isValid(parsed)) {
                closingDateValue = formatISO(parsed, { representation: 'date' });
            }
        } catch (e) {
            console.warn(`Invalid closing date format received: ${jobData.closingDate}. Storing as NULL.`);
        }
    }

    const query = `
        INSERT INTO job_postings (tenant_id, title, description, department, location, salary_range, status, date_posted, closing_date, employment_type, experience_level, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *;
    `;
    const values = [
        jobData.tenantId,
        jobData.title,
        jobData.description,
        jobData.department,
        jobData.location,
        jobData.salaryRange || null,
        jobData.status || 'Draft',
        datePosted,
        closingDateValue,
        jobData.employmentType || 'Full-time',
        jobData.experienceLevel || 'Mid-Level',
    ];

    let client;
    try {
        client = await pool.connect();
        const res = await client.query(query, values);
        if (res.rows.length === 0) {
            throw new Error("Database did not return the created job posting.");
        }
        return mapRowToJobPosting(res.rows[0]);
    } catch (err) {
        console.error('[DB addJobPosting] Error adding job posting:', err);
        throw err;
    } finally {
        if (client) client.release();
    }
}


// Update job posting (ensure it belongs to the tenant)
export async function updateJobPosting(id: string, tenantId: string, updates: Partial<JobPostingFormData>): Promise<JobPosting | undefined> {
    const client = await pool.connect();
    const currentPosting = await getJobPostingById(id, tenantId);
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
        closingDate: 'closing_date',
        employmentType: 'employment_type',
        experienceLevel: 'experience_level',
    };

    if (updates.status && updates.status !== 'Draft' && currentPosting.status === 'Draft') {
        setClauses.push(`date_posted = $${valueIndex++}`);
        values.push(new Date());
    }

    for (const key in updates) {
        if (key === 'tenantId') continue;
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof JobPostingFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                let value = updates[key as keyof JobPostingFormData];
                if (key === 'closingDate') {
                    let closingDateStr: string | null = null;
                    if (value) {
                        try {
                            const parsed = parseISO(value as string);
                            if (isValid(parsed)) {
                                closingDateStr = formatISO(parsed, { representation: 'date' });
                            }
                        } catch {}
                    }
                    value = closingDateStr;
                } else if (key === 'salaryRange') {
                    value = value || null;
                }
                values.push(value);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return currentPosting;
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    values.push(tenantId);

    const query = `
        UPDATE job_postings
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToJobPosting(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error updating job posting ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete job posting (ensure it belongs to the tenant and has no candidates)
export async function deleteJobPosting(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        const checkCandidatesQuery = 'SELECT 1 FROM candidates WHERE job_posting_id = $1 AND tenant_id = $2 LIMIT 1';
        const candidateRes = await client.query(checkCandidatesQuery, [id, tenantId]);
        if (candidateRes.rowCount > 0) {
            throw new Error('Cannot delete job posting with associated candidates.');
        }
        const deleteQuery = 'DELETE FROM job_postings WHERE id = $1 AND tenant_id = $2';
        const res = await client.query(deleteQuery, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting job posting ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// --- Candidate Operations ---

function mapRowToCandidate(row: any): Candidate {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        email: row.email,
        phone: row.phone ?? undefined,
        jobPostingId: row.job_posting_id,
        applicationDate: new Date(row.application_date).toISOString(),
        status: row.status as CandidateStatus,
        resumeUrl: row.resume_url ?? undefined,
        coverLetter: row.cover_letter ?? undefined,
        notes: row.notes ?? undefined,
        source: row.source ?? undefined,
        expectedSalary: row.expected_salary ?? undefined,
    };
}

// Get candidates for a specific tenant, optionally filtered
export async function getAllCandidates(tenantId: string, filters?: { jobPostingId?: string, status?: CandidateStatus }): Promise<Candidate[]> {
    const client = await pool.connect();
    let query = 'SELECT * FROM candidates';
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let valueIndex = 2;

    if (filters?.jobPostingId) {
        conditions.push(`job_posting_id = $${valueIndex++}`);
        values.push(filters.jobPostingId);
    }
    if (filters?.status) {
        conditions.push(`status = $${valueIndex++}`);
        values.push(filters.status);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY application_date DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToCandidate);
    } catch (err) {
        console.error(`Error fetching candidates for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get candidate by ID (ensure it belongs to the tenant)
export async function getCandidateById(id: string, tenantId: string): Promise<Candidate | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM candidates WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching candidate ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Add candidate for a specific tenant and job posting
export async function addCandidate(candidateData: CandidateFormData): Promise<Candidate> {
    const client = await pool.connect();
    if (!candidateData.tenantId || !candidateData.jobPostingId) {
        throw new Error("Tenant ID and Job Posting ID are required to add a candidate.");
    }
    const query = `
        INSERT INTO candidates (tenant_id, name, email, phone, job_posting_id, application_date, status, resume_url, cover_letter, notes, source, expected_salary, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, NOW(), NOW())
        RETURNING *;
    `;
    const values = [
        candidateData.tenantId,
        candidateData.name,
        candidateData.email,
        candidateData.phone || null,
        candidateData.jobPostingId,
        candidateData.status || 'Applied',
        candidateData.resumeUrl || null,
        candidateData.coverLetter || null,
        candidateData.notes || null,
        candidateData.source || null,
        candidateData.expectedSalary || null,
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToCandidate(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding candidate:', err);
         if (err.code === '23505') {
             if (err.constraint === 'candidates_tenant_id_email_job_posting_id_key') {
                  throw new Error('This email address has already applied for this job.');
             }
         }
        throw err;
    } finally {
        client.release();
    }
}

// Update candidate (ensure it belongs to the tenant)
export async function updateCandidate(id: string, tenantId: string, updates: Partial<Omit<Candidate, 'id' | 'applicationDate' | 'jobPostingId' | 'tenantId'>>): Promise<Candidate | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof typeof updates]?: string } = {
        name: 'name',
        email: 'email',
        phone: 'phone',
        status: 'status',
        resumeUrl: 'resume_url',
        coverLetter: 'cover_letter',
        notes: 'notes',
        source: 'source',
        expectedSalary: 'expected_salary',
    };

    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof typeof updates];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                values.push(updates[key as keyof typeof updates] ?? null);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return getCandidateById(id, tenantId);
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    values.push(tenantId);

    const query = `
        UPDATE candidates
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating candidate ${id} for tenant ${tenantId}:`, err);
        if (err.code === '23505') {
             if (err.constraint === 'candidates_tenant_id_email_job_posting_id_key') {
                  throw new Error('This email address has already applied for this job.');
             }
         }
        throw err;
    } finally {
        client.release();
    }
}

// Delete candidate (ensure it belongs to the tenant)
export async function deleteCandidate(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    const query = 'DELETE FROM candidates WHERE id = $1 AND tenant_id = $2';
    try {
        const res = await client.query(query, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting candidate ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}
