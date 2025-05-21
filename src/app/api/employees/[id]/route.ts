
import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeById as dbGetEmployeeById,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { employeeSchema } from '@/modules/employees/types';
import { _parseSessionCookie } from '@/modules/auth/actions'; // Import the direct cookie parser
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
  console.log(`[API GET /employees/${id}] Received request.`);

  try {
    const session = await getSession(request);
    if (!session?.tenantId || !session.userRole || !session.userId) {
      console.error(`[API GET /employees/${id}] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }
    const { tenantId, userRole, userId: currentUserId } = session;
    console.log(`[API GET /employees/${id}] Session: tenantId=${tenantId}, userRole=${userRole}, currentUserId=${currentUserId}`);

    let employeeProfile;
    if (userRole === 'Employee') {
      console.log(`[API GET /employees/${id}] Employee role. ID from URL: ${id}. Current user ID: ${currentUserId}`);
      // If employee, 'id' in URL is usually their own userId for "My Profile"
      // or their employee.id for an edit page if they are trying to edit their own profile.
      // The most consistent approach for an /api/employees/[id] route is that 'id' is the employee's primary key.
      // We then check if this employee record belongs to the current user.

      const fetchedEmployee = await dbGetEmployeeById(id.toLowerCase(), tenantId.toLowerCase());
      if (fetchedEmployee && fetchedEmployee.userId?.toLowerCase() === currentUserId.toLowerCase()) {
        console.log(`[API GET /employees/${id}] Employee is accessing their own profile by employee PK. Fetched Employee PK: ${fetchedEmployee.id}, Linked User ID: ${fetchedEmployee.userId}`);
        employeeProfile = fetchedEmployee;
      } else if (fetchedEmployee) {
         console.warn(`[API GET /employees/${id}] Employee ${currentUserId} attempting to access employee record ${id} which does not belong to them (linked user_id: ${fetchedEmployee.userId}).`);
         return NextResponse.json({ error: 'Unauthorized: You can only view your own employee profile.' }, { status: 403 });
      } else {
        console.warn(`[API GET /employees/${id}] Employee record not found for PK ${id} in tenant ${tenantId}.`);
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
      }
    } else { // Admin or Manager
      console.log(`[API GET /employees/${id}] Admin/Manager role. Fetching employee by PK (employee.id): ${id}`);
      employeeProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId.toLowerCase());
    }

    if (!employeeProfile) {
      console.warn(`[API GET /employees/${id}] Employee not found for ID ${id} and tenant ${tenantId}.`);
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    console.log(`[API GET /employees/${id}] Employee found: ${employeeProfile.name}`);
    return NextResponse.json(employeeProfile);

  } catch (error: any) {
    console.error(`[API GET /employees/${id}] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = 'Failed to fetch employee.';
    let statusCode = 500;
    if (error.message?.toLowerCase().includes('unauthorized') || error.message?.toLowerCase().includes('session')) {
      statusCode = 401;
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
    const { tenantId, userRole, userId: currentUserId } = session;

    const body = await request.json();
    let dataToUpdate = { ...body };

    // Authorization: Employee can only update specific fields of their own profile
    if (userRole === 'Employee') {
      const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId.toLowerCase());
      if (!employeeToUpdate || employeeToUpdate.userId?.toLowerCase() !== currentUserId.toLowerCase()) {
        console.warn(`[API PUT /employees/${id}] Unauthorized attempt by Employee ${currentUserId} to update employee PK ${id}.`);
        return NextResponse.json({ error: 'Unauthorized to update this employee profile.' }, { status: 403 });
      }
      const allowedUpdates: Partial<typeof body> = {};
      if (body.phone !== undefined) allowedUpdates.phone = body.phone;
      if (body.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = body.dateOfBirth;
      
      const disallowedKeys = Object.keys(body).filter(key => !['phone', 'dateOfBirth'].includes(key));
      if (disallowedKeys.length > 0) {
        console.warn(`[API PUT /employees/${id}] Employee ${currentUserId} attempted to update disallowed fields: ${disallowedKeys.join(', ')} on employee PK ${id}.`);
        return NextResponse.json({ error: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }, { status: 403 });
      }
      dataToUpdate = allowedUpdates;
    }

    // Schema validation (excluding server-managed fields)
    const validation = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true }).partial().safeParse(dataToUpdate);
    if (!validation.success) {
      console.error(`[API PUT /employees/${id}] Validation Error:`, validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    if (Object.keys(validation.data).length === 0 && userRole === 'Employee') {
        // If employee submitted no allowed changes.
        const currentEmployee = await dbGetEmployeeById(id.toLowerCase(), tenantId.toLowerCase());
        return NextResponse.json(currentEmployee); // Return current data
    }


    const updatedEmployee = await dbUpdateEmployee(id.toLowerCase(), tenantId.toLowerCase(), validation.data);

    if (updatedEmployee) {
      console.log(`[API PUT /employees/${id}] Employee updated successfully: ${updatedEmployee.name}`);
      return NextResponse.json(updatedEmployee);
    } else {
      console.warn(`[API PUT /employees/${id}] Employee not found for ID ${id} during update.`);
      return NextResponse.json({ error: 'Employee not found for this tenant' }, { status: 404 });
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
    const { tenantId, userRole } = session;

    if (userRole !== 'Admin' && userRole !== 'Manager') {
      console.warn(`[API DELETE /employees/${id}] Unauthorized attempt by role ${userRole}.`);
      return NextResponse.json({ error: 'Unauthorized to delete employees.' }, { status: 403 });
    }

    const deleted = await dbDeleteEmployee(id.toLowerCase(), tenantId.toLowerCase());

    if (deleted) {
      console.log(`[API DELETE /employees/${id}] Employee deleted successfully.`);
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 });
    } else {
      console.warn(`[API DELETE /employees/${id}] Employee not found for ID ${id} during deletion.`);
      return NextResponse.json({ error: 'Employee not found for this tenant.' }, { status: 404 });
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
