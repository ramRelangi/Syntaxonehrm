
import pool from '@/lib/db';
import type { EmailTemplate, EmailSettings } from '@/modules/communication/types';
import { encrypt, decrypt } from '@/lib/encryption';

// --- Email Template Operations ---

function mapRowToEmailTemplate(row: any): EmailTemplate {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        subject: row.subject,
        body: row.body,
        usageContext: row.usage_context ?? undefined,
        category: row.category ?? undefined, // Added
    };
}

export async function getAllTemplates(tenantId: string): Promise<EmailTemplate[]> {
    if (!tenantId) {
        console.warn("[DB getAllTemplates] Missing tenantId.");
        return [];
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_templates WHERE tenant_id = $1 ORDER BY category, name ASC', [tenantId]); // Order by category then name
        return res.rows.map(mapRowToEmailTemplate);
    } catch (err) {
        console.error(`Error fetching all email templates for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

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

export async function addTemplate(templateData: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    const client = await pool.connect();
    if (!templateData.tenantId) {
        throw new Error("Tenant ID is required to add an email template.");
    }
    const query = `
        INSERT INTO email_templates (tenant_id, name, subject, body, usage_context, category)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const values = [
        templateData.tenantId,
        templateData.name,
        templateData.subject,
        templateData.body,
        templateData.usageContext || null,
        templateData.category || null, // Added
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
        category: 'category', // Added
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
    values.push(id);
    values.push(tenantId);
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

function mapRowToEmailSettings(row: any): EmailSettings | null {
     if (!row) return null;
     let decryptedPassword = '';
     try {
        if (row.smtp_password_encrypted) {
            decryptedPassword = decrypt(row.smtp_password_encrypted);
            if (!decryptedPassword) {
                throw new Error("Decryption resulted in empty password.");
            }
        } else {
             console.warn(`[DB mapRowToEmailSettings] Encrypted password missing in DB for tenant ${row.tenant_id}.`);
             return null;
        }
         if (!row.smtp_host || !row.smtp_port || !row.smtp_user || !row.from_email || !row.from_name) {
             console.warn(`[DB mapRowToEmailSettings] DB row for tenant ${row.tenant_id} is missing essential fields. Treating as unconfigured.`);
             return null;
         }
        return {
            tenantId: row.tenant_id,
            smtpHost: row.smtp_host,
            smtpPort: parseInt(row.smtp_port, 10),
            smtpUser: row.smtp_user,
            smtpPassword: decryptedPassword,
            smtpSecure: row.smtp_secure,
            fromEmail: row.from_email,
            fromName: row.from_name,
        };
     } catch (decryptionError: any) {
          console.error(`[DB mapRowToEmailSettings] Failed to decrypt password or map settings for tenant ${row.tenant_id}:`, decryptionError.message);
          return null;
     }
}

export async function getEmailSettings(tenantId: string): Promise<EmailSettings | null> {
    if (!tenantId) {
        console.warn("[DB getEmailSettings] Missing tenantId.");
        return null;
    }
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_configuration WHERE tenant_id = $1', [tenantId]);
        if (res.rows.length > 0) {
            const settings = mapRowToEmailSettings(res.rows[0]);
            return settings;
        } else {
            return null;
        }
    } catch (err) {
        console.error(`Error fetching email settings for tenant ${tenantId}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateEmailSettings(tenantId: string, settingsData: Omit<EmailSettings, 'tenantId'>): Promise<Omit<EmailSettings, 'smtpPassword'>> {
    const client = await pool.connect();
    if (!tenantId) {
        throw new Error("Tenant ID is required to update email settings.");
    }
    let encryptedPassword = '';
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
            smtp_password_encrypted = EXCLUDED.smtp_password_encrypted,
            smtp_secure = EXCLUDED.smtp_secure,
            from_email = EXCLUDED.from_email,
            from_name = EXCLUDED.from_name,
            updated_at = NOW()
        RETURNING *;
    `;
    const values = [
        tenantId,
        settingsData.smtpHost,
        settingsData.smtpPort,
        settingsData.smtpUser,
        encryptedPassword,
        settingsData.smtpSecure,
        settingsData.fromEmail,
        settingsData.fromName,
    ];
    try {
        const res = await client.query(query, values);
        const savedSettingsWithEncryptedPassword = mapRowToEmailSettings(res.rows[0]);
        if (!savedSettingsWithEncryptedPassword) {
             throw new Error("Failed to retrieve settings after update or decryption failed.");
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = savedSettingsWithEncryptedPassword;
        return safeSettings;
    } catch (err: any) {
        console.error('[DB updateEmailSettings] Error updating email settings:', err);
         if (err.code === '23503' && err.constraint === 'email_configuration_tenant_id_fkey') {
            throw new Error('Tenant association failed. The specified tenant does not exist.');
        }
        throw err;
    } finally {
        client.release();
    }
}
