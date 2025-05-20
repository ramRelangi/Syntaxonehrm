
// src/app/(app)/[domain]/employees/[id]/page.tsx
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Briefcase, Building, Calendar, Activity, Pencil, ArrowLeft, UsersIcon, MapPin, Tag, UserCheck } from 'lucide-react'; // Added UsersIcon, MapPin, Tag, UserCheck
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';
import type { Employee, EmploymentType } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface EmployeeDetailPageProps {
  // Params are accessed via hook
}

// Helper to fetch data from API routes - CLIENT SIDE VERSION (API handles tenant context)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Employee Detail Page - fetchData] Fetching data from: ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Employee Detail Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) return undefined as T;
         if (response.status === 400 && (await response.text()).includes('Tenant context')) {
              throw new Error('Tenant information is missing. Unable to load data.');
         }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Employee Detail Page - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            const errorData = JSON.parse(errorText || '{}');
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Employee Detail Page - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


// Helper function to determine badge variant based on status
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
  const employeeId = params.id as string;
  const { toast } = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  // Consider fetching manager's name if reportingManagerId exists
  // const [managerName, setManagerName] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!employeeId || !tenantDomain) return;

    const fetchEmployeeDetails = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchData<Employee | undefined>(`/api/employees/${employeeId}`);
        if (!data) {
          notFound();
          return;
        }
        setEmployee(data);

        // Optional: Fetch manager details if reportingManagerId exists
        // if (data.reportingManagerId) {
        //   const managerData = await fetchData<Employee | undefined>(`/api/employees/${data.reportingManagerId}`);
        //   if (managerData) setManagerName(managerData.name);
        // }

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

    fetchEmployeeDetails();
  }, [employeeId, tenantDomain, toast]);

   const formatDate = (dateString?: string | null) => {
     if (!dateString) return "N/A";
     try {
       const parsedDate = parseISO(dateString);
       return isValid(parsedDate) ? format(parsedDate, "MMMM d, yyyy") : "Invalid Date";
     } catch (e) { console.error("Error formatting date:", e); return "Invalid Date"; }
   };

   if (!tenantDomain || !employeeId) {
      return <div>Loading context...</div>;
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
             <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"> {/* Adjusted grid for more fields */}
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
     return <p className="text-center text-destructive py-10">{error}</p>;
  }

   if (!employee) {
      return <p className="text-center py-10">Employee not found.</p>;
  }

  const InfoItem = ({ icon: Icon, label, value, isLink = false, hrefPrefix = "" }: { icon: React.ElementType, label: string, value?: string | null, isLink?: boolean, hrefPrefix?: string }) => {
    if (!value && value !== 0) return null; // Render nothing if value is undefined or null (except 0)
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
        <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"> {/* Adjusted grid */}
           <div className="space-y-4">
             <InfoItem icon={Mail} label="Email" value={employee.email} isLink hrefPrefix="mailto:" />
             <InfoItem icon={Phone} label="Phone" value={employee.phone} isLink hrefPrefix="tel:" />
             <InfoItem icon={UserCheck} label="Date of Birth" value={formatDate(employee.dateOfBirth)} />
           </div>
           <div className="space-y-4">
             <InfoItem icon={Briefcase} label="Position" value={employee.position} />
             <InfoItem icon={Building} label="Department" value={employee.department} />
             <InfoItem icon={UsersIcon} label="Reporting Manager ID" value={employee.reportingManagerId} />
             {/* TODO: Fetch and display manager's name instead of ID */}
           </div>
           <div className="space-y-4">
             <InfoItem icon={Calendar} label="Hire Date" value={formatDate(employee.hireDate)} />
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
                <CardHeader><CardTitle>Leave History</CardTitle>
                <CardDescription><Link href={`/${tenantDomain}/leave?employeeId=${employeeId}`} className='text-primary hover:underline'>View leave history</Link></CardDescription></CardHeader>
                <CardContent><p className="text-muted-foreground">Recent leave records will be displayed here.</p></CardContent>
            </Card>
       </div>
    </div>
  );
}
