
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { LeaveType } from '@/modules/leave/types';
import type { Gender } from '@/modules/employees/types'; // Import Gender
import { genderSchema } from '@/modules/employees/types'; // Import Gender Schema
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DialogClose,
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit, Trash2, Loader2, Save } from 'lucide-react';

const leaveTypeFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  requiresApproval: z.boolean().default(true),
  defaultBalance: z.coerce.number().min(0, "Default balance cannot be negative").optional().default(0),
  accrualRate: z.coerce.number().min(0, "Accrual rate cannot be negative").optional().default(0),
  applicableGender: z.custom<Gender>().optional().nullable(), // Zod schema for applicableGender
});

type LeaveTypeFormData = z.infer<typeof leaveTypeFormSchema>;

const ALL_GENDERS_VALUE = "__ALL_GENDERS__"; // Special value for 'All Genders' option

interface LeaveTypeManagementProps {
  initialLeaveTypes: LeaveType[];
  onUpdate: () => void;
}

export function LeaveTypeManagement({ initialLeaveTypes, onUpdate }: LeaveTypeManagementProps) {
  const { toast } = useToast();
  const leaveTypes = initialLeaveTypes;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState<Record<string, boolean>>({});
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingLeaveType, setEditingLeaveType] = React.useState<LeaveType | null>(null);

  const form = useForm<LeaveTypeFormData>({
    resolver: zodResolver(leaveTypeFormSchema),
  });

  React.useEffect(() => {
    if (editingLeaveType) {
      form.reset({
        id: editingLeaveType.id,
        name: editingLeaveType.name,
        description: editingLeaveType.description || '',
        requiresApproval: editingLeaveType.requiresApproval,
        defaultBalance: editingLeaveType.defaultBalance ?? 0,
        accrualRate: editingLeaveType.accrualRate ?? 0,
        applicableGender: editingLeaveType.applicableGender ?? null,
      });
    } else {
      form.reset({
        id: undefined,
        name: '',
        description: '',
        requiresApproval: true,
        defaultBalance: 0,
        accrualRate: 0,
        applicableGender: null, // Default to null (All Genders)
      });
    }
  }, [editingLeaveType, form]);

  const onSubmit = async (data: LeaveTypeFormData) => {
    setIsSubmitting(true);
    const isEditMode = !!editingLeaveType;
    const apiUrl = isEditMode ? `/api/leave/types/${editingLeaveType!.id}` : '/api/leave/types';
    const method = isEditMode ? 'PUT' : 'POST';

    const payload = { ...data, applicableGender: data.applicableGender === ALL_GENDERS_VALUE ? null : data.applicableGender };
    if (!isEditMode) delete payload.id;

    try {
        const response = await fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        let result: any;
        let responseText: string | null = null;
        try {
             responseText = await response.text();
             if(responseText) result = JSON.parse(responseText);
        } catch(e) {
            if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            result = {};
        }

        if (!response.ok) {
             throw new Error(result?.error || result?.message || `HTTP error! Status: ${response.status}`);
        }

        toast({
            title: `Leave Type ${isEditMode ? 'Updated' : 'Added'}`,
            description: `${result.name || data.name} has been successfully ${isEditMode ? 'updated' : 'added'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        setIsDialogOpen(false);
        setEditingLeaveType(null);
        form.reset();
        onUpdate();

    } catch (error: any) {
        console.error("Leave Type Submit error:", error);
        toast({
            title: `Error ${isEditMode ? 'Updating' : 'Adding'} Leave Type`,
            description: error.message || "An unexpected error occurred.",
            variant: "destructive",
        });
        form.setError("root.serverError", { message: error.message || "An unexpected server error occurred." });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setIsDeleting(prev => ({ ...prev, [id]: true }));
    try {
        const response = await fetch(`/api/leave/types/${id}`, {
            method: 'DELETE',
        });

         let result: any;
         let responseText: string | null = null;
         try {
            responseText = await response.text();
             if(responseText) result = JSON.parse(responseText);
         } catch(e) {
            if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            result = {};
         }

        if (!response.ok) {
            throw new Error(result?.error || result?.message || `HTTP error! status: ${response.status}`);
        }

        toast({
            title: "Leave Type Deleted",
            description: `${name} has been successfully deleted.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        onUpdate();

    } catch (error: any) {
        console.error("Leave Type Delete error:", error);
         toast({
            title: "Deletion Failed",
            description: error.message || "Could not delete leave type.",
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
    setEditingLeaveType(null);
    form.reset({
      id: undefined, name: '', description: '', requiresApproval: true, defaultBalance: 0, accrualRate: 0, applicableGender: null
    });
    setIsDialogOpen(true);
  };

   const handleDialogClose = (open: boolean) => {
     if (!open) {
       setEditingLeaveType(null);
       form.reset();
       form.clearErrors();
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
          <DialogContent className="sm:max-w-md">
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
                        <Input placeholder="e.g., Standard paid time off" {...field} value={field.value ?? ""} />
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
                  name="applicableGender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Applicable Gender (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ALL_GENDERS_VALUE}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select applicable gender or leave blank for all" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ALL_GENDERS_VALUE}>All Genders</SelectItem>
                          {genderSchema.options.map(gender => (
                            <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>If a gender is selected, this leave type will only be available to employees of that gender.</FormDescription>
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
                  <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
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
         <div className="overflow-auto">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Default Balance</TableHead>
                <TableHead>Accrual Rate</TableHead>
                <TableHead>Needs Approval?</TableHead>
                <TableHead>Applicable Gender</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {leaveTypes.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
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
                    <TableCell>{type.applicableGender || 'All'}</TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)} className="mr-1 h-8 w-8">
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                        </Button>
                        <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8" disabled={isDeleting[type.id!]}>
                                {isDeleting[type.id!] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
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
                            <AlertDialogCancel disabled={isDeleting[type.id!]}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(type.id!, type.name)} disabled={isDeleting[type.id!]} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {isDeleting[type.id!] ? "Deleting..." : "Delete"}
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
         </div>
      </CardContent>
    </Card>
  );
}
