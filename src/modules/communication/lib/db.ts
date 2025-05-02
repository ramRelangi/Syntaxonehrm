import pool from '@/lib/db';
import type { EmailTemplate, EmailSettings } from '@/modules/communication/types';

// --- Email Template Operations ---

function mapRowToEmailTemplate(row: any): EmailTemplate {
    return {
        id: row.id,
        name: row.name,
        subject: row.subject,
        body: row.body,
        usageContext: row.usage_context ?? undefined,
    };
}

export async function getAllTemplates(): Promise<EmailTemplate[]> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_templates ORDER BY name ASC');
        return res.rows.map(mapRowToEmailTemplate);
    } catch (err) {
        console.error('Error fetching all email templates:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getTemplateById(id: string): Promise<EmailTemplate | undefined> {
    const client = await pool.connect();
    try {
        const res = await client.query('SELECT * FROM email_templates WHERE id = $1', [id]);
        return res.rows.length > 0 ? mapRowToEmailTemplate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error fetching email template ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function addTemplate(templateData: Omit<EmailTemplate, 'id'>): Promise<EmailTemplate> {
    const client = await pool.connect();
    const query = `
        INSERT INTO email_templates (name, subject, body, usage_context)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;
    const values = [
        templateData.name,
        templateData.subject,
        templateData.body,
        templateData.usageContext || null,
    ];
    try {
        const res = await client.query(query, values);
        return mapRowToEmailTemplate(res.rows[0]);
    } catch (err) {
        console.error('Error adding email template:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function updateTemplate(id: string, updates: Partial<Omit<EmailTemplate, 'id'>>): Promise<EmailTemplate | undefined> {
    const client = await pool.connect();
    const setClauses: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

     const columnMap: { [K in keyof Omit<EmailTemplate, 'id'>]?: string } = {
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


    if (setClauses.length === 0) return getTemplateById(id);

    values.push(id);
    const query = `
        UPDATE email_templates
        SET ${setClauses.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *;
    `;
    try {
        const res = await client.query(query, values);
        return res.rows.length > 0 ? mapRowToEmailTemplate(res.rows[0]) : undefined;
    } catch (err) {
        console.error(`Error updating email template ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}

export async function deleteTemplate(id: string): Promise<boolean> {
    const client = await pool.connect();
    // Consider adding checks if template is critical or linked elsewhere
    const query = 'DELETE FROM email_templates WHERE id = $1';
    try {
        const res = await client.query(query, [id]);
        return res.rowCount > 0;
    } catch (err) {
        console.error(`Error deleting email template ${id}:`, err);
        throw err;
    } finally {
        client.release();
    }
}


// --- Email Settings Operations ---
// Storing settings in a simple key-value table or a dedicated settings table.
// Using a single row in a dedicated table for simplicity here. Assuming row id=1 exists.

function mapRowToEmailSettings(row: any): EmailSettings | null {
     if (!row) return null;
     // Check if essential fields are non-null before returning
     if (!row.smtp_host || !row.smtp_port || !row.smtp_user || !row.smtp_password || !row.from_email || !row.from_name) {
         console.warn("[DB mapRowToEmailSettings] DB row exists but is missing essential fields. Treating as unconfigured.");
         return null;
     }
     return {
         smtpHost: row.smtp_host,
         smtpPort: parseInt(row.smtp_port, 10),
         smtpUser: row.smtp_user,
         smtpPassword: row.smtp_password, // Password will be stored encrypted ideally
         smtpSecure: row.smtp_secure,
         fromEmail: row.from_email,
         fromName: row.from_name,
     };
}


// Function to get settings (fetches the single settings row)
export async function getEmailSettings(): Promise<EmailSettings | null> {
    const client = await pool.connect();
    console.log("[DB getEmailSettings] Fetching email settings row...");
    try {
        // Assuming settings are stored in a table `app_settings` with a specific key or a single row
        // Using a single row table `email_configuration` for this example
        const res = await client.query('SELECT * FROM email_configuration LIMIT 1');
        if (res.rows.length > 0) {
            console.log("[DB getEmailSettings] Settings row found:", JSON.stringify(res.rows[0]));
            const settings = mapRowToEmailSettings(res.rows[0]);
            if (settings) {
                 console.log("[DB getEmailSettings] Successfully mapped row to settings object.");
                 return settings;
            } else {
                console.log("[DB getEmailSettings] Settings row found but mapping failed (missing essential fields). Returning null.");
                return null;
            }
        } else {
            console.log("[DB getEmailSettings] No settings row found. Returning null.");
            return null; // No settings configured yet
        }
    } catch (err) {
        console.error('Error fetching email settings:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Function to update/insert settings (upsert)
export async function updateEmailSettings(settingsData: EmailSettings): Promise<EmailSettings> {
    const client = await pool.connect();
    // In a real app, encrypt smtpPassword before saving
    const encryptedPassword = settingsData.smtpPassword; // Placeholder - use bcrypt or similar

    const query = `
        INSERT INTO email_configuration (id, smtp_host, smtp_port, smtp_user, smtp_password, smtp_secure, from_email, from_name, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
            smtp_host = EXCLUDED.smtp_host,
            smtp_port = EXCLUDED.smtp_port,
            smtp_user = EXCLUDED.smtp_user,
            smtp_password = EXCLUDED.smtp_password,
            smtp_secure = EXCLUDED.smtp_secure,
            from_email = EXCLUDED.from_email,
            from_name = EXCLUDED.from_name,
            updated_at = NOW()
        RETURNING *;
    `;
    const values = [
        settingsData.smtpHost,
        settingsData.smtpPort,
        settingsData.smtpUser,
        encryptedPassword, // Store encrypted password
        settingsData.smtpSecure,
        settingsData.fromEmail,
        settingsData.fromName,
    ];
    try {
        console.log("[DB updateEmailSettings] Attempting upsert with data:", JSON.stringify({ ...settingsData, smtpPassword: '***' }));
        const res = await client.query(query, values);
        console.log("[DB updateEmailSettings] Upsert successful. Returning mapped settings.");
        // Return the saved data, potentially decrypting password if needed (but generally don't return password)
         const savedSettings = mapRowToEmailSettings(res.rows[0]);
         if (!savedSettings) {
              throw new Error("Failed to retrieve settings after update."); // Should not happen if query returns data
         }
         // DO NOT return the password, even encrypted
         return { ...savedSettings, smtpPassword: '' }; // Return with password cleared
    } catch (err) {
        console.error('Error updating email settings:', err);
        throw err;
    } finally {
        client.release();
    }
}

// --- Database Schema (for reference) ---
/*
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    usage_context VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_configuration (
    id INT PRIMARY KEY DEFAULT 1, -- Only one row for settings
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_user VARCHAR(255) NOT NULL,
    smtp_password TEXT NOT NULL, -- Store encrypted password!
    smtp_secure BOOLEAN NOT NULL DEFAULT TRUE,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT only_one_row CHECK (id = 1) -- Enforce single row
);

-- Trigger for updated_at (if not already created)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON email_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_configuration_updated_at
BEFORE UPDATE ON email_configuration
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

*/
