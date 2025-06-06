# SyntaxHive Hrm

This is SyntaxHive Hrm.

## Getting Started

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment Variables:**
    Copy the `.env.example` file to `.env`. **Crucially, you must first manually create a PostgreSQL database.** Then, fill in the connection details for your **existing** database and other configurations in the `.env` file:
    ```env
    # PostgreSQL Database Configuration (Ensure this database exists!)
    DB_HOST=your_db_host # Use '127.0.0.1' instead of 'localhost' if you encounter ECONNREFUSED errors
    DB_PORT=5432
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    DB_NAME=your_db_name
    # Optional: DB_SSL=true (if required by your DB provider)

    # Internal SMTP for Registration/Password Reset Emails (Optional, but recommended)
    INTERNAL_SMTP_HOST=your_internal_smtp_host
    INTERNAL_SMTP_PORT=587 # or 465, 25 etc.
    INTERNAL_SMTP_USER=your_internal_smtp_username
    INTERNAL_SMTP_PASSWORD=your_internal_smtp_password
    INTERNAL_SMTP_SECURE=false # Typically false for 587/25, true for 465. Adjust as needed.
    INTERNAL_FROM_EMAIL=noreply@yourdomain.com
    INTERNAL_FROM_NAME="SyntaxHive Hrm System"

    # Google GenAI API Key (Optional - for AI features)
    GOOGLE_GENAI_API_KEY=your_google_ai_api_key

    # Admin Email for Notifications (Optional - for Communication module)
    ADMIN_EMAIL=your_admin_email@example.com

    # Base URL for constructing links (e.g., in emails)
    NEXT_PUBLIC_BASE_URL=http://localhost:9002

    # Root Domain for constructing tenant URLs (e.g., your-company.syntaxhivehrm.app)
    NEXT_PUBLIC_ROOT_DOMAIN=localhost # Change in production to your actual root domain

    # !!! IMPORTANT: Secret key for encrypting sensitive data (e.g., SMTP passwords) !!!
    # Generate a strong, random 32-byte key (e.g., using Node.js crypto.randomBytes(32).toString('hex'))
    # Keep this key secret and do NOT commit it to version control.
    ENCRYPTION_KEY=YOUR_STRONG_SECRET_ENCRYPTION_KEY_HERE_CHANGE_ME
    ```
    **Important:**
     - **`ENCRYPTION_KEY`**: This is crucial for encrypting sensitive data like SMTP passwords stored in the database. You **MUST** generate a strong, unique secret key (e.g., a 32-byte random string). **Do not use the placeholder value.** Keep this key absolutely secret and do not commit it to version control. You can generate one using Node.js: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
     - The database specified by `DB_NAME` must exist on your PostgreSQL server before proceeding. This application **does not** automatically create the root database itself, only tenant-specific tables upon registration.
     - For production, set `NEXT_PUBLIC_ROOT_DOMAIN` to your actual domain (e.g., `syntaxhivehrm.app`). For local development, `localhost` is usually sufficient.
     - **Troubleshooting `ECONNREFUSED` errors:** If you see database connection errors like `ECONNREFUSED ::1:5432` or similar, ensure your PostgreSQL server is running and listening for connections. Try setting `DB_HOST=127.0.0.1` in your `.env` file instead of `localhost`.

3.  **Initialize Global Database Schema (Create Core Tables):**
    Make sure your PostgreSQL server is running and the database specified in `.env` exists. Then, run the schema initialization script:
    ```bash
    npm run db:init
    ```
    This command connects to the existing database specified in `.env` and creates the necessary tables (`tenants`, `users`, `employees`, etc.) if they don't already exist. **Run this command once before starting the application for the first time or after significant database schema changes.**

4.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

5.  **Register Your First Tenant:**
    Navigate to `http://localhost:9002/register` to create your company account and the initial admin user. This step requires the database tables to have been created by `npm run db:init`.

6.  **Login:**
    After registration, you should receive a welcome email (if internal SMTP is configured) with your unique login URL (e.g., `http://your-company.localhost:9002/login`). Use this URL and the credentials you created during registration to log in.

## Development Notes

-   The application uses `pg` to connect to a PostgreSQL database.
-   Sensitive data (like SMTP passwords) is encrypted using `crypto-js` AES. Ensure `ENCRYPTION_KEY` is set correctly in your `.env`.
-   Server Actions are used for backend logic (e.g., registration, CRUD operations).
-   API routes handle interactions like data fetching for client components.
-   ShadCN UI components are used for the user interface.
-   Tailwind CSS is used for styling.
-   Genkit is integrated for AI features (like the resume parser).
-   Multi-tenancy is implemented using subdomains (e.g., `tenant1.syntaxhivehrm.app`, `tenant2.syntaxhivehrm.app`). Middleware handles rewriting requests to the correct tenant context.
-   Make sure to restart the development server (`npm run dev`) after changing environment variables in `.env`.
-   The `npm run db:init` script is crucial for setting up the database tables. Run it after creating your database and configuring `.env`.

