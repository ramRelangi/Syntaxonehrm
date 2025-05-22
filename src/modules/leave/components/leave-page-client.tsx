
// src/modules/leave/components/leave-page-client.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIconMain, PlusCircle, ListChecks, Settings, LandPlot, ArrowLeft, Users, Briefcase, Star, Shield, Umbrella, Plane, HeartPulse, CalendarDays } from "lucide-react"; // Changed FirstAidKit to HeartPulse
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

// Helper to pick an icon based on leave type name
const getLeaveTypeIcon = (leaveTypeName?: string): React.ReactNode => {
  const name = leaveTypeName?.toLowerCase() || "";
  if (name.includes("annual") || name.includes("vacation")) return <Plane className="h-5 w-5" />;
  if (name.includes("sick")) return <HeartPulse className="h-5 w-5" />; // Changed to HeartPulse
  if (name.includes("maternity")) return <Shield className="h-5 w-5" />;
  if (name.includes("paternity")) return <Briefcase className="h-5 w-5" />;
  if (name.includes("unpaid")) return <Umbrella className="h-5 w-5" />;
  if (name.includes("special") || name.includes("bereavement")) return <Star className="h-5 w-5" />;
  return <CalendarDays className="h-5 w-5" />;
};


export default function LeavePageClient({ userId: initialUserId, isAdmin, currentUserRole, tenantDomain, employeeGender }: LeavePageClientProps) {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const employeeIdFromQuery = searchParams.get('employeeId');
  // Use the employeeId from query if present (admin viewing other's leave), otherwise use the logged-in user's ID
  const targetUserId = employeeIdFromQuery || initialUserId;

  const [allLeaveTypes, setAllLeaveTypes] = React.useState<LeaveType[]>([]);
  const [applicableLeaveTypes, setApplicableLeaveTypes] = React.useState<LeaveType[]>([]);
  const [allRequests, setAllRequests] = React.useState<LeaveRequest[]>([]); // For admins
  const [myRequests, setMyRequests] = React.useState<LeaveRequest[]>([]); // For the targetUserId
  const [requestsPendingMyApproval, setRequestsPendingMyApproval] = React.useState<LeaveRequest[]>([]);
  const [myBalances, setMyBalances] = React.useState<LeaveBalance[]>([]); // For the targetUserId
  const [holidays, setHolidays] = React.useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  // Set initial active tab based on whether an employeeId is in the query params
  const [activeTab, setActiveTab] = React.useState(employeeIdFromQuery ? 'my-requests' : 'request');
  const [currentEmployeeName, setCurrentEmployeeName] = React.useState<string | null>(null);


  const getEmployeeProfileInfo = React.useCallback(async (): Promise<{ name: string; gender: Gender | null } | null> => {
      if (!initialUserId) return null; // If no logged-in user, can't fetch profile
      try {
          // This conceptual API call should fetch the current logged-in user's employee details
          const response = await fetch('/api/auth/session'); // This returns userId, userRole, etc.
          if (response.ok) {
              const session = await response.json();
              // Assuming the session might have name, or we need another call for detailed profile
              // For this example, we'll prioritize the name if available, or use a generic term.
              // In a real app, you'd ensure this fetches name and gender for the 'initialUserId'.
              return { name: session.name || "Current User", gender: session.gender || employeeGender || null };
          }
          return { name: "Current User", gender: employeeGender || null }; // Fallback
      } catch (error) {
          console.error("Error fetching current user's profile for leave page:", error);
          return { name: "Current User", gender: employeeGender || null }; // Fallback
      }
  }, [initialUserId, employeeGender]);


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
              getLeaveRequestsAction({ employeeId: targetUserId }), // Fetches requests for the target user
              getEmployeeLeaveBalancesAction(targetUserId), // Fetches balances for the target user
              getHolidaysAction(),
          ];

          // Fetch all requests only if admin is viewing the main leave page (no specific employeeId in query)
          if (isAdmin && !employeeIdFromQuery) {
              promises.push(getLeaveRequestsAction()); // Fetches all requests for the tenant
          } else {
              promises.push(Promise.resolve([])); // Placeholder if not admin or viewing specific employee
          }

          // Fetch requests pending manager approval
          if (currentUserRole === 'Manager' || currentUserRole === 'Admin') {
              promises.push(getLeaveRequestsAction({ forManagerApproval: true }));
          } else {
              promises.push(Promise.resolve([]));
          }

          const [typesData, targetUserReqData, balancesData, holidaysData, allReqDataFromFetch, managerApprovalData] = await Promise.all(promises);
          
          setAllLeaveTypes(typesData);
          setAllRequests(allReqDataFromFetch); // Contains all requests if admin & no query; empty otherwise
          setMyRequests(targetUserReqData); // Requests for the employee being viewed (targetUserId)
          setRequestsPendingMyApproval(managerApprovalData);
          setMyBalances(balancesData); // Balances for the employee being viewed (targetUserId)
          setHolidays(holidaysData);

         // Set the name for the page title
          if (employeeIdFromQuery && targetUserReqData.length > 0 && targetUserReqData[0].employeeName) {
             setCurrentEmployeeName(targetUserReqData[0].employeeName);
          } else if (employeeIdFromQuery && targetUserId === initialUserId) { // Admin viewing their own leave via query param
             const profile = await getEmployeeProfileInfo();
             setCurrentEmployeeName(profile?.name || "My");
          } else if (employeeIdFromQuery) { // Admin viewing someone else
             // Try to get name from `allRequests` if it happens to contain this employee, otherwise use ID
             const foundEmployee = allRequests.find(req => req.employeeId === targetUserId);
             setCurrentEmployeeName(foundEmployee?.employeeName || `Employee (ID: ${targetUserId.substring(0,8)}...)`);
          } else if (initialUserId) { // User viewing their own leave page (no query param)
             const profile = await getEmployeeProfileInfo();
             setCurrentEmployeeName(profile?.name || "My");
          } else {
             setCurrentEmployeeName(null); // Should not happen if targetUserId is set
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
      // Use employeeGender of the person whose leave is being viewed (targetUserId)
      // This requires fetching the target employee's gender if employeeIdFromQuery is present and not the current user.
      // For simplicity now, it uses `employeeGender` prop which is for the LOGGED-IN user.
      // This needs refinement if admin views another employee of different gender.
      // For now, if admin views someone else, all types are shown.
      const genderToFilterBy = employeeIdFromQuery && employeeIdFromQuery !== initialUserId ? undefined : employeeGender;


      if (genderToFilterBy) {
        filteredTypes = allLeaveTypes.filter(lt =>
          !lt.applicableGender || lt.applicableGender === genderToFilterBy
        );
      } else {
        // If no specific gender to filter by (e.g., admin viewing all, or gender unknown), show all non-gender-specific
        // or all types. For now, show all types if gender is unknown for the viewed profile.
        // A better approach might be to show only types where applicableGender is null if target gender is unknown.
        filteredTypes = allLeaveTypes;
      }
      console.log(`[Leave Page Client] Logged-in User Gender: ${employeeGender}, Target Employee Gender (used for filtering): ${genderToFilterBy}, All Types: ${allLeaveTypes.length}, Applicable Types for Form: ${filteredTypes.length}`);
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

  // Dynamic page title based on context
  const pageTitleNamePart = currentEmployeeName || (isAdmin && !employeeIdFromQuery ? "All Employees'" : "My");
  const pageTitle = `${pageTitleNamePart} Leave Management ${tenantDomain && !currentEmployeeName && !(isAdmin && !employeeIdFromQuery) ? `for ${tenantDomain}` : ''}`;


  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <CalendarIconMain className="h-6 w-6" /> {pageTitle}
        </h1>
        {/* Show back button if admin is viewing a specific employee's leave details */}
        {employeeIdFromQuery && initialUserId !== employeeIdFromQuery && isAdmin && (
            <Button variant="outline" onClick={() => router.push(`/${tenantDomain}/leave`)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Requests
            </Button>
        )}
      </div>

       {isLoading && !fetchError && (
           <div className="space-y-6 md:space-y-8">
              <Skeleton className="h-40 w-full rounded-lg" />
              <Skeleton className="h-10 w-full max-w-lg rounded-md" />
              <Skeleton className="h-64 w-full rounded-lg" />
           </div>
       )}
       {fetchError && !isLoading && (
           <Card><CardContent className="p-6 text-destructive text-center">{fetchError}</CardContent></Card>
       )}

       {!isLoading && !fetchError && targetUserId && (
           <>
              {/* Leave Balances Section - Always shows balances for targetUserId */}
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
                                    "dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700" // Dark mode styles
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
                       {/* Request Leave tab - only if not viewing someone else's details */}
                       {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                           <TabsTrigger value="request" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                                <PlusCircle className="h-4 w-4"/> Request Leave
                            </TabsTrigger>
                       )}
                       {/* My Requests tab - title adjusts based on context */}
                       <TabsTrigger value="my-requests" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                           <ListChecks className="h-4 w-4"/>
                           {currentEmployeeName ? `${currentEmployeeName}'s Requests` : 'My Requests'}
                        </TabsTrigger>
                       {/* All Requests tab - for admin not viewing a specific employee */}
                       {isAdmin && !employeeIdFromQuery && (
                            <TabsTrigger value="all-requests" className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-primary data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent rounded-none data-[state=active]:shadow-none data-[state=active]:bg-transparent transition-all">
                               <Users className="h-4 w-4"/> All Requests
                            </TabsTrigger>
                       )}
                        {/* Pending My Approval tab - for managers/admins */}
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

                {/* Request Leave Tab Content - only if applicable */}
                {(!employeeIdFromQuery || employeeIdFromQuery === initialUserId) && (
                    <TabsContent value="request" className="mt-6">
                       <Card className="shadow-lg border-border/60">
                           <CardHeader>
                               <CardTitle>Submit New Leave Request</CardTitle>
                               <CardDescription>Complete the form to request time off. Ensure your balances are sufficient.</CardDescription>
                           </CardHeader>
                           <CardContent>
                               <LeaveRequestForm
                                   employeeId={targetUserId} // Should be initialUserId for self-request
                                   leaveTypes={applicableLeaveTypes}
                                   balances={myBalances}
                                   onSuccess={handleLeaveRequestSubmitted}
                               />
                           </CardContent>
                       </Card>
                    </TabsContent>
                )}

                {/* My Requests Tab Content - always shows requests for targetUserId */}
                <TabsContent value="my-requests" className="mt-6">
                    <LeaveRequestList
                        requests={myRequests}
                        leaveTypes={allLeaveTypes}
                        isAdminView={isAdmin && (targetUserId === initialUserId || !employeeIdFromQuery)}
                        currentUserId={initialUserId} // Pass the logged-in user's ID
                        tenantDomain={tenantDomain}
                        onUpdate={handleLeaveRequestUpdated}
                    />
                </TabsContent>

                {/* All Requests Tab Content - for admin not viewing specific employee */}
                {isAdmin && !employeeIdFromQuery && (
                   <TabsContent value="all-requests" className="mt-6">
                       <LeaveRequestList
                           requests={allRequests}
                           leaveTypes={allLeaveTypes}
                           isAdminView={true}
                           currentUserId={initialUserId} // Pass the logged-in user's ID
                           tenantDomain={tenantDomain}
                           onUpdate={handleLeaveRequestUpdated}
                       />
                   </TabsContent>
                )}

                {/* Pending My Approval Tab Content */}
                {(currentUserRole === 'Admin' || currentUserRole === 'Manager') && (
                     <TabsContent value="pending-my-approval" className="mt-6">
                         <LeaveRequestList
                             requests={requestsPendingMyApproval}
                             leaveTypes={allLeaveTypes}
                             isAdminView={true} // Allows approve/reject actions
                             currentUserId={initialUserId} // Pass the logged-in user's ID (manager's ID)
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
