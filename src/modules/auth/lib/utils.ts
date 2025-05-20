
import crypto from 'crypto';

/**
 * Generates a temporary password.
 * @param length The length of the password to generate (default: 12).
 * @returns A randomly generated password string.
 */
export function generateTemporaryPassword(length = 12): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let password = "";
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }
    return password;
}
