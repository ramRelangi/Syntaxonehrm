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
import { getHolidaysAction, getLeaveRequests, getLeaveTypes, getEmployeeLeaveBalances } from '@/modules/leave/actions'; // Import all relevant actions
// getSessionData is no longer directly called here
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert
import { cn } from '@/lib/utils'; // Import cn utility


interface LeavePageClientProps {
  userId: string | null;
  isAdmin: boolean;
  tenantDomain: string | null;
}

export default function LeavePageClient({ userId, isAdmin, tenantDomain }: LeavePageClientProps) {
  const { toast } = useToast();
  // userId, isAdmin, tenantDomain are now props
  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState('request');


  // Function to refetch all necessary data AFTER auth context is loaded using server actions
  const refetchData = React.useCallback(async () => {
      if (!userId || !tenantDomain) {
          console.log("[Leave Page Client] Skipping refetchData, userId or tenantDomain not available from props.");
          setIsLoading(false); // Ensure loading stops if props aren't ready
          setFetchError("User or tenant information is missing.");
          return;
      }
      console.log("[Leave Page Client] Refetching leave and holiday data for user:", userId);
      setIsLoading(true);
      setFetchError(null);
      try {
           // Use server actions directly instead of API calls
          const [typesData, allReqData, myReqData, balancesData, holidaysData] = await Promise.all([
              getLeaveTypes(), // Action uses session context
              isAdmin ? getLeaveRequests() : Promise.resolve([]), // Action uses session context
              getLeaveRequests({ employeeId: userId }), // Action uses session context + filter
              getEmployeeLeaveBalances(userId), // Action uses session context for tenant
              getHolidaysAction(), // Action uses session context
          ]);
          setLeaveTypes(typesData);
          setAllRequests(allReqData);
          setMyRequests(myReqData);
          setMyBalances(balancesData);
          setHolidays(holidaysData);
      } catch (err: any) {
          console.error("[Leave Page Client] Error during refetchData using actions:", err);
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
  }, [toast, userId, isAdmin, tenantDomain]); // Keep dependencies

  // Fetch data when userId and tenantDomain become available via props
  React.useEffect(() => {
    if (userId && tenantDomain) {
        refetchData();
    } else {
        // If critical props are missing after initial render, show error or stop loading
        setIsLoading(false);
        if (!userId || !tenantDomain) {
             setFetchError("User or tenant context could not be established.");
             console.error("[Leave Page Client] Critical props (userId, tenantDomain) missing.");
        }
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
    if (!userId || !tenantDomain) { // Handle missing critical props early
      return (
          <div className="flex flex-col gap-6 items-center justify-center min-h-[400px]">
               <Alert variant="destructive" className="max-w-md">
                  <AlertTitle>Initialization Error</AlertTitle>
                  <AlertDescription>{fetchError || "Could not load user or tenant context."}</AlertDescription>
              </Alert>
          </div>
      );
    }


  return (
    <div className="flex flex-col gap-6 md:gap-8"> {/* Increased gap */}
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Calendar className="h-6 w-6" /> Leave Management {tenantDomain ? `for ${tenantDomain}` : ''}
      </h1>

       {isLoading && !fetchError && (
          // Show multiple skeletons for better loading perception
           <div className="space-y-6 md:space-y-8">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full max-w-lg" />
              <Skeleton className="h-64 w-full" />
           </div>
       )}
       {fetchError && !isLoading && (
           <Card><CardContent className="p-4 text-destructive text-center">{fetchError}</CardContent></Card>
       )}


       {!isLoading && !fetchError && userId && (
           <>
             {/* Leave Balances Section - Responsive Grid */}
              <Card className="shadow-sm">
                 <CardHeader>
                   <CardTitle>My Leave Balances</CardTitle>
                   <CardDescription>Your current available leave balances.</CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {myBalances.length > 0 ? (
                       myBalances.map(balance => (
                           <div key={balance.leaveTypeId} className="flex flex-col items-start gap-1 p-3 border rounded-md bg-secondary/50">
                               <span className="font-medium text-sm">{balance.leaveTypeName || leaveTypeNameMap.get(balance.leaveTypeId) || 'Unknown Type'}</span>
                               <Badge variant="outline" className="text-lg">{balance.balance} days</Badge>
                           </div>
                       ))
                    ) : (
                        <p className="text-muted-foreground col-span-full text-center py-4">No leave balance information available.</p>
                    )}
                 </CardContent>
              </Card>


              {/* Tabs for Request Form, Lists, and Type/Holiday Management */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs">
                 {/* Use a flex-wrap layout for the tabs list to handle different screen sizes better */}
                 {/* Wrap TabsList in overflow-x-auto for small screens */}
                 <div className="overflow-x-auto pb-2">
                     <TabsList className="inline-flex h-auto w-max sm:w-full sm:grid sm:grid-cols-2 md:grid-cols-4">
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
                 </div>

                {/* Request Leave Tab */}
                <TabsContent value="request">
                   <Card className="shadow-sm mt-4"> {/* Add margin top */}
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
