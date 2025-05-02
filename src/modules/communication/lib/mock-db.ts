
import type { EmailTemplate, EmailSettings } from '@/modules/communication/types';

// --- Email Templates ---
let emailTemplates: EmailTemplate[] = [
  // ... existing templates ...
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
// Initialize with an empty object to avoid null state after restarts during development.
// The getEmailSettings function will determine if it's actually configured.
let emailSettings: EmailSettings | {} = {};

// Initialize with some default mock data if needed for testing
// emailSettings = {
//     smtpHost: 'smtp.example.com',
//     smtpPort: 587,
//     smtpUser: 'user@example.com',
//     smtpPassword: 'password123',
//     smtpSecure: true,
//     fromEmail: 'noreply@example.com',
//     fromName: 'StreamlineHR System'
// }

export function getEmailSettings(): EmailSettings | null {
    // Check if essential fields exist to determine if configured, before returning
    // Cast to EmailSettings temporarily to check properties safely
    const potentialSettings = emailSettings as EmailSettings;
    if (potentialSettings && potentialSettings.smtpHost && potentialSettings.fromEmail) {
       // Return a deep copy if settings seem configured
       return JSON.parse(JSON.stringify(emailSettings)) as EmailSettings;
    }
    // Return null if the object is empty or missing essential fields
    return null;
}

export function updateEmailSettings(settingsData: EmailSettings): EmailSettings {
    // Overwrite existing settings or create if initially empty
    emailSettings = { ...settingsData };
    // Return a deep copy
    return JSON.parse(JSON.stringify(emailSettings));
}
