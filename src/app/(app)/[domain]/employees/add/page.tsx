// src/app/(app)/[domain]/employees/add/page.tsx
import * as React from "react"; // Import React
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { UserPlus } from "lucide-react";
import { headers } from 'next/headers'; // Needed to get request context for auth
import { getTenantIdFromAuth } from '@/lib/auth'; // Import server-side auth helper
import { notFound } from 'next/navigation'; // Import notFound for error handling

interface AddEmployeePageProps {
  params: { domain: string }; // Expect domain param
}

export default async function TenantAddEmployeePage({ params }: AddEmployeePageProps) {
  const tenantDomain = params.domain; // Domain from URL

  // Fetch tenantId server-side using the auth helper
  let tenantId: string | null = null;
  let tenantName = tenantDomain; // Fallback name
  let error: string | null = null;

  try {
    tenantId = await getTenantIdFromAuth();
    if (!tenantId) {
        // This shouldn't happen if middleware and layout are correct, but handle defensively
        console.error(`[Add Employee Page] Could not resolve Tenant ID for domain "${tenantDomain}".`);
        error = "Could not identify your company context. Please ensure you are logged in correctly.";
        // Optionally trigger notFound() if tenant context is absolutely required
        // notFound();
    } else {
        console.log(`[Add Employee Page] Resolved Tenant ID for domain "${tenantDomain}": ${tenantId}`);
        // Optionally fetch tenant name if needed for display
        // const tenantDetails = await getTenantById(tenantId); // Need getTenantById from auth/lib/db
        // if (tenantDetails) tenantName = tenantDetails.name;
    }
  } catch (err: any) {
     console.error(`[Add Employee Page] Error fetching tenant context:`, err);
     error = "An error occurred while identifying your company context.";
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
          <CardDescription>Fill in the details for the new employee for {tenantName}.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
              <p className="text-destructive text-center py-4">{error}</p>
          ) : !tenantId ? (
               <p className="text-muted-foreground text-center py-4">Loading tenant information...</p> // Or show loading skeleton
          ) : (
              <EmployeeForm
                 formTitle="Add New Employee"
                 formDescription="Enter the employee's information below."
                 submitButtonText="Add Employee"
                 tenantId={tenantId} // Pass the fetched tenantId to the form
               />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
