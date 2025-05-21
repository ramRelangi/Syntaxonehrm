
import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeByIdAction, updateEmployee as updateEmployeeAction, deleteEmployeeAction } from '@/modules/employees/actions';
import { employeeSchema } from '@/modules/employees/types';
import { _parseSessionCookie } from '@/modules/auth/actions';
import type { SessionData } from '@/modules/auth/types';

interface Params {
  params: { id: string };
}

async function getSession(request: NextRequest): Promise<SessionData | null> {
  // For API routes, it's safer to pass the request if needed, but _parseSessionCookie uses next/headers directly
  return _parseSessionCookie();
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  console.log(`[API GET /employees/${id}] Received request for employee ID: ${id}`);

  try {
    const session = await getSession(request);
    if (!session?.tenantId) {
      console.error(`[API GET /employees/${id}] Unauthorized: Missing tenant ID from session.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context (tenantId missing).' }, { status: 401 });
    }
    console.log(`[API GET /employees/${id}] Session tenantId: ${session.tenantId}`);

    const employee = await getEmployeeByIdAction(id); // Action now handles role-based fetching logic
    if (!employee) {
      console.warn(`[API GET /employees/${id}] Employee not found by action. ID used: ${id}, Tenant from session: ${session.tenantId}`);
      return NextResponse.json({ error: `Employee not found for ID ${id} in tenant ${session.tenantId}.` }, { status: 404 });
    }
    console.log(`[API GET /employees/${id}] Employee found: ${employee.name}`);
    return NextResponse.json(employee);

  } catch (error: any) {
    console.error(`[API GET /employees/${id}] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = 'Failed to fetch employee.';
    let statusCode = 500;

    if (error.message?.toLowerCase().includes('unauthorized')) {
      statusCode = 403; // Forbidden
      errorMessage = error.message;
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
      statusCode = 400; // Bad Request for invalid UUIDs
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  console.log(`[API PUT /employees/${id}] Received request.`);

  try {
    const session = await getSession(request);
    if (!session?.tenantId || !session.userRole || !session.userId) {
      console.error(`[API PUT /employees/${id}] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }

    const body = await request.json();
    // The updateEmployeeAction will handle role-based field restrictions and validation internally.
    const result = await updateEmployeeAction(id, body);

    if (result.success && result.employee) {
      console.log(`[API PUT /employees/${id}] Employee updated successfully: ${result.employee.name}`);
      return NextResponse.json(result.employee);
    } else {
      console.error(`[API PUT /employees/${id}] Action failed to update employee. Errors:`, result.errors);
      let errorMessage = result.errors?.[0]?.message || 'Failed to update employee.';
      let statusCode = 400; // Default for validation or general action failure

      if (errorMessage.toLowerCase().includes('unauthorized')) {
        statusCode = 403;
      } else if (errorMessage.toLowerCase().includes('not found')) {
        statusCode = 404;
      } else if (errorMessage.toLowerCase().includes('already exists')) {
        statusCode = 409; // Conflict
      }
      return NextResponse.json({ error: errorMessage, details: result.errors }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`[API PUT /employees/${id}] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = 'Failed to update employee.';
    let statusCode = 500;

    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        statusCode = 400;
        errorMessage = 'Invalid JSON payload.';
    } else if (error.message?.toLowerCase().includes('unauthorized')) {
        statusCode = 403;
        errorMessage = error.message;
    } else if (error.message?.includes('Email address already exists')) {
        statusCode = 409; // Conflict
        errorMessage = error.message;
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
        statusCode = 400;
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  console.log(`[API DELETE /employees/${id}] Received request.`);

  try {
    const session = await getSession(request);
    if (!session?.tenantId || !session.userRole) {
      console.error(`[API DELETE /employees/${id}] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }

    const result = await deleteEmployeeAction(id);

    if (result.success) {
      console.log(`[API DELETE /employees/${id}] Employee deleted successfully.`);
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 });
    } else {
      console.error(`[API DELETE /employees/${id}] Action failed to delete employee. Error:`, result.error);
      let errorMessage = result.error || 'Failed to delete employee.';
      let statusCode = 500;
      if (errorMessage.toLowerCase().includes('unauthorized')) {
        statusCode = 403;
      } else if (errorMessage.toLowerCase().includes('not found')) {
        statusCode = 404;
      }
      return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`[API DELETE /employees/${id}] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = 'Failed to delete employee.';
    let statusCode = 500;
     if (error.message?.toLowerCase().includes('unauthorized')) {
        statusCode = 403;
        errorMessage = error.message;
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
        statusCode = 400;
        errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}
