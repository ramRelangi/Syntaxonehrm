
// src/modules/leave/components/leave-page-client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, PlusCircle, ListChecks, Settings, LandPlot, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { LeaveRequestList } from "@/modules/leave/components/leave-request-list";
import { Badge } from "@/components/ui/badge";
import { LeaveTypeManagement } from "@/modules/leave/components/leave-type-management";
import { HolidayManagement } from "@/modules/leave/components/holiday-management";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaveType, LeaveRequest, LeaveBalance, Holiday } from "@/modules/leave/types";
import { getHolidaysAction, getLeaveRequests, getLeaveTypes, getEmployeeLeaveBalances } from '@/modules/leave/actions';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';
import { useSearchParams, useRouter } from "next/navigation";

interface LeavePageClientProps {
  userId: string | null;
  isAdmin: boolean;
  tenantDomain: string | null;
}

export default function LeavePageClient({ userId: initialUserId, isAdmin, tenantDomain }: LeavePageClientProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const employeeIdFromQuery = searchParams.get('employeeId');
  const targetUserId = employeeIdFromQuery || initialUserId;

  const [leaveTypes, setLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(employeeIdFromQuery ? 'my-requests' : 'request');
  const [currentEmployeeName, setCurrentEmployeeName] = React.useState<string | null>(null);


  const refetchData = React.useCallback(async () => {
      if (!targetUserId || !tenantDomain) {
          console.log("[Leave Page Client] Skipping refetchData, targetUserId or tenantDomain not available.");
          setIsLoading(false);
          setFetchError("User or tenant information is missing.");
          return;
      }
      console.log("[Leave Page Client] Refetching leave and holiday data for user:", targetUserId);
      setIsLoading(true);
      setFetchError(null);
      try {
          const [typesData, allReqData, myReqData, balancesData, holidaysData] = await Promise.all([
              getLeaveTypes(),
              isAdmin && !employeeIdFromQuery ? getLeaveRequests() : Promise.resolve([]),
              getLeaveRequests({ employeeId: targetUserId }),
              getEmployeeLeaveBalances(targetUserId),
              getHolidaysAction(),
          ]);
          setLeaveTypes(typesData);
          setAllRequests(allReqData);
          setMyRequests(myReqData);
          setMyBalances(balancesData);
          setHolidays(holidaysData);

          if (employeeIdFromQuery && myReqData.length > 0 && myReqData[0].employeeName) {
             setCurrentEmployeeName(myReqData[0].employeeName);
          } else if (employeeIdFromQuery) {
             setCurrentEmployeeName(`Employee ID: ${employeeIdFromQuery}`);
          } else {
             setCurrentEmployeeName(null);
          }

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
  }, [toast, targetUserId, isAdmin, tenantDomain, employeeIdFromQuery]);

  React.useEffect(() => {
    if (targetUserId && tenantDomain) {
        refetchData();
    } else {
        setIsLoading(false);
        if (!targetUserId || !tenantDomain) {
             setFetchError("User or tenant context could not be established.");
             console.error("[Leave Page Client] Critical props (targetUserId, tenantDomain) missing.");
        }
    }
  }, [targetUserId, tenantDomain, refetchData]);

   const handleLeaveRequestSubmitted = () => {
     refetchData();
     setActiveTab('my-requests');
   };

   const handleLeaveRequestUpdated = () => refetchData();
   const handleLeaveTypeUpdated = () => refetchData();
   const handleHolidayUpdated = () => refetchData();

  const pageTitle = employeeIdFromQuery
    ? currentEmployeeName
        ? `Leave Management for ${currentEmployeeName}`
        : `Leave Management for Employee`
    : `Leave Management ${tenantDomain ? `for ${tenantDomain}` : ''}`;


  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex items-center justify-between flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Calendar className="h-6 w-6" /> {pageTitle}
        </h1>
        {employeeIdFromQuery && (
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
        )}
      </div>


       {isLoading && !fetchError && (
           <div className="space-y-6 md:space-y-8">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full max-w-lg" />
              <Skeleton className="h-64 w-full" />
           </div>
       )}
       {fetchError && !isLoading && (
           <Card><CardContent className="p-4 text-destructive text-center">{fetchError}</CardContent></Card>
       )}


       {!isLoading && !fetchError && targetUserId && (
           <>
              <Card className="shadow-sm">
                 <CardHeader>
                   <CardTitle>
                        {employeeIdFromQuery && currentEmployeeName
                            ? `${currentEmployeeName.startsWith('Employee ID:') ? '' : currentEmployeeName + "'s " }Leave Balances`
                            : "My Leave Balances"}
                   </CardTitle>
                   <CardDescription>
                        {employeeIdFromQuery
                            ? `Current available leave balances for this employee.`
                            : "Your current available leave balances."}
                   </CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {myBalances.length > 0 ? (
                       myBalances.map(balance => (
                           <div key={balance.leaveTypeId} className="flex flex-col items-start gap-1 p-3 border rounded-md bg-secondary/50">
                               <span className="font-medium text-sm">{balance.leaveTypeName}</span> {/* Use balance.leaveTypeName directly */}
                               <Badge variant="outline" className="text-lg">{balance.balance} days</Badge>
                           </div>
                       ))
                    ) : (
                        <p className="text-muted-foreground col-span-full text-center py-4">No leave balance information available.</p>
                    )}
                 </CardContent>
              </Card>


              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs">
                 <div className="overflow-x-auto pb-2">
                     <TabsList className="inline-flex h-auto w-max sm:w-full sm:grid sm:grid-cols-2 md:grid-cols-4">
                       {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                           <TabsTrigger value="request" className="flex items-center gap-1">
                                <PlusCircle className="h-4 w-4"/> Request Leave
                            </TabsTrigger>
                       )}
                       <TabsTrigger value="my-requests" className="flex items-center gap-1">
                           <ListChecks className="h-4 w-4"/>
                           {employeeIdFromQuery && currentEmployeeName ? `${currentEmployeeName.startsWith('Employee ID:') ? 'Requests' : currentEmployeeName + "'s Requests"}` : 'My Requests'}
                        </TabsTrigger>
                       {isAdmin && !employeeIdFromQuery && (
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

                {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                    <TabsContent value="request">
                       <Card className="shadow-sm mt-4">
                           <CardHeader>
                               <CardTitle>Submit Leave Request</CardTitle>
                               <CardDescription>Fill out the form below to request time off.</CardDescription>
                           </CardHeader>
                           <CardContent>
                               <LeaveRequestForm
                                   employeeId={targetUserId}
                                   leaveTypes={leaveTypes}
                                   onSuccess={handleLeaveRequestSubmitted}
                               />
                           </CardContent>
                       </Card>
                    </TabsContent>
                )}

                <TabsContent value="my-requests">
                    <LeaveRequestList
                        requests={myRequests}
                        leaveTypes={leaveTypes}
                        isAdminView={isAdmin && employeeIdFromQuery === initialUserId}
                        currentUserId={initialUserId}
                        tenantDomain={tenantDomain}
                        onUpdate={handleLeaveRequestUpdated}
                    />
                </TabsContent>

                {isAdmin && !employeeIdFromQuery && (
                   <TabsContent value="all-requests">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={leaveTypes}
                           isAdminView={true}
                           currentUserId={initialUserId}
                           tenantDomain={tenantDomain}
                           onUpdate={handleLeaveRequestUpdated}
                       />
                   </TabsContent>
                )}

                {isAdmin && (
                   <TabsContent value="manage-types">
                       <LeaveTypeManagement
                           initialLeaveTypes={leaveTypes}
                           onUpdate={handleLeaveTypeUpdated}
                       />
                   </TabsContent>
                )}

                {isAdmin && (
                   <TabsContent value="manage-holidays">
                       <HolidayManagement
                           initialHolidays={holidays}
                           onUpdate={handleHolidayUpdated}
                       />
                   </TabsContent>
                )}
              </Tabs>
           </>
       )}
    </div>
  );
}
