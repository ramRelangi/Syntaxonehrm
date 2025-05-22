
// src/app/(app)/[domain]/employees/[id]/page.tsx
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Briefcase, Building, Calendar as CalendarIconLucide, Activity, Pencil, ArrowLeft, UsersIcon, MapPin, Tag, UserCheck, FileText as LeaveIcon } from 'lucide-react'; // Added LeaveIcon
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';
import type { Employee, EmploymentType } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface EmployeeDetailPageProps {
  // Params are accessed via hook
}

async function fetchData<T>(url: string, options?: RequestInit): Promise<T | undefined> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employee Detail Page - fetchData] Attempting to fetch from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employee Detail Page - fetchData] Response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) {
            console.log(`[Employee Detail Page - fetchData] Resource not found (404) for ${fullUrl}.`);
            // Explicitly log the error payload if any for 404s too, before returning undefined
            const errorText = await response.text().catch(() => ""); // Try to get error text
            if (errorText) {
                console.error(`[Employee Detail Page - fetchData] 404 API Response body for ${fullUrl}:`, errorText);
            }
            return undefined;
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Employee Detail Page - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            let errorData: { message?: string; error?: string; details?: any } = {};
            try {
                if (errorText) errorData = JSON.parse(errorText);
            } catch (e) {
                 console.warn(`[Employee Detail Page - fetchData] Failed to parse error response as JSON for ${fullUrl}. Raw text: ${errorText}`);
                 errorData.message = errorText || `HTTP error! status: ${response.status}`;
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        const responseText = await response.text();
        if (!responseText) {
            console.log(`[Employee Detail Page - fetchData] Received empty response body for ${fullUrl}, returning undefined.`);
            return undefined;
        }
        return JSON.parse(responseText) as T;
    } catch (error) {
        console.error(`[Employee Detail Page - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw error;
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


const getStatusVariant = (status?: Employee['status']): "default" | "secondary" | "outline" | "destructive" => {
  if (!status) return 'outline';
  switch (status) {
    case 'Active': return 'default';
    case 'On Leave': return 'secondary';
    case 'Inactive': return 'outline';
    default: return 'outline';
  }
};

const getEmploymentTypeVariant = (type?: EmploymentType): "default" | "secondary" | "outline" => {
  switch (type) {
    case 'Full-time': return 'default';
    case 'Part-time': return 'secondary';
    case 'Contract': return 'outline';
    default: return 'outline';
  }
}

export default function TenantEmployeeDetailPage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const employeeIdFromUrl = params.id as string;
  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!employeeIdFromUrl || !tenantDomain) {
      console.warn("[TenantEmployeeDetailPage - useEffect] employeeIdFromUrl or tenantDomain is missing. Aborting fetch.");
      setIsLoading(false);
      setError("Required identifiers missing.");
      return;
    }

    const fetchEmployeeDetails = async () => {
      console.log(`[TenantEmployeeDetailPage - fetchEffect] Starting fetch for URL param id: '${employeeIdFromUrl}' in tenant '${tenantDomain}'`);
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeIdFromUrl}`);
        if (!data) {
          console.warn(`[TenantEmployeeDetailPage - fetchEffect] Employee not found for ID '${employeeIdFromUrl}'. Triggering notFound().`);
          notFound();
          return;
        }
        console.log(`[TenantEmployeeDetailPage - fetchEffect] Fetched employee. URL param id: '${employeeIdFromUrl}', Fetched Employee PK: '${data.id}', Fetched Employee UserID: '${data.userId}', Fetched Employee Name: '${data.name}'`);
        setEmployee(data);
      } catch (err: any) {
        console.error(`[TenantEmployeeDetailPage - fetchEffect] Error loading employee profile for ID '${employeeIdFromUrl}':`, err);
        setError(err.message || "Failed to load employee data.");
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

    fetchEmployeeDetails();
  }, [employeeIdFromUrl, tenantDomain, toast]);

   const formatDate = (dateString?: string | null) => {
     if (!dateString) return "N/A";
     try {
       const parsedDate = parseISO(dateString);
       return isValid(parsedDate) ? format(parsedDate, "MMMM d, yyyy") : "Invalid Date";
     } catch (e) { console.error("Error formatting date:", e); return "Invalid Date"; }
   };

   if (!tenantDomain || !employeeIdFromUrl) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Alert variant="destructive">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Context Error</AlertTitle>
            <AlertDescription>Could not determine tenant or employee context.</AlertDescription>
          </Alert>
        </div>
      );
   }

   if (isLoading) {
     return (
         <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-8 w-48" />
              </div>
               <Skeleton className="h-10 w-32" />
           </div>
           <Card className="shadow-sm">
             <CardHeader><Skeleton className="h-6 w-1/3" /><Skeleton className="h-4 w-1/2" /></CardHeader>
             <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-4"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /></div>
                <div className="space-y-4"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /></div>
                <div className="space-y-4 md:col-span-2 lg:col-span-1"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> </div>
             </CardContent>
           </Card>
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="shadow-sm"><CardHeader><Skeleton className="h-5 w-1/2"/><Skeleton className="h-4 w-3/4"/></CardHeader><CardContent><Skeleton className="h-16 w-full"/></CardContent></Card>
              <Card className="shadow-sm"><CardHeader><Skeleton className="h-5 w-1/2"/><Skeleton className="h-4 w-3/4"/></CardHeader><CardContent><Skeleton className="h-16 w-full"/></CardContent></Card>
            </div>
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
                        {error} You may not have permission to view this profile.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }
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

   if (!employee) {
      return (
         <div className="flex flex-col items-center justify-center min-h-[400px]">
             <Alert variant="default" className="max-w-md">
                <AlertTriangle className="h-5 w-5" />
                <AlertTitle>Profile Not Found</AlertTitle>
                <AlertDescription>
                    The employee profile you are trying to view could not be found.
                </AlertDescription>
            </Alert>
        </div>
       );
  }

  const InfoItem = ({ icon: Icon, label, value, isLink = false, hrefPrefix = "" }: { icon: React.ElementType, label: string, value?: string | null, isLink?: boolean, hrefPrefix?: string }) => {
    if (!value && value !== 0) return null;
    return (
        <div className="flex items-start gap-3">
            <Icon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0"/>
            <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                {isLink && value ? (
                    <a href={`${hrefPrefix}${value}`} className="text-sm text-primary hover:underline break-all">{value}</a>
                ) : (
                    <p className="text-sm text-foreground break-words">{value}</p>
                )}
            </div>
        </div>
    );
  };

  if (employee) {
    console.log(`[TenantEmployeeDetailPage - render] Rendering page for URL param id: '${employeeIdFromUrl}'. Current 'employee' state: PK='${employee.id}', UserID='${employee.userId}', Name='${employee.name}'. Edit link will use PK: '${employee.id}'.`);
  } else if (isLoading) {
    console.log(`[TenantEmployeeDetailPage - render] isLoading is true. employeeIdFromUrl from URL: '${employeeIdFromUrl}'`);
  } else if (error) {
    console.log(`[TenantEmployeeDetailPage - render] Error state: ${error}. employeeIdFromUrl from URL: '${employeeIdFromUrl}'`);
  }


  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between flex-wrap gap-4">
         <div className="flex items-center gap-2">
           <Button variant="outline" size="icon" asChild>
             <Link href={`/${tenantDomain}/employees`}>
               <ArrowLeft className="h-4 w-4" />
               <span className="sr-only">Back to Employees</span>
             </Link>
           </Button>
           <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <User className="h-6 w-6" /> {employee.name}
           </h1>
           {employee.employeeId && <Badge variant="outline">ID: {employee.employeeId}</Badge>}
         </div>
          <Button asChild variant="outline">
             <Link href={`/${tenantDomain}/employees/${employee.id}/edit`}>
                 <Pencil className="mr-2 h-4 w-4"/> Edit Employee
             </Link>
         </Button>
      </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
          <CardDescription>Detailed view of the employee's record for {tenantDomain}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
           <div className="space-y-4">
             <InfoItem icon={Mail} label="Email" value={employee.email} isLink hrefPrefix="mailto:" />
             <InfoItem icon={Phone} label="Phone" value={employee.phone} isLink hrefPrefix="tel:" />
             <InfoItem icon={UserCheck} label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
           </div>
           <div className="space-y-4">
             <InfoItem icon={Briefcase} label="Position" value={employee.position} />
             <InfoItem icon={Building} label="Department" value={employee.department} />
             <InfoItem icon={UsersIcon} label="Reporting Manager ID" value={employee.reportingManagerId} />
           </div>
           <div className="space-y-4">
             <InfoItem icon={CalendarIconLucide} label="Hire Date" value={formatDate(employee.hireDate)} />
             <InfoItem icon={MapPin} label="Work Location" value={employee.workLocation} />
             <div className="flex items-start gap-3">
                 <Tag className="h-5 w-5 text-muted-foreground mt-0.5"/>
                 <div>
                     <p className="text-sm font-medium">Employment Type</p>
                     <Badge variant={getEmploymentTypeVariant(employee.employmentType)}>{employee.employmentType || 'N/A'}</Badge>
                 </div>
             </div>
             <div className="flex items-start gap-3">
                 <Activity className="h-5 w-5 text-muted-foreground mt-0.5"/>
                 <div>
                     <p className="text-sm font-medium">Status</p>
                     <Badge variant={getStatusVariant(employee.status)}>{employee.status}</Badge>
                 </div>
             </div>
           </div>
        </CardContent>
      </Card>

       <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-sm">
                <CardHeader><CardTitle>Performance Reviews</CardTitle><CardDescription>Placeholder for review history.</CardDescription></CardHeader>
                <CardContent><p className="text-muted-foreground">Review data will be displayed here.</p></CardContent>
            </Card>
             <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LeaveIcon className="h-5 w-5 text-primary"/> Leave Information
                    </CardTitle>
                    <CardDescription>View leave balances and request history.</CardDescription>
                </CardHeader>
                <CardContent>
                    {employee.userId ? (
                        <Button asChild>
                            <Link href={`/${tenantDomain}/leave?employeeId=${employee.userId}`}>
                                View Leave Details
                            </Link>
                        </Button>
                    ) : (
                        <p className="text-muted-foreground">No user account linked to view leave details.</p>
                    )}
                </CardContent>
            </Card>
       </div>
    </div>
  );
}
