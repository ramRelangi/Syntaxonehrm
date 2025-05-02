"use client"; // Make this a client component to fetch data

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from "@/modules/employees/types";

// Helper to fetch data from API routes
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Construct the full URL relative to the application's base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '/'; // Use relative path for client-side fetching
    const fullUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}${url.startsWith('/') ? url.substring(1) : url}`;

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options }); // Use no-store for dynamic data
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${fullUrl}:`, error);
        throw error; // Re-throw to be caught by component
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
      const data = await fetchData<Employee[]>('api/employees');
      setEmployees(data);
    } catch (err: any) {
      setError("Failed to load employees. Please try refreshing the page.");
      toast({
        title: "Error",
        description: "Could not fetch employee data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Added toast to dependency array

  // Fetch data on component mount
  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]); // Use the memoized fetch function

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
