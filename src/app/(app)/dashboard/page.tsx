
// src/app/(app)/dashboard/page.tsx

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Employee } from "@/modules/employees/types"; // Keep type import
import type { LeaveRequest } from "@/modules/leave/types"; // Keep type import
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Used for initial verification in layout/page, but API needs ID
import { getTenantId } from '@/api/utils/get-tenant-id'; // Import the updated utility to get ID for API calls
import { notFound } from 'next/navigation';
import { headers } from 'next/headers'; // To create a mock request for getTenantId

interface DashboardPageProps {
  params: { domain: string };
}

// Helper to construct mock request for getTenantId
function createMockRequest(): Request {
    const headersList = headers(); // Get headers from the incoming server request
    const mockUrl = `http://${headersList.get('host') || 'localhost'}`; // Construct a mock URL
    return new Request(mockUrl, { headers: headersList });
}


// Helper to fetch data from API routes - SERVER SIDE VERSION (Needs tenant context)
async function fetchData<T>(tenantId: string, url: string, options?: RequestInit): Promise<T> {
    // Construct the full URL relative to the application's base URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;

    console.log(`[Dashboard Fetch] Fetching server-side data for tenant ${tenantId} from: ${fullUrl}`); // Log the URL

    try {
        // The API routes expect X-Tenant-Domain, but we pass X-Tenant-Id for internal API calls
        // This depends on how getTenantId in the API routes is implemented.
        // Let's assume API routes use getTenantId which resolves domain->ID.
        // We need to pass the *domain* in the header for API routes to resolve.
        const headersList = headers(); // Get current headers
        const tenantDomain = headersList.get('X-Tenant-Domain'); // Get domain from middleware header

        const fetchHeaders = new Headers(options?.headers);
        if (tenantDomain) {
             fetchHeaders.set('X-Tenant-Domain', tenantDomain); // Pass tenant domain to API routes
        } else {
            console.error(`[Dashboard Fetch] Critical: X-Tenant-Domain header missing for API call to ${fullUrl}`);
             throw new Error('Tenant context is missing.');
        }


        const response = await fetch(fullUrl, {
            cache: 'no-store',
            ...options,
            headers: fetchHeaders, // Include modified headers
         });
        console.log(`[Dashboard Fetch] Server-side fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            // Log the raw error text first for debugging
            console.error(`[Dashboard Fetch] Server-side fetch error for ${fullUrl}: Status ${response.status}, Body: ${errorText}`);
            // Try to parse JSON to get a more specific error message from the API
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (parseError) {
                // Fallback to raw text if not JSON
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
    // Handle potential errors within the card
    let value: string | number = <Skeleton className="h-6 w-12" />; // Default to skeleton
    let displayError = false;
    try {
         value = await valuePromise;
    } catch (error) {
         console.error(`[Dashboard MetricCard - ${title}] Error fetching metric:`, error);
         value = "Error";
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

// --- Async Data Fetching Functions via API (with tenantId) ---
async function getTotalEmployees(tenantId: string) {
    const employees = await fetchData<Employee[]>(tenantId, '/api/employees');
    return employees.length;
}

async function getUpcomingLeavesCount(tenantId: string) {
    const today = new Date();
    // API route needs to filter by tenantId based on header/context
    const upcomingRequests = await fetchData<LeaveRequest[]>(tenantId, '/api/leave/requests?status=Approved');
    const count = upcomingRequests.filter(req => new Date(req.startDate) >= today).length;
    return count;
}

async function getOpenPositionsCount(tenantId: string) {
     // API route needs to filter by tenantId
     const openPositions = await fetchData<any[]>(tenantId, '/api/recruitment/postings?status=Open');
     return openPositions.length;
 }

async function getPendingTasksCount(tenantId: string) {
    // Mock - Replace later with real data fetching for the tenant
    await new Promise(res => setTimeout(res, 50));
    return 3;
}
// --- End Data Fetching Functions ---


export default async function TenantDashboardPage({ params }: DashboardPageProps) {
    const tenantDomain = params.domain;

    // 1. Verify Tenant Domain Exists - THIS IS NOW HANDLED BY TenantAppLayout
    // const tenant = await getTenantByDomain(tenantDomain);
    // if (!tenant) { ... }

    // 2. Get Tenant ID for API calls using the utility function
    const mockRequest = createMockRequest(); // Create a mock Request object
    const tenantId = await getTenantId(mockRequest as NextRequest); // Use utility to resolve ID

    if (!tenantId) {
         // This case should ideally be caught by the layout verification, but handle defensively
         console.error(`[Dashboard Page] Could not resolve Tenant ID for domain "${tenantDomain}".`);
         notFound();
    }
     console.log(`[Dashboard Page] Resolved Tenant ID for domain "${tenantDomain}": ${tenantId}`);

    // Fetch tenant details *after* resolving ID to display name, etc.
    // NOTE: This might be redundant if layout already fetched it. Pass via props/context if needed.
     let tenantName = tenantDomain; // Fallback to domain name
     try {
        const tenantDetails = await getTenantByDomain(tenantDomain);
        if(tenantDetails) tenantName = tenantDetails.name;
     } catch (dbError){
         console.error(`[Dashboard Page] Error fetching tenant details for name display:`, dbError);
         // Continue with domain name, but log error
     }


    // Define quick links - these are tenant-relative now
    const quickLinks = [
    { href: `/${tenantDomain}/employees/add`, label: 'Add New Employee', icon: Users },
    { href: `/${tenantDomain}/recruitment`, label: 'Manage Job Postings', icon: Briefcase },
    { href: `/${tenantDomain}/leave#request`, label: 'Request Leave', icon: Calendar }, // Assumes leave page handles tenant context
    { href: `/${tenantDomain}/smart-resume-parser`, label: 'Parse Resume', icon: UploadCloud }, // Assumes parser handles tenant context
    ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard - {tenantName}</h1>

      {/* Key Metrics Section with Suspense */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Total Employees" icon={Users} valuePromise={getTotalEmployees(tenantId)} changeText="+2 since last month" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Open Positions" icon={Briefcase} valuePromise={getOpenPositionsCount(tenantId)} link={`/${tenantDomain}/recruitment`} linkText="View jobs" />
          </Suspense>
         <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
             <MetricCard title="Upcoming Leaves" icon={Calendar} valuePromise={getUpcomingLeavesCount(tenantId)} link={`/${tenantDomain}/leave`} linkText="View calendar" />
         </Suspense>
          <Suspense fallback={<Skeleton className="h-[110px] w-full" />}>
            <MetricCard title="Pending Tasks" icon={FileText} valuePromise={getPendingTasksCount(tenantId)} changeText="Requires attention"/>
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
