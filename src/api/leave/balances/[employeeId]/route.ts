
import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeLeaveBalances } from '@/modules/leave/actions';
import { getTenantId } from '../../../utils/get-tenant-id'; // Import utility

interface Params {
  params: { employeeId: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  // Get tenantId for context, action will also derive it for security
  const tenantId = await getTenantId(request);
  if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context is required.' }, { status: 400 });
  }

  try {
    // TODO: Add authorization - check if the requesting user can view this employee's balances
    // Action now derives tenantId internally
    const balances = await getEmployeeLeaveBalances(params.employeeId); // Call server action

    // Action should handle errors like employee not found within the tenant context
    // Return the balances (potentially empty array)
    return NextResponse.json(balances);
  } catch (error: any) {
    console.error(`Error fetching leave balances for employee ${params.employeeId} (API):`, error);
    // Handle potential specific errors from the action if needed
    return NextResponse.json({ error: error.message || 'Failed to fetch leave balances' }, { status: 500 });
  }
}
