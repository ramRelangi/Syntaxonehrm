"use client"; // Make detail page a client component

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound, useParams } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Briefcase, Building, Calendar, Activity, Pencil, ArrowLeft } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';
import type { Employee } from '@/modules/employees/types';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

// Helper to fetch data from API routes
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '/';
    const fullUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}${url.startsWith('/') ? url.substring(1) : url}`;
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (!response.ok) {
            if (response.status === 404) return undefined as T; // Handle not found specifically
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${fullUrl}:`, error);
        throw error;
    }
}


// Helper function to determine badge variant based on status
const getStatusVariant = (status?: Employee['status']): "default" | "secondary" | "outline" | "destructive" => {
  if (!status) return 'outline';
  switch (status) {
    case 'Active':
      return 'default';
    case 'On Leave':
      return 'secondary';
    case 'Inactive':
      return 'outline';
    default:
      return 'outline';
  }
};


export default function EmployeeDetailPage() {
  const params = useParams();
  const employeeId = params.id as string;
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
        const data = await fetchData<Employee | undefined>(`api/employees/${employeeId}`);
        if (!data) {
          notFound(); // Trigger 404 if API returns undefined/404
          return;
        }
        setEmployee(data);
      } catch (err: any) {
        setError("Failed to load employee data.");
        toast({
          title: "Error",
          description: "Could not fetch employee details.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployee();
  }, [employeeId, toast]);

   // Function to safely format date
   const formatDate = (dateString?: string) => {
     if (!dateString) return "N/A";
     try {
       const parsedDate = parseISO(dateString);
       if (isValid(parsedDate)) {
         return format(parsedDate, "MMMM d, yyyy");
       }
     } catch (e) {
       console.error("Error formatting date:", e);
     }
     return "Invalid Date";
   };


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
             <CardHeader>
               <Skeleton className="h-6 w-1/3" />
               <Skeleton className="h-4 w-1/2" />
             </CardHeader>
             <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-4"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /></div>
                <div className="space-y-4"> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /> <Skeleton className="h-12 w-full" /></div>
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
     return <p className="text-center text-destructive">{error}</p>;
  }

   if (!employee) {
      return <p className="text-center">Employee not found.</p>;
  }


  return (
    <div className="flex flex-col gap-6">
       <div className="flex items-center justify-between flex-wrap gap-4">
         <div className="flex items-center gap-2">
           <Button variant="outline" size="icon" asChild>
             <Link href="/employees">
               <ArrowLeft className="h-4 w-4" />
               <span className="sr-only">Back to Employees</span>
             </Link>
           </Button>
           <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <User className="h-6 w-6" /> {employee.name}
           </h1>
         </div>
          <Button asChild variant="outline">
             <Link href={`/employees/${employee.id}/edit`}>
                 <Pencil className="mr-2 h-4 w-4"/> Edit Employee
             </Link>
         </Button>
      </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Employee Information</CardTitle>
          <CardDescription>Detailed view of the employee's record.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
           {/* Column 1 */}
           <div className="space-y-4">
             <div className="flex items-center gap-3">
                 <Mail className="h-5 w-5 text-muted-foreground"/>
                 <div>
                     <p className="text-sm font-medium">Email</p>
                     <a href={`mailto:${employee.email}`} className="text-sm text-primary hover:underline">{employee.email}</a>
                 </div>
             </div>
              {employee.phone && (
                 <div className="flex items-center gap-3">
                     <Phone className="h-5 w-5 text-muted-foreground"/>
                     <div>
                         <p className="text-sm font-medium">Phone</p>
                         <p className="text-sm text-foreground">{employee.phone}</p>
                     </div>
                 </div>
             )}
             <div className="flex items-center gap-3">
                 <Briefcase className="h-5 w-5 text-muted-foreground"/>
                 <div>
                     <p className="text-sm font-medium">Position</p>
                     <p className="text-sm text-foreground">{employee.position}</p>
                 </div>
             </div>
           </div>

           {/* Column 2 */}
           <div className="space-y-4">
                <div className="flex items-center gap-3">
                     <Building className="h-5 w-5 text-muted-foreground"/>
                     <div>
                         <p className="text-sm font-medium">Department</p>
                         <p className="text-sm text-foreground">{employee.department}</p>
                     </div>
                 </div>
                 <div className="flex items-center gap-3">
                     <Calendar className="h-5 w-5 text-muted-foreground"/>
                     <div>
                         <p className="text-sm font-medium">Hire Date</p>
                         <p className="text-sm text-foreground">{formatDate(employee.hireDate)}</p>
                     </div>
                 </div>
                  <div className="flex items-center gap-3">
                     <Activity className="h-5 w-5 text-muted-foreground"/>
                     <div>
                         <p className="text-sm font-medium">Status</p>
                         <Badge variant={getStatusVariant(employee.status)}>{employee.status}</Badge>
                     </div>
                 </div>
           </div>
        </CardContent>
         {/* Can add CardFooter for additional actions if needed */}
      </Card>

       {/* Placeholder for related information (e.g., Performance Reviews, Leave History) */}
       <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Performance Reviews</CardTitle>
                    <CardDescription>Placeholder for review history.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Review data will be displayed here.</p>
                </CardContent>
            </Card>
             <Card className="shadow-sm">
                <CardHeader>
                    <CardTitle>Leave History</CardTitle>
                    <CardDescription>Placeholder for leave records.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Leave records will be displayed here.</p>
                </CardContent>
            </Card>
       </div>
    </div>
  );
}
