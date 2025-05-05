
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
import { getTenantIdFromSession, isAdminFromSession } from '@/modules/auth/actions'; // Adjusted import

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
    const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);
    if (!validation.success) {
        console.error("Update Settings Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }

    let dataToSave = validation.data;

    // If password field is empty, try to fetch the existing encrypted password
    if (!dataToSave.smtpPassword) {
         console.log("[Action updateEmailSettings] Password field is empty. Fetching existing settings to preserve password...");
         const existingSettings = await dbGetEmailSettings(tenantId); // Fetches decrypted password
         if (existingSettings?.smtpPassword) {
              console.log("[Action updateEmailSettings] Using existing password.");
             dataToSave = { ...dataToSave, smtpPassword: existingSettings.smtpPassword };
         } else {
             // If no existing password and none provided, it's an error unless this is the first save (which validation should catch?)
              console.error("[Action updateEmailSettings] Password field is empty and no existing password found.");
              return { success: false, errors: [{ code: 'custom', path: ['smtpPassword'], message: 'SMTP Password is required.' }] };
         }
    } else {
         console.log("[Action updateEmailSettings] New password provided.");
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
// Receives potentially incomplete settings from the form (password might be omitted)
export async function testSmtpConnectionAction(settingsData: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; message: string }> {
     const tenantId = await getTenantId();

     // Validate the *provided* data first (password might be missing)
     const validation = emailSettingsSchema.omit({ tenantId: true }).partial().safeParse(settingsData); // Allow partial for test
     if (!validation.success) {
         const firstError = validation.error.errors[0];
         return { success: false, message: `Validation Error (${firstError?.path[0] || 'input'}): ${firstError?.message || 'Invalid data'}` };
     }

     let completeSettings: EmailSettings;

     // If password is NOT provided in the test data, fetch the stored (decrypted) one
     if (!settingsData.smtpPassword) {
         console.log("[Test Connection Action] Password not provided for test. Fetching stored settings...");
         const storedSettings = await dbGetEmailSettings(tenantId); // Gets decrypted password
         if (!storedSettings || !storedSettings.smtpPassword) {
             return { success: false, message: 'Password missing. Please enter password to test or save settings first.' };
         }
         // Merge provided data with stored data (especially the password)
         completeSettings = {
             ...storedSettings, // Use stored as base
             ...validation.data, // Override with validated form data (host, port etc. might have changed)
             tenantId: tenantId, // Ensure tenantId is set
         };
         console.log("[Test Connection Action] Using stored password for test.");
     } else {
         // Password was provided in the form, use it directly after full validation
         const fullValidation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);
         if (!fullValidation.success) {
            const firstError = fullValidation.error.errors[0];
            return { success: false, message: `Validation Error (${firstError?.path[0] || 'input'}): ${firstError?.message || 'Invalid data'}` };
         }
         completeSettings = { ...fullValidation.data, tenantId: tenantId };
         console.log("[Test Connection Action] Using provided password for test.");
     }


    // Now `completeSettings` has all required fields, including the decrypted password
    let transportOptions: nodemailer.TransportOptions = {
        host: completeSettings.smtpHost,
        port: completeSettings.smtpPort,
        auth: {
            user: completeSettings.smtpUser,
            pass: completeSettings.smtpPassword, // Use the definite password
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    if (completeSettings.smtpPort === 465) {
        transportOptions.secure = true;
    } else if (completeSettings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
    } else {
        transportOptions.secure = completeSettings.smtpSecure;
    }

    const transporter = nodemailer.createTransport(transportOptions);

    try {
        console.log('[Test Connection Action] Attempting transporter.verify()...');
        await transporter.verify();
        console.log('[Test Connection Action] SMTP connection verified successfully.');
        return { success: true, message: 'Connection successful!' };
    } catch (error: any) {
        console.error('[Test Connection Action] Error:', error);
        let errorMessage = `Connection failed: ${error.message}`;
         if (error.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Check username and password.';
         } else if (error.code === 'ECONNREFUSED') {
             errorMessage = 'Connection refused. Check host, port, and firewall.';
         } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
             errorMessage = 'Connection timed out. Check network, host, and port.';
         } else if (error.code === 'ENOTFOUND') {
             errorMessage = `Hostname '${completeSettings.smtpHost}' not found. Check the host address.`;
         } else if (error.message?.includes('wrong version number') || error.code === 'ESOCKET') {
            errorMessage = `SSL/TLS handshake failed. Check port (${completeSettings.smtpPort}) and encryption settings (secure=${transportOptions.secure}). Details: ${error.message}`;
         } else if (error.message?.includes('Authentication unsuccessful')) {
             errorMessage = `Authentication unsuccessful. Check credentials or tenant SMTP settings. (Details: ${error.message})`;
         }
        return { success: false, message: errorMessage };
    }
}
