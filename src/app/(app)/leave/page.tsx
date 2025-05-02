// This component is designated as a Client Component
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

// Mock current user ID and admin status - replace with actual auth context
const MOCK_USER_ID = "emp-001"; // Example: Alice Wonderland
const MOCK_IS_ADMIN = true; // Example: Assume user is admin for testing

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    // Use relative paths for client-side fetching
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`Fetching data from: ${fullUrl}`); // Log the URL being fetched

    try {
        // Fetch relative to the current origin
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`Fetch response status for ${fullUrl}: ${response.status}`); // Log response status

        if (!response.ok) {
            const errorText = await response.text(); // Get raw error text
            console.error(`Fetch error response body for ${fullUrl}:`, errorText);
            const errorData = JSON.parse(errorText || '{}'); // Try parsing JSON, default to empty object
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error in fetchData for ${fullUrl}:`, error);
        // Rethrow a more specific error if possible, or the original one
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
           throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}

export default function LeavePage() {
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
    setIsLoading(true);
    setError(null);
    try {
      const [typesData, allReqData, myReqData, balancesData] = await Promise.all([
        fetchData<LeaveType[]>('/api/leave/types'),
        MOCK_IS_ADMIN ? fetchData<LeaveRequest[]>('/api/leave/requests') : Promise.resolve([]), // Only fetch all if admin
        fetchData<LeaveRequest[]>(`/api/leave/requests?employeeId=${MOCK_USER_ID}`),
        fetchData<LeaveBalance[]>(`/api/leave/balances/${MOCK_USER_ID}`),
      ]);
      setLeaveTypes(typesData);
      setAllRequests(allReqData);
      setMyRequests(myReqData);
      setMyBalances(balancesData);
    } catch (err: any) { // Catch specific error type
      setError("Failed to load leave management data. Please try refreshing.");
      toast({
        title: "Error Loading Data",
        description: err.message || "Could not fetch necessary leave information.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]); // Add toast to dependency array

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
          <Calendar className="h-6 w-6" /> Leave Management
      </h1>

      {/* Leave Balances Section */}
       <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>My Leave Balances</CardTitle>
            <CardDescription>Your current available leave balances.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
             {isLoading ? (
                <> <Skeleton className="h-10 w-24 rounded-md" /> <Skeleton className="h-10 w-28 rounded-md" /> </>
             ) : error ? (
                <p className="text-destructive">Error loading balances.</p>
             ): myBalances.length > 0 ? (
                myBalances.map(balance => (
                    <div key={balance.leaveTypeId} className="flex items-center gap-2 p-3 border rounded-md bg-secondary/50">
                        <span className="font-medium">{leaveTypeNameMap.get(balance.leaveTypeId) || 'Unknown Type'}:</span>
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
           {MOCK_IS_ADMIN && (
                <TabsTrigger value="all-requests" className="flex items-center gap-1">
                   <ListChecks className="h-4 w-4"/> Manage Requests {/* Changed Icon */}
                </TabsTrigger>
           )}
           {MOCK_IS_ADMIN && (
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
                     {isLoading ? <Skeleton className="h-64 w-full" /> : error ? <p className="text-destructive">{error}</p> :
                        <LeaveRequestForm
                            employeeId={MOCK_USER_ID}
                            leaveTypes={leaveTypes}
                            onSuccess={handleLeaveRequestSubmitted} // Pass success callback
                        />
                     }
                </CardContent>
            </Card>
         </TabsContent>

         {/* My Requests Tab */}
         <TabsContent value="my-requests">
              {isLoading ? <Skeleton className="h-64 w-full" /> : error ? <p className="text-destructive">{error}</p> :
                 <LeaveRequestList
                     requests={myRequests}
                     leaveTypes={leaveTypes}
                     isAdminView={false}
                     currentUserId={MOCK_USER_ID}
                     onUpdate={handleLeaveRequestUpdated} // Pass update callback
                 />
              }
         </TabsContent>

         {/* All Requests Tab (Admin Only) */}
         {MOCK_IS_ADMIN && (
            <TabsContent value="all-requests">
                {isLoading ? <Skeleton className="h-64 w-full" /> : error ? <p className="text-destructive">{error}</p> :
                    <LeaveRequestList
                        requests={allRequests}
                        leaveTypes={leaveTypes}
                        isAdminView={true}
                        onUpdate={handleLeaveRequestUpdated} // Pass update callback
                    />
                }
            </TabsContent>
         )}

         {/* Manage Leave Types Tab (Admin Only) */}
         {MOCK_IS_ADMIN && (
            <TabsContent value="manage-types">
                 {isLoading ? <Skeleton className="h-64 w-full" /> : error ? <p className="text-destructive">{error}</p> :
                    <LeaveTypeManagement
                        initialLeaveTypes={leaveTypes}
                        onUpdate={handleLeaveTypeUpdated} // Pass update callback
                    />
                 }
            </TabsContent>
         )}
       </Tabs>
    </div>
  );
}
