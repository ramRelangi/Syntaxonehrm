
// src/modules/leave/components/leave-page-client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIconMain, PlusCircle, ListChecks, Settings, LandPlot, ArrowLeft, Users, Briefcase, Star, Shield, Umbrella, Plane, FirstAidKit, CalendarDays } from "lucide-react"; // Added more icons
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
import type { UserRole } from "@/modules/auth/types";
import { getHolidaysAction, getLeaveRequestsAction, getLeaveTypesAction, getEmployeeLeaveBalancesAction } from '@/modules/leave/actions';
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils"; // Import cn

interface LeavePageClientProps {
  userId: string | null;
  isAdmin: boolean;
  currentUserRole: UserRole | null;
  tenantDomain: string | null;
  employeeGender?: Gender | null;
}

// Helper to pick an icon based on leave type name (very basic example)
const getLeaveTypeIcon = (leaveTypeName?: string): React.ReactNode => {
  const name = leaveTypeName?.toLowerCase() || "";
  if (name.includes("annual") || name.includes("vacation")) return <Plane className="h-5 w-5" />;
  if (name.includes("sick")) return <FirstAidKit className="h-5 w-5" />;
  if (name.includes("maternity")) return <Shield className="h-5 w-5" />; // Example
  if (name.includes("paternity")) return <Briefcase className="h-5 w-5" />; // Example
  if (name.includes("unpaid")) return <Umbrella className="h-5 w-5" />; // Example
  if (name.includes("special") || name.includes("bereavement")) return <Star className="h-5 w-5" />;
  return <CalendarDays className="h-5 w-5" />; // Default
};


export default function LeavePageClient({ userId: initialUserId, isAdmin, currentUserRole, tenantDomain, employeeGender }: LeavePageClientProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const employeeIdFromQuery = searchParams.get('employeeId');
  const targetUserId = employeeIdFromQuery || initialUserId;

  const [allLeaveTypes, setAllLeaveTypes] = React.useState<LeaveType[]>([]);
  const [applicableLeaveTypes, setApplicableLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]);
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]);
  const [requestsPendingMyApproval, setRequestsPendingMyApproval] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]);
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(employeeIdFromQuery ? 'my-requests' : 'request');
  const [currentEmployeeName, setCurrentEmployeeName] = React.useState<string | null>(null);

  // Helper function to get current user's profile (example, might need adjustment based on your auth setup)
  // This is a client-side function, ideally it would fetch from an API or use a context
  const getEmployeeProfileInfo = React.useCallback(async (): Promise<{ name: string; gender: Gender | null } | null> => {
      // In a real app, this would fetch from an API endpoint like '/api/auth/me' or '/api/employees/me'
      // For demonstration, returning a mock or trying to fetch if your API supports it
      try {
          const response = await fetch('/api/auth/session'); // Assuming this returns { userId, userRole, tenantId, tenantDomain, name?, gender? }
          if (response.ok) {
              const session = await response.json();
              // Check if employee specific details like name and gender are directly on session,
              // or if another call is needed to get the full employee profile using session.userId
              // For this example, let's assume a separate call would be needed if not on session directly.
              // This example is simplified and might not fully work without a proper API for current employee details.
              if (session.userId) {
                  // Mock fetching additional details - replace with actual API call to get employee profile by userId
                  // const profileResponse = await fetch(`/api/employees/${session.userId}`); // This conceptual endpoint needs to exist
                  // if(profileResponse.ok) {
                  //     const profile = await profileResponse.json();
                  //     return { name: profile.name, gender: profile.gender };
                  // }
                  // For now, return what might be on session or mock.
                  return { name: session.name || "Current User", gender: session.gender || null };
              }
          }
          return null;
      } catch (error) {
          console.error("Error fetching current user's profile for leave page:", error);
          return null;
      }
  }, []);


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
              getLeaveRequestsAction({ employeeId: targetUserId }),
              getEmployeeLeaveBalancesAction(targetUserId),
              getHolidaysAction(),
          ];

          if (isAdmin && !employeeIdFromQuery) {
              promises.push(getLeaveRequestsAction());
          } else {
              promises.push(Promise.resolve([]));
          }

          if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
              promises.push(getLeaveRequestsAction({ forManagerApproval: true }));
          } else {
              promises.push(Promise.resolve([]));
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
             const employeeProfile = await getEmployeeProfileInfo();
             if (employeeIdFromQuery === initialUserId && employeeProfile) {
                 setCurrentEmployeeName(employeeProfile.name);
             } else {
                 setCurrentEmployeeName(`Employee (ID: ${employeeIdFromQuery.substring(0,8)}...)`);
             }
          } else if (initialUserId) {
             const employeeProfile = await getEmployeeProfileInfo();
             if (employeeProfile) setCurrentEmployeeName(employeeProfile.name);
             else setCurrentEmployeeName("My");
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
  }, [toast, targetUserId, isAdmin, tenantDomain, employeeIdFromQuery, currentUserRole, initialUserId, getEmployeeProfileInfo]);

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

  const pageTitleNamePart = currentEmployeeName || (isAdmin && !employeeIdFromQuery ? "Employee" : "My");
  const pageTitle = `${pageTitleNamePart} Leave Management ${tenantDomain && !currentEmployeeName ? `for ${tenantDomain}` : ''}`;

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <CalendarIconMain className="h-6 w-6" /> {pageTitle}
        </h1>
        {employeeIdFromQuery && (
            <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
        )}
      </div>

       {isLoading && !fetchError && (
           <div className="space-y-6 md:space-y-8">
              <Skeleton className="h-40 w-full rounded-lg" /> {/* Enhanced skeleton for balances */}
              <Skeleton className="h-10 w-full max-w-lg rounded-md" /> {/* Tabs list skeleton */}
              <Skeleton className="h-64 w-full rounded-lg" /> {/* Tab content skeleton */}
           </div>
       )}
       {fetchError && !isLoading && (
           <Card><CardContent className="p-6 text-destructive text-center">{fetchError}</CardContent></Card>
       )}

       {!isLoading && !fetchError && targetUserId && (
           <>
              <Card className="shadow-lg border-border/60">
                 <CardHeader>
                   <CardTitle className="text-xl">
                        {currentEmployeeName ? `${currentEmployeeName}'s Leave Balances` : "My Leave Balances"}
                   </CardTitle>
                   <CardDescription>
                        Overview of available leave days by type.
                   </CardDescription>
                 </CardHeader>
                 <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {myBalances.length > 0 ? (
                       myBalances.map(balance => (
                           <div key={balance.leaveTypeId} 
                                className={cn(
                                    "flex flex-col items-start justify-between gap-2 p-4 border rounded-lg bg-card hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1",
                                    "dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
                                )}>
                               <div className="flex items-center gap-3 text-muted-foreground w-full">
                                   <span className="p-2 bg-primary/10 text-primary rounded-full">
                                     {getLeaveTypeIcon(balance.leaveTypeName)}
                                   </span>
                                   <span className="font-semibold text-md text-card-foreground flex-grow truncate">{balance.leaveTypeName}</span>
                               </div>
                               <div className="mt-2 w-full text-left">
                                   <span className="text-4xl font-bold text-primary">{balance.balance}</span>
                                   <span className="text-lg text-muted-foreground ml-1">days</span>
                               </div>
                               <p className="text-xs text-muted-foreground mt-2 w-full text-right">Last updated: {new Date(balance.lastUpdated).toLocaleDateString()}</p>
                           </div>
                       ))
                    ) : (
                        <p className="text-muted-foreground col-span-full text-center py-6 text-lg">No leave balance information available.</p>
                    )}
                 </CardContent>
              </Card>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" id="leave-tabs">
                 <div className="overflow-x-auto pb-1 mb-4 border-b border-border/60">
                     <TabsList className="inline-flex h-auto w-max sm:w-full justify-start px-0 bg-transparent">
                       {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                           <TabsTrigger value="request" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                                <PlusCircle className="h-4 w-4"/> Request Leave
                            </TabsTrigger>
                       )}
                       <TabsTrigger value="my-requests" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                           <ListChecks className="h-4 w-4"/>
                           {currentEmployeeName ? `${currentEmployeeName}'s Requests` : 'My Requests'}
                        </TabsTrigger>
                       {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && !employeeIdFromQuery && (
                            <TabsTrigger value="all-requests" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                               <Users className="h-4 w-4"/> All Requests
                            </TabsTrigger>
                       )}
                        {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && (
                             <TabsTrigger value="pending-my-approval" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                                <ListChecks className="h-4 w-4"/> Pending My Approval
                                {requestsPendingMyApproval.length > 0 && (
                                    <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">{requestsPendingMyApproval.length}</Badge>
                                )}
                             </TabsTrigger>
                        )}
                       {isAdmin && (
                           <TabsTrigger value="manage-types" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                              <Settings className="h-4 w-4"/> Manage Types
                           </TabsTrigger>
                       )}
                       {isAdmin && (
                           <TabsTrigger value="manage-holidays" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                              <LandPlot className="h-4 w-4"/> Manage Holidays
                           </TabsTrigger>
                       )}
                     </TabsList>
                 </div>

                {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                    <TabsContent value="request" className="mt-6">
                       <Card className="shadow-lg border-border/60">
                           <CardHeader>
                               <CardTitle>Submit New Leave Request</CardTitle>
                               <CardDescription>Complete the form to request time off. Ensure your balances are sufficient.</CardDescription>
                           </CardHeader>
                           <CardContent>
                               <LeaveRequestForm
                                   employeeId={targetUserId}
                                   leaveTypes={applicableLeaveTypes}
                                   balances={myBalances} // Pass balances
                                   onSuccess={handleLeaveRequestSubmitted}
                               />
                           </CardContent>
                       </Card>
                    </TabsContent>
                )}

                <TabsContent value="my-requests" className="mt-6">
                    <LeaveRequestList
                        requests={myRequests}
                        leaveTypes={allLeaveTypes}
                        isAdminView={isAdmin && (employeeIdFromQuery === initialUserId || !employeeIdFromQuery)}
                        currentUserId={initialUserId}
                        tenantDomain={tenantDomain}
                        onUpdate={handleLeaveRequestUpdated}
                    />
                </TabsContent>

                {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && !employeeIdFromQuery && (
                   <TabsContent value="all-requests" className="mt-6">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={allLeaveTypes}
                           isAdminView={true}
                           currentUserId={initialUserId}
                           tenantDomain={tenantDomain}
                           onUpdate={handleLeaveRequestUpdated}
                       />
                   </TabsContent>
                )}

                {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && (
                     <TabsContent value="pending-my-approval" className="mt-6">
                         <LeaveRequestList
                             requests={requestsPendingMyApproval}
                             leaveTypes={allLeaveTypes}
                             isAdminView={true}
                             currentUserId={initialUserId}
                             tenantDomain={tenantDomain}
                             onUpdate={handleLeaveRequestUpdated}
                             isManagerApprovalView={true}
                         />
                     </TabsContent>
                )}

                {isAdmin && (
                   <TabsContent value="manage-types" className="mt-6">
                       <LeaveTypeManagement
                           initialLeaveTypes={allLeaveTypes}
                           onUpdate={handleLeaveTypeUpdated}
                       />
                   </TabsContent>
                )}

                {isAdmin && (
                   <TabsContent value="manage-holidays" className="mt-6">
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

