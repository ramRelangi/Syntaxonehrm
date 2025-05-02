"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types'; // Updated import path
import type { Employee } from '@/modules/employees/types'; // Updated import path
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns'; // Import isValid
import { cn } from '@/lib/utils';

interface EmployeeFormProps {
  employee?: Employee; // Optional employee data for editing
  onSubmitAction: (data: EmployeeFormData) => Promise<{ success: boolean; employee?: Employee; errors?: any[] }>;
  submitButtonText?: string;
  formTitle: string;
  formDescription: string;
}

export function EmployeeForm({
  employee,
  onSubmitAction,
  submitButtonText = "Save Employee",
  formTitle,
  formDescription,
}: EmployeeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  // Function to safely parse and format the date
  const getFormattedHireDate = (hireDate?: string): string => {
    if (!hireDate) return "";
    try {
      const parsedDate = parseISO(hireDate);
      if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    } catch (e) {
      console.error("Error parsing hire date:", e);
    }
    return ""; // Return empty string if parsing fails or date is invalid
  };

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      position: employee?.position ?? "",
      department: employee?.department ?? "",
      hireDate: getFormattedHireDate(employee?.hireDate), // Use helper function
      status: employee?.status ?? "Active",
    },
  });

   // Watch the hireDate field to handle date picker updates
   const hireDateValue = form.watch('hireDate');


  const onSubmit = async (data: EmployeeFormData) => {
    setIsLoading(true);
    console.log("Submitting form data:", data); // Debug: Log form data
    const result = await onSubmitAction(data);
    setIsLoading(false);

    if (result.success && result.employee) {
      toast({
        title: `Employee ${employee ? 'Updated' : 'Added'}`,
        description: `${result.employee.name} has been successfully ${employee ? 'updated' : 'added'}.`,
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      });
      // Redirect to the employee list or the updated employee's detail page
      router.push('/employees');
      router.refresh(); // Force refresh to ensure data table updates
    } else {
      console.error("Form submission error:", result.errors); // Debug: Log errors
      // Handle validation errors from server action if any
      if (result.errors) {
         result.errors.forEach((err: any) => {
             // Ensure err.path exists and is an array before joining
             const fieldName = Array.isArray(err.path) ? err.path.join('.') : 'unknownField';
             // Check if the field exists in the form before setting the error
             if (fieldName in form.getValues()) {
                 form.setError(fieldName as keyof EmployeeFormData, { message: err.message });
             } else {
                 console.warn(`Attempted to set error on non-existent field: ${fieldName}`);
             }
         });
         toast({
           title: "Validation Error",
           description: "Please check the form fields.",
           variant: "destructive",
         });
      } else {
        toast({
          title: `Error ${employee ? 'Updating' : 'Adding'} Employee`,
          description: `An unexpected error occurred. Please try again.`,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  <FormMessage />
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
                 <FormItem className="flex flex-col pt-2"> {/* Added pt-2 for alignment */}
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
                           {field.value ? (
                             isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : "Invalid date" // Display formatted date or error
                           ) : (
                             <span>Pick a date</span>
                           )}
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
                              field.onChange(format(date, 'yyyy-MM-dd')); // Store as YYYY-MM-DD
                              setDatePickerOpen(false); // Close picker on select
                            } else {
                               field.onChange(""); // Clear field if date is invalid or cleared
                               setDatePickerOpen(false);
                            }
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
                <FormItem className="pt-2"> {/* Added pt-2 for alignment */}
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
            ) : (employee ? <Save className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />)
            }
            {isLoading ? 'Saving...' : submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
