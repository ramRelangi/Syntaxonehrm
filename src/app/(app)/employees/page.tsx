// This component is designated as a Client Component
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from '@/modules/employees/types';

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Use relative paths for client-side fetching
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employees Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        // Fetch relative to the current origin
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


export default function EmployeesPage() {
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Function to refetch employees via API
  const fetchEmployees = React.useCallback(async () => {
    console.log("[Employees Page] Starting fetchEmployees...");
    setIsLoading(true);
    setError(null);
    try {
      // Use the relative path to the API route
      const data = await fetchData<Employee[]>('/api/employees');
      setEmployees(data);
       console.log(`[Employees Page] Successfully fetched ${data.length} employees.`);
    } catch (err: any) {
      console.error("[Employees Page] Error fetching employees:", err);
      setError("Failed to load employees. Please try refreshing the page.");
      toast({
        title: "Error Loading Employees",
        description: err.message || "Could not fetch employee data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      console.log("[Employees Page] Finished fetchEmployees.");
    }
  }, [toast]);

  // Fetch data on component mount
  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Function to handle successful deletion (passed to DataTable)
  const handleEmployeeDeleted = () => {
     console.log("[Employees Page] handleEmployeeDeleted triggered. Refetching employees...");
    // Refetch data to update the table after deletion
    fetchEmployees();
  };

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
                columns={columns}
                data={employees}
                onEmployeeDeleted={handleEmployeeDeleted} // Pass callback
              />
            )}
         </CardContent>
      </Card>
    </div>
  );
}
