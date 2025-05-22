
import pool from '@/lib/db';
import type {
    JobOpening,
    Candidate,
    JobApplication,
    JobOpeningStatus,
    CandidateApplicationStatus,
    JobOpeningFormData,
    CandidateFormData,
    EmploymentType,
    ExperienceLevel
} from '@/modules/recruitment/types';
import { formatISO, isValid, parseISO } from 'date-fns';

// --- Job Opening Operations ---

function mapRowToJobOpening(row: any): JobOpening {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        job_title: row.job_title,
        description: row.description,
        department: row.department,
        location: row.location,
        salary_range: row.salary_range ?? undefined,
        status: row.status as JobOpeningStatus,
        date_posted: row.date_posted ? new Date(row.date_posted).toISOString() : undefined,
        closing_date: row.closing_date ? formatISO(new Date(row.closing_date), { representation: 'date' }) : undefined,
        employment_type: row.employment_type as EmploymentType ?? undefined,
        experience_level: row.experience_level as ExperienceLevel ?? undefined,
        no_of_vacancies: row.no_of_vacancies,
        requirements: row.requirements ?? undefined,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    };
}

export async function getAllJobOpenings(tenantId: string, filters?: { status?: JobOpeningStatus }): Promise<JobOpening[]> {
    const client = await pool.connect();
    let query = 'SELECT * FROM job_openings';
    const conditions: string[] = ['tenant_id = $1'];
    const values: any[] = [tenantId];
    let valueIndex = 2;

    if (filters?.status) {
        conditions.push(`status = $${valueIndex++}`);
        values.push(filters.status);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY date_posted DESC, created_at DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToJobOpening);
    } catch (err) {
        console.error(`Error fetching all job openings for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getJobOpeningById(id: string, tenantId: string): Promise<JobOpening | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM job_openings WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToJobOpening(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching job opening ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addJobOpening(jobData: JobOpeningFormData & { tenantId: string }): Promise<JobOpening> {
    const isDraft = (jobData.status || 'Draft') === 'Draft';
    const datePosted = isDraft ? null : new Date();

    let closingDateValue: string | null = null;
    if (jobData.closing_date) {
        try {
            const parsed = parseISO(jobData.closing_date);
            if (isValid(parsed)) {
                closingDateValue = formatISO(parsed, { representation: 'date' });
            }
        } catch (e) {
            console.warn(`Invalid closing date format received: ${jobData.closing_date}. Storing as NULL.`);
        }
    }

    const query = `
        INSERT INTO job_openings (
            tenant_id, job_title, description, department, location, salary_range, status, date_posted, 
            closing_date, employment_type, experience_level, no_of_vacancies, requirements, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
        RETURNING *;
    `;
    const values = [
        jobData.tenantId,
        jobData.job_title,
        jobData.description || null,
        jobData.department || null,
        jobData.location || null,
        jobData.salary_range || null,
        jobData.status || 'Draft',
        datePosted,
        closingDateValue,
        jobData.employment_type || 'Full-time',
        jobData.experience_level || 'Mid-Level',
        jobData.no_of_vacancies || 1,
        jobData.requirements || null,
    ];

    let client;
    try {
        client = await pool.connect();
        const res = await client.query(query, values);
        if (res.rows.length === 0) {
            throw new Error("Database did not return the created job opening.");
        }
        return mapRowToJobOpening(res.rows[0]);
    } catch (err) {
        console.error('[DB addJobOpening] Error adding job opening:', err);
        throw err;
    } finally {
        if (client) client.release();
    }
}

export async function updateJobOpening(id: string, tenantId: string, updates: Partial<JobOpeningFormData>): Promise<JobOpening | undefined> {
    const client = await pool.connect();
    const currentOpening = await getJobOpeningById(id, tenantId); // Use the renamed function
    if (!currentOpening) return undefined;

    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof JobOpeningFormData]?: string } = {
        job_title: 'job_title',
        description: 'description',
        department: 'department',
        location: 'location',
        salary_range: 'salary_range',
        status: 'status',
        closing_date: 'closing_date',
        employment_type: 'employment_type',
        experience_level: 'experience_level',
        no_of_vacancies: 'no_of_vacancies',
        requirements: 'requirements',
    };

    if (updates.status && updates.status !== 'Draft' && currentOpening.status === 'Draft') {
        setClauses.push(`date_posted = $${valueIndex++}`);
        values.push(new Date());
    }

    for (const key in updates) {
        if (key === 'tenantId') continue; // Should not be updated
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const dbKey = columnMap[key as keyof JobOpeningFormData];
            if (dbKey) {
                setClauses.push(`${dbKey} = $${valueIndex}`);
                let value = updates[key as keyof JobOpeningFormData];
                if (key === 'closing_date') {
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
                } else if (key === 'salary_range' || key === 'department' || key === 'location' || key === 'description' || key === 'requirements') {
                    value = value || null;
                }
                values.push(value);
                valueIndex++;
            }
        }
    }

    if (setClauses.length === 0) return currentOpening;
    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    values.push(tenantId);

    const query = `
        UPDATE job_openings
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;

    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToJobOpening(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error updating job opening ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteJobOpening(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
        const checkApplicationsQuery = 'SELECT 1 FROM job_applications WHERE job_id = $1 AND tenant_id = $2 LIMIT 1';
        const appRes = await client.query(checkApplicationsQuery, [id, tenantId]);
        if (appRes.rowCount > 0) {
            throw new Error('Cannot delete job opening with associated applications. Please remove applications first.');
        }
        const deleteQuery = 'DELETE FROM job_openings WHERE id = $1 AND tenant_id = $2';
        const res = await client.query(deleteQuery, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting job opening ${id} for tenant ${tenantId}:`, err);
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
        first_name: row.first_name,
        last_name: row.last_name,
        name: `${row.first_name} ${row.last_name}`, // Construct full name
        email: row.email,
        phone: row.phone ?? undefined,
        resume_url: row.resume_url ?? undefined,
        source: row.source ?? undefined,
        current_company: row.current_company ?? undefined,
        current_designation: row.current_designation ?? undefined,
        total_experience: row.total_experience ? parseFloat(row.total_experience) : undefined,
        notice_period: row.notice_period ? parseInt(row.notice_period, 10) : undefined,
        current_salary: row.current_salary ?? undefined,
        expected_salary: row.expected_salary ?? undefined,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        // Fields from job_applications are not directly on candidate row unless joined
        job_posting_id: row.job_posting_id || row.job_id, // from join with job_applications
        application_date: row.application_date ? new Date(row.application_date).toISOString() : (row.app_applied_date ? new Date(row.app_applied_date).toISOString() : undefined),
        status: row.status || row.current_stage, // from join with job_applications
    };
}

// Get candidate by ID (ensure it belongs to the tenant)
export async function getCandidateById(id: string, tenantId: string): Promise<Candidate | undefined> {
    const client = await pool.connect();
    try {
        // This function fetches the candidate MASTER record, not a specific application status
        const res = await client.query('SELECT * FROM candidates WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching candidate ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to find an existing candidate by email for a tenant
export async function findCandidateByEmail(email: string, tenantId: string, client?: any): Promise<Candidate | undefined> {
    const conn = client || await pool.connect();
    try {
        const res = await conn.query('SELECT * FROM candidates WHERE email = $1 AND tenant_id = $2 LIMIT 1', [email, tenantId]);
        return res.rows.length > 0 ? mapRowToCandidate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error finding candidate by email ${email} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        if (!client) conn.release();
    }
}


// Add candidate and their application to a specific job opening
// Returns the JobApplication object (which would include candidate details if joined)
export async function addCandidateAndApplyForJob(
    candidateData: Omit<CandidateFormData, 'name' | 'job_posting_id'>,
    jobOpeningId: string,
    tenantId: string
): Promise<JobApplication> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let candidate = await findCandidateByEmail(candidateData.email, tenantId, client);
        let candidateId: string;

        if (candidate) {
            candidateId = candidate.id!;
            // Optionally update existing candidate details here if needed
            const updateClauses: string[] = [];
            const updateValues: any[] = [];
            let valIdx = 1;
            if (candidateData.first_name && candidateData.first_name !== candidate.first_name) { updateClauses.push(`first_name = $${valIdx++}`); updateValues.push(candidateData.first_name); }
            if (candidateData.last_name && candidateData.last_name !== candidate.last_name) { updateClauses.push(`last_name = $${valIdx++}`); updateValues.push(candidateData.last_name); }
            if (candidateData.phone && candidateData.phone !== candidate.phone) { updateClauses.push(`phone = $${valIdx++}`); updateValues.push(candidateData.phone); }
            // Add other updatable fields...
            if (updateClauses.length > 0) {
                updateClauses.push(`updated_at = NOW()`);
                updateValues.push(candidateId);
                updateValues.push(tenantId);
                await client.query(`UPDATE candidates SET ${updateClauses.join(', ')} WHERE id = $${valIdx++} AND tenant_id = $${valIdx++}`, updateValues);
            }
        } else {
            const candQuery = `
                INSERT INTO candidates (
                    tenant_id, first_name, last_name, email, phone, resume_url, source, 
                    current_company, current_designation, total_experience, notice_period, 
                    current_salary, expected_salary, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                RETURNING id;
            `;
            const candValues = [
                tenantId, candidateData.first_name, candidateData.last_name, candidateData.email,
                candidateData.phone || null, candidateData.resume_url || null, candidateData.source || null,
                candidateData.current_company || null, candidateData.current_designation || null,
                candidateData.total_experience || null, candidateData.notice_period || null,
                candidateData.current_salary || null, candidateData.expected_salary || null,
            ];
            const candRes = await client.query(candQuery, candValues);
            candidateId = candRes.rows[0].id;
        }

        // Check if candidate already applied for this job opening
        const existingAppRes = await client.query(
            'SELECT id FROM job_applications WHERE tenant_id = $1 AND candidate_id = $2 AND job_id = $3',
            [tenantId, candidateId, jobOpeningId]
        );
        if (existingAppRes.rowCount > 0) {
            throw new Error('This candidate has already applied for this job opening.');
        }

        const appQuery = `
            INSERT INTO job_applications (tenant_id, candidate_id, job_id, applied_date, current_stage, created_at, updated_at)
            VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW())
            RETURNING *;
        `;
        const appValues = [tenantId, candidateId, jobOpeningId, candidateData.status || 'Applied'];
        const appRes = await client.query(appQuery, appValues);
        
        await client.query('COMMIT');
        // mapRowToJobApplication needs to be created
        return mapRowToJobApplication(appRes.rows[0]);

    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[DB addCandidateAndApplyForJob] Error:', err);
        if (err.code === '23503') { // Foreign key violation
             if (err.constraint === 'job_applications_job_id_fkey') {
                 throw new Error('Invalid job opening selected.');
             }
        }
        throw err;
    } finally {
        client.release();
    }
}

// Update candidate (master record)
export async function updateCandidate(id: string, tenantId: string, updates: Partial<Omit<CandidateFormData, 'job_posting_id' | 'name'>>): Promise<Candidate | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    const columnMap: { [K in keyof typeof updates]?: string } = {
        first_name: 'first_name',
        last_name: 'last_name',
        email: 'email',
        phone: 'phone',
        resume_url: 'resume_url',
        source: 'source',
        current_company: 'current_company',
        current_designation: 'current_designation',
        total_experience: 'total_experience',
        notice_period: 'notice_period',
        current_salary: 'current_salary',
        expected_salary: 'expected_salary',
        // status is on job_applications, not candidates table
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

    if (setClauses.length === 0) {
        client.release();
        return getCandidateById(id, tenantId);
    }

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
        if (err.code === '23505' && err.constraint?.includes('email')) { // Example, adjust to your unique constraints
            throw new Error('This email address is already in use by another candidate in this tenant.');
        }
        throw err;
    } finally {
        client.release();
    }
}


export async function deleteCandidate(id: string, tenantId: string): Promise<boolean> {
    const client = await pool.connect();
    // Deleting a candidate will also delete their job_applications due to ON DELETE CASCADE
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

// --- Job Application Operations ---

function mapRowToJobApplication(row: any): JobApplication {
    return {
        id: row.id || row.application_id, // application_id is the PK
        tenantId: row.tenant_id,
        candidate_id: row.candidate_id,
        job_id: row.job_id,
        applied_date: new Date(row.applied_date).toISOString(),
        current_stage: row.current_stage as CandidateApplicationStatus,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : undefined,
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
        // Candidate details can be joined here
        candidate_name: row.candidate_name,
        candidate_email: row.candidate_email,
        candidate_phone: row.candidate_phone,
        candidate_resume_url: row.candidate_resume_url,
    };
}

export async function getApplicationsForJobOpening(jobOpeningId: string, tenantId: string, filters?: { status?: CandidateApplicationStatus }): Promise<JobApplication[]> {
    const client = await pool.connect();
    let query = `
        SELECT ja.*, 
               c.first_name || ' ' || c.last_name AS candidate_name, 
               c.email AS candidate_email,
               c.phone AS candidate_phone,
               c.resume_url AS candidate_resume_url 
        FROM job_applications ja
        JOIN candidates c ON ja.candidate_id = c.id AND ja.tenant_id = c.tenant_id
    `;
    const conditions: string[] = ['ja.tenant_id = $1', 'ja.job_id = $2'];
    const values: any[] = [tenantId, jobOpeningId];
    let valueIndex = 3;

    if (filters?.status) {
        conditions.push(`ja.current_stage = $${valueIndex++}`);
        values.push(filters.status);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY ja.applied_date DESC';

    try {
        const res = await client.query(query, values);
        return res.rows.map(mapRowToJobApplication);
    } catch (err) {
        console.error(`Error fetching applications for job opening ${jobOpeningId}, tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateApplicationStatus(applicationId: string, tenantId: string, status: CandidateApplicationStatus, notes?: string): Promise<JobApplication | undefined> {
    const client = await pool.connect();
    // In a real app, you might want to log who changed the status and when, possibly in a separate audit table
    const query = `
        UPDATE job_applications
        SET current_stage = $1, updated_at = NOW() 
        WHERE id = $2 AND tenant_id = $3
        RETURNING *; 
    `;
    // Notes are on the candidate record, not application. If notes are for application stage, add column.
    try {
        const res = await client.query(query, [status, applicationId, tenantId]);
        if (res.rows.length > 0) {
            // To return full JobApplication with candidate details, we'd need to re-fetch or join
            const updatedAppRes = await client.query(`
                SELECT ja.*, c.first_name || ' ' || c.last_name AS candidate_name, c.email AS candidate_email
                FROM job_applications ja
                JOIN candidates c ON ja.candidate_id = c.id
                WHERE ja.id = $1 AND ja.tenant_id = $2
            `, [applicationId, tenantId]);
            return mapRowToJobApplication(updatedAppRes.rows[0]);
        }
        return undefined;
    } catch (err) {
        console.error(`Error updating application status for ${applicationId}, tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}
