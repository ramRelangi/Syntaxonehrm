
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
// In-memory store (will be reset on server restart in dev)
let emailSettings: EmailSettings | {} = {};

// Default settings to return if in-memory is empty (simulates persistence for dev)
const defaultMockSettings: EmailSettings = {
    smtpHost: 'smtp.example.com', // Use a placeholder
    smtpPort: 587,
    smtpUser: 'testuser',
    smtpPassword: 'testpassword',
    smtpSecure: true,
    fromEmail: 'noreply@example.com',
    fromName: 'StreamlineHR Mock'
};


export function getEmailSettings(): EmailSettings | null {
    // Check if essential fields exist in the in-memory object
    const potentialSettings = emailSettings as EmailSettings;
    if (potentialSettings && potentialSettings.smtpHost && potentialSettings.fromEmail && potentialSettings.smtpUser && potentialSettings.smtpPassword) {
       // Return a deep copy if in-memory settings seem configured
       console.log("[Mock DB] Returning in-memory email settings.");
       return JSON.parse(JSON.stringify(emailSettings)) as EmailSettings;
    }
    // Return default mock settings if in-memory is empty or incomplete
    // This helps avoid the "not configured" error after server restarts in dev
    console.warn("[Mock DB] In-memory email settings not found or incomplete. Returning default mock settings.");
    return JSON.parse(JSON.stringify(defaultMockSettings));
}

export function updateEmailSettings(settingsData: EmailSettings): EmailSettings {
    // Overwrite existing in-memory settings or create if initially empty
    console.log("[Mock DB] Updating in-memory email settings.");
    emailSettings = { ...settingsData };
    // Return a deep copy
    return JSON.parse(JSON.stringify(emailSettings));
}
