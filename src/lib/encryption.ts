
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  console.error("FATAL ERROR: ENCRYPTION_KEY environment variable is not set. Encryption/decryption will fail.");
  // Optional: throw an error during startup if the key is essential
  // throw new Error("ENCRYPTION_KEY environment variable is not set.");
}

/**
 * Encrypts a plaintext string using AES.
 * @param text The plaintext string to encrypt.
 * @returns The encrypted ciphertext (Base64 encoded). Returns an empty string if encryption key is missing.
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    console.error("Encryption failed: ENCRYPTION_KEY is not set.");
    // Returning empty string or handling this case depends on application logic
    // Throwing an error might be safer in many contexts
    throw new Error("Encryption key is missing.");
    // return '';
  }
  try {
    const ciphertext = CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
    return ciphertext;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data.");
  }
}

/**
 * Decrypts an AES ciphertext string.
 * @param ciphertext The Base64 encoded ciphertext string to decrypt.
 * @returns The original plaintext string. Returns an empty string if decryption key is missing or decryption fails.
 */
export function decrypt(ciphertext: string): string {
  if (!ENCRYPTION_KEY) {
    console.error("Decryption failed: ENCRYPTION_KEY is not set.");
    // Returning empty string or handling this case depends on application logic
    throw new Error("Encryption key is missing.");
    // return '';
  }
  if (!ciphertext) {
      console.warn("Decryption skipped: Ciphertext is empty.");
      return ''; // Handle empty ciphertext gracefully
  }
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) {
        // This can happen if the key is wrong or the ciphertext is corrupted
        console.error("Decryption resulted in empty text. Key might be incorrect or ciphertext corrupted.");
        throw new Error("Decryption failed: Invalid key or corrupted data.");
    }
    return originalText;
  } catch (error) {
    console.error("Decryption error:", error);
    // Instead of returning empty, throw an error to indicate failure clearly
    throw new Error("Failed to decrypt data. Invalid key or corrupted data.");
    // return '';
  }
}
