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
// Import session helpers from auth actions
import { getTenantIdFromSession, isAdminFromSession, sendAdminNotification } from '@/modules/auth/actions';

// --- Helper Functions ---
async function getTenantId(): Promise<string> {
    const tenantId = await getTenantIdFromSession(); // Use new session helper
    if (!tenantId) {
        console.error("[Communication Actions] Tenant context not found in session.");
        throw new Error("Tenant context not found. User may not be authenticated or associated with a tenant.");
    }
    // console.log(`[Communication Actions] Resolved tenantId: ${tenantId}`);
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
    // console.log(`[getEmailSettingsAction] Fetching settings for tenant ${tenantId}...`);
    const settings = await dbGetEmailSettings(tenantId); // This decrypts
    if (settings) {
        // console.log(`[getEmailSettingsAction] Settings found for tenant ${tenantId} (password excluded).`);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { smtpPassword, ...safeSettings } = settings; // Remove password before returning
        return safeSettings;
    }
    // console.log(`[getEmailSettingsAction] No settings found for tenant ${tenantId}.`);
    return null;
}

// Expects full settings data including password (if provided)
export async function updateEmailSettingsAction(settingsData: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; settings?: Omit<EmailSettings, 'smtpPassword'>; errors?: z.ZodIssue[] | { path: (string | number)[]; message: string }[] }> {
    let tenantId: string;
    try {
        tenantId = await getTenantId();
        console.log(`[updateEmailSettingsAction] Retrieved tenantId from session: ${tenantId}`); // Log retrieved tenantId
    } catch (authError: any) {
         console.error(`[updateEmailSettingsAction] Auth Error fetching tenantId: ${authError.message}`);
         return { success: false, errors: [{ path: ['root'], message: 'Authentication failed: ' + authError.message }] };
    }
    console.log(`[updateEmailSettingsAction] Attempting to update settings for tenant ${tenantId}`);

    // Determine if a password was actually provided (not just the placeholder)
    const isPasswordProvided = settingsData.smtpPassword && settingsData.smtpPassword !== '******';

    // Adjust validation schema based on whether a password is being provided
    const schemaToUse = isPasswordProvided
        ? emailSettingsSchema.omit({ tenantId: true }) // Require password if provided
        : emailSettingsSchema.omit({ tenantId: true, smtpPassword: true }); // Make password optional if not provided

    const validation = schemaToUse.safeParse(settingsData);

    if (!validation.success) {
        console.error(`[updateEmailSettingsAction] Validation Error for tenant ${tenantId}:`, validation.error.flatten());
        return { success: false, errors: validation.error.errors };
    }
    console.log(`[updateEmailSettingsAction] Validation successful for tenant ${tenantId}.`);

    // Prepare data for saving, potentially fetching existing encrypted password
    let dataToSave: Omit<EmailSettings, 'tenantId'> | null = null;

    if (isPasswordProvided) {
        // New password provided, use the validated data directly
        dataToSave = validation.data as Omit<EmailSettings, 'tenantId'>;
         console.log(`[updateEmailSettingsAction] New password provided for tenant ${tenantId}.`);
    } else {
        // Password field was empty or placeholder, fetch existing encrypted password
         console.log(`[updateEmailSettingsAction] Password field empty/placeholder for tenant ${tenantId}. Fetching existing settings...`);
        try {
            // Fetch full settings including decrypted password
            const existingSettings = await dbGetEmailSettings(tenantId);

            if (existingSettings?.smtpPassword) {
                 console.log(`[updateEmailSettingsAction] Using existing password for tenant ${tenantId}.`);
                 // Combine validated form data (without password) with existing password
                 dataToSave = {
                     ...(validation.data as Omit<EmailSettings, 'tenantId' | 'smtpPassword'>), // Cast to exclude password field
                     smtpPassword: existingSettings.smtpPassword, // Use existing decrypted password
                 };
            } else {
                 // No existing password found, and none provided now.
                 // If settings are being created, password IS required.
                 if (!existingSettings) {
                      console.error(`[updateEmailSettingsAction] Password required for initial setup but not provided for tenant ${tenantId}.`);
                      return { success: false, errors: [{ path: ['smtpPassword'], message: 'SMTP Password is required for initial setup.' }] };
                 } else {
                     // Existing settings found, but no password. Indicates data issue. Require password again.
                     console.error(`[updateEmailSettingsAction] Existing settings found but no password stored for tenant ${tenantId}. Password must be provided.`);
                     return { success: false, errors: [{ path: ['smtpPassword'], message: 'Existing password not found. Please provide the SMTP password.' }] };
                 }
            }
        } catch (fetchError: any) {
            console.error(`[updateEmailSettingsAction] Error fetching existing settings for tenant ${tenantId}:`, fetchError);
            return { success: false, errors: [{ path: ['root'], message: `Failed to retrieve existing settings: ${fetchError.message}` }] };
        }
    }

    if (!dataToSave) {
        // Should not happen if logic above is correct, but as a safeguard
        console.error(`[updateEmailSettingsAction] Failed to prepare data for saving for tenant ${tenantId}.`);
        return { success: false, errors: [{ path: ['root'], message: 'Internal error preparing settings data.' }] };
    }


    try {
        // Log the tenantId being passed to the DB function just before the call
        console.log(`[updateEmailSettingsAction] Calling dbUpdateEmailSettings with tenantId: ${tenantId} and data (password masked):`, JSON.stringify({ ...dataToSave, smtpPassword: '***' }));
        // dbUpdateEmailSettings encrypts before saving and returns WITHOUT password
        const updatedSafeSettings = await dbUpdateEmailSettings(tenantId, dataToSave);
        console.log(`[updateEmailSettingsAction] Settings updated successfully for tenant ${tenantId}. Revalidating path.`);
        revalidatePath(`/${tenantId}/communication`);
        return { success: true, settings: updatedSafeSettings };
    } catch (error: any) {
        // Log the detailed error including potentially the DB error code
        console.error(`[updateEmailSettingsAction] Error updating settings for tenant ${tenantId} (action):`, error.message, error.code ? `(Code: ${error.code})` : '', error); // Log full error

        // Provide a more specific error message if possible
        let errorMessage = error.message || 'Failed to save settings.';
        let errorPath: (string | number)[] = ['root']; // Default path

        // Check for specific PostgreSQL error codes or messages
        if (error.code === '23503' && error.message?.includes('email_configuration_tenant_id_fkey')) {
             errorMessage = 'Tenant association failed. The specified tenant does not exist.';
        } else if (error.message?.includes('Encryption key is missing')) {
             errorMessage = 'Server configuration error: Encryption key is missing.';
        } else if (error.message?.includes('Failed to encrypt password')) {
             errorMessage = 'Server error: Could not secure password.';
        }

        return { success: false, errors: [{ path: errorPath, message: errorMessage }] };
    }
}


// --- Test Connection Action ---
// Accepts optional settings from the form for testing *before* saving.
// If settings are not provided, it fetches the saved settings from the DB.
export async function testSmtpConnectionAction(settings?: Omit<EmailSettings, 'tenantId'>): Promise<{ success: boolean; message: string }> {
     let tenantId: string;
     try {
         tenantId = await getTenantId();
     } catch (authError: any) {
         console.error(`[Test Connection Action] Auth Error: ${authError.message}`);
         return { success: false, message: 'Authentication failed: ' + authError.message };
     }
     console.log(`[Test Connection Action] Testing connection for tenant: ${tenantId}. Settings provided: ${!!settings}`);

     let completeSettings: EmailSettings | null = null;

     if (settings) {
        // Settings provided from form, use them directly (password might be plain text)
        // Validate the provided settings
        const validation = emailSettingsSchema.omit({ tenantId: true }).safeParse(settings);
        if (!validation.success) {
            console.error(`[Test Connection Action] Provided settings are invalid for tenant ${tenantId}:`, validation.error.flatten());
            return { success: false, message: "Provided SMTP settings are incomplete or invalid." };
        }
        completeSettings = { ...validation.data, tenantId }; // Add tenantId back
        console.log(`[Test Connection Action] Using provided settings for test (password masked).`);
     } else {
         // No settings provided, fetch from DB
         try {
             console.log(`[Test Connection Action] Fetching email settings from DB for tenant ${tenantId}...`);
             completeSettings = await dbGetEmailSettings(tenantId); // Fetches and decrypts

             if (!completeSettings || !completeSettings.smtpHost || !completeSettings.smtpPort || !completeSettings.smtpUser || !completeSettings.smtpPassword) {
                 console.warn(`[Test Connection Action] Incomplete or no settings found in DB for tenant ${tenantId}.`);
                 // Provide clearer error messages based on what's missing
                 if (!completeSettings) {
                     return { success: false, message: "SMTP settings are not configured. Please save your settings first." };
                 } else {
                      let missing = [];
                      if (!completeSettings.smtpHost) missing.push('Host');
                      if (!completeSettings.smtpPort) missing.push('Port');
                      if (!completeSettings.smtpUser) missing.push('Username');
                      if (!completeSettings.smtpPassword) missing.push('Password');
                      return { success: false, message: `Stored SMTP settings are incomplete (missing: ${missing.join(', ')}). Please update and save.` };
                 }
             }

             // Re-validate fetched settings (optional but good practice)
             const dbValidation = emailSettingsSchema.safeParse(completeSettings);
             if (!dbValidation.success) {
                 console.error(`[Test Connection Action] Fetched settings from DB are structurally invalid for tenant ${tenantId}:`, dbValidation.error.flatten());
                 return { success: false, message: "Stored SMTP settings are structurally invalid." };
             }
             console.log(`[Test Connection Action] Using validated settings from DB for test (password masked).`);

         } catch (error: any) {
             console.error(`[Test Connection Action] Error fetching or validating settings for tenant ${tenantId}:`, error);
             return { success: false, message: `Failed to retrieve settings: ${error.message}` };
         }
     }


    // --- Connection Test Logic (using completeSettings) ---
    let transportOptions: nodemailer.TransportOptions = {
        host: completeSettings.smtpHost,
        port: completeSettings.smtpPort,
        auth: {
            user: completeSettings.smtpUser,
            pass: completeSettings.smtpPassword, // Use the (potentially decrypted) password
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        logger: process.env.NODE_ENV === 'development',
        debug: process.env.NODE_ENV === 'development',
    };

    // Automatically configure secure/requireTLS based on common ports or explicit setting
     if (completeSettings.smtpPort === 465) {
        transportOptions.secure = true;
         console.log('[Test Connection Action] Using secure=true for port 465');
     } else if (completeSettings.smtpPort === 587) {
        transportOptions.secure = false; // Often needs STARTTLS
        transportOptions.requireTLS = true; // Explicitly require STARTTLS
         console.log('[Test Connection Action] Using secure=false, requireTLS=true for port 587');
     } else {
         // For other ports, rely on the saved smtpSecure value
         transportOptions.secure = completeSettings.smtpSecure;
         console.warn(`[Test Connection Action] Using provided 'secure' value (${completeSettings.smtpSecure}) for non-standard port ${completeSettings.smtpPort}. Verify provider requirements.`);
     }


    const transporter = nodemailer.createTransport(transportOptions);

    try {
        console.log('[Test Connection Action] Attempting transporter.verify()...');
        await transporter.verify();
        console.log('[Test Connection Action] SMTP connection verified successfully.');
        return { success: true, message: 'Connection successful!' };
    } catch (error: any) {
        console.error('[Test Connection Action] Verify Error:', error.message, error.code); // Log code as well
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
            errorMessage = `SSL/TLS Handshake failed. Check port (${completeSettings.smtpPort}) and encryption settings (Secure: ${transportOptions.secure}). Details: ${error.message}`;
         } else if (error.responseCode && error.response) {
            errorMessage = `SMTP Server Error (${error.responseCode}): ${error.response}`;
         }
        // Append original message if not already included for more context
        if (error.message && !errorMessage.includes(error.message)) {
            errorMessage += ` (Details: ${error.message})`;
        }
        // Send admin notification on failure
        await sendAdminNotification(
             `SMTP Test Connection Failed (Tenant: ${tenantId})`,
             `Tenant: ${tenantId}\nHost: ${completeSettings.smtpHost}:${completeSettings.smtpPort}\nError: ${errorMessage}`
         );
        return { success: false, message: errorMessage };
    }
}

// --- Send Email Action ---
export async function sendEmailAction(data: { to: string; subject: string; body: string }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    let tenantId: string;
     try {
         tenantId = await getTenantId();
     } catch (authError: any) {
         console.error(`[Send Email Action] Auth Error: ${authError.message}`);
         return { success: false, error: 'Authentication failed: ' + authError.message };
     }
    console.log(`[Send Email Action] Attempting to send email for tenant ${tenantId}...`);

    let settings: EmailSettings | null = null;
    try {
        settings = await dbGetEmailSettings(tenantId); // Fetch decrypted settings
        // Add more specific checks for required fields
        if (!settings || !settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPassword || !settings.fromEmail || !settings.fromName) {
             console.error(`[Send Email Action] Incomplete settings for tenant ${tenantId}.`);
             let missing = [];
             if (!settings) missing.push('All Settings');
             else {
                 if (!settings.smtpHost) missing.push('Host');
                 if (!settings.smtpPort) missing.push('Port');
                 if (!settings.smtpUser) missing.push('Username');
                 if (!settings.smtpPassword) missing.push('Password');
                 if (!settings.fromEmail) missing.push('From Email');
                 if (!settings.fromName) missing.push('From Name');
             }
             // Corrected error message to guide the user
             throw new Error(`Email sending is not configured or settings are incomplete (Missing: ${missing.join(', ')}). Please check and save SMTP details in Communication Settings.`);
        }
        console.log(`[Send Email Action] Using settings for ${settings.smtpHost}:${settings.smtpPort}`);
    } catch (error: any) {
        console.error(`[Send Email Action] Error fetching settings for tenant ${tenantId}:`, error);
        // Return the specific error message from settings check/fetch
        return { success: false, error: error.message || `Failed to retrieve email configuration.` };
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
    if (settings.smtpPort === 465) {
        transportOptions.secure = true;
    } else if (settings.smtpPort === 587) {
        transportOptions.secure = false;
        transportOptions.requireTLS = true;
    } else {
        transportOptions.secure = settings.smtpSecure;
    }


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
        console.error(`[Send Email Action] Error sending email for tenant ${tenantId}:`, error.message, error.code); // Log code
         let errorMessage = `Failed to send email: ${error.message}`;
          if (error.code === 'EAUTH') {
            errorMessage = `SMTP Authentication failed. Check credentials. (Details: ${error.message})`;
          } else if (error.code === 'ECONNREFUSED') {
             errorMessage = `Connection refused. Check host/port/firewall. (Details: ${error.message})`;
          } // Add more specific error handling as in test connection
        return { success: false, error: errorMessage };
    }
}
