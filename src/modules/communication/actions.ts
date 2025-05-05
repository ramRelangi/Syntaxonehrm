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
import { getTenantIdFromSession, isAdminFromSession } from '@/modules/auth/actions';

// --- Helper Functions ---
async function getTenantId(): Promise<string> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) {
        throw new Error("Tenant context not found. User may not be authenticated or associated with a tenant.");
    }
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
    const settings = await dbGetEmailSettings(tenantId); // This already decrypts
    if (settings) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = settings; // Remove password before returning
        return safeSettings;
    }
    return null;
}

// Expects full settings data including password (if provided)
export async function updateEmailSettingsAction(settingsData: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; settings?: Omit<EmailSettings, 'smtpPassword'>; errors?: z.ZodIssue[] }> {
    const tenantId = await getTenantId();
    // Validate against the schema that *includes* the password field
    const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);

    if (!validation.success) {
        console.error("Update Settings Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }

    let dataToSave = validation.data;

    // If password field is empty or just placeholder, try to fetch the existing encrypted password
    if (!dataToSave.smtpPassword || dataToSave.smtpPassword === '******') {
         console.log("[Action updateEmailSettings] Password field empty/placeholder. Fetching existing settings...");
         try {
             // Fetch settings from DB (which includes decrypted password)
             const existingSettings = await dbGetEmailSettings(tenantId);
             if (existingSettings?.smtpPassword) {
                 console.log("[Action updateEmailSettings] Using existing password.");
                 // Replace placeholder/empty password with the actual decrypted password from DB
                 dataToSave = { ...dataToSave, smtpPassword: existingSettings.smtpPassword };
             } else {
                 // If no existing password and none provided, it's an error UNLESS we are updating other fields
                 // Check if any other field actually changed
                 const initialSafeSettings = await getEmailSettingsAction(); // Fetch safe settings for comparison
                 const changedFields = Object.keys(dataToSave).filter(
                    key => key !== 'smtpPassword' && dataToSave[key as keyof typeof dataToSave] !== initialSafeSettings?.[key as keyof typeof initialSafeSettings]
                 );

                 if (changedFields.length === 0) {
                    // No password provided, nothing else changed - this is basically a no-op, treat as success?
                    // Or maybe error because the intention was likely to update password but it was left blank?
                    // Let's return an error for clarity.
                     console.error("[Action updateEmailSettings] Password required but not provided and no other fields changed.");
                     return { success: false, errors: [{ code: 'custom', path: ['smtpPassword'], message: 'SMTP Password is required if no other fields are being updated.' }] };
                 } else {
                    // Other fields changed, but no existing password found in DB. This is an invalid state.
                     console.error("[Action updateEmailSettings] Password required but not provided and no existing password found in DB.");
                     return { success: false, errors: [{ code: 'custom', path: ['smtpPassword'], message: 'Existing password not found. Please provide the password to save changes.' }] };
                 }
             }
         } catch (fetchError: any) {
              console.error("[Action updateEmailSettings] Error fetching existing settings:", fetchError);
              return { success: false, errors: [{ code: 'custom', path: ['root'], message: `Failed to retrieve existing settings: ${fetchError.message}` }] };
         }
    } else {
         console.log("[Action updateEmailSettings] New password provided in the form.");
    }


    try {
        // dbUpdateEmailSettings encrypts before saving and returns WITHOUT password
        const updatedSafeSettings = await dbUpdateEmailSettings(tenantId, dataToSave);
        revalidatePath(`/${tenantId}/communication`);
        return { success: true, settings: updatedSafeSettings };
    } catch (error: any) {
        console.error("Error updating settings (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['smtpHost'], message: error.message || 'Failed to save settings.' }] };
    }
}


// --- Test Connection Action ---
// This action now fetches settings internally based on tenant context.
// It no longer accepts settings data from the client.
export async function testSmtpConnectionAction(): Promise<{ success: boolean; message: string }> {
     const tenantId = await getTenantId();
     console.log(`[Test Connection Action] Testing connection for tenant: ${tenantId}`);

     let completeSettings: EmailSettings | null = null; // Initialize as null

     try {
         // Fetch the complete, decrypted settings from the database
         console.log(`[Test Connection Action] Fetching email settings from DB for tenant ${tenantId}...`);
         completeSettings = await dbGetEmailSettings(tenantId); // Fetches and decrypts

         if (!completeSettings) {
             // This handles cases where settings don't exist OR decryption failed OR essential fields missing
             console.error(`[Test Connection Action] No valid settings found in DB for tenant ${tenantId}.`);
             return { success: false, message: "SMTP settings are not configured or are invalid. Please save your settings first." };
         }

         // Settings exist and were decrypted successfully (dbGetEmailSettings returns null otherwise)
         // Validate the fetched settings structure just in case (though db function should ensure this)
         const validation = emailSettingsSchema.safeParse(completeSettings);
         if (!validation.success) {
             console.error(`[Test Connection Action] Fetched settings from DB are structurally invalid for tenant ${tenantId}:`, validation.error.flatten());
             // This scenario is less likely if dbGetEmailSettings works correctly, but good to handle.
             return { success: false, message: "Stored SMTP settings are incomplete or invalid. Please review and save them again." };
         }

         // completeSettings is now validated and contains the decrypted password
         console.log(`[Test Connection Action] Using settings from DB for test (password masked): host=${completeSettings.smtpHost}, port=${completeSettings.smtpPort}, user=${completeSettings.smtpUser}, secure=${completeSettings.smtpSecure}`);

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
        connectionTimeout: 15000, // Increased timeout
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    // Automatically configure secure/requireTLS based on common ports
    if (completeSettings.smtpPort === 465) {
        transportOptions.secure = true;
         console.log("[Test Connection Action] Using secure=true for port 465");
    } else if (completeSettings.smtpPort === 587) {
        transportOptions.secure = false; // Often needs STARTTLS
        transportOptions.requireTLS = true; // Explicitly require STARTTLS
         console.log("[Test Connection Action] Using secure=false, requireTLS=true for port 587");
    } else {
        // For other ports, rely on the saved smtpSecure value, but warn if ambiguous
        transportOptions.secure = completeSettings.smtpSecure;
         console.warn(`[Test Connection Action] Using explicit secure=${completeSettings.smtpSecure} for non-standard port ${completeSettings.smtpPort}. Verify provider requirements.`);
         // If secure is false for non-587 ports, TLS might still be required/used implicitly by Nodemailer
         // but explicit requireTLS is usually for port 587 STARTTLS.
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
        return { success: false, message: errorMessage };
    }
}
