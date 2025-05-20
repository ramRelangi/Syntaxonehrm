
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
// Use a schema for the form that omits tenantId, as it's added server-side.
// EmployeeId is passed as a prop and included in defaultValues.
import { leaveRequestSchema, type LeaveRequestFormData, type LeaveType } from '@/modules/leave/types';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Send, X, Paperclip } from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

interface LeaveRequestFormProps {
  employeeId: string; // This should be a valid UUID
  leaveTypes: LeaveType[];
  onSuccess: () => void;
}

// Define the type for the form's own data (excluding tenantId)
type FormShape = Omit<LeaveRequestFormData, 'tenantId'>;

export function LeaveRequestForm({
  employeeId,
  leaveTypes,
  onSuccess,
}: LeaveRequestFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = React.useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = React.useState(false);

  // The form uses a schema that omits tenantId, as it's added by the API route.
  // EmployeeId is part of the form's state and default values.
  const formSchemaForResolver = leaveRequestSchema.omit({ tenantId: true });

  const form = useForm<FormShape>({
    resolver: zodResolver(formSchemaForResolver),
    defaultValues: {
      employeeId: employeeId, // employeeId from props
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      reason: "",
      attachmentUrl: "",
    },
  });

  const startDateValue = form.watch('startDate');
  const endDateValue = form.watch('endDate');

  const calculateLeaveDays = () => {
     if (startDateValue && endDateValue && isValid(parseISO(startDateValue)) && isValid(parseISO(endDateValue))) {
        const start = parseISO(startDateValue);
        const end = parseISO(endDateValue);
        return end >= start ? differenceInDays(end, start) + 1 : 0;
     }
     return 0;
  };

  const leaveDays = calculateLeaveDays();

  const onSubmit = async (data: FormShape) => {
    setIsLoading(true);
    console.log("[Leave Request Form] Submitting via API (form data):", data);

    // The API route will add tenantId from session.
    // We send the form data which includes employeeId (already validated by form's schema).
    const payload = {
        ...data,
        attachmentUrl: data.attachmentUrl === "" ? null : data.attachmentUrl,
    };

    try {
        const response = await fetch('/api/leave/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        let result: any;
        let responseText: string | null = null;
        try {
            responseText = await response.text();
             if (responseText) {
                 result = JSON.parse(responseText);
             }
        } catch (jsonError) {
             console.warn("[Leave Request Form] Failed to parse response JSON:", jsonError);
             if (!response.ok) {
                 throw new Error(responseText || `HTTP error! status: ${response.status}`);
             }
              console.warn("[Leave Request Form] OK response but non-JSON:", responseText);
             result = {};
        }


        if (!response.ok) {
            console.error("[Leave Request Form] API Error Response:", result);
            throw new Error(result?.error || result?.message || `HTTP error! status: ${response.status}`);
        }

         console.log("[Leave Request Form] API Success Response:", result);

        toast({
            title: "Leave Request Submitted",
            description: `Your request has been submitted successfully.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        form.reset();
        onSuccess();

    } catch (error: any) {
        console.error("[Leave Request Form] Submission error:", error);
        let errorMessage = error.message || "An unexpected error occurred.";
         if (error.message?.includes('Insufficient leave balance')) {
             errorMessage = 'Insufficient leave balance for the selected dates.';
             form.setError("endDate", { type: "manual", message: errorMessage });
         } else if (error.message?.includes('Invalid employee identifier') || error.message?.includes('Invalid leave type identifier')) {
            // More specific error if the form somehow submits invalid UUIDs for these
            errorMessage = 'There was an issue with the selected employee or leave type. Please try again.';
            form.setError("root.serverError", { message: errorMessage });
         }
         else {
             form.setError("root.serverError", { message: errorMessage });
         }
        toast({
            title: "Error Submitting Request",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {form.formState.errors.root?.serverError && !form.formState.errors.endDate && (
          <FormMessage className="text-destructive text-center">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

         {/* employeeId is part of the form state but not a visible field if passed as prop */}
         {/* <input type="hidden" {...form.register("employeeId")} /> */}

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            field.onChange(date ? format(date, 'yyyy-MM-dd') : "");
                            setStartDatePickerOpen(false);
                            form.trigger('endDate');
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) }
                        initialFocus
                        />
                    </PopoverContent>
                    </Popover>
                    <FormMessage />
                </FormItem>
                )}
            />

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
                           field.onChange(date ? format(date, 'yyyy-MM-dd') : "");
                           setEndDatePickerOpen(false);
                           form.trigger('endDate');
                        }}
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

         {leaveDays > 0 && (
            <div className="text-sm text-muted-foreground">
                Total leave days requested: {leaveDays}
            </div>
        )}

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

        <FormField
            control={form.control}
            name="attachmentUrl"
            render={({ field }) => (
            <FormItem>
                <FormLabel className="flex items-center gap-1">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    Attachment URL (Optional)
                </FormLabel>
                <FormControl>
                <Input
                    type="url"
                    placeholder="e.g., https://example.com/medical_certificate.pdf"
                    {...field}
                    value={field.value ?? ""}
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
