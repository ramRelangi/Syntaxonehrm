
// src/app/(app)/[domain]/employees/page.tsx
"use client";

import * as React from "react";
import { useParams, useRouter } from 'next/navigation'; // Added useRouter
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, AlertTriangle, Loader2, UserCog } from "lucide-react";
import { EmployeeDataTable } from '@/modules/employees/components/employee-data-table';
import { columns } from '@/modules/employees/components/employee-table-columns';
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from '@/modules/employees/types';
import type { UserRole } from "@/modules/auth/types"; // Import UserRole
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// Removed direct action imports, data comes from props or higher-level fetch

interface EmployeesPageProps {
  // Props will be passed from parent layout or page after fetching session
  // For client components, session data should ideally come via props or context
  // For this example, we'll assume userRole and userId are passed if needed for client-side logic
  // However, the primary data filtering will happen in the server action called by this page.
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employees Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employees Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

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


export default function TenantEmployeesPage({ /* props if passed from layout */ }: EmployeesPageProps) {
  const params = useParams();
  const router = useRouter();
  const tenantDomain = params.domain as string;
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  // Session data (userRole, userId) would ideally be available here
  // For this example, we'll assume it's fetched at a higher level and
  // the `getEmployees` server action uses it correctly.
  // For client-side conditional rendering based on role, you'd need that info here.
  // Let's simulate having userRole available for UI adjustments:
  const [userRole, setUserRole] = React.useState<UserRole | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // In a real app, fetch session info securely or get from context/props
    const fetchSession = async () => {
        try {
            // This is a conceptual client-side fetch; for actual session, use server-provided props
            const sessionResponse = await fetch('/api/auth/session'); // Example endpoint
            if (sessionResponse.ok) {
                const session = await sessionResponse.json();
                setUserRole(session.userRole);
                setCurrentUserId(session.userId);
            } else {
                 setUserRole(null); // Or 'Employee' as a safe default if needed for UI
                 setCurrentUserId(null);
            }
        } catch (e) {
            console.error("Failed to fetch client-side session info:", e);
            setUserRole(null);
            setCurrentUserId(null);
        }
    };
    fetchSession();
  }, []);


  const fetchEmployees = React.useCallback(async () => {
    if (!tenantDomain) {
      setError("Could not determine tenant context.");
      setIsLoading(false);
      return;
    }
    console.log(`[Employees Page - ${tenantDomain}] Starting fetchEmployees...`);
    setIsLoading(true);
    setError(null);
    try {
      // Call the server action (which internally uses session for role-based filtering)
      // We use a generic API call here as an example, but this could also directly invoke the action if set up.
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
  }, [toast, tenantDomain]);

  React.useEffect(() => {
    if (userRole !== null) { // Fetch employees once userRole is determined
        fetchEmployees();
    }
  }, [fetchEmployees, userRole]);

   if (!tenantDomain) {
       return <div>Error: Could not determine tenant context.</div>;
   }

  const handleEmployeeDeleted = () => {
     console.log(`[Employees Page - ${tenantDomain}] handleEmployeeDeleted triggered. Refetching employees...`);
    fetchEmployees();
  };

  const renderContent = () => {
     if (isLoading || userRole === null) { // Also show loading if role isn't determined yet
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
              <AlertTitle>Error Loading Employees</AlertTitle>
              <AlertDescription>
                 {error} <Button variant="link" onClick={fetchEmployees} className="p-0 h-auto">Try again</Button>
              </AlertDescription>
           </Alert>
       );
     }

     // If user is an 'Employee' and data is loaded, potentially show their profile or a restricted view
     if (userRole === 'Employee') {
         if (employees.length === 1 && currentUserId && employees[0].userId === currentUserId) {
             // Option 1: Redirect to their profile page
             // React.useEffect(() => {
             //    router.push(`/${tenantDomain}/employees/${employees[0].id}`);
             // }, [employees, router, tenantDomain]);
             // return <p>Redirecting to your profile...</p>;

             // Option 2: Display a link to their profile
             return (
                 <div className="text-center py-10">
                     <UserCog className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                     <h2 className="text-xl font-semibold">Your Profile</h2>
                     <p className="text-muted-foreground mb-4">You are viewing your employee information.</p>
                     <Button asChild>
                         <Link href={`/${tenantDomain}/employees/${employees[0].id}`}>
                             View My Profile
                         </Link>
                     </Button>
                     {/* Or, show the table with just their data */}
                     {/* <EmployeeDataTable columns={columns} data={employees} onEmployeeDeleted={handleEmployeeDeleted} /> */}
                 </div>
             );
         } else if (employees.length === 0 && currentUserId){
              return <p className="text-center py-10 text-muted-foreground">Your employee profile could not be loaded.</p>;
         }
     }

     return (
       <EmployeeDataTable
         columns={columns}
         data={employees}
         onEmployeeDeleted={handleEmployeeDeleted}
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
