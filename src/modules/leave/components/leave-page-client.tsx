// src/modules/leave/components/leave-page-client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, PlusCircle, ListChecks, Settings, LandPlot } from "lucide-react"; // Added LandPlot for Holidays
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { LeaveRequestList } from "@/modules/leave/components/leave-request-list";
import { Badge } from "@/components/ui/badge";
import { LeaveTypeManagement } from "@/modules/leave/components/leave-type-management";
import { HolidayManagement } from "@/modules/leave/components/holiday-management"; // Import HolidayManagement
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaveType, LeaveRequest, LeaveBalance, Holiday } from "@/modules/leave/types"; // Added Holiday type
import { getHolidaysAction } from '@/modules/leave/actions'; // Import holiday action
import { getSessionData } from '@/modules/auth/actions'; // Import session helper
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert
import { cn } from "@/lib/utils"; // Import cn utility

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Leave Page Client - fetchData] Fetching data from: ${fullUrl}`);

    try {
        // API routes use headers for tenant context
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Leave Page Client - fetchData] Fetch response status for ${fullUrl}: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Leave Page Client - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            let errorPayload: { message?: string; error?: string } = {};
             try {
                 errorPayload = JSON.parse(errorText || '{}');
             } catch (parseError) {
                 console.warn(`[Leave Page Client - fetchData] Failed to parse error response as JSON for ${fullUrl}. Raw text:`, errorText);
                 errorPayload.message = errorText;
             }
             // Try to extract a more specific message
             const specificError = errorPayload.error || errorPayload.message || `HTTP error! status: ${response.status}`;
             throw new Error(specificError);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Leave Page Client - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           // Rethrow the extracted or original error message
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}

export default function LeavePageClient() {
  const { toast } = useToast();
  const [userId, setUserId] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);
  const [tenantDomain, setTenantDomain] = React.useState<string | null>(null);
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState('request');

  // Fetch auth context (user ID, admin status, domain) on mount
  React.useEffect(() => {
    const fetchAuthContext = async () => {
        setIsLoading(true); // Start loading
        setAuthError(null);
        try {
            // Use the server action to get session data
            const session = await getSessionData();
            if (!session || !session.userId || !session.tenantId || !session.tenantDomain) {
                throw new Error("Could not verify user identity or tenant context.");
            }
            setUserId(session.userId);
            setIsAdmin(session.userRole === 'Admin');
            setTenantDomain(session.tenantDomain);
            console.log("[Leave Page Client] Auth Context Loaded:", { userId: session.userId, isAdmin: session.userRole === 'Admin', tenantDomain: session.tenantDomain });
        } catch (err: any) {
            console.error("[Leave Page Client] Error fetching auth context:", err);
            setAuthError(err.message || "Failed to load user session.");
             toast({
                title: "Authentication Error",
                description: err.message || "Failed to load user session.",
                variant: "destructive",
            });
        } finally {
             // Don't set loading false here, let refetchData handle it
        }
    };
    fetchAuthContext();
  }, [toast]);


  // Function to refetch all necessary data AFTER auth context is loaded
  const refetchData = React.useCallback(async () => {
      if (!userId || !tenantDomain) {
          console.log("[Leave Page Client] Skipping refetchData, userId or tenantDomain not available yet.");
          setIsLoading(false); // Ensure loading stops if auth failed or isn't ready
          return;
      }
      console.log("[Leave Page Client] Refetching leave and holiday data for user:", userId);
      setIsLoading(true);
      setFetchError(null);
      try {
          const [typesData, allReqData, myReqData, balancesData, holidaysData] = await Promise.all([
              fetchData<LeaveType[]>('/api/leave/types'),
              isAdmin ? fetchData<LeaveRequest[]>('/api/leave/requests') : Promise.resolve([]),
              fetchData<LeaveRequest[]>(`/api/leave/requests?employeeId=${userId}`),
              fetchData<LeaveBalance[]>(`/api/leave/balances/${userId}`),
              getHolidaysAction(),
          ]);
          setLeaveTypes(typesData);
          setAllRequests(allReqData);
          setMyRequests(myReqData);
          setMyBalances(balancesData);
          setHolidays(holidaysData);
      } catch (err: any) {
          console.error("[Leave Page Client] Error during refetchData:", err);
          const errorMsg = err.message || "Failed to load leave management data.";
          setFetchError(errorMsg);
          toast({
              title: "Error Loading Data",
              description: errorMsg,
              variant: "destructive",
          });
      } finally {
          setIsLoading(false);
      }
  }, [toast, userId, isAdmin, tenantDomain]);

  // Fetch data when userId and tenantDomain become available
  React.useEffect(() => {
    if (userId && tenantDomain) {
        refetchData();
    }
  }, [userId, tenantDomain, refetchData]); // Depend on userId and tenantDomain

   // Callbacks for components to trigger refetch
   const handleLeaveRequestSubmitted = () => {
     refetchData();
     setActiveTab('my-requests');
   };

   const handleLeaveRequestUpdated = () => refetchData();
   const handleLeaveTypeUpdated = () => refetchData();
   const handleHolidayUpdated = () => refetchData();

   // Derive leave type name map
   const leaveTypeNameMap = React.useMemo(() => {
     const map = new Map<string, string>();
     leaveTypes.forEach(lt => map.set(lt.id, lt.name));
     return map;
   }, [leaveTypes]);

   // Conditional rendering based on loading and error states
    if (authError) {
        return (
            <div className="flex flex-col gap-6 items-center justify-center min-h-[400px]">
                 <Alert variant="destructive" className="max-w-md">
                    <AlertTitle>Authentication Error</AlertTitle>
                    <AlertDescription>{authError}</AlertDescription>
                </Alert>
            </div>
        );
    }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Calendar className="h-6 w-6" /> Leave Management {tenantDomain ? `for ${tenantDomain}` : ''}
      </h1>

       {isLoading && !fetchError && (
          <Card><CardContent className="p-4 text-center text-muted-foreground"><Skeleton className="h-64 w-full" /></CardContent></Card>
       )}
       {fetchError && !isLoading && (
           <Card><CardContent className="p-4 text-destructive text-center">{fetchError}</CardContent></Card>
       )}


       {!isLoading && !fetchError && userId && (
           <>
             {/* Leave Balances Section */}
              <Card className="shadow-sm">
                 <CardHeader>
                   <CardTitle>My Leave Balances</CardTitle>
                   <CardDescription>Your current available leave balances.</CardDescription>
                 </CardHeader>
                 <CardContent className="flex flex-wrap gap-4">
                    {myBalances.length > 0 ? (
                       myBalances.map(balance => (
                           <div key={balance.leaveTypeId} className="flex items-center gap-2 p-3 border rounded-md bg-secondary/50">
                               <span className="font-medium">{balance.leaveTypeName || leaveTypeNameMap.get(balance.leaveTypeId) || 'Unknown Type'}:</span>
                               <Badge variant="outline">{balance.balance} days</Badge>
                           </div>
                       ))
                    ) : (
                        <p className="text-muted-foreground">No leave balance information available.</p>
                    )}
                 </CardContent>
              </Card>


              {/* Tabs for Request Form, Lists, and Type/Holiday Management */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs">
                 {/* Use cn helper and responsive grid columns */}
                 <TabsList className={cn(
                      "grid w-full",
                      isAdmin ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-2" // Responsive for admin
                  )}>
                   <TabsTrigger value="request" className="flex items-center gap-1">
                        <PlusCircle className="h-4 w-4"/> Request Leave
                    </TabsTrigger>
                   <TabsTrigger value="my-requests" className="flex items-center gap-1">
                       <ListChecks className="h-4 w-4"/> My Requests
                    </TabsTrigger>
                   {isAdmin && (
                        <TabsTrigger value="all-requests" className="flex items-center gap-1">
                           <ListChecks className="h-4 w-4"/> Manage Requests
                        </TabsTrigger>
                   )}
                   {isAdmin && (
                       <TabsTrigger value="manage-types" className="flex items-center gap-1">
                          <Settings className="h-4 w-4"/> Manage Types
                       </TabsTrigger>
                   )}
                   {isAdmin && (
                       <TabsTrigger value="manage-holidays" className="flex items-center gap-1">
                          <LandPlot className="h-4 w-4"/> Manage Holidays
                       </TabsTrigger>
                   )}
                 </TabsList>

                {/* Request Leave Tab */}
                <TabsContent value="request">
                   <Card className="shadow-sm">
                       <CardHeader>
                           <CardTitle>Submit Leave Request</CardTitle>
                           <CardDescription>Fill out the form below to request time off.</CardDescription>
                       </CardHeader>
                       <CardContent>
                           <LeaveRequestForm
                               employeeId={userId} // Pass confirmed userId
                               leaveTypes={leaveTypes}
                               onSuccess={handleLeaveRequestSubmitted}
                           />
                       </CardContent>
                   </Card>
                </TabsContent>

                {/* My Requests Tab */}
                <TabsContent value="my-requests">
                    <LeaveRequestList
                        requests={myRequests}
                        leaveTypes={leaveTypes}
                        isAdminView={false}
                        currentUserId={userId} // Pass confirmed userId
                        onUpdate={handleLeaveRequestUpdated}
                    />
                </TabsContent>

                {/* All Requests Tab (Admin Only) */}
                {isAdmin && (
                   <TabsContent value="all-requests">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={leaveTypes}
                           isAdminView={true}
                           currentUserId={userId} // Pass confirmed userId
                           onUpdate={handleLeaveRequestUpdated}
                       />
                   </TabsContent>
                )}

                {/* Manage Leave Types Tab (Admin Only) */}
                {isAdmin && (
                   <TabsContent value="manage-types">
                       <LeaveTypeManagement
                           initialLeaveTypes={leaveTypes}
                           onUpdate={handleLeaveTypeUpdated}
                       />
                   </TabsContent>
                )}

                 {/* Manage Holidays Tab (Admin Only) */}
                {isAdmin && (
                   <TabsContent value="manage-holidays">
                       <HolidayManagement
                           initialHolidays={holidays}
                           onUpdate={handleHolidayUpdated} // Pass the refetch callback
                       />
                   </TabsContent>
                )}
              </Tabs>
           </>
       )}
    </div>
  );
}
