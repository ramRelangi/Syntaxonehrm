
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound, useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Briefcase, Building, Calendar as CalendarIconLucide, Activity, Pencil, ArrowLeft, UsersIcon, MapPin, Tag, UserCheck, FileText as LeaveIcon, ShieldCheck, LandPlot, BriefcaseBusiness, CalendarClock, Dot, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';
import type { Employee, EmploymentType, EmployeeStatus } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { UserRole } from '@/modules/auth/types';

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
            console.warn(`[Employee Detail Page - fetchData] Resource not found (404) for ${fullUrl}.`);
            const errorText = await response.text().catch(() => "");
            let errorMessage = `Resource not found at ${fullUrl}`;
            if (errorText) {
                 try {
                    const errorPayload = JSON.parse(errorText);
                    console.error(`[Employee Detail Page - fetchData] 404 API Response JSON:`, errorPayload);
                    errorMessage = errorPayload.error || errorMessage;
                 } catch {
                    console.error(`[Employee Detail Page - fetchData] 404 API Response (not JSON):`, errorText);
                    errorMessage = `${errorMessage}. Server response: ${errorText.substring(0,100)}`;
                 }
            }
            throw new Error(errorMessage); 
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

const getStatusVariant = (status?: EmployeeStatus): "default" | "secondary" | "outline" | "destructive" => {
  if (!status) return 'outline';
  switch (status) {
    case 'Active': return 'default'; 
    case 'On Leave': return 'secondary'; 
    case 'Inactive': return 'destructive'; 
    default: return 'outline';
  }
};

const getStatusIcon = (status?: EmployeeStatus) => {
  if (!status) return <Dot className="h-4 w-4 text-muted-foreground" />;
  switch (status) {
    case 'Active': return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'On Leave': return <CalendarClock className="h-4 w-4 text-blue-600" />;
    case 'Inactive': return <XCircle className="h-4 w-4 text-red-600" />;
    default: return <Dot className="h-4 w-4 text-muted-foreground" />;
  }
};


export default function TenantEmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantDomain = params.domain as string;
  const employeeIdFromUrl = params.id as string; 
  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = React.useState<UserRole | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null); 


  React.useEffect(() => {
    const fetchSessionInfo = async () => {
        try {
            const res = await fetch('/api/auth/session'); 
            if (res.ok) {
                const session = await res.json();
                setCurrentUserRole(session.userRole);
                setCurrentUserId(session.userId); 
            } else {
                console.error("Failed to fetch session info:", await res.text());
                setError("Could not verify user session.");
            }
        } catch (e) {
            console.error("Error fetching session info:", e);
            setError("Error verifying session.");
        }
    };
    fetchSessionInfo();
  }, []);


  React.useEffect(() => {
    if (!employeeIdFromUrl || !tenantDomain || currentUserRole === null || currentUserId === null) {
      if (!employeeIdFromUrl || !tenantDomain) {
        console.warn("[TenantEmployeeDetailPage - useEffect] employeeIdFromUrl or tenantDomain is missing. Aborting fetch.");
        setError("Required identifiers missing.");
        setIsLoading(false);
      }
      return;
    }

    const fetchEmployeeDetails = async () => {
      console.log(`[TenantEmployeeDetailPage - fetchEffect] Starting fetch for URL param id: '${employeeIdFromUrl}' in tenant '${tenantDomain}'`);
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeIdFromUrl}`);
        if (!data) {
          console.warn(`[TenantEmployeeDetailPage - fetchEffect] Employee not found via API for ID '${employeeIdFromUrl}'. Triggering notFound().`);
          notFound();
          return;
        }
        console.log(`[TenantEmployeeDetailPage - fetchEffect] Fetched employee. URL param id: '${employeeIdFromUrl}', Fetched Employee PK: '${data.id}', Fetched Employee UserID: '${data.userId}', Fetched Employee Name: '${data.name}'`);
        setEmployee(data);
      } catch (err: any) {
        console.error(`[TenantEmployeeDetailPage - fetchEffect] Error loading employee profile for ID '${employeeIdFromUrl}':`, err);
        setError(err.message || "Failed to load employee data.");
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

    fetchEmployeeDetails();
  }, [employeeIdFromUrl, tenantDomain, toast, currentUserRole, currentUserId]); 

   const formatDate = (dateString?: string | null) => {
     if (!dateString) return "N/A";
     try {
       const parsedDate = parseISO(dateString);
       return isValid(parsedDate) ? format(parsedDate, "MMMM d, yyyy") : "Invalid Date";
     } catch (e) { console.error("Error formatting date:", e); return "Invalid Date"; }
   };

   if (isLoading || currentUserRole === null) { 
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
                 <Button variant="outline" onClick={() => router.back()} className="mt-4">Go Back</Button>
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
                 <Button variant="outline" onClick={() => router.back()} className="mt-4">Go Back</Button>
            </Alert>
        </div>
       );
  }

  const canEditThisProfile = currentUserRole === 'Admin' || currentUserRole === 'Manager' || (currentUserRole === 'Employee' && employee.userId === currentUserId);


  const InfoItem = ({ icon: Icon, label, value, isLink = false, hrefPrefix = "" }: { icon: React.ElementType, label: string, value?: string | null | boolean, isLink?: boolean, hrefPrefix?: string }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="flex items-start gap-3 py-2">
            <Icon className="h-5 w-5 text-muted-foreground mt-1 flex-shrink-0"/>
            <div className="flex-grow">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                {isLink && typeof value === 'string' ? (
                    <a href={`${hrefPrefix}${value}`} className="text-sm text-primary hover:underline break-all">{value}</a>
                ) : (
                    <p className="text-sm text-foreground break-words">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || 'N/A')}</p>
                )}
            </div>
        </div>
    );
  };
  
  if (employee) {
    console.log(`[TenantEmployeeDetailPage - render] Rendering page for URL param id: '${employeeIdFromUrl}'. Current 'employee' state: PK='${employee.id}', UserID='${employee.userId}', Name='${employee.name}'. Edit link will use PK: '${employee.id}'.`);
  }


  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between flex-wrap gap-4">
         <div className="flex items-center gap-3">
           <Button variant="outline" size="icon" asChild>
             <Link href={`/${tenantDomain}/employees`}>
               <ArrowLeft className="h-4 w-4" />
               <span className="sr-only">Back to Employees</span>
             </Link>
           </Button>
           <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <User className="h-7 w-7 text-primary" /> {employee.name}
           </h1>
           {employee.employeeId && <Badge variant="outline" className="text-sm font-mono">ID: {employee.employeeId}</Badge>}
         </div>
         {canEditThisProfile && (
             <Button asChild variant="default">
                <Link href={`/${tenantDomain}/employees/${employee.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4"/> Edit Profile
                </Link>
            </Button>
         )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-md">
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" />Personal & Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-0 divide-y sm:divide-y-0 sm:divide-x">
                <div className="space-y-1 pr-0 sm:pr-6 py-2 sm:py-0">
                    <InfoItem icon={Mail} label="Official Email" value={employee.email} isLink hrefPrefix="mailto:" />
                    <InfoItem icon={Mail} label="Personal Email" value={employee.personal_email} isLink hrefPrefix="mailto:" />
                    <InfoItem icon={Phone} label="Phone" value={employee.phone} isLink hrefPrefix="tel:" />
                    <InfoItem icon={CalendarIconLucide} label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
                     <InfoItem icon={User} label="Gender" value={employee.gender} />
                </div>
                <div className="space-y-1 pl-0 sm:pl-6 py-2 sm:py-0">
                    <InfoItem icon={ShieldCheck} label="Marital Status" value={employee.marital_status} />
                    <InfoItem icon={LandPlot} label="Nationality" value={employee.nationality} />
                    <InfoItem icon={Activity} label="Blood Group" value={employee.blood_group} />
                </div>
            </CardContent>
        </Card>

        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-primary" />Employment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 divide-y">
                <InfoItem icon={Briefcase} label="Position" value={employee.position} />
                <InfoItem icon={Building} label="Department" value={employee.department} />
                <InfoItem icon={Tag} label="Employment Type" value={employee.employmentType} />
                <InfoItem icon={CalendarClock} label="Hire Date" value={formatDate(employee.hireDate)} />
                <InfoItem icon={MapPin} label="Work Location" value={employee.workLocation} />
                <div className="flex items-start gap-3 py-2">
                    {getStatusIcon(employee.status)}
                    <div>
                        <p className="text-xs font-medium text-muted-foreground">Status</p>
                        <Badge variant={getStatusVariant(employee.status)} className="mt-1">{employee.status}</Badge>
                    </div>
                </div>
                {employee.reportingManagerId && ( 
                    <InfoItem icon={UsersIcon} label="Reporting Manager ID" value={employee.reportingManagerId} />
                )}
            </CardContent>
        </Card>
      </div>


       <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><User className="h-5 w-5 text-primary"/>Emergency Contact</CardTitle>
                </CardHeader>
                 <CardContent className="space-y-1 divide-y">
                     <InfoItem icon={User} label="Name" value={employee.emergency_contact_name} />
                     <InfoItem icon={Phone} label="Number" value={employee.emergency_contact_number} isLink hrefPrefix="tel:" />
                 </CardContent>
            </Card>
             <Card className="shadow-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <LeaveIcon className="h-5 w-5 text-primary"/> Leave Information
                    </CardTitle>
                    <CardDescription>View leave balances and request history for this employee.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild>
                        <Link href={`/${tenantDomain}/leave?employeeId=${employee.userId || employee.id}`}>
                            View Leave Details
                        </Link>
                    </Button>
                </CardContent>
            </Card>
       </div>
    </div>
  );
}
