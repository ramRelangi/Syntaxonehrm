
// src/app/(app)/[domain]/employees/page.tsx
"use client";

import * as React from "react";
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from '@/modules/employees/types';

interface EmployeesPageProps {
  params: { domain: string };
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // API routes are called directly, middleware ensures tenant context via header
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employees Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employees Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            let errorPayload = { message: `HTTP error! status: ${response.status}` };
             try {
                const errorText = await response.text();
                 if (errorText) {
                    errorPayload = JSON.parse(errorText);
                 }
             } catch (e) {
                 // Ignore JSON parsing error if response is not JSON
             }
             console.error(`[Employees Page - fetchData] Fetch error for ${fullUrl}:`, errorPayload.message);
             // Handle specific 400 error for missing tenant
             if (response.status === 400 && errorPayload.message.includes('Tenant context')) {
                 throw new Error('Tenant information is missing. Unable to load data.');
             }
             throw new Error(errorPayload.message);
        }
        const data = await response.json();
        console.log(`[Employees Page - fetchData] Successfully fetched data for ${fullUrl}`);
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
  const tenantDomain = params.domain;
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Function to refetch employees via API (API route uses tenant header)
  const fetchEmployees = React.useCallback(async () => {
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
      setError(err.message || "Failed to load employees. Please try refreshing the page.");
      toast({
        title: "Error Loading Employees",
        description: err.message || "Could not fetch employee data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log(`[Employees Page - ${tenantDomain}] Finished fetchEmployees.`);
    }
  }, [toast, tenantDomain]);

  // Fetch data on component mount
  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Function to handle successful deletion (passed to DataTable)
  const handleEmployeeDeleted = () => {
     console.log(`[Employees Page - ${tenantDomain}] handleEmployeeDeleted triggered. Refetching employees...`);
    // Refetch data to update the table after deletion
    fetchEmployees();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
         <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
           <Users className="h-6 w-6" /> Employee Management
         </h1>
         {/* Link uses tenant-relative path */}
         <Button asChild>
             <Link href={`/${tenantDomain}/employees/add`}>
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
            {isLoading && (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-1/3" /> {/* Filter skeleton */}
                    <Skeleton className="h-96 w-full" /> {/* Table skeleton */}
                    <Skeleton className="h-10 w-1/4 ml-auto" /> {/* Pagination skeleton */}
                </div>
            )}
            {error && <p className="text-center text-destructive py-10">{error}</p>}
            {!isLoading && !error && (
              <EmployeeDataTable
                columns={columns} // Columns need to be adapted for tenant-relative links
                data={employees}
                onEmployeeDeleted={handleEmployeeDeleted} // Pass callback
                tenantDomain={tenantDomain} // Pass domain for link generation in columns
              />
            )}
         </CardContent>
      </Card>
    </div>
  );
}
