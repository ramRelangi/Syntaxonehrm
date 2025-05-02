
import { Pool } from 'pg';


// Load environment variables from .env file - REMOVED explicit dotenv.config()
// dotenv.config();
console.log('db.ts is being loaded');
console.log('DB_HOST:', process.env.DB_HOST ? '******' : 'Not Set'); // Avoid logging sensitive info
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASS:', process.env.DB_PASS ? '******' : 'Not Set'); // Avoid logging sensitive info
console.log('DB_NAME:', process.env.DB_NAME);

// Ensure required environment variables are loaded
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  const errorMessage = `Missing required database environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env file and the server has been restarted.`;
  console.error(`FATAL ERROR: ${errorMessage}`);
  // Throwing here might prevent the app from starting, ensure variables are set
  throw new Error(errorMessage);
}

let pool: Pool;

try {
  pool = new Pool({
    host: process.env.DB_HOST,
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
    `Database pool created for ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`
  );
} catch (error) {
  console.error('FATAL ERROR: Failed to create database pool.', error);
  // Rethrow or handle appropriately
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
    if (err.code === 'ECONNREFUSED') {
      friendlyMessage = `Connection refused at ${err.address}:${err.port}. Ensure the database server is running and accessible.`;
    } else if (err.code === 'ENOTFOUND') {
      friendlyMessage = `Database host not found (${process.env.DB_HOST}). Check DB_HOST and DNS.`;
    } else if (err.code === 'ETIMEDOUT') {
      friendlyMessage = 'Database connection timed out. Check network and server status.';
    } else if (err.code === '28P01') {
      friendlyMessage = 'Database authentication failed. Check DB_USER and DB_PASS.';
    } else if (err.code === '3D000') {
      friendlyMessage = `Database "${process.env.DB_NAME}" does not exist. Please create it before running the application.`;
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
