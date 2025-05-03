import { NextRequest, NextResponse } from 'next/server';
import { getEmployees as getEmployeesAction, addEmployee } from '@/modules/employees/actions';
import { employeeSchema, EmployeeFormData } from '@/modules/employees/types'; // Ensure EmployeeFormData is imported if used in POST
// Removed import of getTenantId util, actions now handle tenant context internally via auth
// import { getTenantId } from '../utils/get-tenant-id';
import { getTenantIdFromAuth } from '@/lib/auth'; // Import auth helper directly if needed for API layer context/logging (optional)

export async function GET(request: NextRequest) {
  let tenantIdForContext: string | null = null; // For logging/error context
  try {
    // Although the action uses getTenantIdFromAuth internally,
    // we might want it here for logging or pre-checks if needed.
    // Let's get it for context, but the action is the source of truth for the DB query.
    tenantIdForContext = await getTenantIdFromAuth();
    // Optional: Add a check here if needed, though action should handle it
    if (!tenantIdForContext) {
         console.error('GET /api/employees - Tenant context could not be determined from request.');
         // Return a more specific error than the generic 500 the action might throw
         return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
    }

    console.log(`GET /api/employees - Fetching employees for tenant context: ${tenantIdForContext}`);
    // Call the server action which handles its own tenant resolution and data fetching
    const employees = await getEmployeesAction();
    return NextResponse.json(employees);

  } catch (error: any) { // Catch errors from the action or tenant resolution
    console.error(`Error fetching employees (API) for tenant context ${tenantIdForContext || 'unknown'}:`, error);

    let message = 'Failed to fetch employees due to an internal server error.';
    let status = 500;

    // Handle specific errors (like auth errors from action or DB connection issues)
    if (error.message?.includes('Tenant context not found') || error.message?.includes('Tenant ID is required')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401;
    } else if (error.message?.includes('invalid input syntax for type uuid')) {
        // This indicates the tenantId passed to the DB was invalid (shouldn't happen if auth works)
        message = 'Internal server error: Invalid tenant identifier.';
        status = 500; // Keep as 500, client shouldn't see UUID details
        console.error("UUID Syntax Error - Check how tenantId is being passed to DB query.");
    }
    // Add DB connection error checks if needed (though action/db layer might handle)
    else if (error.code) {
        switch (error.code) {
            case 'ECONNREFUSED': message = `Database connection refused.`; status = 503; break;
            case 'ENOTFOUND': message = `Database host not found.`; status = 503; break;
            case 'ETIMEDOUT': message = 'Database connection timed out.'; status = 504; break;
            default: message = error.message || message; break;
        }
    } else {
         message = error.message || message;
    }

    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
  let tenantIdForContext: string | null = null; // For logging/error context
  try {
    // Get tenant context for validation if needed, but action derives it for insertion
    tenantIdForContext = await getTenantIdFromAuth();
    if (!tenantIdForContext) {
        return NextResponse.json({ error: 'Unauthorized or tenant context missing.' }, { status: 401 });
    }

    const body = await request.json();

    // Validation should happen within the action using tenantId from auth.
    // We don't need to validate tenantId here.
    // const validation = employeeSchema.safeParse(body); // This schema requires tenantId
    // Instead, pass the raw form data (without tenantId) to the action.
    const formData = body as Omit<EmployeeFormData, 'tenantId'>;

    // Call the server action to add the employee (action handles tenantId and validation)
    const result = await addEmployee(formData);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee, { status: 201 });
    } else {
      // Use the errors from the action if available
       console.error(`POST /api/employees Action Error for tenant ${tenantIdForContext}:`, result.errors);
       let errorMessage = result.errors?.[0]?.message || 'Failed to add employee';
       let statusCode = 400; // Default bad request for validation errors

       // Check for specific errors from the action
       if (errorMessage.includes('Email address already exists')) {
            statusCode = 409; // Conflict
       } else if (errorMessage.includes('Tenant context not found') || errorMessage.includes('Tenant ID is missing')) {
           statusCode = 401; // Unauthorized / Bad Context
           errorMessage = 'Unauthorized or missing tenant context.';
       } else if (result.errors?.some((e: any) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(e.code || ''))) {
            // Handle DB errors passed from the action
            const dbError = result.errors.find((e: any) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(e.code || ''));
            if (dbError) {
                if (dbError.code === 'ECONNREFUSED') errorMessage = `Database connection refused.`;
                else if (dbError.code === 'ENOTFOUND') errorMessage = `Database host not found.`;
                else if (dbError.code === 'ETIMEDOUT') errorMessage = `Database connection timed out.`;
                statusCode = 503; // Service Unavailable
            }
       } else if (!result.errors) {
           statusCode = 500; // Internal server error if no specific errors array
           errorMessage = 'An unexpected error occurred while adding the employee.';
       }

      return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error adding employee (API) for tenant ${tenantIdForContext || 'unknown'}:`, error);
    let message = 'Internal server error';
    let status = 500;
    if (error instanceof SyntaxError) {
       message = 'Invalid JSON payload';
       status = 400;
    } else if (error.message?.includes('Tenant context not found')) {
        message = 'Unauthorized or tenant context missing.';
        status = 401;
    }
     // Catching potential DB connection errors directly in POST (less likely now handled by action)
     else if (error.code === 'ECONNREFUSED') { message = `Database connection refused.`; status = 503; }
     else if (error.code === 'ENOTFOUND') { message = `Database host not found.`; status = 503; }
     else if (error.code === 'ETIMEDOUT') { message = 'Database connection timed out.'; status = 504; }
     else { message = error.message || message; }

    return NextResponse.json({ error: message }, { status: status });
  }
}
