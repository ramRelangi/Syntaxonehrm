
'use server';

import type { EmailTemplate, EmailSettings, EmailTemplateFormData } from '@/modules/communication/types';
import { emailTemplateSchema, emailSettingsSchema } from '@/modules/communication/types';
import {
  getAllTemplates as dbGetAllTemplates,
  getTemplateById as dbGetTemplateById,
  addTemplate as dbAddTemplate,
  updateTemplate as dbUpdateTemplate,
  deleteTemplate as dbDeleteTemplate,
  getEmailSettings as dbGetEmailSettings,
  updateEmailSettings as dbUpdateEmailSettings,
} from '@/modules/communication/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';
import { getTenantIdFromSession, isAdminFromSession, sendAdminNotification } from '@/modules/auth/actions';

// --- Helper Functions ---
async function getTenantId(): Promise<string> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) {
        console.error("[Communication Actions] Tenant context not found in session.");
        throw new Error("Tenant context not found. User may not be authenticated or associated with a tenant.");
    }
    console.log(`[Communication Actions] Resolved tenantId: ${tenantId}`);
    return tenantId;
}

// --- Email Template Server Actions ---

export async function getEmailTemplatesAction(): Promise<EmailTemplate[]> {
    const tenantId = await getTenantId();
    return dbGetAllTemplates(tenantId);
}

export async function getEmailTemplateByIdAction(id: string): Promise<EmailTemplate | undefined> {
    const tenantId = await getTenantId();
    return dbGetTemplateById(id, tenantId);
}

export async function addEmailTemplateAction(formData: EmailTemplateFormData): Promise<{ success: boolean; template?: EmailTemplate; errors?: z.ZodIssue[] }> {
    const tenantId = await getTenantId();
    // Ensure tenantId is not part of the form data being validated here if it's added contextually
    const validation = emailTemplateSchema.omit({ id: true, tenantId: true }).safeParse(formData);
    if (!validation.success) {
        console.error("Add Template Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newTemplate = await dbAddTemplate({ ...validation.data, tenantId });
        revalidatePath(`/${tenantId}/communication`); // Adjust path if necessary
        return { success: true, template: newTemplate };
    } catch (error: any) {
        console.error("Error adding template (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add template.' }] };
    }
}

export async function updateEmailTemplateAction(id: string, formData: Partial<EmailTemplateFormData>): Promise<{ success: boolean; template?: EmailTemplate; errors?: z.ZodIssue[] }> {
     const tenantId = await getTenantId();
     const validation = emailTemplateSchema.omit({ id: true, tenantId: true }).partial().safeParse(formData);
     if (!validation.success) {
         console.error("Update Template Validation Error:", validation.error.flatten());
         return { success: false, errors: validation.error.errors };
     }
    try {
        const updatedTemplate = await dbUpdateTemplate(id, tenantId, validation.data);
        if (updatedTemplate) {
            revalidatePath(`/${tenantId}/communication`);
            return { success: true, template: updatedTemplate };
        } else {
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Template not found.' }] };
        }
    } catch (error: any) {
        console.error("Error updating template (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to update template.' }] };
    }
}

export async function deleteEmailTemplateAction(id: string): Promise<{ success: boolean; error?: string }> {
    const tenantId = await getTenantId();
    try {
        const deleted = await dbDeleteTemplate(id, tenantId);
        if (deleted) {
            revalidatePath(`/${tenantId}/communication`);
            return { success: true };
        } else {
            return { success: false, error: 'Template not found.' };
        }
    } catch (error: any) {
        console.error("Error deleting template (action):", error);
        return { success: false, error: error.message || 'Failed to delete template.' };
    }
}

// --- Email Settings Server Actions ---

// Returns settings WITHOUT password for security reasons
export async function getEmailSettingsAction(): Promise<Omit<EmailSettings, 'smtpPassword'> | null> {
    const tenantId = await getTenantId();
    console.log(`[getEmailSettingsAction] Fetching settings for tenant ${tenantId}...`);
    const settings = await dbGetEmailSettings(tenantId); // This already decrypts
    if (settings) {
        console.log(`[getEmailSettingsAction] Settings found for tenant ${tenantId} (password excluded).`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = settings; // Remove password before returning
        return safeSettings;
    }
    console.log(`[getEmailSettingsAction] No settings found for tenant ${tenantId}.`);
    return null;
}

// Expects full settings data including password (if provided)
export async function updateEmailSettingsAction(settingsData: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; settings?: Omit<EmailSettings, 'smtpPassword'>; errors?: z.ZodIssue[] }> {
    const tenantId = await getTenantId();
    console.log(`[updateEmailSettingsAction] Attempting to update settings for tenant ${tenantId}`); // Log tenantId

    // Validate against the schema that *includes* the password field
    // Note: `tenantId` is omitted because it's derived, not submitted by the form.
    const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);

    if (!validation.success) {
        console.error(`[updateEmailSettingsAction] Validation Error for tenant ${tenantId}:`, validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    console.log(`[updateEmailSettingsAction] Validation successful for tenant ${tenantId}.`);

    let dataToSave = validation.data;

    // Handle password: Keep existing encrypted if new one is placeholder/empty
    if (!dataToSave.smtpPassword || dataToSave.smtpPassword === '******') {
         console.log(`[updateEmailSettingsAction] Password field empty/placeholder for tenant ${tenantId}. Fetching existing encrypted password...`);
         try {
             // Fetch FULL settings including encrypted password directly (or adapt dbGetEmailSettings if it returns encrypted too)
             const existingSettings = await dbGetEmailSettings(tenantId); // Assuming this decrypts, need encrypted one
             // Modify dbGetEmailSettings or add a new function to get the encrypted password if needed
             // For now, assuming dbGetEmailSettings returns the decrypted password. Re-encrypting it here is NOT ideal.
             // A better approach: modify dbUpdateEmailSettings to handle empty password input.

             if (existingSettings?.smtpPassword) { // Check if existing decrypted password is there
                 console.log(`[updateEmailSettingsAction] Using existing password for tenant ${tenantId}.`);
                 // If the DB function requires the password, provide the one we just fetched (decrypted).
                 // The DB function will re-encrypt it.
                 dataToSave = { ...dataToSave, smtpPassword: existingSettings.smtpPassword };
             } else {
                 // No existing password and none provided.
                 console.error(`[updateEmailSettingsAction] Password required but not provided and no existing password found for tenant ${tenantId}.`);
                 return { success: false, errors: [{ code: 'custom', path: ['smtpPassword'], message: 'SMTP Password is required.' }] };
             }
         } catch (fetchError: any) {
              console.error(`[updateEmailSettingsAction] Error fetching existing settings for tenant ${tenantId}:`, fetchError);
              return { success: false, errors: [{ code: 'custom', path: ['root'], message: `Failed to retrieve existing settings: ${fetchError.message}` }] };
         }
    } else {
         console.log(`[updateEmailSettingsAction] New password provided for tenant ${tenantId}.`);
    }


    try {
        console.log(`[updateEmailSettingsAction] Calling dbUpdateEmailSettings for tenant ${tenantId}...`);
        // dbUpdateEmailSettings encrypts before saving and returns WITHOUT password
        const updatedSafeSettings = await dbUpdateEmailSettings(tenantId, dataToSave);
        console.log(`[updateEmailSettingsAction] Settings updated successfully for tenant ${tenantId}. Revalidating path.`);
        revalidatePath(`/${tenantId}/communication`);
        return { success: true, settings: updatedSafeSettings };
    } catch (error: any) {
        console.error(`[updateEmailSettingsAction] Error updating settings for tenant ${tenantId} (action):`, error);
        // Check for foreign key violation specifically
        if (error.message?.includes('violates foreign key constraint')) {
            console.error(`[updateEmailSettingsAction] Foreign key violation likely due to invalid tenant ID: ${tenantId}`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: `Internal Server Error: Invalid tenant context (${error.message})` }] };
        }
        return { success: false, errors: [{ code: 'custom', path: ['smtpHost'], message: error.message || 'Failed to save settings.' }] };
    }
}


// --- Test Connection Action ---
// Fetches settings internally based on tenant context.
export async function testSmtpConnectionAction(): Promise<{ success: boolean; message: string }> {
     const tenantId = await getTenantId();
     console.log(`[Test Connection Action] Testing connection for tenant: ${tenantId}`);

     let completeSettings: EmailSettings | null = null;

     try {
         console.log(`[Test Connection Action] Fetching email settings from DB for tenant ${tenantId}...`);
         completeSettings = await dbGetEmailSettings(tenantId); // Fetches and decrypts

         if (!completeSettings) {
             console.warn(`[Test Connection Action] No valid settings found in DB for tenant ${tenantId}.`);
             return { success: false, message: "SMTP settings are not configured or are invalid. Please save your settings first." };
         }

         const validation = emailSettingsSchema.safeParse(completeSettings);
         if (!validation.success) {
             console.error(`[Test Connection Action] Fetched settings from DB are structurally invalid for tenant ${tenantId}:`, validation.error.flatten());
             return { success: false, message: "Stored SMTP settings are incomplete or invalid. Please review and save them again." };
         }
         console.log(`[Test Connection Action] Using validated settings from DB for test (password masked).`);

     } catch (error: any) {
         console.error(`[Test Connection Action] Error fetching or validating settings for tenant ${tenantId}:`, error);
         return { success: false, message: `Failed to retrieve settings: ${error.message}` };
     }


    // --- Connection Test Logic (using completeSettings) ---
    let transportOptions: nodemailer.TransportOptions = {
        host: completeSettings.smtpHost,
        port: completeSettings.smtpPort,
        auth: {
            user: completeSettings.smtpUser,
            pass: completeSettings.smtpPassword, // Use the decrypted password
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    // Automatically configure secure/requireTLS based on common ports
    if (completeSettings.smtpPort === 465) {
        transportOptions.secure = true;
    } else if (completeSettings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
    } else {
        transportOptions.secure = completeSettings.smtpSecure;
         console.warn(`[Test Connection Action] Using explicit secure=${completeSettings.smtpSecure} for non-standard port ${completeSettings.smtpPort}. Verify provider requirements.`);
    }

    const transporter = nodemailer.createTransport(transportOptions);

    try {
        console.log('[Test Connection Action] Attempting transporter.verify()...');
        await transporter.verify();
        console.log('[Test Connection Action] SMTP connection verified successfully.');
        return { success: true, message: 'Connection successful!' };
    } catch (error: any) {
        console.error('[Test Connection Action] Verify Error:', error);
        let errorMessage = `Connection failed: ${error.message}`;
         if (error.code === 'EAUTH' || error.message?.includes('Authentication unsuccessful') || error.message?.includes('Invalid login')) {
            errorMessage = `Authentication failed. Check username and password. (Details: ${error.message})`;
         } else if (error.code === 'ECONNREFUSED') {
             errorMessage = `Connection refused. Check host (${completeSettings.smtpHost}), port (${completeSettings.smtpPort}), and firewall.`;
         } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
             errorMessage = 'Connection timed out. Check network, host, and port.';
         } else if (error.code === 'ENOTFOUND' || error.code === 'EDNS') {
             errorMessage = `Hostname '${completeSettings.smtpHost}' not found. Check the host address.`;
         } else if (error.code === 'ESOCKET' || error.message?.includes('wrong version number')) {
            errorMessage = `SSL/TLS handshake failed. Check port (${completeSettings.smtpPort}) and encryption settings (Secure: ${transportOptions.secure}). Details: ${error.message}`;
         } else if (error.responseCode && error.response) {
            errorMessage = `SMTP Server Error (${error.responseCode}): ${error.response}`;
         }
        // Append original message if not already included for more context
        if (error.message && !errorMessage.includes(error.message)) {
            errorMessage += ` (Details: ${error.message})`;
        }
        // Send admin notification on failure
        await sendAdminNotification({ message: `SMTP Test Connection Failed for tenant ${tenantId}: ${errorMessage}` });
        return { success: false, message: errorMessage };
    }
}

// --- Send Email Action ---
export async function sendEmailAction(data: { to: string; subject: string; body: string }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const tenantId = await getTenantId();
    console.log(`[Send Email Action] Attempting to send email for tenant ${tenantId}...`);

    let settings: EmailSettings | null = null;
    try {
        settings = await dbGetEmailSettings(tenantId); // Fetch decrypted settings
        if (!settings) {
            throw new Error("Email sending is not configured or settings are invalid.");
        }
        // Basic validation of fetched settings
        if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword || !settings.fromEmail || !settings.fromName) {
             throw new Error("Fetched email settings are incomplete. Please check Communication Settings.");
        }
         console.log(`[Send Email Action] Using settings for ${settings.smtpHost}:${settings.smtpPort}`);
    } catch (error: any) {
        console.error(`[Send Email Action] Error fetching settings for tenant ${tenantId}:`, error);
        return { success: false, error: `Failed to retrieve email configuration: ${error.message}` };
    }

    // Validate input data
    const validation = z.object({
        to: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
    }).safeParse(data);

    if (!validation.success) {
        console.error(`[Send Email Action] Invalid email data for tenant ${tenantId}:`, validation.error.flatten());
        return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
    }

    // Create transporter
    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost, port: settings.smtpPort,
        auth: { user: settings.smtpUser, pass: settings.smtpPassword }, // Use decrypted password
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development', debug: process.env.NODE_ENV === 'development',
    };
    if (settings.smtpPort === 465) { transportOptions.secure = true; }
    else if (settings.smtpPort === 587) { transportOptions.secure = false; transportOptions.requireTLS = true; }
    else { transportOptions.secure = settings.smtpSecure; }

    const transporter = nodemailer.createTransport(transportOptions);

    // Send mail
    try {
        const mailOptions = {
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: validation.data.to,
            subject: validation.data.subject,
            [validation.data.body.trim().startsWith('<') ? 'html' : 'text']: validation.data.body,
        };
        console.log(`[Send Email Action] Sending email to ${validation.data.to} via ${settings.smtpHost} for tenant ${tenantId}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`[Send Email Action] Email sent successfully for tenant ${tenantId}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error(`[Send Email Action] Error sending email for tenant ${tenantId}:`, error);
         let errorMessage = `Failed to send email: ${error.message}`;
          if (error.code === 'EAUTH') {
            errorMessage = `SMTP Authentication failed. Check credentials. (Details: ${error.message})`;
          } // Add more specific error handling as in test connection
        return { success: false, error: errorMessage };
    }
}
