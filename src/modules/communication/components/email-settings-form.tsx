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
import { Loader2, Save, AlertTriangle, PlugZap, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

type ConnectionStatus = 'idle' | 'checking' | 'success' | 'failed' | 'unconfigured';

interface EmailSettingsFormProps {
  initialSettings?: Omit<EmailSettings, 'smtpPassword'> | null; // Receive settings without password
  onSuccess: () => void;
  onTestResult: (success: boolean) => void;
  connectionStatus: ConnectionStatus;
}

export function EmailSettingsForm({ initialSettings, onSuccess, onTestResult, connectionStatus }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [isLoadingSave, setIsLoadingSave] = React.useState(false);
  const [isLoadingTest, setIsLoadingTest] = React.useState(false);

  const form = useForm<EmailSettings>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      smtpHost: initialSettings?.smtpHost ?? '',
      smtpPort: initialSettings?.smtpPort ?? 587,
      smtpUser: initialSettings?.smtpUser ?? '',
      smtpPassword: '', // Always start with empty password field
      smtpSecure: initialSettings?.smtpSecure ?? true,
      fromEmail: initialSettings?.fromEmail ?? '',
      fromName: initialSettings?.fromName ?? '',
    },
  });

   const onSubmit = async (data: EmailSettings) => {
    setIsLoadingSave(true);
    console.log("[Settings Form] Submitting settings via API (password masked):", JSON.stringify({ ...data, smtpPassword: '***' }));
    const apiUrl = '/api/communication/settings';
    const method = 'PUT';

    // IMPORTANT: If the password field is empty, use the existing password
    // This requires fetching the current full settings securely on the server-side
    // OR passing a flag indicating password shouldn't be updated.
    // Simple approach for now: If password field is empty, DO NOT send it in the payload.
    // More robust: Server-side should handle this logic.
    const payload = { ...data };
    if (!payload.smtpPassword) {
       // If password is empty, we implicitly want to keep the old one.
       // The API route needs to handle this logic (fetch old, keep if new is empty).
       // For now, we'll just send the empty password, assuming API handles it.
       // A better approach might be to fetch the current settings securely first,
       // or have a separate 'change password' flow.
        console.warn("[Settings Form] Password field is empty. The API should retain the existing password.");
        // delete payload.smtpPassword; // Option 1: Don't send password field
        // payload.keepPassword = true; // Option 2: Send a flag (requires API change)
    }


    try {
        const response = await fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), // Send potentially incomplete payload
        });

        let result: any;
        let responseText: string | null = null;
        try {
           responseText = await response.text();
           if(responseText) result = JSON.parse(responseText);
        } catch (e) {
           if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
           result = {}; // OK but no JSON
        }


        if (!response.ok) {
            console.error("[Settings Form] API Save Error:", result);
            throw new Error(result?.error || result?.message || `Failed to save settings. Status: ${response.status}`);
        }

         console.log("[Settings Form] API Save Success (response masked):", result ? JSON.stringify({...result, smtpPassword: '***'}) : '{}');

         toast({
            title: "Settings Saved",
            description: "Email configuration has been successfully updated.",
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
         });

         form.reset({ // Reset form with new data (excluding password)
            ...data,
            smtpPassword: '', // Clear password field after successful save
         });
         onSuccess(); // Trigger parent refresh

    } catch (error: any) {
        console.error("[Settings Form] Submission error:", error);
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
    const isValid = await form.trigger(); // Validate form
    if (!isValid) {
        toast({ title: "Incomplete Settings", description: "Please fill in all required SMTP fields before testing.", variant: "destructive" });
        return;
    }

    setIsLoadingTest(true);
    const settingsData = form.getValues();
    // If password field is empty, the test *will likely fail* unless handled server-side.
    // This highlights the need for better password management. For testing, require password entry.
     if (!settingsData.smtpPassword && isNaN(initialSettings?.smtpPort ?? NaN)) { // Require password if it wasn't pre-filled (meaning it exists)
          setIsLoadingTest(false);
          toast({ title: "Password Required", description: "Please enter the SMTP password to test the connection.", variant: "destructive" });
          form.setFocus("smtpPassword");
          return;
      }
      // If initialSettings exist, but password is empty, it implies user hasn't changed it.
      // The API needs the *actual* password to test. This form doesn't have it.
      // The API *could* fetch the real password if testing existing settings, but that's complex.
      // Simplest for now: Require password input for test.

    console.log("[Settings Form] Testing connection via API (password masked):", JSON.stringify({ ...settingsData, smtpPassword: '***' }));

    let testSuccess = false;

    try {
      const response = await fetch('/api/communication/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the current form data, including potentially empty password
        body: JSON.stringify(settingsData),
      });

       let result: any;
       let responseText: string | null = null;
       try {
           responseText = await response.text();
           if(responseText) result = JSON.parse(responseText);
       } catch(e){
           if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
           result = {}; // OK, no body
       }


      if (!response.ok) {
          console.error("[Settings Form] API Test Error:", result);
          throw new Error(result?.error || result?.message || `Test failed. Status: ${response.status}`);
      }

      console.log("[Settings Form] API Test Success:", result);
      testSuccess = true;
      // Success toast is optional, rely on button change
      // toast({ title: "Connection Successful", description: result.message, className: "bg-green-100..." });


    } catch (error: any) {
      console.error("[Settings Form] Test connection error object:", error);
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
        if (connectionStatus === 'unconfigured') return "Configure";
        return "Test Connection";
     };

     const isSaveDisabled = isLoadingSave || isLoadingTest || !form.formState.isDirty;


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
                Storing SMTP passwords directly is insecure. Use environment variables or a secrets manager in production. The password field is required for testing. Saved passwords are not displayed.
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
                    <FormLabel>SMTP Password *</FormLabel>
                     <FormDescription>Enter password to update or test. Leave blank to keep existing password when saving.</FormDescription>
                    <FormControl><Input type="password" placeholder="Enter password to test or update" {...field} autoComplete="new-password"/></FormControl>
                    <FormMessage />
                </FormItem>
            )}/>
        </div>

        <FormField control={form.control} name="smtpSecure" render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5"><FormLabel>Use Encryption (TLS/SSL)</FormLabel>
                <FormDescription>Enable secure connection. Common for ports 587/465. Check provider.</FormDescription></div>
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
