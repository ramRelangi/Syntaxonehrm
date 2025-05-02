
/**
 * @fileOverview Client-side function to call the resume parsing AI flow via API.
 *
 * - parseResume - A function that sends the resume data to the API endpoint.
 * - ParseResumeInput - The input type for the parseResume function.
 * - ParseResumeOutput - The return type expected from the API.
 */

import { z } from 'zod';

// Re-export schemas for use in the client component
export const ParseResumeInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseResumeInput = z.infer<typeof ParseResumeInputSchema>;

export const ParseResumeOutputSchema = z.object({
  name: z.string().describe('The name of the candidate.'),
  contactDetails: z.object({
    email: z.string().email().optional().describe('The email address of the candidate.'),
    phone: z.string().optional().describe('The phone number of the candidate.'),
    linkedin: z.string().optional().describe('The LinkedIn profile URL of the candidate.'),
  }).describe('The contact details of the candidate.'),
  skills: z.array(z.string()).describe('A list of skills possessed by the candidate.'),
  experience: z.array(z.string()).describe('A list of previous job experiences of the candidate.'),
});
export type ParseResumeOutput = z.infer<typeof ParseResumeOutputSchema>;


export async function parseResume(input: ParseResumeInput): Promise<ParseResumeOutput> {
    // Call the Genkit API endpoint
    const response = await fetch('/api/ai/parseResumeFlow', { // Assuming endpoint follows /api/ai/[flowName] convention
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.message || `Failed to parse resume. Status: ${response.status}`);
    }

    const result = await response.json();

    // Optionally validate the result against the output schema
    const validation = ParseResumeOutputSchema.safeParse(result);
    if (!validation.success) {
        console.error("API response validation error:", validation.error);
        throw new Error("Received invalid data format from the resume parser.");
    }

    return validation.data;
}
