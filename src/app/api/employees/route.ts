
// src/app/api/employees/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  getAllEmployees as dbGetAllEmployees,
  addEmployeeInternal as dbAddEmployeeInternal, // Corrected import alias
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import { _parseSessionCookie, sendEmployeeWelcomeEmail } from '@/modules/auth/actions'; // Import direct cookie parser and email sender
import { addUser as dbAddUser } from '@/modules/auth/lib/db'; // DB function to add user
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
import type { SessionData, User } from '@/modules/auth/types';

const SALT_ROUNDS = 10;

// Helper function to get session data
async function getSession(request: NextRequest): Promise<SessionData | null> {
  // Since _parseSessionCookie is async and uses cookies(), it should be awaited.
  // It's safe to call from an API route handler.
  return _parseSessionCookie();
}


export async function GET(request: NextRequest) {
  console.log(`[API GET /employees] Fetching employees...`);
  try {
    const session = await getSession(request); // Correctly await here
    if (!session?.tenantId || !session.userRole || !session.userId) {
      console.error(`[API GET /employees] Unauthorized: Missing session data.`);
      return NextResponse.json({ error: "Unauthorized or missing session context." }, { status: 401 });
    }
    const { tenantId, userRole, userId } = session;

    let employees;
    if (userRole === 'Employee') {
      console.log(`[API GET /employees] Employee role, fetching own profile for user ${userId}.`);
      const employeeProfile = await dbGetEmployeeByUserId(userId.toLowerCase(), tenantId.toLowerCase());
      employees = employeeProfile ? [employeeProfile] : [];
    } else {
      console.log(`[API GET /employees] Admin/Manager role, fetching all employees for tenant ${tenantId}.`);
      employees = await dbGetAllEmployees(tenantId.toLowerCase());
    }
    console.log(`[API GET /employees] Fetched ${employees.length} employees.`);
    return NextResponse.json(employees);

  } catch (error: any) {
    console.error(`[API GET /employees] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let message = 'Failed to fetch employees.';
    let status = 500;
    if (error.message?.toLowerCase().includes('unauthorized') || error.message?.toLowerCase().includes('session')) {
      status = 401;
      message = error.message;
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
      status = 400;
      message = error.message;
    } else if (error.message?.includes('Tenant ID is required')) { // Specific check from recent changes
        status = 400;
        message = error.message;
    }
    return NextResponse.json({ error: message, details: error.message }, { status });
  }
}

export async function POST(request: NextRequest) {
  console.log(`[API POST /employees] Adding employee...`);
  try {
    const session = await getSession(request); // Correctly await here
    if (!session?.tenantId || !session.userRole || !session.tenantDomain) {
      console.error(`[API POST /employees] Unauthorized: Missing session data for add.`);
      return NextResponse.json({ error: "Unauthorized or missing session context for add operation." }, { status: 401 });
    }
    const { tenantId, userRole, tenantDomain } = session;

    if (userRole !== 'Admin' && userRole !== 'Manager') {
      console.warn(`[API POST /employees] Unauthorized attempt by role ${userRole}.`);
      return NextResponse.json({ error: 'Unauthorized to add employees.' }, { status: 403 });
    }

    const body = await request.json();
    // Validate form data (excluding server-set fields like tenantId, userId, employeeId)
    const validation = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true }).safeParse(body);
    if (!validation.success) {
      console.error(`[API POST /employees] Validation Error:`, validation.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    const { name, email, role: employeeRoleToSet, ...employeeDetails } = validation.data;

    // Ensure role is correctly determined
    let actualRoleToSet: User['role'] = 'Employee'; // Default
    if (userRole === 'Admin' && employeeRoleToSet) { // Admins can set roles
        actualRoleToSet = employeeRoleToSet;
    }
    // Managers can only create 'Employee' role users (already defaulted if not Admin)

    // Create user account
    const temporaryPassword = generateTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    let newUser: User;
    try {
      newUser = await dbAddUser({
        tenantId: tenantId,
        email: email.toLowerCase(), // Ensure email is stored consistently
        passwordHash,
        name,
        role: actualRoleToSet, // Use the determined role
        isActive: true,
      });
      console.log(`[API POST /employees] User account created with ID: ${newUser.id} and Role: ${actualRoleToSet}`);
    } catch (userError: any) {
      console.error("[API POST /employees] Error creating user:", userError);
      if (userError.message?.includes('User email already exists')) {
        return NextResponse.json({ error: userError.message, details: [{ path: ['email'], message: userError.message }] }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create user account for employee.', details: [{ path: ['email'], message: userError.message }] }, { status: 500 });
    }

    // Add employee record
    // Prepare data for dbAddEmployeeInternal, ensuring reportingManagerId is null if it was NO_MANAGER_VALUE or empty
    const dataForDb = {
        ...employeeDetails,
        reportingManagerId: employeeDetails.reportingManagerId && employeeDetails.reportingManagerId !== "__NO_MANAGER__" ? employeeDetails.reportingManagerId : null,
    };

    const newEmployee = await dbAddEmployeeInternal({
      ...dataForDb, // Use the prepared data
      tenantId: tenantId,
      userId: newUser.id,
      name,
      email: email.toLowerCase(), // Ensure consistent email
    });
    console.log(`[API POST /employees] Employee record added: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}`);

    // Send welcome email
    sendEmployeeWelcomeEmail(
      tenantId,
      newEmployee.name,
      newEmployee.email,
      newUser.id, // Pass user's UUID
      newEmployee.employeeId!, // Pass official employee_id (EMP-XXX)
      temporaryPassword,
      tenantDomain
    ).catch(emailError => console.error(`[API POST /employees] Non-blocking error sending welcome email:`, emailError));

    return NextResponse.json(newEmployee, { status: 201 });

  } catch (error: any) {
    console.error(`[API POST /employees] Error:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let message = 'Failed to add employee.';
    let status = 500;
    let details: any = [{ path: ['root'], message }];

     if (error instanceof SyntaxError && error.message.includes('JSON')) {
        status = 400;
        message = 'Invalid JSON payload.';
        details = [{ path: ['root'], message }];
    } else if (error.message?.toLowerCase().includes('unauthorized')) {
        status = 403;
        message = error.message;
        details = [{ path: ['root'], message }];
    } else if (error.message?.includes('Email address already exists')) {
        status = 409; // Conflict
        message = error.message;
        details = [{ path: ['email'], message }];
    } else if (error.message?.toLowerCase().includes('invalid identifier format')) {
        status = 400;
        message = error.message;
        details = [{ path: ['root'], message }];
    } else if (error.message?.includes('Tenant ID is required')) { // From recent changes
        status = 400;
        message = error.message;
        details = [{ path: ['root'], message }];
    }
    return NextResponse.json({ error: message, details }, { status });
  }
}
