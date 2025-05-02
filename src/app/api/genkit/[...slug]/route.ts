import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { NextRequest } from "next/server";
import { defineFlow } from "genkit";
import { z } from "zod";
import { handleRequest } from "@genkit-ai/next";

import '@/modules/ai/flows/smart-resume-parser'; // Ensure your flows are imported from the module

export const config = {
  runtime: 'edge', // Specify the runtime environment
};

// If you haven't initialized Genkit globally (e.g., in ai-instance.ts), do it here.
// Otherwise, make sure your global instance is configured correctly.
// genkit({
//   plugins: [
//     googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY }),
//   ],
//   logLevel: 'debug',
//   enableTracingAndMetrics: true,
// });


// Example flow definition (if not defined elsewhere)
// const menuSuggestionFlow = defineFlow(
//   {
//     name: 'menuSuggestionFlow',
//     inputSchema: z.string(),
//     outputSchema: z.string(),
//   },
//   async (subject) => {
//     // Your flow logic here...
//     return `Suggestions for ${subject}`;
//   }
// );


// Export the flows you want to expose via the API
// export { menuSuggestionFlow };


// Define the POST handler using handleRequest
export async function POST(req: NextRequest) {
  const result = await handleRequest({req});
  if (!result) {
    return new Response(null, { status: 404 });
  }
  return new Response(result.body, result);
}
