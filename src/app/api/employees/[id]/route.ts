
import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeByIdAction, updateEmployee, deleteEmployeeAction } from '@/modules/employees/actions'; // Corrected import
import { employeeSchema } from '@/modules/employees/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    // Call the server action, now correctly named
    const employee = await getEmployeeByIdAction(params.id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json(employee);
  } catch (error: any) {
    console.error(`Error fetching employee ${params.id} (API):`, error);
    // Propagate a more specific error message if available from the action
    const errorMessage = error.message || 'Failed to fetch employee';
    // Check if it's an authorization error from the action
    if (errorMessage.toLowerCase().includes('unauthorized')) {
        return NextResponse.json({ error: errorMessage }, { status: 403 });
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();

    // Server-side validation before calling the action
    // Note: The `updateEmployee` action expects formData without tenantId, userId, employeeId
    // It derives tenantId from session and uses the provided `id` param as the employee's primary key.
    const validation = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true }).partial().safeParse(body);
    if (!validation.success) {
       console.error(`PUT /api/employees/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call the server action to update the employee
    const result = await updateEmployee(params.id, validation.data);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee);
    } else if (result.errors?.some(e => e.message === 'Employee not found for this tenant')) {
        return NextResponse.json({ error: 'Employee not found for this tenant' }, { status: 404 });
    } else {
         console.error(`PUT /api/employees/${params.id} Action Error:`, result.errors);
         if (result.errors?.some(e => e.message?.includes('Email address already exists'))) {
             return NextResponse.json({ error: 'Email address already exists for this tenant.' }, { status: 409 }); // 409 Conflict
         }
          if (result.errors?.some(e => e.message?.toLowerCase().includes('unauthorized'))) {
             return NextResponse.json({ error: result.errors[0].message }, { status: 403 });
         }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating employee ${params.id} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    // Call the server action to delete the employee
    const result = await deleteEmployeeAction(params.id);
    if (result.success) {
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      // Use error message from the action
      let statusCode = 500;
      if (result.error?.includes('not found')) statusCode = 404;
      else if (result.error?.toLowerCase().includes('unauthorized')) statusCode = 403;
      return NextResponse.json({ error: result.error || 'Failed to delete employee' }, { status: statusCode });
    }
  } catch (error: any) {
    console.error(`Error deleting employee ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
