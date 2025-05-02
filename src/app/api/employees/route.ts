import { NextRequest, NextResponse } from 'next/server';
import { getEmployees, addEmployee } from '@/modules/employees/actions';
import { employeeSchema } from '@/modules/employees/types';

export async function GET(request: NextRequest) {
  try {
    const employees = await getEmployees();
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = employeeSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.errors }, { status: 400 });
    }

    const result = await addEmployee(validation.data);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee, { status: 201 });
    } else {
      // Use the errors from the action if available
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error) {
    console.error('Error adding employee:', error);
    // Handle potential JSON parsing errors or other unexpected issues
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
