// src/app/(app)/[domain]/employees/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { notFound, useParams } from 'next/navigation';
import { Pencil, Loader2, AlertTriangle } from "lucide-react"; // Added AlertTriangle
import type { Employee } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from '@/modules/auth/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Added Alert components

interface EditEmployeePageProps {
  // Params are now accessed via React.use(params)
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Edit Employee Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        // API route handles tenant context via header
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Edit Employee Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) return undefined as T; // Handle not found specifically
         if (response.status === 400 && (await response.text()).includes('Tenant context')) {
             throw new Error('Tenant information is missing. Unable to load data.');
         }
         if (response.status === 403) { // Handle unauthorized specifically
            const errorText = await response.text();
            console.error(`[Edit Employee Page - fetchData] Unauthorized access (403) for ${fullUrl}:`, errorText);
            let errorData: { message?: string; error?: string } = {};
            try {
                if (errorText) errorData = JSON.parse(errorText);
            } catch (e) {
                console.warn(`[Edit Employee Page - fetchData] Failed to parse 403 error response as JSON for ${fullUrl}. Raw text: ${errorText}`);
                // Use the raw text if JSON parsing fails but an errorText exists
                errorData.message = errorText || 'Unauthorized to view this employee profile.';
            }
            throw new Error(errorData.message || errorData.error || 'Unauthorized to view this employee profile.');
        }


        if (!response.ok) {
            const errorText = await response.text(); // Get raw error text
            console.error(`[Edit Employee Page - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            let errorData: { message?: string; error?: string } = {};
             try {
                 if (errorText) errorData = JSON.parse(errorText);
             } catch (e) {
                 console.warn(`[Edit Employee Page - fetchData] Failed to parse error response as JSON for ${fullUrl}. Raw text: ${errorText}`);
                 errorData.message = errorText || `HTTP error! status: ${response.status}`;
             }
            throw new Error(errorData.message || errorData.error || `HTTP error! status: ${response.status}`);
        }
        const responseText = await response.text();
        if (!responseText) {
            console.log(`[Edit Employee Page - fetchData] Received empty response body for ${fullUrl}, returning undefined.`);
            return undefined as T;
        }
        return JSON.parse(responseText) as T;
    } catch (error) {
        console.error(`[Edit Employee Page - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


export default function TenantEditEmployeePage() {
  const params = React.use(useParams()); // Use React.use to get params
  const tenantDomain = params?.domain as string;
  const employeeId = params?.id as string;

  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = React.useState<UserRole | null>(null); // State for user role

  React.useEffect(() => {
    // Simulate fetching current user's role
    // In a real app, this would come from a session context or a dedicated API call
    const fetchUserRole = async () => {
        try {
            // Placeholder: Replace with actual session/role fetching logic
            // Example: const sessionDetails = await fetch('/api/auth/session-details').then(res => res.json());
            // setCurrentUserRole(sessionDetails.role);

            // Mocking for now
             // Fetch actual session data (e.g., from a context or a simple API endpoint)
             const sessionResponse = await fetch('/api/auth/session'); // Example endpoint
             if (sessionResponse.ok) {
                 const session = await sessionResponse.json();
                 setCurrentUserRole(session.userRole);
             } else {
                 console.error("Failed to fetch session details for role check.");
                 setCurrentUserRole('Employee'); // Fallback or handle error
             }
        } catch (err) {
            console.error("Failed to fetch user role:", err);
            setCurrentUserRole('Employee'); // Fallback to least privileged
        }
    };
    fetchUserRole();
  }, []);

  React.useEffect(() => {
    if (!employeeId || !tenantDomain) return;

    const fetchEmployee = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeId}`);
        if (!data) {
          setError("Employee profile not found."); // Set specific error for notFound
          // notFound(); // This would render Next.js default 404, error state allows custom UI
          return;
        }
        setEmployee(data);
      } catch (err: any) {
        setError(err.message || "Failed to load employee data.");
        // Toast is now conditional based on error type
        if (!err.message?.toLowerCase().includes('unauthorized')) {
          toast({
            title: "Error Loading Profile",
            description: err.message || "Could not fetch employee details.",
            variant: "destructive",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId, tenantDomain, toast]);

  if (!tenantDomain || !employeeId) {
       return <div>Loading context...</div>;
   }

  if (isLoading || currentUserRole === null) { // Also wait for role to load
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
    if (error.toLowerCase().includes('unauthorized')) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                 <Alert variant="destructive" className="max-w-md">
                    <AlertTriangle className="h-5 w-5" />
                    <AlertTitle>Access Denied</AlertTitle>
                    <AlertDescription>
                        {error} You may not have permission to edit this profile.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }
    return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!employee) {
       return (
         <div className="flex flex-col items-center justify-center min-h-[400px]">
             <Alert variant="default" className="max-w-md">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle>Profile Not Found</AlertTitle>
                <AlertDescription>
                    The employee profile you are trying to edit could not be found.
                </AlertDescription>
            </Alert>
        </div>
       );
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
          <CardDescription>Modify the employee's information for {tenantDomain}.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeForm
             employee={employee}
             formTitle="Edit Employee"
             formDescription="Update the employee's information."
             submitButtonText="Save Changes"
             tenantDomain={tenantDomain}
             currentUserRole={currentUserRole} // Pass the role
           />
        </CardContent>
      </Card>
    </div>
  );
}
