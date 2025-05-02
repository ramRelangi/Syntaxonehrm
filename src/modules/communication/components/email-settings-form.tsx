
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
import { Loader2, Save, AlertTriangle, PlugZap } from 'lucide-react'; // Added PlugZap for test connection
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface EmailSettingsFormProps {
  initialSettings?: EmailSettings | null; // Optional initial data
  onSuccess: () => void; // Callback on success
}

export function EmailSettingsForm({ initialSettings, onSuccess }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [isLoadingSave, setIsLoadingSave] = React.useState(false);
  const [isLoadingTest, setIsLoadingTest] = React.useState(false);

  const form = useForm<EmailSettings>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: initialSettings ?? { // Provide defaults if no initial settings
      smtpHost: '',
      smtpPort: 587, // Common default for TLS
      smtpUser: '',
      smtpPassword: '',
      smtpSecure: true, // Often true for 587 (STARTTLS), but depends on provider. Check provider docs.
      fromEmail: '',
      fromName: '',
    },
  });

   const onSubmit = async (data: EmailSettings) => {
    setIsLoadingSave(true);
    const apiUrl = '/api/communication/settings';
    const method = 'PUT';

    try {
        const response = await fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        // Check response status and content type before parsing JSON
        if (!response.ok) {
            let errorPayload = { message: `Failed to save settings. Status: ${response.status}` };
            let errorText = '';
            try {
                errorText = await response.text();
                console.error("Save Settings - Server Error Response Text:", errorText);
                if (errorText) {
                    errorPayload = JSON.parse(errorText);
                     if (!errorPayload.message) {
                      errorPayload.message = errorText; // Use raw text if JSON parsing worked but no message field
                    }
                }
            } catch (parseError) {
                console.error("Save Settings - Failed to parse error response:", parseError);
                 // Use raw text if available and parsing failed, otherwise use status
                errorPayload.message = errorText || `Failed to save settings. Status: ${response.status}`;
            }
            throw new Error(errorPayload.message);
        }

         const contentType = response.headers.get("content-type");
         if (contentType && contentType.indexOf("application/json") !== -1) {
              const result = await response.json(); // Assuming success response is JSON

             toast({
                title: "Settings Saved",
                description: "Email configuration has been successfully updated.",
                className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
             });

              onSuccess(); // Trigger callback (e.g., refetch settings)
         } else {
             // Handle unexpected success response format
             const responseText = await response.text();
             console.warn("Save Settings - Received non-JSON success response:", responseText);
             toast({
                 title: "Settings Saved (Unexpected Response)",
                 description: "Settings were likely saved, but the server sent an unexpected response.",
             });
             onSuccess();
         }


    } catch (error: any) {
        console.error("Form submission error:", error);
        toast({
            title: "Error Saving Settings",
            description: error.message || "An unexpected error occurred.",
            variant: "destructive",
        });
        form.setError("root.serverError", { message: error.message || "An unexpected server error occurred." });
    } finally {
        setIsLoadingSave(false);
    }
  };

  const handleTestConnection = async () => {
    // Trigger validation to ensure required fields are filled
    const isValid = await form.trigger();
    if (!isValid) {
        toast({
            title: "Incomplete Settings",
            description: "Please fill in all required SMTP fields before testing.",
            variant: "destructive",
        });
        return;
    }

    setIsLoadingTest(true);
    const settingsData = form.getValues(); // Get current form values

    try {
      const response = await fetch('/api/communication/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData),
      });

      // Check response status and content type before parsing
      if (!response.ok) {
          let errorPayload = { message: `Test failed. Status: ${response.status}` };
          let errorText = '';
          try {
              // Try to parse error JSON, but handle non-JSON responses
              errorText = await response.text();
              console.error("Test Connection - Server Error Response Text:", errorText); // Log raw text
               // Try to parse only if errorText is not empty
              if (errorText) {
                   errorPayload = JSON.parse(errorText);
                   // If JSON parsed but no message, use the raw text or default
                   if (!errorPayload.message) {
                       errorPayload.message = errorText || `Test failed. Status: ${response.status}`;
                   }
              }
          } catch (parseError) {
              // If JSON parsing fails, use the raw text if available, otherwise the status
              console.error("Test Connection - Failed to parse error response:", parseError);
              errorPayload.message = errorText || `Test failed. Status: ${response.status}`;
          }
          // Throw the derived error message
          throw new Error(errorPayload.message);
      }

      // If response is OK, check content type
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
          const result = await response.json(); // Now parse JSON safely
          // Success toast
          toast({
            title: "Connection Successful",
            description: result.message || "Successfully connected to the SMTP server.", // Use message from response
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
          });
      } else {
          // Handle non-JSON success response? Unlikely for this API, but good practice
          const responseText = await response.text();
          console.warn("Test Connection - Received non-JSON success response:", responseText);
          // Assume success if status is ok, even if format is wrong
           toast({
            title: "Connection Test Completed (Unexpected Response)",
            description: "The connection likely succeeded, but the server sent an unexpected response.",
          });
      }

    } catch (error: any) {
      console.error("Test connection error object:", error); // Log the full error object
      toast({
        title: "Connection Failed",
        // Display the detailed error message from the API or the caught error
        description: error.message || "Could not connect to SMTP server.",
        variant: "destructive",
        duration: 8000, // Show error for longer
      });
    } finally {
      setIsLoadingTest(false);
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
                    <FormLabel>SMTP Host *</FormLabel>
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
                    <FormLabel>SMTP Port *</FormLabel>
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
                    <FormLabel>SMTP Username *</FormLabel>
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
                    <FormLabel>SMTP Password *</FormLabel>
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
                <FormLabel>Use Encryption (TLS/SSL)</FormLabel>
                <FormDescription>
                    Enable secure connection. Usually `true` for port 587 (STARTTLS) or 465 (SSL). Check provider docs.
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
                    <FormLabel>Default "From" Email *</FormLabel>
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
                    <FormLabel>Default "From" Name *</FormLabel>
                    <FormControl>
                        <Input placeholder="e.g., Your Company Name" {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
        </div>


        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isLoadingTest || isLoadingSave}>
              {isLoadingTest ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : ( <PlugZap className="mr-2 h-4 w-4" />)
              }
              {isLoadingTest ? 'Testing...' : "Test Connection"}
          </Button>
          <Button type="submit" disabled={isLoadingSave || isLoadingTest || !form.formState.isDirty}> {/* Disable if no changes or testing */}
            {isLoadingSave ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : ( <Save className="mr-2 h-4 w-4" />)
            }
            {isLoadingSave ? 'Saving...' : "Save Settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

