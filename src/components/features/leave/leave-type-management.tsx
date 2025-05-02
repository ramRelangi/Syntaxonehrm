
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LeaveType } from '@/types/leave';
import {
  addLeaveTypeAction,
  updateLeaveTypeAction,
  deleteLeaveTypeAction,
} from '@/actions/leave-actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose, // Import DialogClose
} from '@/components/ui/dialog';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PlusCircle, Edit, Trash2, Loader2, Save } from 'lucide-react';

// --- Zod Schema for Leave Type Form ---
const leaveTypeSchema = z.object({
  id: z.string().optional(), // Optional for adding, required for editing
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  requiresApproval: z.boolean().default(true),
  // Add other fields like defaultBalance, accrualRate if they are configurable
  defaultBalance: z.coerce.number().min(0, "Default balance cannot be negative").optional().default(0),
  accrualRate: z.coerce.number().min(0, "Accrual rate cannot be negative").optional().default(0),
});

type LeaveTypeFormData = z.infer<typeof leaveTypeSchema>;

interface LeaveTypeManagementProps {
  leaveTypes: LeaveType[];
}

export function LeaveTypeManagement({ leaveTypes: initialLeaveTypes }: LeaveTypeManagementProps) {
  const { toast } = useToast();
  const [leaveTypes, setLeaveTypes] = React.useState(initialLeaveTypes); // Local state to reflect updates
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState<Record<string, boolean>>({});
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingLeaveType, setEditingLeaveType] = React.useState<LeaveType | null>(null);

  const form = useForm<LeaveTypeFormData>({
    resolver: zodResolver(leaveTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      requiresApproval: true,
      defaultBalance: 0,
      accrualRate: 0,
    },
  });

   // Effect to update form defaults when editingLeaveType changes
  React.useEffect(() => {
    if (editingLeaveType) {
      form.reset({
        id: editingLeaveType.id,
        name: editingLeaveType.name,
        description: editingLeaveType.description || '',
        requiresApproval: editingLeaveType.requiresApproval,
        defaultBalance: editingLeaveType.defaultBalance ?? 0, // Use nullish coalescing
        accrualRate: editingLeaveType.accrualRate ?? 0,     // Use nullish coalescing
      });
    } else {
      form.reset({ // Reset to default values when adding
        id: undefined,
        name: '',
        description: '',
        requiresApproval: true,
        defaultBalance: 0,
        accrualRate: 0,
      });
    }
  }, [editingLeaveType, form]);


  const onSubmit = async (data: LeaveTypeFormData) => {
    setIsSubmitting(true);
    let result;

    try {
        if (editingLeaveType) {
        // Update existing leave type
        result = await updateLeaveTypeAction(editingLeaveType.id, data);
        } else {
        // Add new leave type
        result = await addLeaveTypeAction(data);
        }

        if (result.success && result.leaveType) {
        toast({
            title: `Leave Type ${editingLeaveType ? 'Updated' : 'Added'}`,
            description: `${result.leaveType.name} has been successfully ${editingLeaveType ? 'updated' : 'added'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        // Update local state optimistically or refetch (simple update here)
        setLeaveTypes(prev => {
             if (editingLeaveType) {
                 return prev.map(lt => lt.id === result.leaveType!.id ? result.leaveType! : lt);
             } else {
                 return [...prev, result.leaveType!];
             }
         });

        setIsDialogOpen(false); // Close dialog on success
        setEditingLeaveType(null); // Clear editing state
        form.reset(); // Reset form
        } else {
         console.error("Error:", result.errors);
        toast({
            title: `Error ${editingLeaveType ? 'Updating' : 'Adding'} Leave Type`,
            description: result.errors?.[0]?.message || "An unexpected error occurred.",
            variant: "destructive",
        });
         // Handle specific field errors if needed
         result.errors?.forEach((err: any) => {
             const fieldName = Array.isArray(err.path) ? err.path.join('.') : 'unknownField';
             if (fieldName && fieldName in form.getValues()) {
                 form.setError(fieldName as keyof LeaveTypeFormData, { message: err.message });
             } else {
                  form.setError("root.serverError", { message: err.message || 'Server error' });
             }
         });
        }
    } catch (error) {
         console.error("Submit error:", error);
         toast({
            title: "Action Failed",
            description: "An unexpected error occurred. Please try again.",
            variant: "destructive",
         });
          form.setError("root.serverError", { message: "An unexpected server error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setIsDeleting(prev => ({ ...prev, [id]: true }));
    try {
        const result = await deleteLeaveTypeAction(id);
        if (result.success) {
            toast({
                title: "Leave Type Deleted",
                description: `${name} has been successfully deleted.`,
                className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
            });
            // Update local state
            setLeaveTypes(prev => prev.filter(lt => lt.id !== id));
        } else {
            toast({
                title: "Error Deleting Leave Type",
                description: `Failed to delete ${name}. It might be in use by leave requests or balances.`,
                variant: "destructive",
            });
        }
    } catch (error) {
        console.error("Delete error:", error);
         toast({
            title: "Deletion Failed",
            description: "An unexpected error occurred. Please try again.",
            variant: "destructive",
        });
    } finally {
        setIsDeleting(prev => ({ ...prev, [id]: false }));
    }
  };

  const openEditDialog = (leaveType: LeaveType) => {
    setEditingLeaveType(leaveType);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingLeaveType(null); // Ensure we are in "add" mode
    form.reset({ // Reset form to defaults for adding
      id: undefined,
      name: '',
      description: '',
      requiresApproval: true,
      defaultBalance: 0,
      accrualRate: 0,
    });
    setIsDialogOpen(true);
  };

   const handleDialogClose = (open: boolean) => {
     if (!open) {
       // Reset form and editing state when dialog is closed
       setEditingLeaveType(null);
       form.reset();
       form.clearErrors(); // Clear errors when closing
     }
     setIsDialogOpen(open);
   };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Manage Leave Types</CardTitle>
          <CardDescription>Add, edit, or remove leave types available in the system.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
             <Button onClick={openAddDialog}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Leave Type
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingLeaveType ? 'Edit Leave Type' : 'Add New Leave Type'}</DialogTitle>
              <DialogDescription>
                {editingLeaveType ? 'Update the details of this leave type.' : 'Define a new type of leave.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                {form.formState.errors.root?.serverError && (
                    <FormMessage className="text-destructive text-center">
                        {form.formState.errors.root.serverError.message}
                    </FormMessage>
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Annual Leave" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Standard paid time off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="defaultBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Balance (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.5" placeholder="e.g., 20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="accrualRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monthly Accrual Rate (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.01" placeholder="e.g., 1.67" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requiresApproval"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                       <div className="space-y-0.5">
                          <FormLabel>Requires Approval</FormLabel>
                           <FormDescription>
                              Does this leave type need manager approval?
                           </FormDescription>
                        </div>
                      <FormControl>
                         <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                         />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                   <DialogClose asChild>
                      <Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button>
                   </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                       <Save className="mr-2 h-4 w-4" />
                    )}
                    {isSubmitting ? 'Saving...' : (editingLeaveType ? 'Save Changes' : 'Add Type')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Default Balance</TableHead>
              <TableHead>Accrual Rate</TableHead>
              <TableHead>Needs Approval?</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaveTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No leave types configured yet.
                </TableCell>
              </TableRow>
            ) : (
              leaveTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell className="text-muted-foreground">{type.description || '-'}</TableCell>
                  <TableCell>{type.defaultBalance ?? 0} days</TableCell>
                  <TableCell>{type.accrualRate ?? 0} days/month</TableCell>
                  <TableCell>{type.requiresApproval ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)} className="mr-1">
                      <Edit className="h-4 w-4" />
                       <span className="sr-only">Edit</span>
                    </Button>
                     <AlertDialog>
                       <AlertDialogTrigger asChild>
                           <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting[type.id]}>
                             <Trash2 className="h-4 w-4" />
                             <span className="sr-only">Delete</span>
                           </Button>
                       </AlertDialogTrigger>
                       <AlertDialogContent>
                         <AlertDialogHeader>
                           <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                           <AlertDialogDescription>
                             This will permanently delete the <strong>{type.name}</strong> leave type. This action cannot be undone and might fail if the type is currently in use.
                           </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                           <AlertDialogCancel disabled={isDeleting[type.id]}>Cancel</AlertDialogCancel>
                           <AlertDialogAction onClick={() => handleDelete(type.id, type.name)} disabled={isDeleting[type.id]} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              {isDeleting[type.id] ? "Deleting..." : "Delete"}
                           </AlertDialogAction>
                         </AlertDialogFooter>
                       </AlertDialogContent>
                     </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
        
    