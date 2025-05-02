# Firebase Studio

This is a NextJS starter in Firebase Studio.

## Getting Started

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Configure Environment Variables:**
    Copy the `.env.example` file (if it exists) to `.env` and fill in your database credentials:
    ```env
    # PostgreSQL Database Configuration
    DB_HOST=your_db_host
    DB_PORT=5432
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    DB_NAME=your_db_name
    # Optional: DB_SSL=true (if required by your DB provider)

    # Google GenAI API Key (Optional - for AI features)
    GOOGLE_GENAI_API_KEY=your_google_ai_api_key

    # Admin Email for Notifications (Optional - for Communication module)
    ADMIN_EMAIL=your_admin_email@example.com
    ```

3.  **Initialize Database Schema:**
    Make sure your PostgreSQL server is running and the database specified in `.env` exists. Then, run the initialization script:
    ```bash
    npm run db:init
    ```
    This command will create the necessary tables (`tenants`, `users`, etc.) if they don't already exist.

4.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

5.  **Register Your First Tenant:**
    Navigate to `http://localhost:9002/register` to create your company account and the initial admin user.

6.  **Login:**
    Go to `http://localhost:9002/login` and log in using the credentials you created during registration.

## Development Notes

-   The application uses `pg` to connect to a PostgreSQL database.
-   Server Actions are used for backend logic (e.g., registration, CRUD operations).
-   API routes handle interactions like data fetching for client components.
-   ShadCN UI components are used for the user interface.
-   Tailwind CSS is used for styling.
-   Genkit is integrated for AI features (like the resume parser).
-   Make sure to restart the development server (`npm run dev`) after changing environment variables in `.env`.
