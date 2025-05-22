
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
// Use a schema for the form that omits tenantId, as it's added server-side.
// EmployeeId is passed as a prop and included in defaultValues.
import { leaveRequestSchema, type LeaveRequestFormData, type LeaveType, type LeaveBalance } from '@/modules/leave/types';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"; // Added FormDescription
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Send, X, Paperclip, Info } from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription as AlertDesc } from "@/components/ui/alert"; // Renamed AlertDescription to avoid conflict

interface LeaveRequestFormProps {
  employeeId: string; // This should be a valid UUID (user_id)
  leaveTypes: LeaveType[];
  balances: LeaveBalance[]; // Receive balances from parent
  onSuccess: () => void;
}

// Define the type for the form's own data (excluding tenantId)
type FormShape = Omit<LeaveRequestFormData, 'tenantId'>;

export function LeaveRequestForm({
  employeeId,
  leaveTypes,
  balances,
  onSuccess,
}: LeaveRequestFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [startDatePickerOpen, setStartDatePickerOpen] = React.useState(false);
  const [endDatePickerOpen, setEndDatePickerOpen] = React.useState(false);
  const [selectedLeaveTypeBalance, setSelectedLeaveTypeBalance] = React.useState<number | null>(null);

  // The form uses a schema that omits tenantId, as it's added by the API route.
  // EmployeeId is part of the form's state and default values.
  const formSchemaForResolver = leaveRequestSchema.omit({ tenantId: true });

  const form = useForm<FormShape>({
    resolver: zodResolver(formSchemaForResolver),
    defaultValues: {
      employeeId: employeeId, // employeeId from props (this is user_id)
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      reason: "",
      attachmentUrl: "",
    },
  });

  const startDateValue = form.watch('startDate');
  const endDateValue = form.watch('endDate');
  const selectedLeaveTypeId = form.watch('leaveTypeId');

  React.useEffect(() => {
    if (selectedLeaveTypeId) {
      const balanceInfo = balances.find(b => b.leaveTypeId === selectedLeaveTypeId);
      setSelectedLeaveTypeBalance(balanceInfo ? balanceInfo.balance : 0);
    } else {
      setSelectedLeaveTypeBalance(null);
    }
  }, [selectedLeaveTypeId, balances]);

  const calculateLeaveDays = React.useCallback(() => {
     if (startDateValue && endDateValue && isValid(parseISO(startDateValue)) && isValid(parseISO(endDateValue))) {
        const start = parseISO(startDateValue);
        const end = parseISO(endDateValue);
        return end >= start ? differenceInDays(end, start) + 1 : 0;
     }
     return 0;
  }, [startDateValue, endDateValue]);

  const leaveDays = calculateLeaveDays();

  const onSubmit = async (data: FormShape) => {
    setIsLoading(true);
    form.clearErrors("root.serverError"); // Clear previous server errors

    // Client-side balance check before API call
    const requestedDays = calculateLeaveDays();
    const currentBalance = balances.find(b => b.leaveTypeId === data.leaveTypeId)?.balance;

    if (currentBalance === undefined) {
      // This should ideally not happen if leave types and balances are synced
      toast({
        title: "Balance Information Missing",
        description: "Could not determine balance for the selected leave type. Please refresh.",
        variant: "destructive",
      });
      form.setError("leaveTypeId", { message: "Balance for this leave type is unavailable." });
      setIsLoading(false);
      return;
    }

    if (requestedDays > currentBalance) {
      toast({
        title: "Insufficient Leave Balance",
        description: `You requested ${requestedDays} day(s) but only have ${currentBalance} day(s) available.`,
        variant: "destructive",
      });
      form.setError("endDate", { message: `Insufficient balance. Available: ${currentBalance} day(s).` });
      setIsLoading(false);
      return;
    }


    console.log("[Leave Request Form] Submitting via API (form data):", data);

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
            const errorMessage = result?.error || result?.message || `HTTP error! status: ${response.status}`;
            // Set error on a specific field if path is available from server, otherwise root
            const errorPath = result?.details?.[0]?.path?.[0] as keyof FormShape | undefined;
            if (errorPath && form.getFieldState(errorPath)) {
                form.setError(errorPath, { message: errorMessage });
            } else {
                form.setError("root.serverError", { message: errorMessage });
            }
            throw new Error(errorMessage);
        }

         console.log("[Leave Request Form] API Success Response:", result);

        toast({
            title: "Leave Request Submitted",
            description: `Your request has been submitted successfully.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        form.reset();
        setSelectedLeaveTypeBalance(null);
        onSuccess();

    } catch (error: any) {
        console.error("[Leave Request Form] Submission error (catch block):", error);
        // Avoid double-toasting if a specific error was already set by form.setError
        if (!form.formState.errors.root?.serverError && !Object.values(form.formState.errors).some(fieldError => fieldError?.message)) {
            toast({
                title: "Error Submitting Request",
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {form.formState.errors.root?.serverError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDesc>{form.formState.errors.root.serverError.message}</AlertDesc>
          </Alert>
        )}

         <FormField
            control={form.control}
            name="leaveTypeId"
            render={({ field }) => (
            <FormItem>
                <FormLabel>Leave Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                <FormControl>
                    <SelectTrigger className={cn(form.formState.errors.leaveTypeId && "border-destructive focus-visible:ring-destructive")}>
                    <SelectValue placeholder="Select leave type" />
                    </SelectTrigger>
                </FormControl>
                <SelectContent>
                    {leaveTypes.map(type => (
                    <SelectItem key={type.id} value={type.id!}>
                        {type.name} {type.description ? `(${type.description})` : ''}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
                {selectedLeaveTypeBalance !== null && (
                  <FormDescription className="flex items-center gap-1 text-sm">
                    <Info className="h-3.5 w-3.5 text-muted-foreground"/>
                     Available balance: {selectedLeaveTypeBalance} day(s)
                  </FormDescription>
                )}
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
                            !field.value && "text-muted-foreground",
                            form.formState.errors.startDate && "border-destructive focus-visible:ring-destructive"
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
                            form.trigger('endDate'); // Re-validate endDate
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
                            !field.value && "text-muted-foreground",
                             form.formState.errors.endDate && "border-destructive focus-visible:ring-destructive"
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
                           form.trigger('endDate'); // Re-validate endDate
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
                Total leave days requested: <span className={cn("font-semibold", selectedLeaveTypeBalance !== null && leaveDays > selectedLeaveTypeBalance && "text-destructive")}>{leaveDays}</span>
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
                    className={cn("resize-none", form.formState.errors.reason && "border-destructive focus-visible:ring-destructive")}
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
                    className={cn(form.formState.errors.attachmentUrl && "border-destructive focus-visible:ring-destructive")}
                />
                </FormControl>
                <FormMessage />
            </FormItem>
            )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { form.reset(); setSelectedLeaveTypeBalance(null); }} disabled={isLoading}>
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

