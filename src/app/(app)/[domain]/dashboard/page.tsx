// src/app/(app)/[domain]/dashboard/page.tsx
// This is now a Server Component by default

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getTenantByDomain } from '@/modules/auth/lib/db';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers'; // Keep for reading headers if needed elsewhere, though not for API calls now

// Import Server Actions directly
import { getEmployees } from '@/modules/employees/actions';
import { getLeaveRequests } from '@/modules/leave/actions';
import { getJobPostings } from '@/modules/recruitment/actions';

interface DashboardPageProps {
  params: { domain: string };
}

// Removed server-side fetchData helper as we'll call actions directly

// Async component to fetch metrics
async function MetricCard({ title, icon: Icon, valuePromise, link, linkText, changeText }: { title: string, icon: React.ElementType, valuePromise: Promise<any>, link?: string, linkText?: string, changeText?: string }) {
    // Handle potential errors within the card
    let value: string | number = <Skeleton className="h-6 w-12" />; // Default to skeleton
    let displayError = false;
    try {
         value = await valuePromise;
         console.log(`[Dashboard MetricCard - ${title}] Fetched value: ${value}`);
    } catch (error: any) {
         console.error(`[Dashboard MetricCard - ${title}] Error fetching metric:`, error);
          // Try to extract a more specific message if available
         let errorMessage = "Error";
         if (error.message?.includes('Tenant context not found') || error.message?.includes('Unauthorized')) {
             errorMessage = "Auth Error";
         } else if (error.message?.includes('invalid input syntax for type uuid')) {
              errorMessage = "DB Error";
         } else if (error.message?.includes('Failed to fetch')) {
              // This shouldn't happen anymore, but keep as fallback
              errorMessage = "Fetch Error";
         } else {
              errorMessage = error.message || "Error"; // Use original message if available
         }
         value = errorMessage;
         displayError = true;
    }
    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${displayError ? 'text-destructive' : ''}`}>{value}</div>
            {link && linkText && !displayError ? (
                 <Link href={link} className="text-xs text-primary hover:underline">{linkText}</Link>
            ) : (
                 changeText && !displayError && <p className="text-xs text-muted-foreground">{changeText}</p>
            )}
            {displayError && <p className="text-xs text-destructive">Could not load data.</p>}
          </CardContent>
        </Card>
    );
}

// --- Async Data Fetching Functions directly using Server Actions ---
// Actions derive tenant context internally
async function getTotalEmployees() {
    // Directly call the action. It handles auth context.
    const employees = await getEmployees();
    return employees.length;
}

async function getUpcomingLeavesCount() {
    const today = new Date();
    // Directly call the action with filters. It handles auth context.
    const upcomingRequests = await getLeaveRequests({ status: 'Approved' });
    const count = upcomingRequests.filter(req => new Date(req.startDate) >= today).length;
    return count;
}

async function getOpenPositionsCount() {
     // Directly call the action with filters. It handles auth context.
     const openPositions = await getJobPostings({ status: 'Open' });
     return openPositions.length;
 }

async function getPendingTasksCount() {
    // Mock - Replace later with real data fetching using a server action
    await new Promise(res => setTimeout(res, 50));
    return 3;
}
// --- End Data Fetching Functions ---


export default async function TenantDashboardPage({ params }: DashboardPageProps) {
    const tenantDomain = params.domain;

    // 1. Verify Tenant Domain Exists - Handled by Layout

    // 2. Fetch tenant details for name display (optional, layout might handle)
     let tenantName = tenantDomain; // Fallback to domain name
     try {
        const tenantDetails = await getTenantByDomain(tenantDomain);
        if(tenantDetails) tenantName = tenantDetails.name;
        else {
            console.warn(`[Dashboard Page] Tenant details not found for domain "${tenantDomain}" after layout validation.`);
            notFound();
        }
     } catch (dbError){
         console.error(`[Dashboard Page] Error fetching tenant details for name display:`, dbError);
         // Continue with domain name, but log error
     }


    // Define quick links - these are tenant-relative now
    const quickLinks = [
    { href: `/${tenantDomain}/employees/add`, label: 'Add New Employee', icon: Users },
    { href: `/${tenantDomain}/recruitment`, label: 'Manage Job Postings', icon: Briefcase },
    { href: `/${tenantDomain}/leave#leave-tabs`, label: 'Request Leave', icon: Calendar },
    { href: `/${tenantDomain}/smart-resume-parser`, label: 'Parse Resume', icon: UploadCloud },
    ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard - {tenantName}</h1>

      {/* Key Metrics Section with Suspense */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            {/* Pass the promise from the action call directly */}
            <MetricCard title="Total Employees" icon={Users} valuePromise={getTotalEmployees()} changeText="+2 since last month" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Open Positions" icon={Briefcase} valuePromise={getOpenPositionsCount()} link={`/${tenantDomain}/recruitment`} linkText="View jobs" />
          </Suspense>
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Upcoming Leaves" icon={Calendar} valuePromise={getUpcomingLeavesCount()} link={`/${tenantDomain}/leave`} linkText="View calendar" />
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
                 {/* TODO: Add ShadCN Chart component here, fetching tenant-specific data */}
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
                  {/* In a real app, fetch recent activities for the tenant */}
                  <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>- John Doe requested leave. (Approved)</li>
                      <li>- New hire Jane Smith onboarded.</li>
                      <li>- Payroll processed for July.</li>
                      <li>- Alice W. requested leave. (Pending)</li>
                       <li>- Job Posting "Senior Frontend Engineer" published.</li>
                  </ul>
              </CardContent>
           </Card>
      </div>
    </div>
  );
}
