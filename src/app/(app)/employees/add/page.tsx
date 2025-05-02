"use client"; // AddEmployeePage needs to be a client component to use the form

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { UserPlus } from "lucide-react";

export default function AddEmployeePage() {

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <UserPlus className="h-6 w-6" /> Add New Employee
          </h1>
      </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Employee Details</CardTitle>
          <CardDescription>Fill in the details for the new employee.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* EmployeeForm handles its own API call */}
          <EmployeeForm
             formTitle="Add New Employee"
             formDescription="Enter the employee's information below."
             submitButtonText="Add Employee"
           />
        </CardContent>
      </Card>
    </div>
  );
}
