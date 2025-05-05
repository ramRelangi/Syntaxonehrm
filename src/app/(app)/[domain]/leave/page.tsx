
// src/app/(app)/[domain]/leave/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, PlusCircle, ListChecks, Settings } from "lucide-react";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { LeaveRequestList } from "@/modules/leave/components/leave-request-list";
import { Badge } from "@/components/ui/badge";
import { LeaveTypeManagement } from "@/modules/leave/components/leave-type-management";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaveType, LeaveRequest, LeaveBalance } from "@/modules/leave/types";
import { useParams } from "next/navigation"; // Import useParams
import { getUserIdFromAuth, isUserAdmin } from '@/lib/auth'; // Use actual auth functions

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Use relative paths for client-side fetching
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Leave Page - fetchData] Fetching data from: ${fullUrl}`); // Log the URL being fetched

    try {
        // API route handles tenant context via header
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Leave Page - fetchData] Fetch response status for ${fullUrl}: ${response.status}`); // Log response status

        if (!response.ok) {
            const errorText = await response.text(); // Get raw error text
            console.error(`[Leave Page - fetchData] Fetch error response body for ${fullUrl}:`, errorText);
            let errorPayload: { message?: string; error?: string } = {};
             try {
                 errorPayload = JSON.parse(errorText || '{}'); // Try parsing JSON
             } catch (parseError) {
                 console.warn(`[Leave Page - fetchData] Failed to parse error response as JSON for ${fullUrl}. Raw text:`, errorText);
                 errorPayload.message = errorText; // Use raw text as message if parsing fails
             }
             throw new Error(errorPayload.error || errorPayload.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Leave Page - fetchData] Error in fetchData for ${fullUrl}:`, error);
        // Rethrow a more specific error if possible, or the original one
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}

export default function TenantLeavePage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const { toast } = useToast();
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState('request'); // Manage active tab
  const [userId, setUserId] = React.useState<string | null>(null); // State for current user ID
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false); // State for admin status

  // Fetch auth context on mount
  React.useEffect(() => {
      const fetchAuthContext = async () => {
          setIsLoading(true); // Start loading when fetching auth context
          try {
              // Use actual auth helpers
              const fetchedUserId = await getUserIdFromAuth(); // Assume this returns ID or null
              const fetchedIsAdmin = await isUserAdmin(); // Assume this returns boolean
              setUserId(fetchedUserId);
              setIsAdmin(fetchedIsAdmin);
              console.log(`[Leave Page] Auth context loaded: User ID - ${fetchedUserId}, Is Admin - ${fetchedIsAdmin}`);
               if (!fetchedUserId) {
                   throw new Error("Could not verify user identity.");
               }
          } catch (err: any) {
              console.error("[Leave Page] Failed to fetch auth context:", err);
              setError("Failed to load user context. Please login again.");
              toast({ title: "Authentication Error", description: err.message || "Could not determine user.", variant: "destructive" });
              setIsLoading(false); // Stop loading if auth fails
          }
          // Loading state will be turned off by refetchData after auth context is set
      };
      fetchAuthContext();
  }, [toast]);


   // Function to refetch all necessary data
  const refetchData = React.useCallback(async () => {
      // Wait for auth context to be loaded before fetching leave data
      if (userId === null) {
          console.log("[Leave Page] Waiting for auth context before fetching leave data...");
          // Don't set loading false here, wait for auth context or error
          return;
      }
      console.log("[Leave Page] Auth context available, fetching leave data for user:", userId);

      setIsLoading(true); // Set loading true when starting data fetch
      setError(null);
      try {
          const [typesData, allReqData, myReqData, balancesData] = await Promise.all([
              fetchData<LeaveType[]>('/api/leave/types'),
              isAdmin ? fetchData<LeaveRequest[]>('/api/leave/requests') : Promise.resolve([]), // Only fetch all if admin
              fetchData<LeaveRequest[]>(`/api/leave/requests?employeeId=${userId}`), // Use actual userId
              fetchData<LeaveBalance[]>(`/api/leave/balances/${userId}`), // Use actual userId
          ]);
          setLeaveTypes(typesData);
          setAllRequests(allReqData);
          setMyRequests(myReqData);
          setMyBalances(balancesData);
      } catch (err: any) { // Catch specific error type
          console.error("[Leave Page] Error during refetchData:", err);
          // Specific error handling based on caught message
          if (err.message?.includes('Invalid identifier') || err.message?.includes('invalid input syntax for type uuid')) {
              setError("An internal error occurred while fetching data. Invalid identifier used.");
          } else {
              setError("Failed to load leave management data. Please try refreshing.");
          }
          toast({
              title: "Error Loading Data",
              description: err.message || "Could not fetch necessary leave information.",
              variant: "destructive",
          });
      } finally {
          setIsLoading(false); // Stop loading once data fetch attempt is complete (success or error)
      }
  }, [toast, userId, isAdmin]); // Add userId and isAdmin dependencies

  // Fetch data on mount and when auth context changes (userId becomes available)
  React.useEffect(() => {
      refetchData();
  }, [refetchData]); // refetchData dependency includes userId and isAdmin

   // Callbacks for components to trigger refetch
   const handleLeaveRequestSubmitted = () => {
     refetchData(); // Refetch all data
     setActiveTab('my-requests'); // Switch to "My Requests" tab
   };

   const handleLeaveRequestUpdated = () => {
     refetchData(); // Refetch all data
   };

    const handleLeaveTypeUpdated = () => {
     refetchData(); // Refetch all data
   };

   // Derive leave type name map
   const leaveTypeNameMap = React.useMemo(() => {
     const map = new Map<string, string>();
     leaveTypes.forEach(lt => map.set(lt.id, lt.name));
     return map;
   }, [leaveTypes]);


  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Calendar className="h-6 w-6" /> Leave Management for {tenantDomain}
      </h1>

       {/* Show loading or error specific to auth context */}
       {isLoading && !error && ( // Show loading indicator only if actively loading and no error yet
          <Card><CardContent className="p-4 text-center text-muted-foreground">Loading leave data...</CardContent></Card>
       )}
       {error && ( // Show main error if any occurred
           <Card><CardContent className="p-4 text-destructive text-center">{error}</CardContent></Card>
       )}


       {!isLoading && !error && userId && ( // Only render main content if not loading, no error, and user context is loaded
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


              {/* Tabs for Request Form, Lists, and Type Management */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs"> {/* Control active tab state */}
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                  <TabsTrigger value="request" className="flex items-center gap-1">
                       <PlusCircle className="h-4 w-4"/> Request Leave
                   </TabsTrigger>
                  <TabsTrigger value="my-requests" className="flex items-center gap-1">
                      <ListChecks className="h-4 w-4"/> My Requests
                   </TabsTrigger>
                  {isAdmin && (
                       <TabsTrigger value="all-requests" className="flex items-center gap-1">
                          <ListChecks className="h-4 w-4"/> Manage Requests {/* Changed Icon */}
                       </TabsTrigger>
                  )}
                  {isAdmin && (
                      <TabsTrigger value="manage-types" className="flex items-center gap-1">
                         <Settings className="h-4 w-4"/> Manage Types
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
                               employeeId={userId} // userId is guaranteed to be non-null here
                               leaveTypes={leaveTypes}
                               onSuccess={handleLeaveRequestSubmitted} // Pass success callback
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
                        currentUserId={userId} // userId is guaranteed to be non-null here
                        onUpdate={handleLeaveRequestUpdated} // Pass update callback
                    />
                </TabsContent>

                {/* All Requests Tab (Admin Only) */}
                {isAdmin && (
                   <TabsContent value="all-requests">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={leaveTypes}
                           isAdminView={true}
                           currentUserId={userId} // userId is guaranteed to be non-null here
                           onUpdate={handleLeaveRequestUpdated} // Pass update callback
                       />
                   </TabsContent>
                )}

                {/* Manage Leave Types Tab (Admin Only) */}
                {isAdmin && (
                   <TabsContent value="manage-types">
                       <LeaveTypeManagement
                           initialLeaveTypes={leaveTypes}
                           onUpdate={handleLeaveTypeUpdated} // Pass update callback
                       />
                   </TabsContent>
                )}
              </Tabs>
           </>
       )}
    </div>
  );
}

