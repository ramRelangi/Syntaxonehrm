
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailTemplateSchema, type EmailTemplate, type EmailTemplateFormData } from '@/modules/communication/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, PlusCircle } from 'lucide-react';
import { DialogClose } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Import Select components

// Example categories
const templateCategories = ["Onboarding", "Leave Management", "Recruitment", "System Notifications", "General"];
const NONE_CATEGORY_VALUE = "__NONE_CATEGORY_VALUE__"; // Special value for the "None" option

interface EmailTemplateFormProps {
  template?: EmailTemplate;
  onSuccess: () => void;
}

export function EmailTemplateForm({ template, onSuccess }: EmailTemplateFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const isEditMode = !!template;
  const submitButtonText = isEditMode ? "Save Changes" : "Create Template";

  const form = useForm<EmailTemplateFormData>({
    resolver: zodResolver(emailTemplateSchema.omit({ id: true, tenantId: true })), // tenantId is handled by action
    defaultValues: {
      name: template?.name ?? "",
      subject: template?.subject ?? "",
      body: template?.body ?? "",
      usageContext: template?.usageContext ?? "",
      category: template?.category || "", // Initialize category, handle undefined as empty string for form
    },
  });

   const onSubmit = async (data: EmailTemplateFormData) => {
    setIsLoading(true);
    console.log("[Email Template Form] Submitting data:", data);
    const apiUrl = isEditMode ? `/api/communication/templates/${template!.id}` : '/api/communication/templates';
    const method = isEditMode ? 'PUT' : 'POST';

    // Ensure category is sent as undefined or empty string if "None" was selected
    const payload = {
        ...data,
        category: data.category === NONE_CATEGORY_VALUE ? "" : data.category,
    };

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
         } catch (e) {
            if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            result = {};
         }


        if (!response.ok) {
             console.error("[Email Template Form] API Error:", result);
            throw new Error(result?.error || result?.message || `HTTP error! status: ${response.status}`);
        }

        console.log("[Email Template Form] API Success:", result);

        toast({
            title: `Template ${isEditMode ? 'Updated' : 'Created'}`,
            description: `Template "${result.name || data.name}" has been successfully ${isEditMode ? 'updated' : 'created'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        onSuccess();

    } catch (error: any) {
        console.error("[Email Template Form] Submission error:", error);
        toast({
            title: `Error ${isEditMode ? 'Updating' : 'Creating'} Template`,
            description: error.message || "An unexpected error occurred.",
            variant: "destructive",
        });
        form.setError("root.serverError", { message: error.message || "An unexpected server error occurred." });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <FormLabel>Template Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Welcome Email, Leave Approval" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject Line</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Welcome Aboard!, Your Leave Request" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Body</FormLabel>
               <div className="text-xs text-muted-foreground mb-2">
                  Use Handlebars syntax for placeholders, e.g., {'{{employeeName}}'}, {'{{startDate}}'}.
               </div>
              <FormControl>
                <Textarea
                   placeholder="Enter the email content here..."
                   rows={10}
                   className="font-mono text-sm"
                   {...field}
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           <FormField
             control={form.control}
             name="usageContext"
             render={({ field }) => (
               <FormItem>
                 <FormLabel>Usage Context (Optional)</FormLabel>
                 <FormControl>
                   <Input placeholder="e.g., onboarding, leave_approval" {...field} value={field.value ?? ""} />
                 </FormControl>
                 <FormMessage />
               </FormItem>
             )}
           />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === NONE_CATEGORY_VALUE ? "" : value)}
                    value={field.value === "" || field.value === undefined ? NONE_CATEGORY_VALUE : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE_CATEGORY_VALUE}>-- None --</SelectItem>
                      {templateCategories.map(categoryValue => (
                        <SelectItem key={categoryValue} value={categoryValue}>
                          {categoryValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
        </div>

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
