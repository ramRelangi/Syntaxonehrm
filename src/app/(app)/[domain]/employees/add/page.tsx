// src/app/(app)/[domain]/employees/add/page.tsx
"use client"; // Add 'use client' directive

import * as React from "react"; // Import React
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { UserPlus } from "lucide-react";

interface AddEmployeePageProps {
  params: { domain: string }; // Expect domain param
}

export default function TenantAddEmployeePage({ params }: AddEmployeePageProps) {
  // Get domain using use() hook as recommended
  const safeParams = React.use(params);
  const tenantDomain = safeParams?.domain;

  // Fetch tenantId server-side using the auth helper (moved to form?)
  // Or assume tenantId is passed down via props/context if needed beyond form submission

  if (!tenantDomain) {
       // Handle case where domain isn't available yet or is invalid
       // This might happen during initial render or if routing is incorrect
       console.error("[Add Employee Page] Tenant domain not found in params.");
       return <div>Error: Could not determine tenant context.</div>;
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
             {/* Pass tenantDomain explicitly, EmployeeForm will derive tenantId if needed */}
              <EmployeeForm
                 formTitle="Add New Employee"
                 formDescription="Enter the employee's information below."
                 submitButtonText="Add Employee"
                 tenantDomain={tenantDomain} // Pass domain instead of ID
               />
        </CardContent>
      </Card>
    </div>
  );
}
