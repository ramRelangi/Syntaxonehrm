
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { getEmployees } from "@/actions/employee-actions"; // Example action
import { getLeaveRequests } from "@/actions/leave-actions"; // Import leave action
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Async component to fetch metrics
async function MetricCard({ title, icon: Icon, valuePromise, link, linkText, changeText }: { title: string, icon: React.ElementType, valuePromise: Promise<any>, link?: string, linkText?: string, changeText?: string }) {
    const value = await valuePromise;
    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{value}</div>
            {link && linkText ? (
                 <Link href={link} className="text-xs text-primary hover:underline">{linkText}</Link>
            ) : (
                 changeText && <p className="text-xs text-muted-foreground">{changeText}</p>
            )}
          </CardContent>
        </Card>
    );
}

// --- Async Data Fetching Functions ---
async function getTotalEmployees() {
    const employees = await getEmployees();
    return employees.length;
}

async function getUpcomingLeavesCount() {
    const today = new Date();
    const upcomingRequests = await getLeaveRequests({ status: 'Approved' }); // Fetch approved requests
    // Filter for requests starting today or later
    const count = upcomingRequests.filter(req => new Date(req.startDate) >= today).length;
    return count;
}

// Mock functions for other metrics
async function getOpenPositionsCount() { await new Promise(res => setTimeout(res, 80)); return 8; }
async function getPendingTasksCount() { await new Promise(res => setTimeout(res, 50)); return 3; }
// --- End Data Fetching Functions ---


export default function DashboardPage() {
  // Define quick links
  const quickLinks = [
    { href: '/employees/add', label: 'Add New Employee', icon: Users },
    { href: '/recruitment/create', label: 'Create Job Posting', icon: Briefcase },
    { href: '/leave#request', label: 'Request Leave', icon: Calendar }, // Updated href to target tab
    { href: '/smart-resume-parser', label: 'Parse Resume', icon: UploadCloud },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>

      {/* Key Metrics Section with Suspense */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Total Employees" icon={Users} valuePromise={getTotalEmployees()} changeText="+2 since last month" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Open Positions" icon={Briefcase} valuePromise={getOpenPositionsCount()} link="/recruitment" linkText="View jobs" />
          </Suspense>
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Upcoming Leaves" icon={Calendar} valuePromise={getUpcomingLeavesCount()} link="/leave" linkText="View calendar" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Pending Tasks" icon={FileText} valuePromise={getPendingTasksCount()} changeText="Requires attention"/>
          </Suspense>
      </div>

      {/* Quick Links Section */}
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Access common HR tasks quickly.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
                 <Button key={link.href} variant="outline" asChild className="justify-start gap-3 text-left h-auto py-3">
                     <Link href={link.href}>
                         <link.icon className="h-5 w-5 text-primary" />
                         <span className="text-sm font-medium">{link.label}</span>
                     </Link>
                 </Button>
            ))}
         </CardContent>
      </Card>

      {/* Placeholder for other dashboard sections (e.g., charts, recent activity) */}
      <div className="grid gap-6 lg:grid-cols-2">
           <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Employee Distribution</CardTitle>
                 <CardDescription>Placeholder for departmental chart.</CardDescription>
              </CardHeader>
              <CardContent>
                 {/* TODO: Add ShadCN Chart component here */}
                 <div className="h-60 w-full flex items-center justify-center bg-muted rounded-md">
                    <BarChart2 className="h-12 w-12 text-muted-foreground" />
                 </div>
              </CardContent>
           </Card>
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Placeholder for activity feed.</CardDescription>
              </CardHeader>
              <CardContent>
                  {/* In a real app, fetch recent activities */}
                  <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>- John Doe requested leave. (Approved)</li>
                      <li>- New hire Jane Smith onboarded.</li>
                      <li>- Payroll processed for July.</li>
                      <li>- Alice W. requested leave. (Pending)</li>
                  </ul>
              </CardContent>
           </Card>
      </div>
    </div>
  );
}
```