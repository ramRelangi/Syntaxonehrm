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
// Import new session helper from auth actions
import { getTenantIdFromSession } from '@/modules/auth/actions';

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
        return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add template.' }] as z.ZodIssue[] };
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
            return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Template not found.' }] as z.ZodIssue[] };
        }
    } catch (error: any) {
        console.error("Error updating template (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to update template.' }] as z.ZodIssue[] };
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

export async function getEmailSettingsAction(): Promise<Omit<EmailSettings, 'smtpPassword'> | null> {
    const tenantId = await getTenantId();
    const settings = await dbGetEmailSettings(tenantId);
    if (settings) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = settings;
        return safeSettings;
    }
    return null;
}

export async function updateEmailSettingsAction(settingsData: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; settings?: Omit<EmailSettings, 'smtpPassword'>; errors?: z.ZodIssue[] }> {
    const tenantId = await getTenantId();
    const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);
    if (!validation.success) {
        console.error("Update Settings Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const updatedSettings = await dbUpdateEmailSettings(tenantId, validation.data);
        revalidatePath(`/${tenantId}/communication`);
        return { success: true, settings: updatedSettings };
    } catch (error: any) {
        console.error("Error updating settings (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['smtpHost'], message: error.message || 'Failed to save settings.' }] as z.ZodIssue[] };
    }
}


// --- Test Connection Action ---
export async function testSmtpConnectionAction(settingsData: Omit<EmailSettings, 'tenantId'> & { smtpPassword?: string }): Promise<{ success: boolean; message: string }> {
     const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settingsData);
     if (!validation.success) {
          const errorPath = validation.error.errors[0]?.path[0] || 'settings';
          const errorMessage = validation.error.errors[0]?.message || 'Invalid settings provided.';
         return { success: false, message: `Validation Error (${errorPath}): ${errorMessage}` };
     }

     const tenantId = await getTenantId();
     let finalSettings: EmailSettings;

     if (!settingsData.smtpPassword) {
         const existingSettings = await dbGetEmailSettings(tenantId);
         if (!existingSettings?.smtpPassword) {
             return { success: false, message: 'Password is required to test connection (or save settings first).' };
         }
         finalSettings = { ...validation.data, tenantId: tenantId, smtpPassword: existingSettings.smtpPassword };
     } else {
          finalSettings = { ...validation.data, tenantId: tenantId, smtpPassword: settingsData.smtpPassword };
     }

    let transportOptions: nodemailer.TransportOptions = {
        host: finalSettings.smtpHost,
        port: finalSettings.smtpPort,
        auth: {
            user: finalSettings.smtpUser,
            pass: finalSettings.smtpPassword,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    if (finalSettings.smtpPort === 465) {
        transportOptions.secure = true;
    } else if (finalSettings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
    } else {
        transportOptions.secure = finalSettings.smtpSecure;
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
            errorMessage = 'Authentication failed. Check username/password.';
         } else if (error.code === 'ECONNREFUSED') {
             errorMessage = 'Connection refused. Check host, port, and firewall.';
         } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
             errorMessage = 'Connection timed out. Check network, host, and port.';
         } else if (error.code === 'ENOTFOUND') {
             errorMessage = `Hostname '${finalSettings.smtpHost}' not found. Check the host address.`;
         } else if (error.message?.includes('wrong version number')) {
            errorMessage = `SSL/TLS handshake failed. Check port (${finalSettings.smtpPort}) and encryption settings (secure=${transportOptions.secure}).`;
         } else if (error.message?.includes('Authentication unsuccessful')) {
             errorMessage = `Authentication unsuccessful. SMTP authentication might be disabled for the tenant or credentials invalid. (Details: ${error.message})`;
         }
        return { success: false, message: errorMessage };
    }
}
