// src/app/(app)/[domain]/employees/[id]/edit/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { notFound, useParams } from 'next/navigation';
import { Pencil, Loader2 } from "lucide-react";
import type { Employee } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRole } from '@/modules/auth/types'; // Import UserRole

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
            const errorData = JSON.parse(errorText || '{}');
            throw new Error(errorData.message || errorData.error || 'Unauthorized to view this employee profile.');
        }


        if (!response.ok) {
            const errorText = await response.text(); // Get raw error text
            console.error(`[Edit Employee Page - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            const errorData = JSON.parse(errorText || '{}'); // Try parsing JSON, default to empty object
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
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
            // For example, you might have an API endpoint `/api/auth/session-details`
            // const sessionDetails = await fetch('/api/auth/session-details').then(res => res.json());
            // setCurrentUserRole(sessionDetails.role);

            // Mocking for now, assuming Admin if not the employee themselves, or Employee if IDs match roughly
            // This is a simplification; proper role fetching is crucial.
            // For testing, you might want to hardcode this to 'Employee' or 'Admin'
            // Let's assume a simple mock: if employeeId implies it's "my" profile, role is Employee.
            // This logic is NOT robust for real use.
            const mockSessionUserId = "7d23bea1-6664-4e0e-840a-46ba89c53c64"; // Example, replace with actual logic
            if (employeeId === mockSessionUserId) {
                 setCurrentUserRole('Employee');
            } else {
                 setCurrentUserRole('Admin'); // Default to Admin for testing other cases
            }

        } catch (err) {
            console.error("Failed to fetch user role:", err);
            setCurrentUserRole('Employee'); // Fallback to least privileged
        }
    };
    fetchUserRole();
  }, [employeeId]);

  React.useEffect(() => {
    if (!employeeId || !tenantDomain) return;

    const fetchEmployee = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeId}`);
        if (!data) {
          notFound();
          return;
        }
        setEmployee(data);
      } catch (err: any) {
        setError(err.message || "Failed to load employee data.");
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
     return <p className="text-center text-destructive py-10">{error}</p>;
  }

  if (!employee) {
       return <p className="text-center py-10">Employee not found.</p>;
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
