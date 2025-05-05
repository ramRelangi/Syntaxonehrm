
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Load environment variables from .env file
dotenv.config();
console.log('db.ts is being loaded');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
// Avoid logging sensitive info
console.log('DB_PASS:', process.env.DB_PASS ? '******' : 'Not Set');
console.log('DB_NAME:', process.env.DB_NAME);

// Ensure required environment variables are loaded
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  const errorMessage = `Missing required database environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env file and the server has been restarted.`;
  console.error(`FATAL ERROR: ${errorMessage}`);
  // Throwing here prevents the app from starting if config is missing
  throw new Error(errorMessage);
}

let pool: Pool;

try {
  // If DB_HOST is 'localhost', explicitly use '127.0.0.1' to avoid potential IPv6 issues
  const dbHost = process.env.DB_HOST === 'localhost' ? '127.0.0.1' : process.env.DB_HOST;
  console.log(`Attempting to connect with host: ${dbHost}`); // Log the host being used

  pool = new Pool({
    host: dbHost,
    port: parseInt(process.env.DB_PORT || '5432', 10), // Default port is 5432
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionTimeoutMillis: 5000, // Time to wait for connection (ms)
    idleTimeoutMillis: 10000, // Time client can be idle before closing (ms)
    max: 10, // Max number of clients in the pool
    // Optional: Add SSL configuration if required
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    // Consider implementing reconnection logic or graceful shutdown
  });

  console.log(
    `Database pool created for ${process.env.DB_USER}@${dbHost}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`
  );
} catch (error) {
  console.error('FATAL ERROR: Failed to create database pool.', error);
  // Re-throw to ensure the application doesn't start in a broken state
  throw new Error('Failed to create database pool.');
}

export default pool;

// Function to test the database connection
export async function testDbConnection() {
  let client;
  try {
    console.log('Attempting to connect to the database...');
    client = await pool.connect();
    console.log('Database connection successful!');
    // Optionally run a simple query
    const res = await client.query('SELECT NOW()');
    console.log('Current time from DB:', res.rows[0].now);
    return { success: true, message: 'Database connection successful!' };
  } catch (err: any) {
    console.error('Database connection failed:', err.message);

    // Provide more specific error messages based on error codes
    let friendlyMessage = 'Database connection failed.';
    const dbHost = process.env.DB_HOST === 'localhost' ? '127.0.0.1' : process.env.DB_HOST; // Use the same host logic
    const dbPort = process.env.DB_PORT || '5432';

    if (err.code === 'ECONNREFUSED') {
      friendlyMessage = `Connection refused at ${dbHost}:${dbPort}. Please ensure the PostgreSQL database server is running and accessible from your application. Check firewall settings and database logs.`;
    } else if (err.code === 'ENOTFOUND') {
      friendlyMessage = `Database host not found (${dbHost}). Check DB_HOST in your .env file and ensure DNS is resolving correctly.`;
    } else if (err.code === 'ETIMEDOUT') {
      friendlyMessage = 'Database connection timed out. Check network connectivity, firewall rules, and if the database server is responding.';
    } else if (err.code === '28P01') {
      friendlyMessage = 'Database authentication failed. Please verify DB_USER and DB_PASS in your .env file.';
    } else if (err.code === '3D000') {
      friendlyMessage = `Database "${process.env.DB_NAME}" does not exist. Please create it or ensure DB_NAME in your .env file is correct.`;
    } else {
        // Include the original error message for other DB errors
        friendlyMessage = `Database error: ${err.message} (Code: ${err.code || 'N/A'})`;
    }

    console.error(`[DB Test Error Details] Code: ${err.code}, Message: ${err.message}`);
    return { success: false, message: friendlyMessage, error: err };
  } finally {
    if (client) {
      client.release(); // Ensure client is released back to the pool
      console.log('Database client released after test.');
    }
  }
}
