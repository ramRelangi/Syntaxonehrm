
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';
import { testSmtpConnectionAction, updateEmailSettingsAction } from '@/modules/communication/actions'; // Import test action
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, PlugZap, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '@/modules/communication/types'; // Import ConnectionStatus type

// Form data excludes tenantId, which comes from auth context in the action
// Password field is always present for validation, even if left blank to keep existing one.
type EmailSettingsFormData = Omit<EmailSettings, 'tenantId'>;

interface EmailSettingsFormProps {
  // Receive initial settings *without* password
  initialSettings?: Omit<EmailSettings, 'smtpPassword' | 'tenantId'> | null;
  onSuccess: () => void;
  // Prop to *trigger* the test connection check in the parent
  onTestConnectionTrigger: () => void;
  connectionStatus: ConnectionStatus;
}

export function EmailSettingsForm({ initialSettings, onSuccess, onTestConnectionTrigger, connectionStatus }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [isLoadingSave, setIsLoadingSave] = React.useState(false);
  // isLoadingTest state is now managed by the parent via connectionStatus prop
  // const [isLoadingTest, setIsLoadingTest] = React.useState(false);

  // Define schema for validation (password optional only if editing)
  const formSchema = emailSettingsSchema.omit({ tenantId: true }).superRefine((data, ctx) => {
     if (!initialSettings && !data.smtpPassword) {
         ctx.addIssue({
             code: z.ZodIssueCode.custom,
             path: ["smtpPassword"],
             message: "SMTP Password is required for initial setup.",
         });
     } else if (data.smtpPassword && data.smtpPassword.length > 0 && data.smtpPassword.length < 1) {
          ctx.addIssue({
             code: z.ZodIssueCode.too_small,
             minimum: 1,
             type: "string",
             inclusive: true,
             path: ["smtpPassword"],
             message: "SMTP Password is required.",
         });
     }
  });


  const form = useForm<EmailSettingsFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      smtpHost: initialSettings?.smtpHost ?? '',
      smtpPort: initialSettings?.smtpPort ?? 587,
      smtpUser: initialSettings?.smtpUser ?? '',
      smtpPassword: '', // Always start with empty password field
      smtpSecure: initialSettings?.smtpSecure ?? (initialSettings?.smtpPort === 587 ? false : (initialSettings?.smtpPort === 465 ? true : false)), // Default based on common ports
      fromEmail: initialSettings?.fromEmail ?? '',
      fromName: initialSettings?.fromName ?? '',
    },
  });

   const onSubmit = async (data: EmailSettingsFormData) => {
    setIsLoadingSave(true);
    console.log("[Settings Form] Submitting settings via action (password masked):", JSON.stringify({ ...data, smtpPassword: '***' }));

    try {
        const result = await updateEmailSettingsAction(data);

        if (!result.success) {
            console.error("[Settings Form] Action Save Error:", result.errors);
            if (result.errors) {
                result.errors.forEach((err: any) => {
                    const path = err.path?.[0] as keyof EmailSettingsFormData | undefined;
                    if (path) {
                        form.setError(path, { message: err.message });
                    } else {
                         form.setError("root.serverError", { message: err.message || "An unknown validation error occurred." });
                    }
                });
                 toast({ title: "Validation Error", description: "Please check the form fields.", variant: "destructive" });
            } else {
                 form.setError("root.serverError", { message: "Failed to save settings due to a server error." });
                 toast({ title: "Error Saving Settings", description: "An unexpected server error occurred.", variant: "destructive" });
            }
             throw new Error("Failed to save settings.");
        }

         console.log("[Settings Form] Action Save Success (response masked):", result.settings ? JSON.stringify({...result.settings, smtpPassword: '***'}) : '{}');
         toast({ title: "Settings Saved", description: "Email configuration updated.", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" });

         form.reset({
            ...result.settings,
            smtpPassword: '',
         });
         onSuccess();

    } catch (error: any) {
        if (!form.formState.errors.root?.serverError && !Object.keys(form.formState.errors).length) {
             console.error("[Settings Form] Submission error:", error);
             toast({ title: "Error Saving Settings", description: error.message || "An unexpected error occurred.", variant: "destructive" });
             form.setError("root.serverError", { message: error.message || "An unexpected error occurred." });
        }
    } finally {
        setIsLoadingSave(false);
    }
  };

  // This function now just calls the prop passed from the parent
  const handleTestConnectionClick = () => {
      console.log("[EmailSettingsForm] Triggering test connection via prop 'onTestConnectionTrigger'. Type:", typeof onTestConnectionTrigger);
      if (typeof onTestConnectionTrigger === 'function') {
          onTestConnectionTrigger(); // Call the function passed from parent
      } else {
          console.error("[EmailSettingsForm] onTestConnectionTrigger is not a function!");
          toast({
              title: "Internal Error",
              description: "Could not initiate connection test.",
              variant: "destructive",
          });
      }
  };

    // Determine if test button should be disabled (when saving or already checking)
    const isTestingDisabled = isLoadingSave || connectionStatus === 'checking';

    // Button styling and text remain based on connectionStatus prop
    const getButtonClass = () => {
        if (connectionStatus === 'checking') return ""; // Default while checking
        if (connectionStatus === 'success') return "bg-green-600 hover:bg-green-700 text-white";
        if (connectionStatus === 'failed') return "bg-red-600 hover:bg-red-700 text-white";
        if (connectionStatus === 'unconfigured') return "bg-yellow-500 hover:bg-yellow-600 text-white";
        return "bg-primary hover:bg-primary/90 text-primary-foreground"; // Idle state
    };

     const getButtonIcon = () => {
        if (connectionStatus === 'checking') return <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
        if (connectionStatus === 'success') return <CheckCircle className="mr-2 h-4 w-4" />;
        if (connectionStatus === 'failed') return <XCircle className="mr-2 h-4 w-4" />;
        if (connectionStatus === 'unconfigured') return <AlertTriangle className="mr-2 h-4 w-4" />;
        return <PlugZap className="mr-2 h-4 w-4" />; // Idle state
     };

     const getButtonText = () => {
        if (connectionStatus === 'checking') return "Testing...";
        if (connectionStatus === 'success') return "Connected";
        if (connectionStatus === 'failed') return "Test Failed";
        // Show "Test Connection" for both idle and unconfigured, as user might have entered new details
        return "Test Connection";
     };

     const isSaveDisabled = isLoadingSave || connectionStatus === 'checking';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <Alert variant="default" className="bg-yellow-50 border-yellow-300 text-yellow-800 [&>svg]:text-yellow-600 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 dark:[&>svg]:text-yellow-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important Security Note</AlertTitle>
            <AlertDescription>
                 Saved passwords are encrypted and not displayed here. Enter the password only if you need to update it or test the connection. Leave blank to keep the existing password when saving.
            </AlertDescription>
         </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="smtpHost" render={({ field }) => (
                <FormItem><FormLabel>SMTP Host *</FormLabel><FormControl><Input placeholder="e.g., smtp.mailgun.org" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="smtpPort" render={({ field }) => (
                <FormItem><FormLabel>SMTP Port *</FormLabel><FormControl><Input type="number" placeholder="e.g., 587 or 465" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)}/></FormControl><FormMessage /></FormItem>
            )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="smtpUser" render={({ field }) => (
                <FormItem><FormLabel>SMTP Username *</FormLabel><FormControl><Input placeholder="Your SMTP username" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="smtpPassword" render={({ field }) => (
                <FormItem>
                    <FormLabel>SMTP Password</FormLabel>
                     <FormDescription>Enter to update or test. Leave blank to keep current password.</FormDescription>
                    <FormControl><Input type="password" placeholder="Enter if updating/testing" {...field} autoComplete="new-password"/></FormControl>
                    <FormMessage />
                </FormItem>
            )}/>
        </div>

        <FormField control={form.control} name="smtpSecure" render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5"><FormLabel>Use Encryption (Implicit TLS/SSL)</FormLabel>
                <FormDescription>Set true for port 465. Set false for port 587 (STARTTLS). Check provider docs.</FormDescription></div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl>
                 <FormMessage />
            </FormItem>
        )}/>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="fromEmail" render={({ field }) => (
                <FormItem><FormLabel>Default "From" Email *</FormLabel><FormControl><Input type="email" placeholder="e.g., noreply@yourcompany.com" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="fromName" render={({ field }) => (
                <FormItem><FormLabel>Default "From" Name *</FormLabel><FormControl><Input placeholder="e.g., Your Company Name" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>


        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          {/* Test button now just calls the passed handler */}
          <Button type="button" variant="outline" className={cn(getButtonClass())} onClick={handleTestConnectionClick} disabled={isTestingDisabled}>
             {getButtonIcon()} {getButtonText()}
           </Button>
          <Button type="submit" disabled={isSaveDisabled}>
            {isLoadingSave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isLoadingSave ? 'Saving...' : "Save Settings"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
