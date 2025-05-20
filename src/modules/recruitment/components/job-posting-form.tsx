
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import {
  jobPostingSchema,
  type JobPostingFormData,
  type JobPosting,
  jobPostingStatusSchema,
  employmentTypeSchema, // Import new enum
  experienceLevelSchema, // Import new enum
} from '@/modules/recruitment/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, PlusCircle } from 'lucide-react';
import { format, parseISO, isValid, formatISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { DialogClose } from '@/components/ui/dialog';
import { addJobPostingAction, updateJobPostingAction } from '@/modules/recruitment/actions';

interface JobPostingFormProps {
  jobPosting?: JobPosting;
  onSuccess: () => void;
}

type JobPostingFormSubmitData = Omit<JobPostingFormData, 'tenantId' | 'datePosted'>;

export function JobPostingForm({ jobPosting, onSuccess }: JobPostingFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [closingDatePickerOpen, setClosingDatePickerOpen] = React.useState(false);

  const isEditMode = !!jobPosting;
  const submitButtonText = isEditMode ? "Save Changes" : "Create Job Posting";

  const getFormattedDate = (dateString?: string | null): string => {
    if (!dateString) return "";
    try {
      const parsedDate = parseISO(dateString);
      return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : "";
    } catch (e) { console.error("Error parsing date:", e); return ""; }
  };

  const form = useForm<JobPostingFormSubmitData>({
    resolver: zodResolver(jobPostingSchema.omit({ id: true, datePosted: true, tenantId: true })),
    defaultValues: {
      title: jobPosting?.title ?? "",
      description: jobPosting?.description ?? "",
      department: jobPosting?.department ?? "",
      location: jobPosting?.location ?? "",
      salaryRange: jobPosting?.salaryRange ?? "",
      status: jobPosting?.status ?? "Draft",
      closingDate: getFormattedDate(jobPosting?.closingDate),
      employmentType: jobPosting?.employmentType ?? "Full-time",
      experienceLevel: jobPosting?.experienceLevel ?? "Mid-Level",
    },
  });

   const onSubmit = async (data: JobPostingFormSubmitData) => {
    setIsLoading(true);
    form.clearErrors();
    console.log("[Job Posting Form] Attempting to submit data:", data);

    const payload = {
         ...data,
         closingDate: data.closingDate && isValid(parseISO(data.closingDate))
            ? formatISO(parseISO(data.closingDate), { representation: 'date' })
            : undefined,
         salaryRange: data.salaryRange || undefined,
     };

     console.log("[Job Posting Form] Sending payload to action:", payload);

    try {
        let result;
        if (isEditMode && jobPosting?.id) {
            console.log(`[Job Posting Form] Calling updateJobPostingAction for ID: ${jobPosting.id}`);
            result = await updateJobPostingAction(jobPosting.id, payload);
        } else {
             console.log(`[Job Posting Form] Calling addJobPostingAction`);
            result = await addJobPostingAction(payload);
        }

        console.log("[Job Posting Form] Action Result:", result);

        if (!result.success) {
             console.error("[Job Posting Form] Action Error:", result.errors);
             const errorMessage = result.errors?.[0]?.message || `Failed to ${isEditMode ? 'update' : 'create'} job posting.`;
              if (result.errors?.[0]?.path) {
                  const fieldPath = result.errors[0].path[0] as keyof JobPostingFormSubmitData;
                  form.setError(fieldPath, { message: errorMessage });
              } else {
                  form.setError("root.serverError", { message: errorMessage });
              }
             throw new Error(errorMessage);
        }

         console.log("[Job Posting Form] Action Success:", result.jobPosting);

        toast({
            title: `Job Posting ${isEditMode ? 'Updated' : 'Created'}`,
            description: `${result.jobPosting?.title || data.title} has been successfully ${isEditMode ? 'updated' : 'created'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        onSuccess();

    } catch (error: any) {
        console.error("[Job Posting Form] Submission error catch block:", error);
        if (!form.formState.errors.root?.serverError && !Object.keys(form.formState.errors).length) {
             toast({
                title: `Error ${isEditMode ? 'Updating' : 'Creating'} Job Posting`,
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
            form.setError("root.serverError", { message: error.message || "An unexpected error occurred." });
        }
    } finally {
        setIsLoading(false);
        console.log("[Job Posting Form] Submission finished.");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Senior Software Engineer" {...field} />
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Describe the role, responsibilities, and requirements..." rows={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Remote, New York Office" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="employmentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employment type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employmentTypeSchema.options.map(type => (
                         <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="experienceLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Experience Level</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select experience level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {experienceLevelSchema.options.map(level => (
                         <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="salaryRange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Salary Range (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. $100,000 - $120,000" {...field} value={field.value ?? ""} />
                  </FormControl>
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
                      {jobPostingStatusSchema.options.map(status => (
                         <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

         <FormField
           control={form.control}
           name="closingDate"
           render={({ field }) => (
             <FormItem className="flex flex-col">
               <FormLabel>Closing Date (Optional)</FormLabel>
               <Popover open={closingDatePickerOpen} onOpenChange={setClosingDatePickerOpen}>
                 <PopoverTrigger asChild>
                   <FormControl>
                     <Button
                       variant={"outline"}
                       className={cn(
                         "w-full pl-3 text-left font-normal",
                         !field.value && "text-muted-foreground"
                       )}
                     >
                       {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a closing date</span>}
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
                       setClosingDatePickerOpen(false);
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


        <div className="flex justify-end gap-2 pt-4">
          <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isLoading}>
                Cancel
              </Button>
          </DialogClose>
          <Button type="submit" disabled={isLoading || (!form.formState.isDirty && isEditMode)}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (isEditMode ? <Save className="mr-2 h-4 w-4" /> : <PlusCircle className="mr-2 h-4 w-4" />)
            }
            {isLoading ? 'Saving...' : submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
