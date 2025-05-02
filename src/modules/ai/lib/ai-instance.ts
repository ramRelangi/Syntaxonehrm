import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

console.log("Initializing Genkit AI instance...");

// Ensure the API key is being read correctly
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
  console.warn("GOOGLE_GENAI_API_KEY environment variable is not set. Genkit Google AI plugin may not function.");
} else {
  console.log("Google GenAI API Key found.");
}

export const ai = genkit({
  // promptDir: './prompts', // Remove if prompts are defined directly in flows/API routes
  plugins: [
    googleAI({
      apiKey: apiKey, // Pass the potentially undefined key
    }),
  ],
  // Default model for generate calls if not specified
  model: 'googleai/gemini-1.5-flash', // Use a generally available and capable model
  logLevel: 'debug', // Enable debug logging for development
  enableTracingAndMetrics: true, // Enable tracing
});

console.log("Genkit AI instance initialized.");
