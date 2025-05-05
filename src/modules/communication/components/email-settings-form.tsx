"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailSettingsSchema, type EmailSettings } from '@/modules/communication/types';
import { updateEmailSettingsAction, testSmtpConnectionAction } from '@/modules/communication/actions'; // Import actions
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertTriangle, PlugZap, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'idle' | 'checking' | 'success' | 'failed' | 'unconfigured';

// Form data excludes tenantId, which comes from auth context in the action
// Password field is always present for validation, even if left blank to keep existing one.
type EmailSettingsFormData = Omit<EmailSettings, 'tenantId'>;

interface EmailSettingsFormProps {
  // Receive initial settings *without* password
  initialSettings?: Omit<EmailSettings, 'smtpPassword' | 'tenantId'> | null;
  onSuccess: () => void;
  onTestResult: (success: boolean) => void;
  connectionStatus: ConnectionStatus;
}

export function EmailSettingsForm({ initialSettings, onSuccess, onTestResult, connectionStatus }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [isLoadingSave, setIsLoadingSave] = React.useState(false);
  const [isLoadingTest, setIsLoadingTest] = React.useState(false);

  const form = useForm<EmailSettingsFormData>({
    resolver: zodResolver(emailSettingsSchema.omit({ tenantId: true })), // Validate without tenantId
    defaultValues: {
      smtpHost: initialSettings?.smtpHost ?? '',
      smtpPort: initialSettings?.smtpPort ?? 587,
      smtpUser: initialSettings?.smtpUser ?? '',
      smtpPassword: '', // Always start with empty password field
      smtpSecure: initialSettings?.smtpSecure ?? (initialSettings?.smtpPort === 587 ? false : true), // Default secure based on common ports
      fromEmail: initialSettings?.fromEmail ?? '',
      fromName: initialSettings?.fromName ?? '',
    },
  });

   const onSubmit = async (data: EmailSettingsFormData) => {
    setIsLoadingSave(true);
    console.log("[Settings Form] Submitting settings via action (password masked):", JSON.stringify({ ...data, smtpPassword: '***' }));

    try {
        // Pass data excluding tenantId to the action
        // The action handles fetching the old password if the new one is blank
        const result = await updateEmailSettingsAction(data);

        if (!result.success) {
            console.error("[Settings Form] Action Save Error:", result.errors);
            // Handle validation errors specifically
            if (result.errors) {
                result.errors.forEach((err: any) => {
                    if (err.path && err.path.length > 0) {
                        form.setError(err.path[0] as keyof EmailSettingsFormData, { message: err.message });
                    } else {
                         form.setError("root.serverError", { message: err.message || "An unknown validation error occurred." });
                    }
                });
                 toast({ title: "Validation Error", description: "Please check the form fields.", variant: "destructive" });
            } else {
                 form.setError("root.serverError", { message: "Failed to save settings due to a server error." });
                 toast({ title: "Error Saving Settings", description: "An unexpected server error occurred.", variant: "destructive" });
            }
             throw new Error("Failed to save settings."); // Throw to prevent success toast
        }

         console.log("[Settings Form] Action Save Success (response masked):", result.settings ? JSON.stringify({...result.settings, smtpPassword: '***'}) : '{}');

         toast({
            title: "Settings Saved",
            description: "Email configuration has been successfully updated.",
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
         });

         form.reset({ // Reset form with potentially updated data (excluding password)
            ...data,
            smtpPassword: '', // Clear password field after successful save
         });
         onSuccess(); // Trigger parent refresh and connection check

    } catch (error: any) {
        // Errors already handled above or caught here
        if (!form.formState.errors.root?.serverError && !Object.keys(form.formState.errors).length) { // Avoid double-toasting
             console.error("[Settings Form] Submission error:", error);
             toast({
                title: "Error Saving Settings",
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
             });
             form.setError("root.serverError", { message: error.message || "An unexpected error occurred." });
        }
    } finally {
        setIsLoadingSave(false);
    }
  };

  const handleTestConnection = async () => {
    // Manually trigger validation for all fields except password if it's potentially empty
    const fieldsToValidate: (keyof EmailSettingsFormData)[] = ['smtpHost', 'smtpPort', 'smtpUser', 'fromEmail', 'fromName'];
    const isValidBasic = await form.trigger(fieldsToValidate);

    if (!isValidBasic) {
         toast({ title: "Incomplete Settings", description: "Please fill in all required SMTP fields (except password if already saved).", variant: "destructive" });
         return;
    }

    setIsLoadingTest(true);
    const settingsData = form.getValues(); // Includes smtpPassword if entered

    // The action 'testSmtpConnectionAction' handles fetching the stored password if the field is empty.
    // We only need to ensure other fields are valid.
    console.log("[Settings Form] Testing connection via action (password masked if present):", JSON.stringify({ ...settingsData, smtpPassword: '***' }));

    let testSuccess = false;

    try {
        const result = await testSmtpConnectionAction(settingsData);

        if (!result.success) {
            console.error("[Settings Form] Action Test Error:", result.message);
             // Try parsing detailed error if available
             let detailMessage = result.message || `Test failed.`;
             try {
                 const details = JSON.parse(result.message || '{}');
                 if(details.message) detailMessage = details.message;
             } catch {}
            throw new Error(detailMessage);
        }

        console.log("[Settings Form] Action Test Success:", result.message);
        testSuccess = true;
        toast({ title: "Connection Successful", description: result.message, className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" });


    } catch (error: any) {
      console.error("[Settings Form] Test connection error object:", error);
      // Log the raw server response text if available
       if (error.response?.text) {
            const text = await error.response.text();
            console.error("Test Connection - Server Error Response Text:", text);
        }
      testSuccess = false;
       toast({
           title: "Connection Test Failed",
           description: error.message || "Could not connect to SMTP server.",
           variant: "destructive",
           duration: 8000,
       });
    } finally {
      setIsLoadingTest(false);
      onTestResult(testSuccess); // Update parent state
    }
  };

    const getButtonClass = () => {
        if (isLoadingTest || connectionStatus === 'checking') return "";
        if (connectionStatus === 'success') return "bg-green-600 hover:bg-green-700 text-white";
        if (connectionStatus === 'failed') return "bg-red-600 hover:bg-red-700 text-white";
        if (connectionStatus === 'unconfigured') return "bg-yellow-500 hover:bg-yellow-600 text-white";
        return "bg-primary hover:bg-primary/90 text-primary-foreground";
    };

     const getButtonIcon = () => {
        if (isLoadingTest || connectionStatus === 'checking') return <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
        if (connectionStatus === 'success') return <CheckCircle className="mr-2 h-4 w-4" />;
        if (connectionStatus === 'failed') return <XCircle className="mr-2 h-4 w-4" />;
        if (connectionStatus === 'unconfigured') return <AlertTriangle className="mr-2 h-4 w-4" />;
        return <PlugZap className="mr-2 h-4 w-4" />;
     };

     const getButtonText = () => {
        if (isLoadingTest) return "Testing...";
        if (connectionStatus === 'checking') return "Checking...";
        if (connectionStatus === 'success') return "Connected";
        if (connectionStatus === 'failed') return "Test Failed";
        if (connectionStatus === 'unconfigured') return "Test Connection"; // Still allow testing unconfigured
        return "Test Connection";
     };

     // Disable save if loading or testing
     const isSaveDisabled = isLoadingSave || isLoadingTest;


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <Alert variant="destructive" className="bg-yellow-50 border-yellow-300 text-yellow-800 [&gt;svg]:text-yellow-600 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 dark:[&gt;svg]:text-yellow-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important Security Note</AlertTitle>
            <AlertDescription>
                Storing SMTP passwords directly is insecure. Use environment variables or a secrets manager in production. Saved passwords are encrypted but not displayed. Enter the password only if you need to update it or test the connection.
            </AlertDescription>
         </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="smtpHost" render={({ field }) => (
                <FormItem><FormLabel>SMTP Host *</FormLabel><FormControl><Input placeholder="e.g., smtp.mailgun.org" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="smtpPort" render={({ field }) => (
                <FormItem><FormLabel>SMTP Port *</FormLabel><FormControl><Input type="number" placeholder="e.g., 587 or 465" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="smtpUser" render={({ field }) => (
                <FormItem><FormLabel>SMTP Username *</FormLabel><FormControl><Input placeholder="Your SMTP username" {...field} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="smtpPassword" render={({ field }) => (
                <FormItem>
                    <FormLabel>SMTP Password</FormLabel>
                     <FormDescription>Enter password only to update or test. Leave blank to keep existing password when saving.</FormDescription>
                    <FormControl><Input type="password" placeholder="Enter password to test or update" {...field} autoComplete="new-password"/></FormControl>
                    {/* Do not show "required" message if editing and password exists */}
                     {(!initialSettings || form.formState.isSubmitted) && <FormMessage />}
                </FormItem>
            )}/>
        </div>

        <FormField control={form.control} name="smtpSecure" render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5"><FormLabel>Use Encryption (Implicit TLS/SSL)</FormLabel>
                <FormDescription>Set true for port 465. Set false for port 587 (uses STARTTLS). Check provider docs.</FormDescription></div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl>
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
          <Button type="button" variant={connectionStatus !== 'idle' ? 'default' : 'outline'} className={cn(getButtonClass())} onClick={handleTestConnection} disabled={isLoadingTest || isLoadingSave}>
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

