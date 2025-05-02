"use client";

import * as React from "react";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/modules/leave/types"; // Updated import
import { format, parseISO } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Hourglass, Trash2, Eye } from 'lucide-react'; // Added Eye for View
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { updateLeaveRequestStatus, cancelLeaveRequest } from "@/modules/leave/actions"; // Updated import path
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


// Helper function to determine badge variant based on status
const getStatusVariant = (status: LeaveRequestStatus): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case 'Approved':
      return 'default'; // Usually green-ish
    case 'Pending':
      return 'secondary'; // Usually yellow-ish/orange
     case 'Rejected':
       return 'destructive'; // Usually red
    case 'Cancelled':
       return 'outline'; // Gray
    default:
      return 'outline';
  }
};

// Helper function to get status icon
const getStatusIcon = (status: LeaveRequestStatus) => {
  switch (status) {
    case 'Approved':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'Pending':
      return <Hourglass className="h-4 w-4 text-yellow-600" />;
    case 'Rejected':
       return <XCircle className="h-4 w-4 text-red-600" />;
    case 'Cancelled':
       return <XCircle className="h-4 w-4 text-muted-foreground" />; // Or a different cancel icon
    default:
      return null;
  }
};

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  leaveTypes: LeaveType[]; // Add leaveTypes prop
  isAdminView?: boolean;
  currentUserId?: string; // To check if user can cancel their own request
}

export function LeaveRequestList({ requests, leaveTypes, isAdminView = false, currentUserId }: LeaveRequestListProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({}); // Track loading state per request ID

   // Create a map for quick lookup of leave type names
  const leaveTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    leaveTypes.forEach(lt => map.set(lt.id, lt.name));
    return map;
  }, [leaveTypes]);

  const handleStatusUpdate = async (id: string, status: 'Approved' | 'Rejected') => {
     setActionLoading(prev => ({ ...prev, [id]: true }));
     // Add comments input if needed
     const result = await updateLeaveRequestStatus(id, status, status === 'Rejected' ? 'Rejected by admin' : 'Approved by admin' /*, approverId */);
     setActionLoading(prev => ({ ...prev, [id]: false }));

     if (result.success) {
        toast({
            title: `Request ${status}`,
            description: `Leave request ${result.request?.id} has been ${status.toLowerCase()}.`,
            className: status === 'Approved' ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
        });
        // Revalidation should happen via server action revalidatePath
     } else {
         toast({
            title: `Error Updating Status`,
            description: `Failed to update request ${id}. ${result.errors?.[0]?.message || ''}`,
            variant: "destructive",
         });
     }
  };

  const handleCancel = async (id: string, employeeName: string) => {
     setActionLoading(prev => ({ ...prev, [id]: true }));
     const result = await cancelLeaveRequest(id);
     setActionLoading(prev => ({ ...prev, [id]: false }));

     if (result.success) {
        toast({
            title: "Request Cancelled",
            description: `Your leave request has been cancelled.`,
             className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:yellow-green-100", // Use a warning/info color
        });
     } else {
         toast({
            title: "Error Cancelling Request",
            description: `Could not cancel the request. It might have already been processed.`,
            variant: "destructive",
         });
     }
  };

  const getLeaveTypeName = (leaveTypeId: string) => {
      // Use the map, fallback to the stored name (in case type was deleted), or 'Unknown'
      return leaveTypeMap.get(leaveTypeId) || requests.find(r => r.leaveTypeId === leaveTypeId)?.leaveTypeName || 'Unknown Type';
  };


  return (
     <TooltipProvider>
         <Card className="shadow-sm">
             <CardHeader>
                 <CardTitle>{isAdminView ? 'All Leave Requests' : 'My Leave Requests'}</CardTitle>
                 <CardDescription>
                     {isAdminView ? 'Review and manage employee leave requests.' : 'View your past and pending leave requests.'}
                 </CardDescription>
             </CardHeader>
             <CardContent>
                 <Table>
                 <TableHeader>
                     <TableRow>
                         {isAdminView && <TableHead>Employee</TableHead>}
                         <TableHead>Type</TableHead>
                         <TableHead>Dates</TableHead>
                         <TableHead>Reason</TableHead>
                         <TableHead>Requested</TableHead>
                         <TableHead className="text-center">Status</TableHead>
                         <TableHead className="text-right">Actions</TableHead>
                     </TableRow>
                 </TableHeader>
                 <TableBody>
                     {requests.length === 0 ? (
                         <TableRow>
                             <TableCell colSpan={isAdminView ? 7 : 6} className="h-24 text-center">
                             No leave requests found.
                             </TableCell>
                         </TableRow>
                     ) : (
                     requests.map((req) => (
                         <TableRow key={req.id}>
                            {isAdminView && <TableCell>{req.employeeName}</TableCell>}
                            <TableCell>{getLeaveTypeName(req.leaveTypeId)}</TableCell> {/* Use helper */}
                            <TableCell>
                                {format(parseISO(req.startDate), "MMM d, yyyy")} - {format(parseISO(req.endDate), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="truncate max-w-[150px] inline-block">{req.reason}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="max-w-xs">{req.reason}</p>
                                        {req.comments && <p className="mt-2 border-t pt-2 text-muted-foreground"><strong>Approver Comment:</strong> {req.comments}</p>}
                                    </TooltipContent>
                                </Tooltip>
                            </TableCell>
                            <TableCell>{format(parseISO(req.requestDate), "MMM d, yyyy")}</TableCell>
                            <TableCell className="text-center">
                                <Badge variant={getStatusVariant(req.status)} className="flex items-center justify-center gap-1 w-24">
                                    {getStatusIcon(req.status)}
                                    {req.status}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                {isAdminView && req.status === 'Pending' && (
                                    <div className="flex gap-1 justify-end">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleStatusUpdate(req.id, 'Approved')}
                                            disabled={actionLoading[req.id]}
                                            className="text-green-600 hover:text-green-700 hover:bg-green-100"
                                        >
                                            <CheckCircle className="h-4 w-4 mr-1"/> Approve
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleStatusUpdate(req.id, 'Rejected')}
                                            disabled={actionLoading[req.id]}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-100"
                                        >
                                            <XCircle className="h-4 w-4 mr-1"/> Reject
                                        </Button>
                                    </div>
                                )}
                                {!isAdminView && req.employeeId === currentUserId && req.status === 'Pending' && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={actionLoading[req.id]}>
                                                <Trash2 className="h-4 w-4 mr-1"/> Cancel
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Cancel Leave Request?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to cancel your leave request for {getLeaveTypeName(req.leaveTypeId)} from {format(parseISO(req.startDate), "MMM d")} to {format(parseISO(req.endDate), "MMM d")}?
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel disabled={actionLoading[req.id]}>Back</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleCancel(req.id, req.employeeName)} disabled={actionLoading[req.id]} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    Yes, Cancel Request
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                {/* Add a View Details Button/Link if needed */}
                                {/* <Button variant="ghost" size="icon" asChild>
                                    <Link href={`/leave/${req.id}`}><Eye className="h-4 w-4"/></Link>
                                </Button> */}
                            </TableCell>
                         </TableRow>
                     ))
                     )}
                 </TableBody>
                 </Table>
             </CardContent>
         </Card>
     </TooltipProvider>
  );
}
