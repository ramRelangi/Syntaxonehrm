
// src/modules/leave/components/leave-page-client.tsx
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

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Leave Page Client - fetchData] Fetching data from: ${fullUrl}`);

    try {
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
             throw new Error(errorPayload.error || errorPayload.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`[Leave Page Client - fetchData] Error in fetchData for ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}

interface LeavePageClientProps {
  tenantDomain: string;
  userId: string;
  isAdmin: boolean;
}

export default function LeavePageClient({ tenantDomain, userId, isAdmin }: LeavePageClientProps) {
  const { toast } = useToast();
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState('request'); // Manage active tab

  // Function to refetch all necessary data
  const refetchData = React.useCallback(async () => {
      console.log("[Leave Page Client] Fetching leave data for user:", userId);
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
          console.error("[Leave Page Client] Error during refetchData:", err);
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

  // Fetch data on mount
  React.useEffect(() => {
      refetchData();
  }, [refetchData]);

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

       {isLoading && !error && (
          <Card><CardContent className="p-4 text-center text-muted-foreground">Loading leave data...</CardContent></Card>
       )}
       {error && (
           <Card><CardContent className="p-4 text-destructive text-center">{error}</CardContent></Card>
       )}


       {!isLoading && !error && (
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
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
                               employeeId={userId}
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
                        currentUserId={userId}
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
                           currentUserId={userId}
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
              </Tabs>
           </>
       )}
    </div>
  );
}

