
import type { EmailTemplate } from '@/modules/communication/types';

// Simple in-memory store for email templates
let emailTemplates: EmailTemplate[] = [
  {
    id: 'tpl-001',
    name: 'Welcome Email',
    subject: 'Welcome to StreamlineHR!',
    body: `Hi {{employeeName}},

Welcome aboard! We're thrilled to have you join the team at StreamlineHR.

Your onboarding process starts now. Please visit your dashboard at {{dashboardLink}} to complete the initial setup.

Best regards,
The StreamlineHR Team`,
    usageContext: 'onboarding',
  },
  {
    id: 'tpl-002',
    name: 'Leave Request Approved',
    subject: 'Your Leave Request Has Been Approved',
    body: `Hi {{employeeName}},

Your leave request for {{leaveType}} from {{startDate}} to {{endDate}} has been approved.

Approved by: {{approverName}}
{{#if comments}}Comments: {{comments}}{{/if}}

Enjoy your time off!

Best,
HR Department`,
    usageContext: 'leave_approval',
  },
  {
    id: 'tpl-003',
    name: 'Leave Request Rejected',
    subject: 'Update on Your Leave Request',
    body: `Hi {{employeeName}},

Unfortunately, your leave request for {{leaveType}} from {{startDate}} to {{endDate}} could not be approved at this time.

Reason: {{comments}}

Please contact your manager or HR if you have any questions.

Regards,
HR Department`,
     usageContext: 'leave_rejection',
  },
];

// --- Mock Database Operations ---

export function getAllTemplates(): EmailTemplate[] {
  // Return a deep copy to prevent direct modification
  return JSON.parse(JSON.stringify(emailTemplates));
}

export function getTemplateById(id: string): EmailTemplate | undefined {
  const template = emailTemplates.find((tpl) => tpl.id === id);
  // Return a deep copy
  return template ? JSON.parse(JSON.stringify(template)) : undefined;
}

export function addTemplate(templateData: Omit<EmailTemplate, 'id'>): EmailTemplate {
   const newId = `tpl-${String(emailTemplates.length + 1).padStart(3, '0')}`;
   const newTemplate: EmailTemplate = {
     ...templateData,
     id: newId,
   };
   emailTemplates.push(newTemplate);
   // Return a deep copy
   return JSON.parse(JSON.stringify(newTemplate));
}

export function updateTemplate(id: string, updates: Partial<Omit<EmailTemplate, 'id'>>): EmailTemplate | undefined {
  const index = emailTemplates.findIndex((tpl) => tpl.id === id);
  if (index !== -1) {
    emailTemplates[index] = { ...emailTemplates[index], ...updates };
     // Return a deep copy
    return JSON.parse(JSON.stringify(emailTemplates[index]));
  }
  return undefined;
}

export function deleteTemplate(id: string): boolean {
  const initialLength = emailTemplates.length;
  // Simple filter deletion
  emailTemplates = emailTemplates.filter((tpl) => tpl.id !== id);
  return emailTemplates.length < initialLength;
}
