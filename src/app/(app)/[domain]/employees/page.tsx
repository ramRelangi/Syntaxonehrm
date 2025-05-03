
// src/app/(app)/[domain]/employees/page.tsx
"use client";

import * as React from "react";
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, AlertTriangle, Loader2 } from "lucide-react"; // Added AlertTriangle, Loader2
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from '@/modules/employees/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added Alert components

interface EmployeesPageProps {
  params: { domain: string };
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employees Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        // API route handles tenant context via header
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employees Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            let errorPayload = { message: `HTTP error! status: ${response.status}` };
             let errorText = '';
             try {
                errorText = await response.text();
                 if (errorText) {
                    errorPayload = JSON.parse(errorText);
                 }
             } catch (e) {
                 console.warn(`[Employees Page - fetchData] Failed to parse error response as JSON for ${fullUrl}:`, errorText);
                 errorPayload.message = errorText || errorPayload.message;
             }
             console.error(`[Employees Page - fetchData] Fetch error for ${fullUrl}:`, errorPayload);
             // Handle specific 401/403 error for missing tenant or auth issues
             if (response.status === 401 || response.status === 403 || (errorPayload.message && errorPayload.message.includes('Unauthorized'))) {
                 throw new Error(errorPayload.message || 'Unauthorized. Unable to load data.');
             } else if (response.status === 400 && errorPayload.message.includes('Tenant context')) {
                 throw new Error(errorPayload.message || 'Tenant information is missing. Unable to load data.');
             }
             throw new Error(errorPayload.message);
        }
        const data = await response.json();
        console.log(`[Employees Page - fetchData] Successfully fetched data for ${fullUrl}, record count: ${Array.isArray(data) ? data.length : 'N/A'}`);
        return data as T;
    } catch (error) {
        console.error(`[Employees Page - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


export default function TenantEmployeesPage({ params }: EmployeesPageProps) {
  const safeParams = React.use(params);
  const tenantDomain = safeParams?.domain;
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Function to refetch employees via API (API route uses tenant header)
  const fetchEmployees = React.useCallback(async () => {
    if (!tenantDomain) { // Check if tenantDomain is available
      setError("Could not determine tenant context.");
      setIsLoading(false);
      return;
    }
    console.log(`[Employees Page - ${tenantDomain}] Starting fetchEmployees...`);
    setIsLoading(true);
    setError(null);
    try {
      // The API route implicitly uses the tenantId from the header set by middleware
      const data = await fetchData<Employee[]>('/api/employees');
      setEmployees(data);
       console.log(`[Employees Page - ${tenantDomain}] Successfully fetched ${data.length} employees.`);
    } catch (err: any) {
      console.error(`[Employees Page - ${tenantDomain}] Error fetching employees:`, err);
      const errorMessage = err.message || "Failed to load employees. Please try refreshing the page.";
      setError(errorMessage);
      toast({
        title: "Error Loading Employees",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log(`[Employees Page - ${tenantDomain}] Finished fetchEmployees.`);
    }
  }, [toast, tenantDomain]); // Add tenantDomain to dependencies

  // Fetch data on component mount
  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]); // Dependency array includes fetchEmployees

   if (!tenantDomain) {
       // Handle case where domain isn't available yet or is invalid
       return <div>Error: Could not determine tenant context.</div>;
   }

  // Function to handle successful deletion (passed to DataTable)
  const handleEmployeeDeleted = () => {
     console.log(`[Employees Page - ${tenantDomain}] handleEmployeeDeleted triggered. Refetching employees...`);
    // Refetch data to update the table after deletion
    fetchEmployees();
  };

  const renderContent = () => {
     if (isLoading) {
       return (
           <div className="space-y-4">
               <Skeleton className="h-10 w-1/3" /> {/* Filter skeleton */}
               <Skeleton className="h-96 w-full" /> {/* Table skeleton */}
               <Skeleton className="h-10 w-1/4 ml-auto" /> {/* Pagination skeleton */}
           </div>
       );
     }
     if (error) {
       return (
           <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Employees</AlertTitle>
              <AlertDescription>
                 {error} <Button variant="link" onClick={fetchEmployees} className="p-0 h-auto">Try again</Button>
              </AlertDescription>
           </Alert>
       );
     }
     return (
       <EmployeeDataTable
         columns={columns}
         data={employees}
         onEmployeeDeleted={handleEmployeeDeleted}
         // tenantDomain={tenantDomain} // No longer needed here
       />
     );
   };


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
         <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
           <Users className="h-6 w-6" /> Employee Management
         </h1>
         {/* Link uses tenant-relative path */}
         <Button asChild>
             <Link href={`/employees/add`}>
                <UserPlus className="mr-2 h-4 w-4"/> Add New Employee
             </Link>
         </Button>
      </div>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Employees Overview</CardTitle>
            <CardDescription>View, search, and manage employee records for {tenantDomain}.</CardDescription>
         </CardHeader>
         <CardContent>
            {renderContent()}
         </CardContent>
      </Card>
    </div>
  );
}
