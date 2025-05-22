
// src/modules/leave/components/leave-page-client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, PlusCircle, ListChecks, Settings, LandPlot, ArrowLeft, Users } from "lucide-react"; // Added Users icon
import { Button } from "@/components/ui/button";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form";
import { LeaveRequestList } from "@/modules/leave/components/leave-request-list";
import { Badge } from "@/components/ui/badge";
import { LeaveTypeManagement } from "@/modules/leave/components/leave-type-management";
import { HolidayManagement } from "@/modules/leave/components/holiday-management";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaveType, LeaveRequest, LeaveBalance, Holiday } from "@/modules/leave/types";
import type { Gender } from "@/modules/employees/types";
import type { UserRole } from "@/modules/auth/types"; // Import UserRole
import { getHolidaysAction, getLeaveRequestsAction, getLeaveTypesAction, getEmployeeLeaveBalancesAction } from '@/modules/leave/actions';
import { useSearchParams, useRouter } from "next/navigation";

interface LeavePageClientProps {
  userId: string | null;
  isAdmin: boolean; // Keep for quick admin checks
  currentUserRole: UserRole | null; // Pass specific role
  tenantDomain: string | null;
  employeeGender?: Gender | null;
}

export default function LeavePageClient({ userId: initialUserId, isAdmin, currentUserRole, tenantDomain, employeeGender }: LeavePageClientProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const employeeIdFromQuery = searchParams.get('employeeId');
  // targetUserId should be the user_id of the employee whose leave we are viewing/managing
  const targetUserId = employeeIdFromQuery || initialUserId;

  const [allLeaveTypes, setAllLeaveTypes] = React.useState<LeaveType[]>([]);
  const [applicableLeaveTypes, setApplicableLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]); // For admin viewing all
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]); // For user's own or specific employee's
  const [requestsPendingMyApproval, setRequestsPendingMyApproval] = React.useState<LeaveRequest[]>([]); // For manager's approval queue
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
          const promises = [
              getLeaveTypesAction(),
              getLeaveRequestsAction({ employeeId: targetUserId }), // Always fetch requests for targetUserId
              getEmployeeLeaveBalancesAction(targetUserId),
              getHolidaysAction(),
          ];

          // Fetch all requests if admin and not viewing a specific employee
          if (isAdmin && !employeeIdFromQuery) {
              promises.push(getLeaveRequestsAction()); // Fetches all for tenant
          } else {
              promises.push(Promise.resolve([])); // Placeholder for allRequests if not needed
          }

          // Fetch requests pending manager approval if user is Manager or Admin
          if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
              promises.push(getLeaveRequestsAction({ forManagerApproval: true }));
          } else {
              promises.push(Promise.resolve([])); // Placeholder
          }


          const [typesData, myReqData, balancesData, holidaysData, allReqDataFromFetch, managerApprovalData] = await Promise.all(promises);
          
          setAllLeaveTypes(typesData);
          setAllRequests(allReqDataFromFetch);
          setMyRequests(myReqData);
          setRequestsPendingMyApproval(managerApprovalData);
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
  }, [toast, targetUserId, isAdmin, tenantDomain, employeeIdFromQuery, currentUserRole]);

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

  React.useEffect(() => {
    if (allLeaveTypes.length > 0) {
      let filteredTypes;
      const genderToFilterBy = employeeIdFromQuery && employeeIdFromQuery !== initialUserId ? undefined : employeeGender;

      if (genderToFilterBy) {
        filteredTypes = allLeaveTypes.filter(lt =>
          !lt.applicableGender || lt.applicableGender === genderToFilterBy
        );
      } else {
        filteredTypes = allLeaveTypes;
      }
      console.log(`[Leave Page Client] Employee Gender: ${genderToFilterBy}, All Types: ${allLeaveTypes.length}, Filtered Types: ${filteredTypes.length}`);
      setApplicableLeaveTypes(filteredTypes);
    } else {
      setApplicableLeaveTypes([]);
    }
  }, [allLeaveTypes, employeeGender, employeeIdFromQuery, initialUserId]);


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
                               <span className="font-medium text-sm">{balance.leaveTypeName}</span>
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
                     <TabsList className="inline-flex h-auto w-max sm:w-full sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"> {/* Adjusted grid columns */}
                       {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                           <TabsTrigger value="request" className="flex items-center gap-1">
                                <PlusCircle className="h-4 w-4"/> Request Leave
                            </TabsTrigger>
                       )}
                       <TabsTrigger value="my-requests" className="flex items-center gap-1">
                           <ListChecks className="h-4 w-4"/>
                           {employeeIdFromQuery && currentEmployeeName ? `${currentEmployeeName.startsWith('Employee ID:') ? 'Requests' : currentEmployeeName + "'s Requests"}` : 'My Requests'}
                        </TabsTrigger>
                       {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && !employeeIdFromQuery && (
                            <TabsTrigger value="all-requests" className="flex items-center gap-1">
                               <Users className="h-4 w-4"/> All Employee Requests
                            </TabsTrigger>
                       )}
                        {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && (
                             <TabsTrigger value="pending-my-approval" className="flex items-center gap-1">
                                <ListChecks className="h-4 w-4"/> Pending My Approval
                             </TabsTrigger>
                        )}
                       {isAdmin && ( // Keep isAdmin for settings-like tabs
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
                                   employeeId={targetUserId} // This is user_id
                                   leaveTypes={applicableLeaveTypes}
                                   onSuccess={handleLeaveRequestSubmitted}
                               />
                           </CardContent>
                       </Card>
                    </TabsContent>
                )}

                <TabsContent value="my-requests">
                    <LeaveRequestList
                        requests={myRequests}
                        leaveTypes={allLeaveTypes}
                        isAdminView={isAdmin && (employeeIdFromQuery === initialUserId || !employeeIdFromQuery)} // Admin view if viewing own or all
                        currentUserId={initialUserId}
                        tenantDomain={tenantDomain}
                        onUpdate={handleLeaveRequestUpdated}
                    />
                </TabsContent>

                {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && !employeeIdFromQuery && (
                   <TabsContent value="all-requests">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={allLeaveTypes}
                           isAdminView={true} // True for admin/manager viewing all requests
                           currentUserId={initialUserId}
                           tenantDomain={tenantDomain}
                           onUpdate={handleLeaveRequestUpdated}
                       />
                   </TabsContent>
                )}

                {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && (
                     <TabsContent value="pending-my-approval">
                         <LeaveRequestList
                             requests={requestsPendingMyApproval}
                             leaveTypes={allLeaveTypes}
                             isAdminView={true} // Managers can approve/reject these
                             currentUserId={initialUserId} // Manager's own ID for context
                             tenantDomain={tenantDomain}
                             onUpdate={handleLeaveRequestUpdated}
                             isManagerApprovalView={true} // Specific prop to indicate this view
                         />
                     </TabsContent>
                )}

                {isAdmin && (
                   <TabsContent value="manage-types">
                       <LeaveTypeManagement
                           initialLeaveTypes={allLeaveTypes}
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

    