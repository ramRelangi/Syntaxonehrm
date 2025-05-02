import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";
import { getEmployees } from '@/modules/employees/actions'; // Updated import path
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table'; // Updated import path
import { columns } from '@/modules/employees/components/employee-table-columns'; // Updated import path
import Link from "next/link";

export default async function EmployeesPage() {
  // Fetch employee data using the server action
  const employees = await getEmployees();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
         <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
           <Users className="h-6 w-6" /> Employee Management
         </h1>
         <Button asChild>
             <Link href="/employees/add">
                <UserPlus className="mr-2 h-4 w-4"/> Add New Employee
             </Link>
         </Button>
      </div>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Employees Overview</CardTitle>
            <CardDescription>View, search, and manage employee records.</CardDescription>
         </CardHeader>
         <CardContent>
            {/* Render the data table */}
            <EmployeeDataTable columns={columns} data={employees} />
         </CardContent>
      </Card>
    </div>
  );
}
