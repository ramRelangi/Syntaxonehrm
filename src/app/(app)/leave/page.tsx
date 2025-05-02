import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, PlusCircle, ListChecks, Settings } from "lucide-react";
import { LeaveRequestForm } from "@/modules/leave/components/leave-request-form"; // Updated import
import { LeaveRequestList } from "@/modules/leave/components/leave-request-list"; // Updated import
import { getLeaveRequests, getLeaveTypes, getEmployeeLeaveBalances, addLeaveRequest } from "@/modules/leave/actions"; // Updated import
import { Badge } from "@/components/ui/badge";
import { LeaveTypeManagement } from "@/modules/leave/components/leave-type-management"; // Updated import path

// Mock current user ID and admin status - replace with actual auth context
const MOCK_USER_ID = "emp-001"; // Example: Alice Wonderland
const MOCK_IS_ADMIN = true; // Example: Assume user is admin for testing

export default async function LeavePage() {
  // Fetch data using server actions
  const leaveTypes = await getLeaveTypes();
  const allRequests = await getLeaveRequests(); // Fetch all for admin view
  const myRequests = await getLeaveRequests({ employeeId: MOCK_USER_ID }); // Filter for user view
  const myBalances = await getEmployeeLeaveBalances(MOCK_USER_ID); // Fetch balances for the current user

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
             {myBalances.length > 0 ? (
                myBalances.map(balance => {
                    const leaveType = leaveTypes.find(lt => lt.id === balance.leaveTypeId);
                    return (
                        <div key={balance.leaveTypeId} className="flex items-center gap-2 p-3 border rounded-md bg-secondary/50">
                            <span className="font-medium">{leaveType?.name || 'Unknown Type'}:</span>
                            <Badge variant="outline">{balance.balance} days</Badge>
                        </div>
                    );
                })
             ) : (
                 <p className="text-muted-foreground">No leave balance information available.</p>
             )}
          </CardContent>
       </Card>


       {/* Tabs for Request Form, Lists, and Type Management */}
       <Tabs defaultValue="request" className="w-full" id="leave-tabs"> {/* Add id for linking */}
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
                    <LeaveRequestForm
                        employeeId={MOCK_USER_ID}
                        leaveTypes={leaveTypes}
                        onSubmitAction={addLeaveRequest} // Pass the server action directly
                    />
                </CardContent>
            </Card>
         </TabsContent>

         {/* My Requests Tab */}
         <TabsContent value="my-requests">
             <LeaveRequestList requests={myRequests} currentUserId={MOCK_USER_ID} isAdminView={false} leaveTypes={leaveTypes} />
         </TabsContent>

         {/* All Requests Tab (Admin Only) */}
         {MOCK_IS_ADMIN && (
            <TabsContent value="all-requests">
                <LeaveRequestList requests={allRequests} isAdminView={true} leaveTypes={leaveTypes} />
            </TabsContent>
         )}

         {/* Manage Leave Types Tab (Admin Only) */}
         {MOCK_IS_ADMIN && (
            <TabsContent value="manage-types">
                <LeaveTypeManagement leaveTypes={leaveTypes} />
            </TabsContent>
         )}
       </Tabs>


       {/* Future: Leave Calendar View */}
       {/* <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Team Leave Calendar</CardTitle>
            <CardDescription>Placeholder for team leave visualization.</CardDescription>
         </CardHeader>
         <CardContent>
             <div className="h-60 w-full flex items-center justify-center bg-muted rounded-md">
                <p className="text-muted-foreground">Calendar Component Placeholder</p>
             </div>
         </CardContent>
      </Card> */}

    </div>
  );
}
