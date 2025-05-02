import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form'; // Updated import path
import { getEmployeeById, updateEmployee } from '@/modules/employees/actions'; // Updated import path
import { notFound } from 'next/navigation';
import { Pencil } from "lucide-react";
import type { Employee } from '@/modules/employees/types'; // Import Employee type locally for the page

interface EditEmployeePageProps {
  params: { id: string };
}

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const employeeId = params.id;
  const employee = await getEmployeeById(employeeId);

  if (!employee) {
    notFound(); // Show 404 if employee doesn't exist
  }

  // Create a specific action for updating this employee
  const updateThisEmployeeAction = updateEmployee.bind(null, employeeId);

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
             <Pencil className="h-6 w-6" /> Edit Employee: {employee.name}
          </h1>
       </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Update Employee Details</CardTitle>
          <CardDescription>Modify the employee's information below.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeForm
             employee={employee}
             onSubmitAction={updateThisEmployeeAction}
             formTitle="Edit Employee"
             formDescription="Update the employee's information."
             submitButtonText="Save Changes"
           />
        </CardContent>
      </Card>
    </div>
  );
}
