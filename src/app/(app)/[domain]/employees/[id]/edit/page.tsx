
// src/app/(app)/[domain]/employees/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { useParams, notFound } from 'next/navigation'; // Import notFound
import { Pencil, Loader2, AlertTriangle } from "lucide-react";
import type { Employee } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from '@/modules/auth/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface EditEmployeePageProps {
  // Params are now accessed via useParams() hook directly
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Edit Employee Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Edit Employee Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) {
            console.log(`[Edit Employee Page - fetchData] 404 for ${fullUrl}.`);
            return undefined as T; // Handle not found specifically
        }
         if (response.status === 400 && (await response.text()).includes('Tenant context')) {
             console.error(`[Edit Employee Page - fetchData] Tenant context error for ${fullUrl}.`);
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
           throw error; // Re-throw the original error to be caught by the caller
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


export default function TenantEditEmployeePage() {
  const paramsFromHook = useParams();
  const tenantDomain = paramsFromHook?.domain as string;
  const employeeId = paramsFromHook?.id as string; // This is the employee.id (PK) from URL

  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = React.useState<UserRole | null>(null);

  React.useEffect(() => {
    const fetchUserRole = async () => {
        console.log("[Edit Employee Page] Fetching user role...");
        try {
            const sessionResponse = await fetch('/api/auth/session');
            if (sessionResponse.ok) {
                const session = await sessionResponse.json();
                console.log("[Edit Employee Page] Session details fetched:", session);
                setCurrentUserRole(session.userRole);
            } else {
                const errorData = await sessionResponse.json().catch(() => ({}));
                console.error("[Edit Employee Page] Failed to fetch session details for role check. Status:", sessionResponse.status, "Error:", errorData.error || errorData.message);
                setError(errorData.error || errorData.message || "Could not verify user session for role check.");
                setCurrentUserRole(null); // Fallback or handle error
            }
        } catch (err: any) {
            console.error("[Edit Employee Page] Error in fetchUserRole:", err);
            setError("Error fetching session details: " + err.message);
            setCurrentUserRole(null); // Fallback to least privileged
        }
    };
    if (tenantDomain) { // Only fetch if domain is present
        fetchUserRole();
    }
  }, [tenantDomain]);

  React.useEffect(() => {
    if (!employeeId || !tenantDomain) return;

    const fetchEmployee = async () => {
      console.log(`[Edit Employee Page] Attempting to fetch employee with ID (PK): ${employeeId}`);
      setIsLoading(true);
      setError(null);
      try {
        // The API route uses employeeId (PK) for fetching
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeId}`);
        if (!data) {
          console.log(`[Edit Employee Page] Employee profile not found for ID (PK): ${employeeId}. Triggering notFound().`);
          notFound(); // Use Next.js notFound for actual 404 page
          return;
        }
        setEmployee(data);
        console.log(`[Edit Employee Page] Employee data fetched successfully for ID (PK): ${employeeId}`);
      } catch (err: any) {
        console.error(`[Edit Employee Page] Error loading employee profile for ID (PK) ${employeeId}:`, err);
        setError(err.message || "Failed to load employee data.");
        // Toast is now conditional based on error type, and only if not a 404 handled by notFound()
        if (!err.message?.toLowerCase().includes('unauthorized') && !err.message?.toLowerCase().includes('not found')) {
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

  if (!tenantDomain || !employeeId) { // Should be caught by middleware/layout, but defensive check
       return <div>Loading context...</div>;
   }

  if (isLoading || currentUserRole === null) { // Also wait for role to load
    return (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
                 <Pencil className="h-6 w-6" /> Loading Employee Details...
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
    // If notFound() was called, Next.js handles rendering the 404 page.
    // This section is for other errors.
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Alert variant="destructive" className="max-w-md">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle>Error Loading Profile</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        </div>
    );
  }

  // This check is technically redundant if notFound() is called, but good for safety
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
             currentUserRole={currentUserRole}
           />
        </CardContent>
      </Card>
    </div>
  );
}
