// This component is designated as a Client Component
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { notFound, useParams } from 'next/navigation';
import { Pencil, Loader2 } from "lucide-react";
import type { Employee } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Use relative paths for client-side fetching
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`Fetching data from: ${fullUrl}`); // Log the URL being fetched

    try {
        // Fetch relative to the current origin
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`Fetch response status for ${fullUrl}: ${response.status}`); // Log response status

        if (response.status === 404) return undefined as T; // Handle not found specifically

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


export default function EditEmployeePage() {
  const params = useParams();
  const employeeId = params.id as string; // Get ID from URL params
  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!employeeId) return;

    const fetchEmployee = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Use relative path
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeId}`);
        if (!data) {
          notFound(); // Trigger 404 if API returns undefined/404
          return;
        }
        setEmployee(data);
      } catch (err: any) {
        setError("Failed to load employee data.");
        toast({
          title: "Error",
          description: err.message || "Could not fetch employee details.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId, toast]);

  if (isLoading) {
    return (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
                 <Pencil className="h-6 w-6" /> Loading...
              </h1>
           </div>
           <Card className="shadow-sm">
             <CardHeader>
               <Skeleton className="h-6 w-1/2" />
               <Skeleton className="h-4 w-3/4" />
             </CardHeader>
             <CardContent className="space-y-6">
                <Skeleton className="h-10 w-full" />
                <div className="grid grid-cols-2 gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                <div className="grid grid-cols-2 gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                <div className="grid grid-cols-2 gap-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
                 <div className="flex justify-end gap-2">
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-24" />
                 </div>
             </CardContent>
           </Card>
        </div>
    );
  }

  if (error) {
     return <p className="text-center text-destructive">{error}</p>;
  }

  if (!employee) {
      // This state should ideally be caught by notFound() earlier, but added as a fallback
      return <p className="text-center">Employee not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
             <Pencil className="h-6 w-6" /> Edit Employee: {employee.name}
          </h1>
       </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Update Employee Details</CardTitle>
          <CardDescription>Modify the employee's information below.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Pass the fetched employee data to the form */}
          <EmployeeForm
             employee={employee}
             formTitle="Edit Employee"
             formDescription="Update the employee's information."
             submitButtonText="Save Changes"
           />
        </CardContent>
      </Card>
    </div>
  );
}
