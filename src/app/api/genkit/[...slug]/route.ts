import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { NextRequest } from "next/server";
import { defineFlow, ai } from "genkit"; // Use ai from instance
import { z } from 'zod';
import { handleRequest } from "@genkit-ai/next";
import { ParseResumeInputSchema, ParseResumeOutputSchema } from '@/modules/ai/flows/smart-resume-parser';

// Import ai instance - Ensure this initializes Genkit correctly
import '@/modules/ai/lib/ai-instance';

// Define the prompt directly in the API route file
const parseResumePrompt = ai.definePrompt({
  name: 'parseResumePrompt',
  input: { schema: ParseResumeInputSchema },
  output: { schema: ParseResumeOutputSchema },
  prompt: `You are an expert resume parser. Extract key information from the resume provided.

Resume: {{media url=resumeDataUri}}

Output the following information in JSON format:
- name: The name of the candidate.
- contactDetails: An object containing the email, phone, and LinkedIn profile URL of the candidate. If a field is not found, omit it or set it to null.
- skills: A list of skills possessed by the candidate. If none are found, return an empty array.
- experience: A list of previous job experiences (company, title, duration if available) of the candidate. Summarize each role briefly. If none are found, return an empty array.
`,
});

// Define the flow using the prompt
const parseResumeFlow = ai.defineFlow(
  {
    name: 'parseResumeFlow', // This name will be part of the URL: /api/ai/parseResumeFlow
    inputSchema: ParseResumeInputSchema,
    outputSchema: ParseResumeOutputSchema,
  },
  async (input) => {
    const { output } = await parseResumePrompt(input);
    if (!output) {
      throw new Error("Resume parsing failed to produce output.");
    }
    return output;
  }
);

// Export the flow for handleRequest
export { parseResumeFlow };

// Define the POST handler using handleRequest
export async function POST(req: NextRequest) {
    console.log(`Handling POST request for: ${req.nextUrl.pathname}`); // Log incoming request path
    const result = await handleRequest({ req });
    if (!result) {
        console.error(`No result from handleRequest for: ${req.nextUrl.pathname}`);
        return new Response(JSON.stringify({ error: 'Flow not found or invalid request' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    console.log(`handleRequest result status: ${result.status}`);
    return new Response(result.body, result);
}

// Optional: Add GET handler for testing or listing flows if needed
// export async function GET(req: NextRequest) {
//    return NextResponse.json({ message: "Genkit AI endpoint. Use POST for flows." });
// }
