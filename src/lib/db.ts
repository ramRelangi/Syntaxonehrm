import { Pool } from 'pg';

// Log found environment variables (masking password) for debugging
console.log(`[DB Init] Checking environment variables...`);
console.log(`[DB Init] DB_HOST: ${process.env.DB_HOST ? 'found' : 'MISSING'}`);
console.log(`[DB Init] DB_PORT: ${process.env.DB_PORT ? `found (${process.env.DB_PORT})` : 'MISSING (using default 5432)'}`);
console.log(`[DB Init] DB_USER: ${process.env.DB_USER ? 'found' : 'MISSING'}`);
console.log(`[DB Init] DB_PASS: ${process.env.DB_PASS ? 'found (masked)' : 'MISSING'}`);
console.log(`[DB Init] DB_NAME: ${process.env.DB_NAME ? 'found' : 'MISSING'}`);

// Ensure environment variables are loaded
// DB_PORT is made optional as it has a default fallback
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    const errorMessage = `Missing required database environment variables: ${missingEnvVars.join(', ')}. Please ensure they are set in your .env file and the server has been restarted.`;
    console.error(`FATAL ERROR: ${errorMessage}`);
    throw new Error(errorMessage);
}

// Function to create and configure the database pool
function createDbPool(): Pool {
    try {
        const newPool = new Pool({
            host: process.env.DB_HOST!, // Use non-null assertion after check
            port: parseInt(process.env.DB_PORT || '5432', 10),
            user: process.env.DB_USER!,
            password: process.env.DB_PASS!,
            database: process.env.DB_NAME!,
            connectionTimeoutMillis: 5000, // Time to wait for connection (ms)
            idleTimeoutMillis: 10000, // Time client can be idle before closing (ms)
            max: 10, // Max number of clients in the pool
        });

        newPool.on('error', (err, client) => {
            console.error('Unexpected error on idle PostgreSQL client', err);
            // Consider if exiting is appropriate for your deployment
            // process.exit(-1);
        });

        console.log(`Database pool created for ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`);
        return newPool;
    } catch (error) {
        console.error('FATAL ERROR: Failed to create database pool.', error);
        // Throw error to prevent application from starting without DB pool
        throw new Error('Failed to create database pool.');
    }
}

// Initialize the pool once using the creation function
const pool: Pool = createDbPool();

// Export the initialized pool instance
export default pool;

// Function to test the connection (more robust error handling)
export async function testDbConnection() {
    let client;
    try {
        console.log('Attempting to connect to the database...');
        client = await pool.connect(); // Use the exported pool instance
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
            friendlyMessage = `Connection refused at ${process.env.DB_HOST}:${process.env.DB_PORT || '5432'}. Ensure the database server is running and accessible.`;
        } else if (err.code === 'ENOTFOUND') {
            friendlyMessage = `Database host not found (${process.env.DB_HOST}). Check DB_HOST and DNS.`;
        } else if (err.code === 'ETIMEDOUT') {
             friendlyMessage = 'Database connection timed out. Check network and server status.';
        } else if (err.code === '28P01') { // invalid_password (PostgreSQL specific)
             friendlyMessage = 'Database authentication failed. Check DB_USER and DB_PASS.';
        } else if (err.code === '3D000') { // invalid_catalog_name (database doesn't exist)
             friendlyMessage = `Database "${process.env.DB_NAME}" does not exist. Please create it or check DB_NAME.`;
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
