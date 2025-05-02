import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from "@/modules/employees/types"; // Keep type import
import type { LeaveRequest } from "@/modules/leave/types"; // Keep type import


// Helper to fetch data from API routes - SERVER SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Construct the full URL relative to the application's base URL
    // Ensure NEXT_PUBLIC_BASE_URL is correctly set in your environment or next.config.js
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        console.error("Error: NEXT_PUBLIC_BASE_URL environment variable is not set.");
        throw new Error("Application base URL is not configured.");
    }
    // Ensure the URL starts with a '/' and baseUrl doesn't end with '/'
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;

    console.log(`Fetching server-side data from: ${fullUrl}`); // Log the URL

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options }); // Use no-store for dynamic data
        console.log(`Server-side fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Server-side fetch error for ${fullUrl}: ${errorText}`);
            // Try to parse JSON, but fallback if it's not JSON
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                // If parsing fails, use the raw text or the status code error
                errorMessage = errorText || errorMessage;
            }
             throw new Error(errorMessage);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${fullUrl}:`, error);
        // Re-throw to be caught by Suspense boundary or error component
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
            throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


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

// --- Async Data Fetching Functions via API ---
async function getTotalEmployees() {
    const employees = await fetchData<Employee[]>('/api/employees');
    return employees.length;
}

async function getUpcomingLeavesCount() {
    const today = new Date();
    // Fetch approved requests via API
    const upcomingRequests = await fetchData<LeaveRequest[]>('/api/leave/requests?status=Approved');
    // Filter for requests starting today or later
    const count = upcomingRequests.filter(req => new Date(req.startDate) >= today).length;
    return count;
}

// Mock functions for other metrics (can be replaced with API calls later)
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
