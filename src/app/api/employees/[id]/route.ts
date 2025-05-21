
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  getEmployeeById as dbGetEmployeeById,
  getEmployeeByUserId as dbGetEmployeeByUserId,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
} from '@/modules/employees/lib/db';
import { employeeSchema } from '@/modules/employees/types';
import { _parseSessionCookie } from '@/modules/auth/actions';
import type { SessionData } from '@/modules/auth/types';
import { deleteUserById as dbDeleteUserById } from '@/modules/auth/lib/db';

interface RouteParams {
  id: string;
}

// Helper to get session within API route
async function getSession(): Promise<SessionData | null> {
  // _parseSessionCookie is async and uses cookies() correctly
  return _parseSessionCookie();
}

export async function GET(request: NextRequest, { params }: { params: RouteParams }) {
  const { id } = params; // Correctly destructure id
  console.log(`[API GET /employees/${id}] Received request for employee ID (this could be user_id or employee_pk_id): ${id}`);

  let session: SessionData | null;
  try {
    session = await getSession();
    if (!session?.tenantId || !session.userRole || !session.userId) {
      console.error(`[API GET /employees/${id}] Unauthorized: Missing or incomplete session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }
  } catch (sessionError: any) {
    console.error(`[API GET /employees/${id}] Error fetching session:`, sessionError);
    return NextResponse.json({ error: 'Session retrieval failed.', details: sessionError.message }, { status: 500 });
  }

  const { tenantId, userRole, userId: currentSessionUserId } = session;
  console.log(`[API GET /employees/${id}] Session details: tenantId=${tenantId}, userRole=${userRole}, currentSessionUserId=${currentSessionUserId}`);

  try {
    let employee;
    const lowerCaseId = id.toLowerCase();
    const lowerCaseTenantId = tenantId.toLowerCase();
    const lowerCaseCurrentSessionUserId = currentSessionUserId.toLowerCase();

    if (userRole === 'Employee') {
      // For "My Profile", the 'id' from the URL *is* the user_id.
      if (lowerCaseId === lowerCaseCurrentSessionUserId) {
        console.log(`[API GET /employees/${id}] Employee role & ID in URL matches session userId. Calling dbGetEmployeeByUserId with userId: ${lowerCaseId}, tenantId: ${lowerCaseTenantId}`);
        employee = await dbGetEmployeeByUserId(lowerCaseId, lowerCaseTenantId);
        if (!employee) {
          console.warn(`[API GET /employees/${id}] dbGetEmployeeByUserId FAILED: Employee profile not found for user_id ${lowerCaseId} in tenant ${lowerCaseTenantId}.`);
        } else {
          console.log(`[API GET /employees/${id}] dbGetEmployeeByUserId SUCCESS: Found employee for user_id ${lowerCaseId}.`);
        }
      } else {
        // An 'Employee' is trying to access an ID that is NOT their own user_id.
        // This should be an unauthorized access.
        console.warn(`[API GET /employees/${id}] Auth_Failed (Employee Role): Attempt to access profile for ID ${id} which does not match session userId ${currentSessionUserId}.`);
        return NextResponse.json({ error: 'Unauthorized: You can only view your own employee profile.' }, { status: 403 });
      }
    } else if (userRole === 'Admin' || userRole === 'Manager') {
      // Admins/Managers fetch by employee.id (PK). The 'id' from URL is treated as employee_pk_id.
      console.log(`[API GET /employees/${id}] Admin/Manager role. Calling dbGetEmployeeById with employee_pk_id: ${lowerCaseId}, tenantId: ${lowerCaseTenantId}`);
      employee = await dbGetEmployeeById(lowerCaseId, lowerCaseTenantId);
      if (!employee) {
        console.warn(`[API GET /employees/${id}] dbGetEmployeeById FAILED: Employee record not found for PK ${lowerCaseId} in tenant ${lowerCaseTenantId}.`);
      } else {
        console.log(`[API GET /employees/${id}] dbGetEmployeeById SUCCESS: Found employee PK ${lowerCaseId}.`);
      }
    } else {
      console.error(`[API GET /employees/${id}] Unknown or invalid user role: ${userRole}. Denying access.`);
      return NextResponse.json({ error: 'Unauthorized due to invalid user role.' }, { status: 403 });
    }

    if (!employee) {
      console.log(`[API GET /employees/${id}] Final check: Employee not found. Returning 404. ID used: ${id}, Tenant: ${tenantId}, Role: ${userRole}`);
      return NextResponse.json({ error: `Employee not found. ID: ${id}, Tenant: ${tenantId}` }, { status: 404 });
    }
    console.log(`[API GET /employees/${id}] Successfully fetched employee: ${employee.name}`);
    return NextResponse.json(employee);

  } catch (error: any) {
    console.error(`[API GET /employees/${id}] Error during data fetching or processing:`, error);
    let errorMessage = 'Failed to fetch employee.';
    let statusCode = 500;
    if (error.message?.toLowerCase().includes('unauthorized')) {
      statusCode = 403;
      errorMessage = error.message;
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.toString() }, { status: statusCode });
  }
}

export async function PUT(request: NextRequest, { params }: { params: RouteParams }) {
  const { id } = params;
  console.log(`[API PUT /employees/${id}] Received request.`);

  let session: SessionData | null;
  try {
    session = await getSession();
    if (!session?.tenantId || !session.userRole || !session.userId) {
      console.error(`[API PUT /employees/${id}] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }
  } catch (sessionError: any) {
    console.error(`[API PUT /employees/${id}] Error fetching session:`, sessionError);
    return NextResponse.json({ error: 'Session retrieval failed.', details: sessionError.message }, { status: 500 });
  }

  const { tenantId, userRole, userId: currentSessionUserId } = session;

  try {
    const body = await request.json();
    let dataToUpdate = { ...body };

    // Fetch the employee record first to check ownership and get user_id if needed
    const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId.toLowerCase());

    if (!employeeToUpdate) {
      console.warn(`[API PUT /employees/${id}] Employee not found for tenant ${tenantId}.`);
      return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    }

    if (userRole === 'Employee') {
      if (employeeToUpdate.userId?.toLowerCase() !== currentSessionUserId.toLowerCase()) {
        console.warn(`[API PUT /employees/${id}] Auth_Failed (Employee Role): Attempt to update employee PK ${id}. Record's user_id (${employeeToUpdate.userId}) != session userId (${currentSessionUserId}).`);
        return NextResponse.json({ error: 'Unauthorized to update this employee profile.' }, { status: 403 });
      }
      // Employee can only update specific fields
      const allowedUpdates: Partial<typeof body> = {};
      if (body.phone !== undefined) allowedUpdates.phone = body.phone;
      if (body.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = body.dateOfBirth;
      // Add other allowed fields here if necessary

      const disallowedKeys = Object.keys(body).filter(key => !Object.keys(allowedUpdates).includes(key));
      if (disallowedKeys.length > 0 && Object.keys(allowedUpdates).length === 0 && Object.keys(body).length > 0) {
        console.warn(`[API PUT /employees/${id}] Employee ${currentSessionUserId} attempted to update only disallowed fields: ${disallowedKeys.join(', ')} on employee PK ${id}.`);
        return NextResponse.json({ error: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }, { status: 403 });
      }
      dataToUpdate = allowedUpdates;
      if (Object.keys(dataToUpdate).length === 0 && Object.keys(body).length > 0) {
           console.log(`[API PUT /employees/${id}] Employee ${currentSessionUserId} submitted only disallowed changes for employee PK ${id}.`);
           return NextResponse.json({ error: 'No updatable fields provided or you are not allowed to update the submitted fields.' }, { status: 400 });
      }
       if (Object.keys(dataToUpdate).length === 0 && Object.keys(body).length === 0) {
          console.log(`[API PUT /employees/${id}] No data submitted for update by employee ${currentSessionUserId}.`);
          return NextResponse.json(employeeToUpdate); // Return current data if nothing to update
      }
    } else if (userRole !== 'Admin' && userRole !== 'Manager') {
      console.warn(`[API PUT /employees/${id}] Unauthorized role (${userRole}) attempting update.`);
      return NextResponse.json({ error: 'Unauthorized to update employee profiles.' }, { status: 403 });
    }

    // Validate the data before updating
    const validation = employeeSchema.partial().omit({ tenantId: true, userId: true, employeeId: true }).safeParse(dataToUpdate);
    if (!validation.success) {
      console.error(`[API PUT /employees/${id}] Validation Error:`, validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const updatedEmployee = await dbUpdateEmployee(id.toLowerCase(), tenantId.toLowerCase(), validation.data);
    if (updatedEmployee) {
      console.log(`[API PUT /employees/${id}] Employee updated successfully: ${updatedEmployee.name}`);
      return NextResponse.json(updatedEmployee);
    } else {
      // This case should be rare if employeeToUpdate was found earlier, but good for safety
      console.error(`[API PUT /employees/${id}] Failed to update employee in DB, dbUpdateEmployee returned undefined.`);
      return NextResponse.json({ error: 'Failed to update employee, record might have been deleted.' }, { status: 404 });
    }

  } catch (error: any) {
    console.error(`[API PUT /employees/${id}] Error during update:`, error);
    let errorMessage = 'Failed to update employee.';
    let statusCode = 500;
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      statusCode = 400;
      errorMessage = 'Invalid JSON payload.';
    } else if (error.message?.toLowerCase().includes('unauthorized')) {
      statusCode = 403;
      errorMessage = error.message;
    } else if (error.message?.includes('already exists')) {
      statusCode = 409; // Conflict
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: RouteParams }) {
  const { id } = params;
  console.log(`[API DELETE /employees/${id}] Received request.`);

  let session: SessionData | null;
  try {
    session = await getSession();
    if (!session?.tenantId || !session.userRole) {
      console.error(`[API DELETE /employees/${id}] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: 'Unauthorized or missing session context.' }, { status: 401 });
    }
  } catch (sessionError: any) {
    console.error(`[API DELETE /employees/${id}] Error fetching session:`, sessionError);
    return NextResponse.json({ error: 'Session retrieval failed.', details: sessionError.message }, { status: 500 });
  }

  const { tenantId, userRole } = session;

  if (userRole !== 'Admin' && userRole !== 'Manager') {
    console.warn(`[API DELETE /employees/${id}] Unauthorized role (${userRole}) attempting delete.`);
    return NextResponse.json({ error: 'Unauthorized to delete employees.' }, { status: 403 });
  }

  try {
    // dbDeleteEmployee handles deleting the associated user record in auth.lib.db.ts
    const deleted = await dbDeleteEmployee(id.toLowerCase(), tenantId.toLowerCase());
    if (deleted) {
      console.log(`[API DELETE /employees/${id}] Employee deleted successfully.`);
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 });
    } else {
      console.warn(`[API DELETE /employees/${id}] Employee not found or already deleted.`);
      return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    }
  } catch (error: any) {
    console.error(`[API DELETE /employees/${id}] Error during deletion:`, error);
    let errorMessage = 'Failed to delete employee.';
    let statusCode = 500;
    if (error.message?.toLowerCase().includes('unauthorized')) {
      statusCode = 403;
      errorMessage = error.message;
    } else if (error.message?.toLowerCase().includes('not found')) {
      statusCode = 404;
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage, details: error.message }, { status: statusCode });
  }
}
    