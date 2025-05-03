// src/app/(app)/[domain]/employees/add/page.tsx
"use client"; // AddEmployeePage needs to be a client component to use the form

import * as React from "react"; // Import React
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { UserPlus } from "lucide-react";
import { useParams } from 'next/navigation'; // Import useParams

interface AddEmployeePageProps {
   // params removed, using hook instead
}

export default function TenantAddEmployeePage({ }: AddEmployeePageProps) { // Removed params prop
  // Use the useParams hook to get route parameters
  const params = useParams();
  const tenantDomain = params.domain as string; // Cast to string as needed

  // Handle cases where domain might not be available (though middleware should prevent this)
  if (!tenantDomain) {
    // Optionally show a loading state or error, though this page relies on the domain
    return <p>Loading tenant information...</p>;
  }

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
          <CardDescription>Fill in the details for the new employee for {tenantDomain}.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Pass tenantDomain for context or form default values if needed */}
          {/* The form itself will get tenantId from session/context ideally */}
          <EmployeeForm
             formTitle="Add New Employee"
             formDescription="Enter the employee's information below."
             submitButtonText="Add Employee"
             // tenantId could be passed if needed, but action should derive it
             // Assuming the EmployeeForm or its underlying action can derive tenantId from context or session
           />
        </CardContent>
      </Card>
    </div>
  );
}
