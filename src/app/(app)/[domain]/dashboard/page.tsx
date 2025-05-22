
// src/app/(app)/[domain]/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getTenantByDomain } from '@/modules/auth/lib/db';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers'; // Import headers
import type { NextRequest } from 'next/server'; // For mock request type

// Import Server Actions directly - Actions derive context implicitly
import { getEmployees } from '@/modules/employees/actions';
import { getLeaveRequestsAction as getLeaveRequests } from '@/modules/leave/actions';
import { getJobOpenings } from '@/modules/recruitment/actions';

export const dynamic = 'force-dynamic'; // Force dynamic rendering

interface DashboardPageProps {
  params: { domain: string };
}

// Helper to construct mock request for getTenantId (if needed elsewhere, or if getTenantIdFromAuth relied on it)
// Not strictly needed here as server actions should get context from headers()
function createMockRequest(): Request {
    const headersList = headers();
    const mockUrl = `http://${headersList.get('host') || 'localhost'}`;
    return new Request(mockUrl, { headers: headersList });
}


// Helper to fetch data from API routes - SERVER SIDE VERSION (Needs tenant context and auth cookie)
// This fetchData function is problematic if API routes rely on session cookies directly,
// as passing cookies from server component to server component fetch can be tricky.
// Prefer calling server actions directly from server components.
async function fetchData<T>(tenantId: string, url: string, options?: RequestInit): Promise<T> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;

    const currentHeaders = headers();
    const tenantDomain = currentHeaders.get('X-Tenant-Domain');

    console.log(`[Dashboard Fetch] Fetching server-side data for tenant ID ${tenantId} (domain ${tenantDomain}) from: ${fullUrl}`);

    try {
        const fetchHeaders = new Headers(options?.headers);
        if (tenantDomain) {
            fetchHeaders.set('X-Tenant-Domain', tenantDomain);
        } else {
            console.warn(`[Dashboard Fetch] X-Tenant-Domain header is missing. API calls might fail for tenant context.`);
        }

        // Pass along the session cookie if making an authenticated API call
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get('mockSession'); // Use the constant name
        if (sessionCookie) {
            fetchHeaders.set('Cookie', `${sessionCookie.name}=${sessionCookie.value}`);
        } else {
            console.warn(`[Dashboard Fetch] Session cookie ('mockSession') not found for API call to ${fullUrl}.`);
        }

        const response = await fetch(fullUrl, {
            cache: 'no-store',
            ...options,
            headers: fetchHeaders,
         });
        console.log(`[Dashboard Fetch] Server-side fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Dashboard Fetch] Server-side fetch error for ${fullUrl}: Status ${response.status}, Body: ${errorText}`);
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (parseError) {
                errorMessage = errorText || errorMessage;
            }
             throw new Error(errorMessage);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Dashboard Fetch] Error fetching ${fullUrl} for tenant ${tenantId}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
            throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}


// Async component to fetch metrics
async function MetricCard({ title, icon: Icon, valuePromise, link, linkText, changeText }: { title: string, icon: React.ElementType, valuePromise: Promise<any>, link?: string, linkText?: string, changeText?: string }) {
    let value: string | number = <Skeleton className="h-6 w-12" />;
    let displayError = false;
    try {
         value = await valuePromise;
         console.log(`[Dashboard MetricCard - ${title}] Fetched value: ${value}`);
    } catch (error: any) {
         console.error(`[Dashboard MetricCard - ${title}] Error fetching metric:`, error);
         let errorMessage = "Error";
         if (error.message?.includes('Tenant context not found') || error.message?.includes('Unauthorized') || error.message?.includes('Tenant ID is required') || error.message?.includes('session context')) {
             errorMessage = "Auth Error";
         } else if (error.message?.includes('invalid input syntax for type uuid')) {
              errorMessage = "DB ID Error";
         } else if (error.message?.includes('Failed to fetch')) {
              errorMessage = "Fetch Error";
         } else {
              errorMessage = error.message?.substring(0, 50) || "Error";
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
    // Server actions get context from cookies()/headers()
    const employees = await getEmployees();
    return employees.length;
}

async function getUpcomingLeavesCount() {
    const today = new Date();
    // Action implicitly filters by tenant and only returns relevant requests
    const upcomingRequests = await getLeaveRequests({ status: 'Approved' });
    const count = upcomingRequests.filter(req => new Date(req.startDate) >= today).length;
    return count;
}

async function getOpenPositionsCount() {
     // Action implicitly filters by tenant
     const openPositions = await getJobOpenings({ status: 'Open' });
     return openPositions.length;
 }

async function getPendingTasksCount() {
    // Mock - Replace later with real data fetching using a server action
    await new Promise(res => setTimeout(res, 50));
    return 3;
}
// --- End Data Fetching Functions ---


export default async function TenantDashboardPage({ params }: DashboardPageProps) {
    const tenantSubdomain = params.domain;

    let tenantName = tenantSubdomain;
     try {
        const tenantDetails = await getTenantByDomain(tenantSubdomain);
        if(tenantDetails) tenantName = tenantDetails.name;
        else {
            console.warn(`[Dashboard Page] Tenant details not found for subdomain "${tenantSubdomain}" after layout validation.`);
            notFound(); // Should be caught by layout, but defensive
        }
     } catch (dbError){
         console.error(`[Dashboard Page] Error fetching tenant details for name display:`, dbError);
     }

    const quickLinks = [
        { href: `/employees/add`, label: 'Add New Employee', icon: Users },
        { href: `/recruitment`, label: 'Manage Job Postings', icon: Briefcase },
        { href: `/leave`, label: 'Request Leave', icon: Calendar },
        { href: `/smart-resume-parser`, label: 'Parse Resume', icon: UploadCloud },
    ];

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard - {tenantName}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Total Employees" icon={Users} valuePromise={getTotalEmployees()} changeText="+2 since last month" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Open Positions" icon={Briefcase} valuePromise={getOpenPositionsCount()} link={`/recruitment`} linkText="View jobs" />
          </Suspense>
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Upcoming Leaves" icon={Calendar} valuePromise={getUpcomingLeavesCount()} link={`/leave`} linkText="View calendar" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Pending Tasks" icon={FileText} valuePromise={getPendingTasksCount()} changeText="Requires attention"/>
          </Suspense>
      </div>

      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Access common HR tasks quickly.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
           <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Employee Distribution</CardTitle>
                 <CardDescription>Placeholder for departmental chart.</CardDescription>
              </CardHeader>
              <CardContent>
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

    