
import { z } from 'zod';

// --- Email Template ---
export const emailTemplateSchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().uuid(),
  name: z.string().min(3, "Template name must be at least 3 characters"),
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  body: z.string().min(10, "Body must be at least 10 characters"),
  usageContext: z.string().optional().describe("Describes when this template is used (e.g., onboarding, leave_approval)"),
  category: z.string().optional().describe("Helps organize templates (e.g., Onboarding, System, Leave)"), // New field
});

export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
export type EmailTemplateFormData = Omit<EmailTemplate, 'id' | 'tenantId'> & { tenantId?: string };


// --- Email Settings ---
export const emailSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  smtpHost: z.string().min(1, "SMTP Host is required"),
  smtpPort: z.coerce.number().int().positive("SMTP Port must be a positive number"),
  smtpUser: z.string().min(1, "SMTP Username is required"),
  smtpPassword: z.string().min(1, "SMTP Password is required"),
  smtpSecure: z.boolean().default(true).describe("Use TLS/SSL"),
  fromEmail: z.string().email("Invalid 'From' email address"),
  fromName: z.string().min(1, "'From' Name is required"),
});

export type EmailSettings = z.infer<typeof emailSettingsSchema>;

// --- Send Email ---
export const sendEmailSchema = z.object({
  to: z.string().email("Invalid 'To' email address"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Email body cannot be empty"),
});

export type SendEmailFormData = z.infer<typeof sendEmailSchema>;

// --- Connection Status ---
export type ConnectionStatus = 'idle' | 'checking' | 'success' | 'failed' | 'unconfigured';
