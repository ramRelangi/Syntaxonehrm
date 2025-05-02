import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeLeaveBalances } from '@/modules/leave/actions';

interface Params {
  params: { employeeId: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const balances = await getEmployeeLeaveBalances(params.employeeId);
    if (!balances) {
        // This might happen if the employee doesn't exist, but the function currently ensures init.
        // Add employee existence check if needed.
         return NextResponse.json({ error: 'Employee not found or no balances available' }, { status: 404 });
    }
    return NextResponse.json(balances);
  } catch (error) {
    console.error(`Error fetching leave balances for employee ${params.employeeId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch leave balances' }, { status: 500 });
  }
}
