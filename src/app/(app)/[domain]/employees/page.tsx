
"use client";

import * as React from "react";
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, AlertTriangle, Loader2, UserCog } from "lucide-react";
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from '@/modules/employees/types';
import type { UserRole } from "@/modules/auth/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Client-side fetch, API route handles auth and tenant context
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employees Page - fetchData] Fetching data from: ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employees Page - fetchData] Response status for ${fullUrl}: ${response.status}`);
        if (!response.ok) {
            let errorPayload = { message: `HTTP error! status: ${response.status}`, error: '' };
            let errorText = '';
            try {
                errorText = await response.text();
                if (errorText) {
                    errorPayload = JSON.parse(errorText) as { message: string, error?: string };
                }
            } catch (e) {
                console.warn(`[Employees Page - fetchData] Failed to parse error response as JSON for ${fullUrl}:`, errorText);
                errorPayload.message = errorText || errorPayload.message;
            }
            console.error(`[Employees Page - fetchData] Fetch error for ${fullUrl}:`, errorPayload);
            if (response.status === 401 || response.status === 403 || (errorPayload.message && (errorPayload.message.includes('Unauthorized') || errorPayload.message.includes('Tenant context not found')))) {
                throw new Error(errorPayload.message || 'Unauthorized. Unable to load data.');
            } else if (response.status === 400 && errorPayload.message && errorPayload.message.includes('Tenant context')) {
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

export default function TenantEmployeesPage() {
  const params = useParams();
  const router = useRouter();
  const tenantDomain = params.domain as string;
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [userRole, setUserRole] = React.useState<UserRole | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchSessionInfo = async () => {
      console.log("[Employees Page] Attempting to fetch client-side session info...");
      try {
        const sessionResponse = await fetch('/api/auth/session');
        if (sessionResponse.ok) {
          const session = await sessionResponse.json();
          console.log("[Employees Page] Client-side session info fetched:", session);
          setUserRole(session.userRole);
          setCurrentUserId(session.userId); // This is the user.id (UUID)
        } else {
          const errorData = await sessionResponse.json().catch(() => ({}));
          console.warn("[Employees Page] Failed to fetch client-side session info, status:", sessionResponse.status, "Error:", errorData.error || errorData.message);
          setError(errorData.error || errorData.message || "Could not verify user session.");
          setUserRole(null);
          setCurrentUserId(null);
        }
      } catch (e: any) {
        console.error("[Employees Page] Error fetching client-side session info:", e);
        setError("Error fetching session details: " + e.message);
        setUserRole(null);
        setCurrentUserId(null);
      }
    };
    if (tenantDomain) {
        fetchSessionInfo();
    } else {
        setError("Tenant domain not found.");
        setIsLoading(false);
    }
  }, [tenantDomain]);

  const fetchEmployees = React.useCallback(async () => {
    if (!tenantDomain) {
      setError("Could not determine tenant context.");
      setIsLoading(false);
      return;
    }
    // Wait for session info to be available before fetching employees
    if (userRole === null || currentUserId === null) {
        console.log("[Employees Page - fetchEmployees] Waiting for session info...");
        return;
    }

    console.log(`[Employees Page - ${tenantDomain}] Starting fetchEmployees... Role: ${userRole}, UserID: ${currentUserId}`);
    setIsLoading(true);
    setError(null);
    try {
      // API route will filter based on role (fetches all for Admin/Manager, self for Employee)
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
  }, [toast, tenantDomain, userRole, currentUserId]);

  React.useEffect(() => {
    if (userRole !== null && currentUserId !== null && tenantDomain) {
        fetchEmployees();
    }
  }, [fetchEmployees, userRole, currentUserId, tenantDomain]);

   if (!tenantDomain) {
       return <div className="text-center text-destructive py-10">Error: Could not determine tenant context.</div>;
   }

  const handleEmployeeDeleted = () => {
     console.log(`[Employees Page - ${tenantDomain}] handleEmployeeDeleted triggered. Refetching employees...`);
    fetchEmployees();
  };

  const renderContent = () => {
     if (isLoading || userRole === null) { // Still loading if role isn't determined
       return (
           <div className="space-y-4">
               <Skeleton className="h-10 w-1/3" />
               <Skeleton className="h-96 w-full" />
               <Skeleton className="h-10 w-1/4 ml-auto" />
           </div>
       );
     }
     if (error) {
       return (
           <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Loading Data</AlertTitle>
              <AlertDescription>
                 {error} <Button variant="link" onClick={fetchEmployees} className="p-0 h-auto">Try again</Button>
              </AlertDescription>
           </Alert>
       );
     }

     if (userRole === 'Employee') {
         // Employees see their own profile. The API should return only their record.
         if (employees.length === 1 && currentUserId && employees[0].userId === currentUserId) {
             // Link to employee detail page using employee.id (PK), not user.id
             const employeePrimaryKey = employees[0].id;
             return (
                 <div className="text-center py-10">
                     <UserCog className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                     <h2 className="text-xl font-semibold">Your Profile</h2>
                     <p className="text-muted-foreground mb-4">You are viewing your employee information.</p>
                     <Button asChild>
                         <Link href={`/${tenantDomain}/employees/${employeePrimaryKey}`}>
                             View My Detailed Profile
                         </Link>
                     </Button>
                 </div>
             );
         } else if (employees.length === 0 && currentUserId){
              return <p className="text-center py-10 text-muted-foreground">Your employee profile could not be loaded or is not yet available.</p>;
         } else if (employees.length > 1) {
             // This case shouldn't happen if API correctly filters for employee role
             console.warn("[Employees Page] Employee role sees multiple records. This should not happen.");
             return <p className="text-center py-10 text-destructive">Error: Inconsistent data. Please contact support.</p>;
         }
     }

     // For Admin/Manager
     return (
       <EmployeeDataTable
         columns={columns}
         data={employees}
         onEmployeeDeleted={handleEmployeeDeleted}
         // tenantDomain is used by ActionsCell via params hook now
       />
     );
   };


  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
         <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
           <Users className="h-6 w-6" /> {userRole === 'Employee' ? 'My Profile Overview' : 'Employee Management'}
         </h1>
         {(userRole === 'Admin' || userRole === 'Manager') && (
             <Button asChild>
                 <Link href={`/${tenantDomain}/employees/add`}>
                    <UserPlus className="mr-2 h-4 w-4"/> Add New Employee
                 </Link>
             </Button>
         )}
      </div>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>{userRole === 'Employee' ? 'Your Information' : 'Employees Overview'}</CardTitle>
            <CardDescription>
                {userRole === 'Employee' ? `Viewing your employee details for ${tenantDomain}.` : `View, search, and manage employee records for ${tenantDomain}.`}
            </CardDescription>
         </CardHeader>
         <CardContent>
            {renderContent()}
         </CardContent>
      </Card>
    </div>
  );
}
