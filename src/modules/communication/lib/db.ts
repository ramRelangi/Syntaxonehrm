
import pool from '@/lib/db';
import type { EmailTemplate, EmailSettings } from '@/modules/communication/types';
import { encrypt, decrypt } from '@/lib/encryption'; // Import encryption utilities

// --- Email Template Operations ---

function mapRowToEmailTemplate(row: any): EmailTemplate {
    return {
        id: row.id,
        tenantId: row.tenant_id, // Include tenantId
        name: row.name,
        subject: row.subject,
        body: row.body,
        usageContext: row.usage_context ?? undefined,
    };
}

// Get templates for a specific tenant
export async function getAllTemplates(tenantId: string): Promise<EmailTemplate[]> {
    if (!tenantId) {
        console.warn("[DB getAllTemplates] Missing tenantId.");
        return [];
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_templates WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
        return res.rows.map(mapRowToEmailTemplate);
    } catch (err) {
        console.error(`Error fetching all email templates for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Get template by ID (ensure it belongs to the tenant - requires tenantId context)
export async function getTemplateById(id: string, tenantId: string): Promise<EmailTemplate | undefined> {
    if (!tenantId || !id) {
        console.warn("[DB getTemplateById] Missing tenantId or id.");
        return undefined;
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_templates WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
        return res.rows.length > 0 ? mapRowToEmailTemplate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching email template ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Add template for a specific tenant
export async function addTemplate(templateData: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    const client = await pool.connect();
    if (!templateData.tenantId) {
        throw new Error("Tenant ID is required to add an email template.");
    }
    const query = `
        INSERT INTO email_templates (tenant_id, name, subject, body, usage_context)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    const values = [
        templateData.tenantId,
        templateData.name,
        templateData.subject,
        templateData.body,
        templateData.usageContext || null,
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToEmailTemplate(res.rows[0]);
    } catch (err: any) {
        console.error('Error adding email template:', err);
        if (err.code === '23505' && err.constraint === 'email_templates_tenant_id_name_key') {
            throw new Error(`Template name "${templateData.name}" already exists for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

// Update template (ensure it belongs to the tenant)
export async function updateTemplate(id: string, tenantId: string, updates: Partial<Omit<EmailTemplate, 'id' | 'tenantId'>>): Promise<EmailTemplate | undefined> {
     if (!tenantId || !id) {
        console.warn("[DB updateTemplate] Missing tenantId or id.");
        return undefined;
    }
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

     const columnMap: { [K in keyof typeof updates]?: string } = {
        name: 'name',
        subject: 'subject',
        body: 'body',
        usageContext: 'usage_context',
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


    if (setClauses.length === 0) return getTemplateById(id, tenantId);

    values.push(id); // ID for WHERE clause
    values.push(tenantId); // tenantId for WHERE clause
    const query = `
        UPDATE email_templates
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${valueIndex} AND tenant_id = $${valueIndex + 1}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToEmailTemplate(res.rows[0]) : undefined;
    } catch (err: any) {
        console.error(`Error updating email template ${id} for tenant ${tenantId}:`, err);
         if (err.code === '23505' && err.constraint === 'email_templates_tenant_id_name_key') {
            throw new Error(`Template name "${updates.name}" already exists for this tenant.`);
        }
        throw err;
    } finally {
        client.release();
    }
}

// Delete template (ensure it belongs to the tenant)
export async function deleteTemplate(id: string, tenantId: string): Promise<boolean> {
     if (!tenantId || !id) {
        console.warn("[DB deleteTemplate] Missing tenantId or id.");
        return false;
    }
    const client = await pool.connect();
    const query = 'DELETE FROM email_templates WHERE id = $1 AND tenant_id = $2';
    try {
        const res = await client.query(query, [id, tenantId]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting email template ${id} for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// --- Email Settings Operations ---
// Settings are now per tenant, using tenant_id as the primary key

function mapRowToEmailSettings(row: any): EmailSettings | null {
     if (!row) return null;

     let decryptedPassword = '';
     try {
        // Ensure encrypted password exists and is not null/empty before decrypting
        if (row.smtp_password_encrypted) {
            decryptedPassword = decrypt(row.smtp_password_encrypted);
            if (!decryptedPassword) {
                // Decryption resulted in empty string, could be wrong key or corrupted data
                throw new Error("Decryption resulted in empty password.");
            }
        } else {
             // If encrypted password is null/empty in DB, treat as invalid configuration
             console.warn(`[DB mapRowToEmailSettings] Encrypted password missing in DB for tenant ${row.tenant_id}.`);
             return null;
        }

        // Check if other essential fields are non-null/valid before returning
         if (!row.smtp_host || !row.smtp_port || !row.smtp_user || !row.from_email || !row.from_name) {
             console.warn(`[DB mapRowToEmailSettings] DB row for tenant ${row.tenant_id} is missing essential fields (host, port, user, fromEmail, fromName). Treating as unconfigured.`);
             return null;
         }


        return {
            tenantId: row.tenant_id,
            smtpHost: row.smtp_host,
            smtpPort: parseInt(row.smtp_port, 10),
            smtpUser: row.smtp_user,
            smtpPassword: decryptedPassword, // Return decrypted password
            smtpSecure: row.smtp_secure,
            fromEmail: row.from_email,
            fromName: row.from_name,
        };
     } catch (decryptionError: any) {
          console.error(`[DB mapRowToEmailSettings] Failed to decrypt password or map settings for tenant ${row.tenant_id}:`, decryptionError.message);
          // Handle decryption failure - return null to indicate invalid/incomplete settings
          return null;
     }
}


// Function to get settings for a specific tenant
export async function getEmailSettings(tenantId: string): Promise<EmailSettings | null> {
    if (!tenantId) {
        console.warn("[DB getEmailSettings] Missing tenantId.");
        return null;
    }
    const client = await pool.connect();
    console.log(`[DB getEmailSettings] Fetching email settings row for tenant ${tenantId}...`);
    try {
        const res = await client.query('SELECT * FROM email_configuration WHERE tenant_id = $1', [tenantId]);
        if (res.rows.length > 0) {
            console.log("[DB getEmailSettings] Settings row found (password encrypted). Attempting to map/decrypt...");
            const settings = mapRowToEmailSettings(res.rows[0]);
            if (settings) {
                 console.log("[DB getEmailSettings] Successfully mapped and decrypted settings object.");
                 return settings;
            } else {
                console.log("[DB getEmailSettings] Settings row found but mapping/decryption failed. Returning null.");
                return null;
            }
        } else {
            console.log(`[DB getEmailSettings] No settings row found for tenant ${tenantId}. Returning null.`);
            return null; // No settings configured yet for this tenant
        }
    } catch (err) {
        console.error(`Error fetching email settings for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to update/insert settings for a specific tenant
// Returns settings *without* the password for security
export async function updateEmailSettings(tenantId: string, settingsData: Omit<EmailSettings, 'tenantId'>): Promise<Omit<EmailSettings, 'smtpPassword'>> {
    const client = await pool.connect();
    if (!tenantId) {
        throw new Error("Tenant ID is required to update email settings.");
    }
    // Encrypt the password before saving
    let encryptedPassword = '';
    // Ensure password is provided and not empty before encrypting
    if (!settingsData.smtpPassword) {
         console.error(`[DB updateEmailSettings] Attempted to save settings for tenant ${tenantId} without providing a password.`);
         throw new Error("SMTP Password is required when saving settings.");
    }
    try {
        encryptedPassword = encrypt(settingsData.smtpPassword);
    } catch (encryptionError) {
        console.error(`[DB updateEmailSettings] Failed to encrypt password for tenant ${tenantId}:`, encryptionError);
        throw new Error("Failed to secure password before saving.");
    }

    const query = `
        INSERT INTO email_configuration (tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, from_email, from_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (tenant_id) DO UPDATE SET
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_user = EXCLUDED.smtp_user,
            smtp_password_encrypted = EXCLUDED.smtp_password_encrypted, -- Always update encrypted password
            smtp_secure = EXCLUDED.smtp_secure,
            from_email = EXCLUDED.from_email,
            from_name = EXCLUDED.from_name,
            updated_at = NOW()
        RETURNING *; -- Return the saved row
    `;
    const values = [
        tenantId,
        settingsData.smtpHost,
        settingsData.smtpPort,
        settingsData.smtpUser,
        encryptedPassword, // Store encrypted password
        settingsData.smtpSecure,
        settingsData.fromEmail,
        settingsData.fromName,
    ];
    try {
        console.log("[DB updateEmailSettings] Attempting upsert with encrypted password for tenant:", tenantId);
        const res = await client.query(query, values);
        console.log("[DB updateEmailSettings] Upsert successful.");

        // Map the returned row (which contains encrypted password) and then remove password
        const savedSettingsWithEncryptedPassword = mapRowToEmailSettings(res.rows[0]);
        if (!savedSettingsWithEncryptedPassword) {
             console.error("[DB updateEmailSettings] Failed to retrieve/decrypt settings after update for tenant:", tenantId);
             throw new Error("Failed to retrieve settings after update or decryption failed.");
        }
        // DO NOT return the password, even decrypted
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = savedSettingsWithEncryptedPassword;
        console.log("[DB updateEmailSettings] Returning safe settings (no password).");
        return safeSettings; // Return settings without password
    } catch (err) {
        console.error('[DB updateEmailSettings] Error updating email settings:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Note: Schema definitions updated in init-db.ts
