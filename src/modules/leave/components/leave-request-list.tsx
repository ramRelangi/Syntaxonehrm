
"use client";

import * as React from "react";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/modules/leave/types";
import { format, parseISO } from 'date-fns';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Hourglass, Trash2, Loader2, Paperclip, User } from 'lucide-react';
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
import Link from "next/link";
import { updateLeaveRequestStatusAction, cancelLeaveRequestAction } from "@/modules/leave/actions"; // Import server actions

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
  isManagerApprovalView?: boolean; // New prop for manager's approval queue view
  currentUserId?: string | null;
  tenantDomain: string | null;
  onUpdate: () => void;
}

export function LeaveRequestList({ requests, leaveTypes, isAdminView = false, isManagerApprovalView = false, currentUserId, tenantDomain, onUpdate }: LeaveRequestListProps) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({});

  const leaveTypeMap = React.useMemo(() => {
    const map = new Map<string, string>();
    leaveTypes.forEach(lt => map.set(lt.id, lt.name));
    return map;
  }, [leaveTypes]);

  const handleStatusUpdate = async (id: string, status: 'Approved' | 'Rejected') => {
     setActionLoading(prev => ({ ...prev, [`${id}-${status}`]: true }));
     const comments = status === 'Rejected' ? 'Rejected by manager/admin' : 'Approved by manager/admin';

     try {
         // Call server action directly
         const result = await updateLeaveRequestStatusAction(id, status, comments);

         if (!result.success) {
             throw new Error(result.errors?.[0]?.message || `Failed to update request to ${status}`);
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
         const result = await cancelLeaveRequestAction(id); // Call server action

         if (!result.success) {
             throw new Error(result.error || `Could not cancel the request.`);
         }

         toast({
             title: "Request Cancelled",
             description: `Your leave request has been cancelled.`,
             className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
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

  const showActionButtonsForAdminOrManager = isAdminView || isManagerApprovalView;

  return (
     <TooltipProvider>
         <Card className="shadow-sm mt-4">
             <CardHeader>
                 <CardTitle>{isManagerApprovalView ? 'Requests Pending Your Approval' : (isAdminView ? 'All Leave Requests' : 'My Leave Requests')}</CardTitle>
                 <CardDescription>
                     {isManagerApprovalView ? 'Review and action leave requests submitted by your direct reports.' : (isAdminView ? 'Review and manage all employee leave requests.' : 'View your past and pending leave requests.')}
                 </CardDescription>
             </CardHeader>
             <CardContent>
                 <div className="overflow-auto">
                     <Table>
                     <TableHeader>
                         <TableRow>
                             {(isAdminView || isManagerApprovalView) && <TableHead>Employee</TableHead>}
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
                                 <TableCell colSpan={(isAdminView || isManagerApprovalView) ? 7 : 6} className="h-24 text-center">
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
                                {(isAdminView || isManagerApprovalView) && (
                                    <TableCell>
                                        {tenantDomain && req.employeeId ? (
                                            <Link href={`/${tenantDomain}/employees/${req.employeeId}`} className="text-primary hover:underline flex items-center gap-1">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                {req.employeeName}
                                            </Link>
                                        ) : (
                                            req.employeeName
                                        )}
                                    </TableCell>
                                )}
                                <TableCell>{getLeaveTypeName(req.leaveTypeId)}</TableCell>
                                <TableCell>
                                    {format(parseISO(req.startDate), "MMM d, yyyy")} - {format(parseISO(req.endDate), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="truncate max-w-[150px] inline-block">{req.reason}</span>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
                                            <p>{req.reason}</p>
                                            {req.comments && <p className="mt-2 border-t pt-2 text-muted-foreground"><strong>Approver Comment:</strong> {req.comments}</p>}
                                            {req.attachmentUrl && (
                                                <p className="mt-2 border-t pt-2">
                                                    <strong>Attachment: </strong>
                                                    <Link href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                                        View Attachment
                                                    </Link>
                                                </p>
                                            )}
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
                                    {showActionButtonsForAdminOrManager && req.status === 'Pending' && (
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
                                    {/* User can cancel their own pending request */}
                                    {!isAdminView && !isManagerApprovalView && req.employeeId === currentUserId && req.status === 'Pending' && (
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
                                    {req.attachmentUrl && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                                    <Link href={req.attachmentUrl} target="_blank" rel="noopener noreferrer">
                                                        <Paperclip className="h-4 w-4 text-muted-foreground"/>
                                                    </Link>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent><p>View Attachment</p></TooltipContent>
                                        </Tooltip>
                                    )}
                                </TableCell>
                             </TableRow>
                           );
                         })
                         )}
                     </TableBody>
                     </Table>
                 </div>
             </CardContent>
         </Card>
     </TooltipProvider>
  );
}

    