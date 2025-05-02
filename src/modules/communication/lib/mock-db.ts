
import type { EmailTemplate, EmailSettings } from '@/modules/communication/types';

// --- Email Templates ---
let emailTemplates: EmailTemplate[] = [
    {
        id: 'tpl-001',
        name: 'Welcome Email',
        subject: 'Welcome to StreamlineHR!',
        body: `Hi {{employeeName}},\n\nWelcome aboard! We're thrilled to have you join the team at StreamlineHR.\n\nYour onboarding process starts now. Please visit your dashboard at {{dashboardLink}} to complete the initial setup.\n\nBest regards,\nThe StreamlineHR Team`,
        usageContext: 'onboarding',
      },
      {
        id: 'tpl-002',
        name: 'Leave Request Approved',
        subject: 'Your Leave Request Has Been Approved',
        body: `Hi {{employeeName}},\n\nYour leave request for {{leaveType}} from {{startDate}} to {{endDate}} has been approved.\n\nApproved by: {{approverName}}\n{{#if comments}}Comments: {{comments}}{{/if}}\n\nEnjoy your time off!\n\nBest,\nHR Department`,
        usageContext: 'leave_approval',
      },
      {
        id: 'tpl-003',
        name: 'Leave Request Rejected',
        subject: 'Update on Your Leave Request',
        body: `Hi {{employeeName}},\n\nUnfortunately, your leave request for {{leaveType}} from {{startDate}} to {{endDate}} could not be approved at this time.\n\nReason: {{comments}}\n\nPlease contact your manager or HR if you have any questions.\n\nRegards,\nHR Department`,
         usageContext: 'leave_rejection',
      },
];

export function getAllTemplates(): EmailTemplate[] {
  return JSON.parse(JSON.stringify(emailTemplates));
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  const template = emailTemplates.find((tpl) => tpl.id === id);
  return template ? JSON.parse(JSON.stringify(template)) : undefined;
}

export function addTemplate(templateData: Omit<EmailTemplate, 'id'>): EmailTemplate {
   const newId = `tpl-${String(emailTemplates.length + 1).padStart(3, '0')}`;
   const newTemplate: EmailTemplate = {
     ...templateData,
     id: newId,
   };
   emailTemplates.push(newTemplate);
   return JSON.parse(JSON.stringify(newTemplate));
}

export function updateTemplate(id: string, updates: Partial<Omit<EmailTemplate, 'id'>>): EmailTemplate | undefined {
  const index = emailTemplates.findIndex((tpl) => tpl.id === id);
  if (index !== -1) {
    emailTemplates[index] = { ...emailTemplates[index], ...updates };
    return JSON.parse(JSON.stringify(emailTemplates[index]));
  }
  return undefined;
}

export function deleteTemplate(id: string): boolean {
  const initialLength = emailTemplates.length;
  emailTemplates = emailTemplates.filter((tpl) => tpl.id !== id);
  return emailTemplates.length < initialLength;
}


// --- Email Settings ---
// In-memory store (will be reset on server restart in dev)
// Initialize with an empty object to signify "not configured yet"
let emailSettings: EmailSettings | {} = {};
console.log(`[Mock DB - Initial State] emailSettings initialized as: ${JSON.stringify(emailSettings)}`);


export function getEmailSettings(): EmailSettings | null {
    console.log('[Mock DB - getEmailSettings] Reading current settings...');
    // Log the raw value of the module-level variable
    const currentSettingsState = emailSettings as EmailSettings | {};
    console.log(`[Mock DB - getEmailSettings] Current raw state of 'emailSettings' variable: ${JSON.stringify(currentSettingsState)}`);

    // Return null if the object is empty, otherwise return a deep copy of the settings
    if (Object.keys(currentSettingsState).length === 0) {
        console.log("[Mock DB - getEmailSettings] Settings object is empty. Returning null.");
        return null;
    } else {
        console.log("[Mock DB - getEmailSettings] Settings object found. Returning a copy.");
        // Assume it has the correct structure; validation happens in the calling API route
        return JSON.parse(JSON.stringify(currentSettingsState)) as EmailSettings;
    }
}


export function updateEmailSettings(settingsData: EmailSettings): EmailSettings {
    // Overwrite existing in-memory settings or create if initially empty
    console.log("[Mock DB - updateEmailSettings] Received data to update settings:", JSON.stringify(settingsData));
    // Ensure we are updating the module-level variable
    emailSettings = { ...settingsData };
    console.log("[Mock DB - updateEmailSettings] Module-level 'emailSettings' variable updated:", JSON.stringify(emailSettings));
    // Return a deep copy
    return JSON.parse(JSON.stringify(emailSettings));
}

// Add a function to clear settings (useful for testing)
export function clearEmailSettings(): void {
    console.log("[Mock DB - clearEmailSettings] Clearing in-memory email settings.");
    emailSettings = {};
    console.log("[Mock DB - clearEmailSettings] Module-level 'emailSettings' variable is now:", JSON.stringify(emailSettings));
}
