
import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeById, updateEmployee, deleteEmployeeAction } from '@/modules/employees/actions';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import { getTenantId } from '../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const tenantId = await getTenantId(request); // Get tenantId for context/logging
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // Action now derives tenantId internally, but requires ID parameter
    const employee = await getEmployeeById(params.id); // Call the server action
    if (!employee) {
      // Action might have internal check, but API should confirm tenant match if needed,
      // or rely on action's implicit tenant context. Assuming action handles it.
      return NextResponse.json({ error: 'Employee not found for this tenant' }, { status: 404 });
    }
    return NextResponse.json(employee);
  } catch (error) {
    console.error(`Error fetching employee ${params.id} for tenant ${tenantId} (API):`, error);
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const tenantId = await getTenantId(request); // Get tenantId for validation context
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();

    // Server-side validation before calling the action
    // Validate partial updates, add tenantId for schema check
    const validationData = { ...body, tenantId }; // Add tenantId for validation
    const validation = employeeSchema.partial().safeParse(validationData);

    if (!validation.success) {
       console.error(`PUT /api/employees/${params.id} Validation Error:`, validation.error.flatten());
       return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten().fieldErrors }, { status: 400 });
    }

    // Call the server action to update the employee (action derives tenantId internally)
    // Pass only the update data, excluding tenantId
    const { tenantId: _, ...updateData } = body;
    const result = await updateEmployee(params.id, updateData); // Pass ID and update data

    if (result.success && result.employee) {
      return NextResponse.json(result.employee);
    } else if (result.errors?.some(e => e.message === 'Employee not found')) {
        return NextResponse.json({ error: 'Employee not found for this tenant' }, { status: 404 });
    } else {
         console.error(`PUT /api/employees/${params.id} Action Error:`, result.errors);
         if (result.errors?.some(e => e.message?.includes('Email address already exists'))) {
             return NextResponse.json({ error: 'Email address already exists for this tenant.' }, { status: 409 }); // 409 Conflict
         }
      return NextResponse.json({ error: result.errors?.[0]?.message || 'Failed to update employee' }, { status: result.errors ? 400 : 500 });
    }
  } catch (error: any) {
    console.error(`Error updating employee ${params.id} for tenant ${tenantId} (API):`, error);
     if (error instanceof SyntaxError) {
       return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const tenantId = await getTenantId(request); // Get tenantId for context/logging
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // Call the server action to delete the employee (action derives tenantId internally)
    const result = await deleteEmployeeAction(params.id);
    if (result.success) {
      return NextResponse.json({ message: 'Employee deleted successfully' }, { status: 200 }); // Or 204 No Content
    } else {
      // Use error message from the action
      return NextResponse.json({ error: result.error || 'Failed to delete employee' }, { status: result.error?.includes('not found') ? 404 : 500 });
    }
  } catch (error: any) {
    console.error(`Error deleting employee ${params.id} for tenant ${tenantId} (API):`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
