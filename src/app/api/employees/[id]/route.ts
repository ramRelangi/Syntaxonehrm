import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeById, updateEmployee, deleteEmployeeAction } from '@/modules/employees/actions';
import { employeeSchema } from '@/modules/employees/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeById(params.id); // Call the server action
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json(employee);
  } catch (error) {
    console.error(`Error fetching employee ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();

    // Server-side validation before calling the action
    const validation = employeeSchema.safeParse(body);
    if (!validation.success) {
       console.error(`PUT /api/employees/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call the server action to update the employee
    const result = await updateEmployee(params.id, validation.data);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee);
    } else if (result.errors?.some(e => e.message === 'Employee not found')) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    } else {
         console.error(`PUT /api/employees/${params.id} Action Error:`, result.errors);
         if (result.errors?.some(e => e.message?.includes('Email address already exists'))) {
             return NextResponse.json({ error: 'Email address already exists.' }, { status: 409 }); // 409 Conflict
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
      return NextResponse.json({ error: result.error || 'Failed to delete employee' }, { status: result.error === 'Employee not found.' ? 404 : 500 });
    }
  } catch (error: any) {
    console.error(`Error deleting employee ${params.id} (API):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
