
import { NextRequest, NextResponse } from 'next/server';
import { getEmployees, addEmployee } from '@/modules/employees/actions';
import { employeeSchema, EmployeeFormData } from '@/modules/employees/types'; // Ensure EmployeeFormData is imported if used in POST
import { getTenantId } from '../utils/get-tenant-id'; // Import utility

export async function GET(request: NextRequest) {
  const tenantId = await getTenantId(request); // Use utility to get tenantId
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // The action now derives tenantId itself, but we might need it for logging/context
    // For consistency, let's pass it to the action if it accepts it, otherwise remove.
    // Assuming getEmployees action now uses getTenantIdFromAuth(), remove tenantId parameter here.
    // const employees = await getEmployees(tenantId);
    const employees = await getEmployees(); // Call the server action (derives tenant internally)
    return NextResponse.json(employees);
  } catch (error: any) { // Catch as any to access error properties
    console.error(`Error fetching employees for tenant ${tenantId} (API):`, error);

    let message = 'Failed to fetch employees due to an internal server error.';
    let status = 500;

    // Check for specific database connection errors by code
    if (error.code) {
        switch (error.code) {
            case 'ECONNREFUSED':
                message = `Database connection refused at ${error.address}:${error.port}. Please ensure the database server is running and accessible.`;
                status = 503; // Service Unavailable
                break;
            case 'ENOTFOUND':
                 message = `Database host not found (${process.env.DB_HOST}). Please check the DB_HOST environment variable and DNS resolution.`;
                 status = 503;
                 break;
            case 'ETIMEDOUT':
                message = 'Database connection timed out. Please check network connectivity and database server status.';
                status = 504; // Gateway Timeout
                break;
            case 'ERR_MODULE_NOT_FOUND': // Handle potential issues if db module itself fails
                 message = 'Database module failed to load. Check server logs.';
                 status = 500;
                 break;
            // Add more specific PG error codes if needed (e.g., authentication errors)
            // case '28P01': // invalid_password
            //     message = 'Database authentication failed. Check DB_USER and DB_PASSWORD.';
            //     status = 503;
            //     break;
            default:
                 // Use the original error message if available
                 message = error.message || message;
                 break; // Keep status 500 for unspecified errors
        }
    } else {
         // Fallback for non-coded errors
         message = error.message || message;
    }

    return NextResponse.json({ error: message }, { status: status });
  }
}

export async function POST(request: NextRequest) {
  const tenantId = await getTenantId(request); // Use utility to get tenantId
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();

    // Prepare data for validation (action will add tenantId from auth context)
    const employeeData = { ...body };

    // Server-side validation before calling the action (schema expects tenantId, add it here)
    // Although action derives it, validation needs it for the schema check.
    const validationData = { ...employeeData, tenantId }; // Add tenantId for validation step
    const validation = employeeSchema.safeParse(validationData);

    if (!validation.success) {
        console.error("POST /api/employees Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call the server action to add the employee (action derives tenantId internally)
    // Pass data *without* tenantId, as action gets it from auth context.
    const result = await addEmployee(employeeData as Omit<EmployeeFormData, 'tenantId'>);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee, { status: 201 });
    } else {
      // Use the errors from the action if available
       console.error("POST /api/employees Action Error:", result.errors);
       // Return specific error for duplicate email
       if (result.errors?.some(e => e.message?.includes('Email address already exists'))) {
            return NextResponse.json({ error: 'Email address already exists for this tenant.' }, { status: 409 }); // 409 Conflict
       }
       // Handle potential DB connection errors during POST as well
       const dbError = result.errors?.find((e:any) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(e.code || ''));
       if (dbError) {
           let message = dbError.message;
           let status = 503;
           if (dbError.code === 'ECONNREFUSED') message = `Database connection refused. Cannot add employee.`;
           else if (dbError.code === 'ENOTFOUND') message = `Database host not found. Cannot add employee.`;
           else if (dbError.code === 'ETIMEDOUT') message = `Database connection timed out. Cannot add employee.`;
           return NextResponse.json({ error: message }, { status });
       }

      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding employee (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
     // Catching potential DB connection errors directly in POST
     let message = 'Internal server error';
     let status = 500;
      if (error.code === 'ECONNREFUSED') {
          message = `Database connection refused at ${error.address}:${error.port}. Cannot add employee.`;
          status = 503;
      } else if (error.code === 'ENOTFOUND') {
          message = `Database host not found (${process.env.DB_HOST}). Cannot add employee.`;
          status = 503;
      } else if (error.code === 'ETIMEDOUT') {
          message = 'Database connection timed out. Cannot add employee.';
          status = 504;
      } else {
          message = error.message || message;
      }

    return NextResponse.json({ error: message }, { status: status });
  }
}
