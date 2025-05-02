
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendEmailSchema, type SendEmailFormData, type EmailTemplate } from '@/modules/communication/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Mail, BookOpen, X } from 'lucide-react';

interface SendEmailFormProps {
  templates: EmailTemplate[];
}

export function SendEmailForm({ templates }: SendEmailFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(null);

  const form = useForm<SendEmailFormData>({
    resolver: zodResolver(sendEmailSchema),
    defaultValues: {
      to: "",
      subject: "",
      body: "",
    },
  });

  // Handle template selection change
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const selectedTemplate = templates.find(t => t.id === templateId);
    if (selectedTemplate) {
      form.setValue('subject', selectedTemplate.subject);
      form.setValue('body', selectedTemplate.body);
      // Optionally trigger validation if needed
      // form.trigger('subject');
      // form.trigger('body');
    } else {
      // Optionally clear fields if "None" is selected or template not found
      // form.setValue('subject', '');
      // form.setValue('body', '');
    }
  };

   const onSubmit = async (data: SendEmailFormData) => {
    setIsLoading(true);

    try {
        const response = await fetch('/api/communication/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json(); // Always try to parse response

        if (!response.ok) {
            throw new Error(result.message || result.error || `HTTP error! status: ${response.status}`);
        }

        toast({
            title: "Email Sent Successfully",
            description: `Email sent to ${data.to}.`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });
        form.reset(); // Reset form on success
        setSelectedTemplateId(null); // Reset template selection

    } catch (error: any) {
        console.error("Send email error:", error);
        toast({
            title: "Error Sending Email",
            description: error.message || "An unexpected error occurred. Please check settings or try again.",
            variant: "destructive",
        });
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

         {/* Template Selector (Optional) */}
        <FormItem>
            <FormLabel>Load Template (Optional)</FormLabel>
            <Select onValueChange={handleTemplateChange} value={selectedTemplateId ?? ""}>
                <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a template to load..." />
                    </SelectTrigger>
                </FormControl>
                <SelectContent>
                    <SelectItem value="">-- None --</SelectItem>
                    {templates.map(template => (
                        <SelectItem key={template.id} value={template.id!}>
                            {template.name} {template.usageContext ? `(${template.usageContext})` : ''}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <FormMessage />
        </FormItem>

        <FormField
          control={form.control}
          name="to"
          render={({ field }) => (
            <FormItem>
              <FormLabel>To</FormLabel>
              <FormControl>
                <Input type="email" placeholder="recipient@example.com" {...field} />
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
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input placeholder="Email Subject Line" {...field} />
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
              <FormLabel>Body</FormLabel>
              <div className="text-xs text-muted-foreground mb-2">
                  Placeholders like {'`{{variable}}`'} will only be replaced if the backend sending logic supports it. Check template definitions for available variables.
               </div>
              <FormControl>
                <Textarea
                   placeholder="Compose your email here..."
                   rows={12}
                   className="font-mono text-sm" // Consistent styling
                   {...field}
                 />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
              type="button"
              variant="outline"
              onClick={() => { form.reset(); setSelectedTemplateId(null); }}
              disabled={isLoading}
           >
             <X className="mr-2 h-4 w-4" /> Clear
          </Button>
          <Button type="submit" disabled={isLoading || !form.formState.isValid}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
               <Send className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Sending...' : 'Send Email'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
