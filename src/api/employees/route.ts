import { NextRequest, NextResponse } from 'next/server';
// Import the DB function directly
import { addEmployee as dbAddEmployee, getAllEmployees as dbGetAllEmployees } from '@/modules/employees/lib/db';
import { employeeSchema, EmployeeFormData } from '@/modules/employees/types';
import { getTenantId } from '@/api/utils/get-tenant-id'; // Keep using API util for tenant context
// Removed server action import for GET
// import { getEmployees as getEmployeesAction, addEmployee } from '@/modules/employees/actions';
import { addEmployee } from '@/modules/employees/actions'; // Keep addEmployee action for POST


export async function GET(request: NextRequest) {
  try {
    console.log(`GET /api/employees - Fetching employees...`);

    // Resolve tenantId using the utility function from the request context
    const tenantId = await getTenantId(request);

    if (!tenantId) {
        console.error(`[API GET /api/employees] Failed to resolve tenant ID from request.`);
        return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 }); // Use 400 for missing context
    }

    // Call the DB function directly with the resolved tenantId
    const employees = await dbGetAllEmployees(tenantId);
    return NextResponse.json(employees);

  } catch (error: any) { // Catch errors from the DB function or tenant resolution
    console.error(`Error fetching employees (API):`, error);

    let message = 'Failed to fetch employees due to an internal server error.';
    let status = 500;

    // Handle specific DB errors
    if (error.code) {
        switch (error.code) {
            case 'ECONNREFUSED': message = `Database connection refused.`; status = 503; break;
            case 'ENOTFOUND': message = `Database host not found.`; status = 503; break;
            case 'ETIMEDOUT': message = 'Database connection timed out.'; status = 504; break;
            // Handle invalid UUID error specifically if tenantId is somehow invalid
            case '22P02': // invalid_text_representation
                 if (error.message?.includes('uuid')) {
                    message = 'Internal server error: Invalid tenant identifier format.';
                    console.error("UUID Syntax Error in GET /api/employees - Check tenantId resolution.");
                 } else {
                     message = `Database error: ${error.message}`;
                 }
                 break;
            default: message = error.message || message; break;
        }
    } else {
         message = error.message || message;
    }

    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log(`POST /api/employees - Adding employee...`); // Simplified log

    // Resolve tenantId for adding the employee
    const tenantId = await getTenantId(request);
    if (!tenantId) {
        console.error(`[API POST /api/employees] Failed to resolve tenant ID from request.`);
        return NextResponse.json({ error: "Tenant ID is required." }, { status: 400 });
    }

    const body = await request.json();

    // Pass the raw form data (without tenantId from body) to the action.
    // The action will derive the tenantId again from its own context (auth) for validation/security.
    // While slightly redundant, it keeps the action self-contained regarding auth context.
    const formData = body as Omit<EmployeeFormData, 'tenantId'>;

    // Call the server action to add the employee
    const result = await addEmployee(formData);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee, { status: 201 });
    } else {
       console.error(`POST /api/employees Action Error:`, result.errors);
       let errorMessage = result.errors?.[0]?.message || 'Failed to add employee';
       let statusCode = 400; // Default bad request for validation errors

       // Check for specific errors from the action
       if (errorMessage.includes('Email address already exists')) {
            statusCode = 409; // Conflict
       } else if (errorMessage.includes('Tenant ID is missing') || errorMessage.includes('Unauthorized')) {
           statusCode = 401; // Unauthorized / Bad Context
           errorMessage = 'Unauthorized or missing tenant context.';
       } else if (result.errors?.some((e: any) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(e.code || ''))) {
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
    console.error(`Error adding employee (API):`, error);
    let message = 'Internal server error';
    let status = 500;
    if (error instanceof SyntaxError) {
       message = 'Invalid JSON payload';
       status = 400;
    } else if (error.message?.includes('Tenant ID is required')) {
        message = 'Tenant ID is required.';
        status = 400;
    }
     // Catching potential DB connection errors directly in POST
     else if (error.code === 'ECONNREFUSED') { message = `Database connection refused.`; status = 503; }
     else if (error.code === 'ENOTFOUND') { message = `Database host not found.`; status = 503; }
     else if (error.code === 'ETIMEDOUT') { message = 'Database connection timed out.'; status = 504; }
     else { message = error.message || message; }

    return NextResponse.json({ error: message }, { status: status });
  }
}
