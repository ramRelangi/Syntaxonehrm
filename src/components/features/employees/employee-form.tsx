"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData } from '@/actions/employee-actions';
import type { Employee } from '@/types/employee';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
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

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      position: employee?.position ?? "",
      department: employee?.department ?? "",
      // Ensure date is handled correctly, parsing if needed
      hireDate: employee?.hireDate ? format(parseISO(employee.hireDate), 'yyyy-MM-dd') : "",
      status: employee?.status ?? "Active",
    },
  });

   // Watch the hireDate field to handle date picker updates
   const hireDateValue = form.watch('hireDate');
   const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const onSubmit = async (data: EmployeeFormData) => {
    setIsLoading(true);
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
      // Refresh might be needed if caching is aggressive, but revalidatePath should handle it
      // router.refresh();
    } else {
      // Handle validation errors from server action if any
      if (result.errors) {
         result.errors.forEach((err: any) => {
            form.setError(err.path.join('.'), { message: err.message });
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
                       <SelectItem value="Construction">Construction</SelectItem> {/* Added from mock */}
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
                 <FormItem className="flex flex-col">
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
                             format(parseISO(field.value), "PPP") // Display formatted date
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
                         selected={field.value ? parseISO(field.value) : undefined}
                         onSelect={(date) => {
                            if (date) {
                              field.onChange(format(date, 'yyyy-MM-dd')); // Store as YYYY-MM-DD
                              setDatePickerOpen(false); // Close picker on select
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
                <FormItem>
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
