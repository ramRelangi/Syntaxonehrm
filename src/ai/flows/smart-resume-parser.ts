'use server';

/**
 * @fileOverview An AI agent for parsing resumes and extracting key information.
 *
 * - parseResume - A function that handles the resume parsing process.
 * - ParseResumeInput - The input type for the parseResume function.
 * - ParseResumeOutput - The return type for the parseResume function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ParseResumeInputSchema = z.object({
  resumeDataUri: z
    .string()
    .describe(
      "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseResumeInput = z.infer<typeof ParseResumeInputSchema>;

const ParseResumeOutputSchema = z.object({
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
  return parseResumeFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseResumePrompt',
  input: {
    schema: z.object({
      resumeDataUri: z
        .string()
        .describe(
          "A resume file, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      name: z.string().describe('The name of the candidate.'),
      contactDetails: z.object({
        email: z.string().email().optional().describe('The email address of the candidate.'),
        phone: z.string().optional().describe('The phone number of the candidate.'),
        linkedin: z.string().optional().describe('The LinkedIn profile URL of the candidate.'),
      }).describe('The contact details of the candidate.'),
      skills: z.array(z.string()).describe('A list of skills possessed by the candidate.'),
      experience: z.array(z.string()).describe('A list of previous job experiences of the candidate.'),
    }),
  },
  prompt: `You are an expert resume parser. Extract key information from the resume provided.

Resume: {{media url=resumeDataUri}}

Output the following information in JSON format:
- name: The name of the candidate.
- contactDetails: An object containing the email, phone, and LinkedIn profile URL of the candidate.
- skills: A list of skills possessed by the candidate.
- experience: A list of previous job experiences of the candidate.
`,
});

const parseResumeFlow = ai.defineFlow<
  typeof ParseResumeInputSchema,
  typeof ParseResumeOutputSchema
>(
  {
    name: 'parseResumeFlow',
    inputSchema: ParseResumeInputSchema,
    outputSchema: ParseResumeOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
