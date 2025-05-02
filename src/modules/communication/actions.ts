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

// --- Email Template Server Actions ---

export async function getEmailTemplatesAction(): Promise<EmailTemplate[]> {
    return dbGetAllTemplates();
}

export async function getEmailTemplateByIdAction(id: string): Promise<EmailTemplate | undefined> {
    return dbGetTemplateById(id);
}

export async function addEmailTemplateAction(formData: EmailTemplateFormData): Promise<{ success: boolean; template?: EmailTemplate; errors?: z.ZodIssue[] }> {
    const validation = emailTemplateSchema.omit({ id: true }).safeParse(formData);
    if (!validation.success) {
        console.error("Add Template Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        const newTemplate = await dbAddTemplate(validation.data);
        revalidatePath('/communication'); // Revalidate the main communication page
        return { success: true, template: newTemplate };
    } catch (error: any) {
        console.error("Error adding template (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['name'], message: error.message || 'Failed to add template.' }] };
    }
}

export async function updateEmailTemplateAction(id: string, formData: Partial<EmailTemplateFormData>): Promise<{ success: boolean; template?: EmailTemplate; errors?: z.ZodIssue[] }> {
     const validation = emailTemplateSchema.omit({ id: true }).partial().safeParse(formData);
     if (!validation.success) {
         console.error("Update Template Validation Error:", validation.error.flatten());
         return { success: false, errors: validation.error.errors };
     }
    try {
        const updatedTemplate = await dbUpdateTemplate(id, validation.data);
        if (updatedTemplate) {
            revalidatePath('/communication');
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
    try {
        const deleted = await dbDeleteTemplate(id);
        if (deleted) {
            revalidatePath('/communication');
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

export async function getEmailSettingsAction(): Promise<EmailSettings | null> {
    // Important: Do NOT expose password in actions returned to the client
    const settings = await dbGetEmailSettings();
    if (settings) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = settings; // Omit password
        return safeSettings;
    }
    return null;
}

export async function updateEmailSettingsAction(settingsData: EmailSettings): Promise<{ success: boolean; settings?: Omit<EmailSettings, 'smtpPassword'>; errors?: z.ZodIssue[] }> {
    const validation = emailSettingsSchema.safeParse(settingsData);
    if (!validation.success) {
        console.error("Update Settings Validation Error:", validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    try {
        // dbUpdateEmailSettings handles upsert and returns without password
        const updatedSettings = await dbUpdateEmailSettings(validation.data);
        revalidatePath('/communication'); // Revalidate page displaying settings status
        return { success: true, settings: updatedSettings };
    } catch (error: any) {
        console.error("Error updating settings (action):", error);
        return { success: false, errors: [{ code: 'custom', path: ['smtpHost'], message: error.message || 'Failed to save settings.' }] };
    }
}


// --- Test Connection Action ---
export async function testSmtpConnectionAction(settingsData: EmailSettings): Promise<{ success: boolean; message: string }> {
     const validation = emailSettingsSchema.safeParse(settingsData);
     if (!validation.success) {
         return { success: false, message: 'Invalid settings provided.' };
     }

     const settings = validation.data; // Use validated data

    let transportOptions: nodemailer.TransportOptions = {
        host: settings.smtpHost,
        port: settings.smtpPort,
        auth: {
            user: settings.smtpUser,
            pass: settings.smtpPassword, // Use password directly for testing
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
    } else {
        transportOptions.secure = settings.smtpSecure;
    }

    const transporter = nodemailer.createTransport(transportOptions);

    try {
        console.log('[Test Connection Action] Attempting transporter.verify()...');
        await transporter.verify();
        console.log('[Test Connection Action] SMTP connection verified successfully.');
        return { success: true, message: 'Connection successful!' };
    } catch (error: any) {
        console.error('[Test Connection Action] Error:', error);
        // Provide a more user-friendly error message
        let errorMessage = `Connection failed: ${error.message}`;
         if (error.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Check username/password.';
         } else if (error.code === 'ECONNREFUSED') {
             errorMessage = 'Connection refused. Check host, port, and firewall.';
         } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
             errorMessage = 'Connection timed out. Check network, host, and port.';
         } else if (error.code === 'ENOTFOUND') {
             errorMessage = `Hostname '${settings.smtpHost}' not found. Check the host address.`;
         } else if (error.message?.includes('wrong version number')) {
            errorMessage = `SSL/TLS handshake failed. Check port and encryption settings (port ${settings.smtpPort} with secure=${transportOptions.secure}).`;
         }
        return { success: false, message: errorMessage };
    }
}

// --- Send Email Action --- (Placeholder - Needs template engine and recipient logic)
/*
export async function sendEmailAction(to: string, templateId: string, context: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const settings = await dbGetEmailSettings();
    if (!settings) {
        return { success: false, error: "Email settings not configured." };
    }
    const template = await dbGetTemplateById(templateId);
    if (!template) {
        return { success: false, error: "Email template not found." };
    }

    // 1. Configure Nodemailer transporter (similar to test action)
    // ... use settings ...

    // 2. Compile template body and subject with context (using Handlebars, etc.)
    // const compiledSubject = compileTemplate(template.subject, context);
    // const compiledBody = compileTemplate(template.body, context);

    // 3. Send mail
    try {
        await transporter.sendMail({
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: to,
            subject: compiledSubject,
            html: compiledBody, // or text: compiledBody
        });
        return { success: true };
    } catch (error: any) {
        console.error("Error sending email:", error);
        return { success: false, error: error.message || "Failed to send email." };
    }
}
*/
