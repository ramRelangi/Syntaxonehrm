"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { leaveRequestSchema, type LeaveRequestFormData, type LeaveType } from '@/modules/leave/types';
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input"; // Not used directly
import { Label } from "@/components/ui/label"; // Keep for consistency if used elsewhere
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Send, X } from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';

interface LeaveRequestFormProps {
  employeeId: string; // Assume current user's employee ID is passed
  leaveTypes: LeaveType[];
  // onSubmitAction removed, replaced by onSuccess callback
  onSuccess: () => void; // Callback function on successful submission
}

export function LeaveRequestForm({
  employeeId,
  leaveTypes,
  onSuccess, // Use the onSuccess callback
}: LeaveRequestFormProps) {
  const router = useRouter(); // Keep router if needed for other purposes, but not for refresh
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = React.useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = React.useState(false);

  const form = useForm<LeaveRequestFormData>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      employeeId: employeeId, // Pre-fill employee ID
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  const startDateValue = form.watch('startDate');
  const endDateValue = form.watch('endDate');

  const calculateLeaveDays = () => {
     if (startDateValue && endDateValue && isValid(parseISO(startDateValue)) && isValid(parseISO(endDateValue))) {
        const start = parseISO(startDateValue);
        const end = parseISO(endDateValue);
        if (end >= start) {
             // +1 because differenceInDays counts full 24h periods, inclusive count needed
            return differenceInDays(end, start) + 1;
        }
     }
     return 0;
  };

  const leaveDays = calculateLeaveDays();

  const onSubmit = async (data: LeaveRequestFormData) => {
    setIsLoading(true);
    console.log("Submitting leave request via API:", data);

    try {
        const response = await fetch('/api/leave/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json(); // Always try to parse response

        if (!response.ok) {
            throw new Error(result.message || result.error || `HTTP error! status: ${response.status}`);
        }

        toast({
            title: "Leave Request Submitted",
            description: `Your request has been submitted successfully.`, // Use generic success message
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        form.reset(); // Reset form on success
        onSuccess(); // Call the success callback

    } catch (error: any) {
        console.error("Leave request submission error:", error);
        toast({
            title: "Error Submitting Request",
            description: error.message || "An unexpected error occurred. Please try again.",
            variant: "destructive",
        });
        // Optionally map specific API errors back to form fields if possible
        form.setError("root.serverError", { message: error.message || "An unexpected server error occurred." });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Display root level errors */}
        {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

         {/* Employee ID is hidden but included */}
         <input type="hidden" {...form.register("employeeId")} />

         {/* Leave Type */}
         <FormField
            control={form.control}
            name="leaveTypeId"
            render={({ field }) => (
            <FormItem>
                <FormLabel>Leave Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                    <SelectTrigger>
                    <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {leaveTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>
                        {type.name} {type.description ? `(${type.description})` : ''}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
                <FormMessage />
            </FormItem>
            )}
        />

        {/* Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Start Date */}
            <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                <FormItem className="flex flex-col pt-2">
                    <FormLabel>Start Date</FormLabel>
                    <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
                    <PopoverTrigger asChild>
                        <FormControl>
                        <Button
                            variant={"outline"}
                            className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
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
                            if (date && isValid(date)) {
                                field.onChange(format(date, 'yyyy-MM-dd'));
                                setStartDatePickerOpen(false);
                                // Trigger validation for endDate if startDate changes
                                form.trigger('endDate');
                            } else {
                                field.onChange("");
                                setStartDatePickerOpen(false);
                            }
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) } // Disable past dates
                        initialFocus
                        />
                    </PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
                )}
            />

            {/* End Date */}
             <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                <FormItem className="flex flex-col pt-2">
                    <FormLabel>End Date</FormLabel>
                    <Popover open={endDatePickerOpen} onOpenChange={setEndDatePickerOpen}>
                    <PopoverTrigger asChild>
                        <FormControl>
                        <Button
                            variant={"outline"}
                            className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
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
                            if (date && isValid(date)) {
                                field.onChange(format(date, 'yyyy-MM-dd'));
                                setEndDatePickerOpen(false);
                                // Trigger validation for endDate itself
                                form.trigger('endDate');
                            } else {
                                field.onChange("");
                                setEndDatePickerOpen(false);
                            }
                        }}
                         // Disable dates before start date or today
                        disabled={(date) =>
                            date < (startDateValue && isValid(parseISO(startDateValue)) ? parseISO(startDateValue) : new Date(new Date().setHours(0,0,0,0)))
                        }
                        initialFocus
                        />
                    </PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
                )}
            />
        </div>

         {/* Display calculated leave days */}
         {leaveDays > 0 && (
            <div className="text-sm text-muted-foreground">
                Total leave days requested: {leaveDays}
            </div>
        )}


         {/* Reason */}
         <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
            <FormItem>
                <FormLabel>Reason for Leave</FormLabel>
                <FormControl>
                <Textarea
                    placeholder="Briefly explain the reason for your leave..."
                    className="resize-none"
                    {...field}
                />
                </FormControl>
                <FormMessage />
            </FormItem>
            )}
        />


        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => form.reset()} disabled={isLoading}>
             <X className="mr-2 h-4 w-4" /> Reset
          </Button>
          <Button type="submit" disabled={isLoading || !form.formState.isValid}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
               <Send className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
