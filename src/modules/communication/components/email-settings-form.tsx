
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmailSettingsFormProps {
  initialSettings?: EmailSettings | null; // Optional initial data
  onSuccess: () => void; // Callback on success
}

export function EmailSettingsForm({ initialSettings, onSuccess }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<EmailSettings>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: initialSettings ?? { // Provide defaults if no initial settings
      smtpHost: '',
      smtpPort: 587, // Common default for TLS
      smtpUser: '',
      smtpPassword: '',
      smtpSecure: true,
      fromEmail: '',
      fromName: '',
    },
  });

   const onSubmit = async (data: EmailSettings) => {
    setIsLoading(true);
    const apiUrl = '/api/communication/settings';
    const method = 'PUT';

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
            title: "Settings Saved",
            description: "Email configuration has been successfully updated.",
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        onSuccess(); // Trigger callback (e.g., refetch settings)

    } catch (error: any) {
        console.error("Form submission error:", error);
        toast({
            title: "Error Saving Settings",
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <Alert variant="destructive" className="bg-yellow-50 border-yellow-300 text-yellow-800 [&>svg]:text-yellow-600 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 dark:[&>svg]:text-yellow-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important Security Note</AlertTitle>
            <AlertDescription>
                Storing SMTP credentials directly is not recommended for production environments. Consider using secure secrets management solutions.
            </AlertDescription>
         </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="smtpHost"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>SMTP Host</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., smtp.mailgun.org" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="smtpPort"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>SMTP Port</FormLabel>
                    <FormControl>
                        <Input type="number" placeholder="e.g., 587 or 465" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="smtpUser"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>SMTP Username</FormLabel>
                    <FormControl>
                        <Input placeholder="Your SMTP username" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="smtpPassword"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>SMTP Password</FormLabel>
                    <FormControl>
                        {/* Use password type to mask input */}
                        <Input type="password" placeholder="Your SMTP password" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
        </div>

        <FormField
            control={form.control}
            name="smtpSecure"
            render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                <FormLabel>Use TLS/SSL</FormLabel>
                <FormDescription>
                    Enable secure connection (Recommended). Usually used with port 587 (TLS) or 465 (SSL).
                </FormDescription>
                </div>
                <FormControl>
                <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                />
                </FormControl>
            </FormItem>
            )}
        />


        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="fromEmail"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Default "From" Email</FormLabel>
                    <FormControl>
                        <Input type="email" placeholder="e.g., noreply@yourcompany.com" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            <FormField
                control={form.control}
                name="fromName"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Default "From" Name</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Your Company Name" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
        </div>


        <div className="flex justify-end gap-2 pt-4">
          {/* No Cancel button needed if it's not in a dialog */}
          <Button type="submit" disabled={isLoading || !form.formState.isDirty}> {/* Disable if no changes */}
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : ( <Save className="mr-2 h-4 w-4" />)
            }
            {isLoading ? 'Saving...' : "Save Settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
