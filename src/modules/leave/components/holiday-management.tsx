
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { holidaySchema, type Holiday, type HolidayFormData } from '@/modules/leave/types';
import { addHolidayAction, updateHolidayAction, deleteHolidayAction } from '@/modules/leave/actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PlusCircle, Edit, Trash2, Loader2, Save, CalendarIcon } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

interface HolidayManagementProps {
  initialHolidays: Holiday[];
  onUpdate: () => void; // Callback to refresh data in parent
}

export function HolidayManagement({ initialHolidays, onUpdate }: HolidayManagementProps) {
  const { toast } = useToast();
  const holidays = initialHolidays;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState<Record<string, boolean>>({});
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingHoliday, setEditingHoliday] = React.useState<Holiday | null>(null);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  // Zod schema for form validation (no tenantId)
  const formSchema = holidaySchema.omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

  const form = useForm<HolidayFormData>({
    resolver: zodResolver(formSchema),
    // Default values set in useEffect based on editingHoliday
  });

  React.useEffect(() => {
    if (editingHoliday) {
      form.reset({
        name: editingHoliday.name,
        date: editingHoliday.date,
        description: editingHoliday.description || '',
      });
    } else {
      form.reset({
        name: '',
        date: '',
        description: '',
      });
    }
  }, [editingHoliday, form]);

  const onSubmit = async (data: HolidayFormData) => {
    setIsSubmitting(true);
    const isEditMode = !!editingHoliday;
    const action = isEditMode ? updateHolidayAction : addHolidayAction;
    const actionParams: any[] = isEditMode ? [editingHoliday!.id!, data] : [data];

    try {
      const result = await action(...actionParams);

      if (!result.success) {
          console.error("Holiday Submit error (action result):", result.errors);
          const errorMessage = result.errors?.[0]?.message || 'Failed to save holiday.';
          // Set field-specific errors if path is available
          if (result.errors?.[0]?.path && result.errors[0].path.length > 0) {
               const fieldPath = result.errors[0].path[0] as keyof HolidayFormData;
               form.setError(fieldPath, { message: errorMessage });
          } else {
               form.setError("root.serverError", { message: errorMessage });
          }
          throw new Error(errorMessage); // Throw to prevent success toast
      }

      toast({
        title: `Holiday ${isEditMode ? 'Updated' : 'Added'}`,
        description: `${result.holiday?.name || data.name} has been successfully ${isEditMode ? 'updated' : 'added'}.`,
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      });

      setIsDialogOpen(false);
      setEditingHoliday(null);
      form.reset();
      onUpdate(); // Refresh parent state

    } catch (error: any) {
      console.error("Holiday Submit error (catch block):", error);
      // Avoid double-toasting if a specific error was already set
      if (!form.formState.errors.date && !form.formState.errors.root?.serverError) {
            toast({
                title: `Error ${isEditMode ? 'Updating' : 'Adding'} Holiday`,
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
            form.setError("root.serverError", { message: error.message || "An unexpected server error occurred." });
        }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setIsDeleting(prev => ({ ...prev, [id]: true }));
    try {
      const result = await deleteHolidayAction(id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete holiday.');
      }

      toast({
        title: "Holiday Deleted",
        description: `${name} has been successfully deleted.`,
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      });
      onUpdate(); // Refresh parent state

    } catch (error: any) {
      console.error("Holiday Delete error:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not delete holiday.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(prev => ({ ...prev, [id]: false }));
    }
  };

  const openEditDialog = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingHoliday(null);
    form.reset({ name: '', date: '', description: '' });
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setEditingHoliday(null);
      form.reset();
      form.clearErrors(); // Clear errors when dialog closes
    }
    setIsDialogOpen(open);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Manage Company Holidays</CardTitle>
          <CardDescription>Add, edit, or remove company-wide holidays.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Holiday
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}</DialogTitle>
              <DialogDescription>
                {editingHoliday ? 'Update the details of this holiday.' : 'Define a new company holiday.'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                {form.formState.errors.root?.serverError && !form.formState.errors.date && ( // Only show root error if no specific date error
                  <FormMessage className="text-destructive text-center">
                    {form.formState.errors.root.serverError.message}
                  </FormMessage>
                )}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Holiday Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., New Year's Day" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Date</FormLabel>
                      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground",
                                form.formState.errors.date && "border-destructive focus-visible:ring-destructive" // Highlight if error
                              )}
                            >
                              {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value && isValid(parseISO(field.value)) ? parseISO(field.value) : undefined}
                            onSelect={(date) => {
                              field.onChange(date ? format(date, 'yyyy-MM-dd') : "");
                              setDatePickerOpen(false);
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage /> {/* Will display date validation/server errors */}
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
                        <Input placeholder="e.g., National holiday" {...field} />
                      </FormControl>
                      <FormMessage />
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
                    {isSubmitting ? 'Saving...' : (editingHoliday ? 'Save Changes' : 'Add Holiday')}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
         {/* Added overflow-auto for responsiveness */}
         <div className="overflow-auto">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {holidays.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                    No holidays configured yet.
                    </TableCell>
                </TableRow>
                ) : (
                holidays.map((holiday) => (
                    <TableRow key={holiday.id}>
                    <TableCell className="font-medium">{holiday.name}</TableCell>
                    <TableCell>{format(parseISO(holiday.date), "PPP")}</TableCell>
                    <TableCell className="text-muted-foreground">{holiday.description || '-'}</TableCell>
                    <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(holiday)} className="mr-1 h-8 w-8">
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                        </Button>
                        <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8" disabled={isDeleting[holiday.id!]}>
                            {isDeleting[holiday.id!] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            <span className="sr-only">Delete</span>
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete the <strong>{holiday.name}</strong> holiday on {format(parseISO(holiday.date), "PPP")}. This action cannot be undone.
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting[holiday.id!]}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(holiday.id!, holiday.name)} disabled={isDeleting[holiday.id!]} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {isDeleting[holiday.id!] ? "Deleting..." : "Delete"}
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
