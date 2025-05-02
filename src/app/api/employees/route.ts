import { NextRequest, NextResponse } from 'next/server';
import { getEmployees, addEmployee } from '@/modules/employees/actions';
import { employeeSchema } from '@/modules/employees/types';

export async function GET(request: NextRequest) {
  try {
    const employees = await getEmployees(); // Call the server action
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees (API):', error);
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Server-side validation before calling the action
    const validation = employeeSchema.safeParse(body);
    if (!validation.success) {
        console.error("POST /api/employees Validation Error:", validation.error.flatten());
        return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call the server action to add the employee
    const result = await addEmployee(validation.data);

    if (result.success && result.employee) {
      return NextResponse.json(result.employee, { status: 201 });
    } else {
      // Use the errors from the action if available
       console.error("POST /api/employees Action Error:", result.errors);
       // Return specific error for duplicate email
       if (result.errors?.some(e => e.message?.includes('Email address already exists'))) {
            return NextResponse.json({ error: 'Email address already exists.' }, { status: 409 }); // 409 Conflict
       }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to add employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error('Error adding employee (API):', error);
    if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
