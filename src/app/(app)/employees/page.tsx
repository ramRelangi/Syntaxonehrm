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
    console.log(`Fetching data from: ${fullUrl}`); // Log the URL being fetched

    try {
        // Fetch relative to the current origin
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`Fetch response status for ${fullUrl}: ${response.status}`); // Log response status

        if (!response.ok) {
            const errorText = await response.text(); // Get raw error text
            console.error(`Fetch error response body for ${fullUrl}:`, errorText);
            const errorData = JSON.parse(errorText || '{}'); // Try parsing JSON, default to empty object
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error in fetchData for ${fullUrl}:`, error);
        // Rethrow a more specific error if possible, or the original one
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

  // Function to refetch employees
  const fetchEmployees = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use the relative path directly
      const data = await fetchData<Employee[]>('/api/employees');
      setEmployees(data);
    } catch (err: any) {
      setError("Failed to load employees. Please try refreshing the page.");
      toast({
        title: "Error",
        description: err.message || "Could not fetch employee data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Fetch data on component mount
  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Function to handle successful deletion (passed to DataTable)
  const handleEmployeeDeleted = () => {
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
            {error && <p className="text-center text-destructive">{error}</p>}
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
