import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeById, updateEmployee, deleteEmployeeAction } from '@/modules/employees/actions';
import { employeeSchema } from '@/modules/employees/types';

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const employee = await getEmployeeById(params.id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    return NextResponse.json(employee);
  } catch (error) {
    console.error(`Error fetching employee ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    const validation = employeeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const result = await updateEmployee(params.id, validation.data);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee);
    } else if (result.errors && result.errors.some(e => e.message === 'Employee not found')) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    } else {
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error) {
    console.error(`Error updating employee ${params.id}:`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const result = await deleteEmployeeAction(params.id);
    if (result.success) {
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      return NextResponse.json({ error: 'Employee not found or could not be deleted' }, { status: 404 });
    }
  } catch (error) {
    console.error(`Error deleting employee ${params.id}:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
