
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
import type { Employee } from '@/modules/employees/types';
import { addEmployee, updateEmployee } from '@/modules/employees/actions'; // Import server actions
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { getTenantIdFromAuth } from '@/lib/auth'; // Import auth helper

interface EmployeeFormProps {
  employee?: Employee; // Optional employee data for editing (includes tenantId)
  submitButtonText?: string;
  formTitle: string;
  formDescription: string;
  tenantDomain: string; // Accept tenantDomain instead of tenantId
}

// Exclude tenantId from the form data type itself, as it's derived contextually
type EmployeeFormSubmitData = Omit<EmployeeFormData, 'tenantId'>;

export function EmployeeForm({
  employee,
  submitButtonText,
  formTitle,
  formDescription,
  tenantDomain, // Receive tenantDomain
}: EmployeeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const isEditMode = !!employee;
  const actualSubmitButtonText = submitButtonText || (isEditMode ? "Save Changes" : "Add Employee");

  const getFormattedHireDate = (hireDate?: string): string => {
    if (!hireDate) return "";
    try {
      const parsedDate = parseISO(hireDate);
      return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : "";
    } catch (e) {
      console.error("Error parsing hire date:", e);
      return "";
    }
  };

  // Schema for validation doesn't need tenantId, action will add it.
  const formSchema = employeeSchema.omit({ tenantId: true });

  const form = useForm<EmployeeFormSubmitData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // tenantId removed from form data
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      position: employee?.position ?? "",
      department: employee?.department ?? "",
      hireDate: getFormattedHireDate(employee?.hireDate),
      status: employee?.status ?? "Active",
    },
  });

  const hireDateValue = form.watch('hireDate');

  const onSubmit = async (data: EmployeeFormSubmitData) => {
    setIsLoading(true);
    console.log("[Employee Form] Submitting data (tenantId will be added by action):", data);

    try {
        let result;
        if (isEditMode && employee?.id) {
            result = await updateEmployee(employee.id, data); // Action derives tenantId
        } else {
            result = await addEmployee(data); // Action derives tenantId
        }

        if (!result.success) {
             console.error("[Employee Form] Action Error:", result.errors);
             let errorMessage = result.errors?.[0]?.message || `Failed to ${isEditMode ? 'update' : 'add'} employee.`;
             // Handle specific errors
             if (errorMessage.includes('Email address already exists')) {
                  errorMessage = 'This email address is already in use for this tenant.';
                  form.setError("email", { type: "manual", message: errorMessage });
             } else if (errorMessage.includes('Tenant ID is missing') || errorMessage.includes('Unauthorized')) {
                 errorMessage = 'Authorization failed or tenant context missing.';
                 form.setError("root.serverError", { message: errorMessage });
             } else {
                  form.setError("root.serverError", { message: errorMessage });
             }
             throw new Error(errorMessage); // Throw to prevent success toast
        }

        console.log("[Employee Form] Action Success:", result);

        toast({
            title: `Employee ${isEditMode ? 'Updated' : 'Added'}`,
            description: `${result.employee?.name || data.name} has been successfully ${isEditMode ? 'updated' : 'added'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        // Use tenantDomain for redirection
        router.push(`/${tenantDomain}/employees`);

    } catch (error: any) {
        console.error("[Employee Form] Submission error:", error);
        // Errors are mostly handled inside the if (!result.success) block now
        // Only toast if no specific field error was set
         if (!form.formState.errors.email && !form.formState.errors.root?.serverError) {
            toast({
                title: `Error ${isEditMode ? 'Updating' : 'Adding'} Employee`,
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
             form.setError("root.serverError", { message: error.message || "An unexpected error occurred." });
        }
    } finally {
        setIsLoading(false);
    }
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {/* No hidden tenantId field needed */}

         {form.formState.errors.root?.serverError && !form.formState.errors.email && (
          <FormMessage className="text-destructive text-center">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <div className="space-y-4">
          {/* Basic Information */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Jane Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="e.g. jane.doe@company.com" {...field} />
                  </FormControl>
                  <FormMessage /> {/* Shows validation and server-set errors */}
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="e.g. 123-456-7890" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Job Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position / Job Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Software Engineer" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value}>
                     <FormControl>
                       <SelectTrigger>
                         <SelectValue placeholder="Select department" />
                       </SelectTrigger>
                     </FormControl>
                     <SelectContent>
                       <SelectItem value="Technology">Technology</SelectItem>
                       <SelectItem value="Human Resources">Human Resources</SelectItem>
                       <SelectItem value="Marketing">Marketing</SelectItem>
                       <SelectItem value="Sales">Sales</SelectItem>
                       <SelectItem value="Finance">Finance</SelectItem>
                       <SelectItem value="Operations">Operations</SelectItem>
                       <SelectItem value="Construction">Construction</SelectItem>
                       <SelectItem value="Other">Other</SelectItem>
                     </SelectContent>
                   </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

           {/* Hire Date and Status */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
               control={form.control}
               name="hireDate"
               render={({ field }) => (
                 <FormItem className="flex flex-col pt-2">
                   <FormLabel>Hire Date</FormLabel>
                   <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
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
                            setDatePickerOpen(false);
                         }}
                         disabled={(date) =>
                           date > new Date() || date < new Date("1900-01-01")
                         }
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
              name="status"
              render={({ field }) => (
                <FormItem className="pt-2">
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
           </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (isEditMode ? <Save className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />)
            }
            {isLoading ? 'Saving...' : actualSubmitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
