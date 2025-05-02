"use client";

import * as React from "react";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/modules/leave/types";
import { format, parseISO } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Hourglass, Trash2, Eye, Loader2 } from 'lucide-react'; // Added Loader2
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const getStatusVariant = (status: LeaveRequestStatus): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case 'Approved': return 'default';
    case 'Pending': return 'secondary';
    case 'Rejected': return 'destructive';
    case 'Cancelled': return 'outline';
    default: return 'outline';
  }
};

const getStatusIcon = (status: LeaveRequestStatus) => {
  switch (status) {
    case 'Approved': return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'Pending': return <Hourglass className="h-4 w-4 text-yellow-600" />;
    case 'Rejected': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'Cancelled': return <XCircle className="h-4 w-4 text-muted-foreground" />;
    default: return null;
  }
};

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  leaveTypes: LeaveType[];
  isAdminView?: boolean;
  currentUserId?: string;
  onUpdate: () => void;
}

export function LeaveRequestList({ requests, leaveTypes, isAdminView = false, currentUserId, onUpdate }: LeaveRequestListProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({});

  const leaveTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    leaveTypes.forEach(lt => map.set(lt.id, lt.name));
    return map;
  }, [leaveTypes]);

  const handleStatusUpdate = async (id: string, status: 'Approved' | 'Rejected') => {
     setActionLoading(prev => ({ ...prev, [`${id}-${status}`]: true })); // Unique key per action
     const comments = status === 'Rejected' ? 'Rejected by admin' : 'Approved by admin'; // Placeholder

     try {
         const response = await fetch(`/api/leave/requests/${id}/status`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             // TODO: Get approverId from session on server-side in API route
             body: JSON.stringify({ status, comments }),
         });

         let result: any;
         let responseText: string | null = null;
         try {
            responseText = await response.text();
             if(responseText) result = JSON.parse(responseText);
         } catch (e) {
            if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            result = {}; // OK but not JSON
         }

         if (!response.ok) {
             throw new Error(result?.error || result?.message || `HTTP error! Status: ${response.status}`);
         }

         toast({
             title: `Request ${status}`,
             description: `Leave request has been ${status.toLowerCase()}.`,
             className: status === 'Approved' ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
         });
         onUpdate();

     } catch (error: any) {
         toast({
            title: `Error Updating Status`,
            description: error.message || `Failed to update request ${id}.`,
            variant: "destructive",
         });
     } finally {
         setActionLoading(prev => ({ ...prev, [`${id}-${status}`]: false }));
     }
  };

  const handleCancel = async (id: string) => {
     setActionLoading(prev => ({ ...prev, [`${id}-cancel`]: true }));
     try {
         // API route handles user auth check (should get user ID from session)
         const response = await fetch(`/api/leave/requests/${id}/cancel`, {
             method: 'PATCH',
         });

          let result: any;
          let responseText: string | null = null;
          try {
            responseText = await response.text();
            if(responseText) result = JSON.parse(responseText);
          } catch (e) {
            if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            result = {}; // OK but not JSON
          }

         if (!response.ok) {
             throw new Error(result?.error || result?.message || `HTTP error! Status: ${response.status}`);
         }

         toast({
             title: "Request Cancelled",
             description: `Your leave request has been cancelled.`,
             className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100", // Use a warning/info color
         });
         onUpdate();

     } catch (error: any) {
         toast({
            title: "Error Cancelling Request",
            description: error.message || `Could not cancel the request.`,
            variant: "destructive",
         });
     } finally {
         setActionLoading(prev => ({ ...prev, [`${id}-cancel`]: false }));
     }
  };

  const getLeaveTypeName = (leaveTypeId: string) => {
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
                     requests.map((req) => {
                       const isLoadingApprove = actionLoading[`${req.id}-Approved`];
                       const isLoadingReject = actionLoading[`${req.id}-Rejected`];
                       const isLoadingCancel = actionLoading[`${req.id}-cancel`];
                       const isAnyActionLoading = isLoadingApprove || isLoadingReject || isLoadingCancel;

                       return (
                         <TableRow key={req.id}>
                            {isAdminView && <TableCell>{req.employeeName}</TableCell>}
                            <TableCell>{getLeaveTypeName(req.leaveTypeId)}</TableCell>
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
                                            disabled={isAnyActionLoading}
                                            className="text-green-600 hover:text-green-700 hover:bg-green-100"
                                        >
                                            {isLoadingApprove ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <CheckCircle className="h-4 w-4 mr-1"/>}
                                             Approve
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleStatusUpdate(req.id, 'Rejected')}
                                            disabled={isAnyActionLoading}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-100"
                                        >
                                             {isLoadingReject ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <XCircle className="h-4 w-4 mr-1"/>}
                                              Reject
                                        </Button>
                                    </div>
                                )}
                                {!isAdminView && req.employeeId === currentUserId && req.status === 'Pending' && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isAnyActionLoading}>
                                                 {isLoadingCancel ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : <Trash2 className="h-4 w-4 mr-1"/>}
                                                  Cancel
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
                                                <AlertDialogCancel disabled={isLoadingCancel}>Back</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleCancel(req.id)} disabled={isLoadingCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                    {isLoadingCancel ? "Cancelling..." : "Yes, Cancel Request"}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                {/* Add View Details placeholder */}
                                {req.comments && (
                                     <Tooltip>
                                         <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4 text-muted-foreground"/></Button></TooltipTrigger>
                                         <TooltipContent><p><strong>Approver Comment:</strong> {req.comments}</p></TooltipContent>
                                     </Tooltip>
                                )}
                            </TableCell>
                         </TableRow>
                       );
                     })
                     )}
                 </TableBody>
                 </Table>
             </CardContent>
         </Card>
     </TooltipProvider>
  );
}
