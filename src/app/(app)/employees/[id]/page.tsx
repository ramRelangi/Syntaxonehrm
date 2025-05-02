import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getEmployeeById } from '@/actions/employee-actions';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { User, Mail, Phone, Briefcase, Building, Calendar, Activity, Pencil, ArrowLeft } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns'; // For date formatting

interface EmployeeDetailPageProps {
  params: { id: string };
}

// Helper function to determine badge variant based on status
const getStatusVariant = (status: Employee['status']): "default" | "secondary" | "outline" | "destructive" => {
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

// Define Employee type locally or import if available globally
interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position: string;
  department: string;
  hireDate: string;
  status: 'Active' | 'Inactive' | 'On Leave';
}


export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const employeeId = params.id;
  const employee = await getEmployeeById(employeeId);

  if (!employee) {
    notFound(); // Show 404 if employee doesn't exist
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
                         <p className="text-sm text-foreground">{format(parseISO(employee.hireDate), "MMMM d, yyyy")}</p>
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
