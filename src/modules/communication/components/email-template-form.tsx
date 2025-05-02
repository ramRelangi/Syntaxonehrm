
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

interface EmailTemplateFormProps {
  template?: EmailTemplate; // Optional data for editing
  onSuccess: () => void; // Callback on success
}

export function EmailTemplateForm({ template, onSuccess }: EmailTemplateFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const isEditMode = !!template;
  const submitButtonText = isEditMode ? "Save Changes" : "Create Template";

  const form = useForm<EmailTemplateFormData>({
    resolver: zodResolver(emailTemplateSchema.omit({ id: true })), // Validate form data
    defaultValues: {
      name: template?.name ?? "",
      subject: template?.subject ?? "",
      body: template?.body ?? "",
      usageContext: template?.usageContext ?? "",
    },
  });

   const onSubmit = async (data: EmailTemplateFormData) => {
    setIsLoading(true);
    const apiUrl = isEditMode ? `/api/communication/templates/${template!.id}` : '/api/communication/templates';
    const method = isEditMode ? 'PUT' : 'POST';

    try {
        const response = await fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || result.error || `HTTP error! status: ${response.status}`);
        }

        toast({
            title: `Template ${isEditMode ? 'Updated' : 'Created'}`,
            description: `Template "${result.name}" has been successfully ${isEditMode ? 'updated' : 'created'}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        onSuccess(); // Trigger callback (e.g., close dialog, refetch data)

    } catch (error: any) {
        console.error("Form submission error:", error);
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
                  Use Handlebars syntax for placeholders, e.g., `{{employeeName}}`, `{{startDate}}`.
               </div>
              <FormControl>
                <Textarea
                   placeholder="Enter the email content here..."
                   rows={10}
                   className="font-mono text-sm" // Use monospace for better placeholder visibility
                   {...field}
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

         {/* Optional: Usage Context - Could be a Select or free text */}
         <FormField
           control={form.control}
           name="usageContext"
           render={({ field }) => (
             <FormItem>
               <FormLabel>Usage Context (Optional)</FormLabel>
               <FormControl>
                 <Input placeholder="e.g., onboarding, leave_approval, password_reset" {...field} />
               </FormControl>
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
          <Button type="submit" disabled={isLoading || !form.formState.isValid}>
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
