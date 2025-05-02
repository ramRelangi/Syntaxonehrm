import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeLeaveBalances } from '@/modules/leave/actions';

interface Params {
  params: { employeeId: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    // TODO: Add authorization - check if the requesting user can view this employee's balances
    const balances = await getEmployeeLeaveBalances(params.employeeId); // Call server action

    // The action now likely returns an array, might not return undefined if employee exists but has 0 balances
    // Check if balances array is empty if necessary, but usually return empty array is fine.
    // if (!balances) { // This check might be redundant now
    //      return NextResponse.json({ error: 'Employee not found or no balances available' }, { status: 404 });
    // }

    return NextResponse.json(balances);
  } catch (error: any) {
    console.error(`Error fetching leave balances for employee ${params.employeeId} (API):`, error);
    // Handle potential specific errors from the action if needed
    return NextResponse.json({ error: error.message || 'Failed to fetch leave balances' }, { status: 500 });
  }
}
