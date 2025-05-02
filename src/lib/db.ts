import { Pool } from 'pg';

// Ensure environment variables are loaded
// DB_PORT is made optional as it has a default fallback
// DB_PASSWORD is changed to DB_PASS to match user's .env
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error(`FATAL ERROR: Missing required database environment variables: ${missingEnvVars.join(', ')}`);
    // In a real app, you might want to throw an error or exit,
    // but for Next.js build process, console error might be better initially.
    // process.exit(1); // Exit if critical env vars are missing
    throw new Error(`Missing required database environment variables: ${missingEnvVars.join(', ')}`);
}

let pool: Pool;

try {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10), // Keep default for port
      user: process.env.DB_USER,
      password: process.env.DB_PASS, // Use DB_PASS
      database: process.env.DB_NAME,
      // Optional: Add SSL configuration if required for your database connection
      // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false, // Example SSL config
      connectionTimeoutMillis: 5000, // Time to wait for connection (ms)
      idleTimeoutMillis: 10000, // Time client can be idle before closing (ms)
      max: 10, // Max number of clients in the pool
    });

    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
      // Recommended to implement reconnection logic or graceful shutdown
      // process.exit(-1); // Consider if exiting is appropriate for your deployment
    });

    console.log(`Database pool created for ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`);

} catch (error) {
     console.error('FATAL ERROR: Failed to create database pool.', error);
     // Throw error to prevent application from starting without DB pool
     throw new Error('Failed to create database pool.');
}


export default pool;

// Function to test the connection (more robust error handling)
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
    } catch (err: any) { // Catch as any to access error properties
        console.error('Database connection failed:', err.message); // Log only the message
        // Provide more specific error messages
        let friendlyMessage = 'Database connection failed.';
        if (err.code === 'ECONNREFUSED') {
            friendlyMessage = `Connection refused at ${err.address}:${err.port}. Ensure the database server is running and accessible.`;
        } else if (err.code === 'ENOTFOUND') {
            friendlyMessage = `Database host not found (${process.env.DB_HOST}). Check DB_HOST and DNS.`;
        } else if (err.code === 'ETIMEDOUT') {
             friendlyMessage = 'Database connection timed out. Check network and server status.';
        } else if (err.code === '28P01') { // invalid_password (PostgreSQL specific)
             friendlyMessage = 'Database authentication failed. Check DB_USER and DB_PASS.'; // Updated message
        } else if (err.code === '3D000') { // invalid_catalog_name (database doesn't exist)
             friendlyMessage = `Database "${process.env.DB_NAME}" does not exist. Check DB_NAME.`;
        }
        // Consider adding more specific PG error codes
        console.error(`[DB Test Error Details] Code: ${err.code}, Message: ${err.message}`);
        // Do NOT throw here, return status instead
        return { success: false, message: friendlyMessage, error: err };
    } finally {
        if (client) {
            client.release(); // Ensure client is released back to the pool
            console.log('Database client released after test.');
        }
    }
}
