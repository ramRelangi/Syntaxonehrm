import { Pool } from 'pg';

// Ensure environment variables are loaded (consider dotenv if not using Next.js built-in)
if (!process.env.DB_HOST || !process.env.DB_PORT || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    console.error("FATAL ERROR: Missing required database environment variables.");
    // In a real app, you might want to throw an error or exit,
    // but for Next.js build process, console error might be better initially.
    // throw new Error("Missing required database environment variables.");
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Optional: Add SSL configuration if required for your database connection
  // ssl: {
  //   rejectUnauthorized: false // Or configure with certs as needed
  // }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  // Recommended to exit the process or implement reconnection logic
  process.exit(-1);
});

console.log(`Database pool created for ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

export default pool;

// Optional: Function to test the connection
export async function testDbConnection() {
    let client;
    try {
        console.log('Attempting to connect to the database...');
        client = await pool.connect();
        console.log('Database connection successful!');
        // Optionally run a simple query
        // const res = await client.query('SELECT NOW()');
        // console.log('Current time from DB:', res.rows[0].now);
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err; // Re-throw for callers to handle
    } finally {
        if (client) {
            client.release(); // Ensure client is released back to the pool
            console.log('Database client released.');
        }
    }
}
