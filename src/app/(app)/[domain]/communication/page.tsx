
// src/app/(app)/[domain]/communication/page.tsx
"use client"; // This page needs client-side interactivity

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, PlusCircle, Settings, CheckCircle, XCircle, AlertTriangle, Loader2, PlugZap, Send } from "lucide-react"; // Added Send, PlugZap
import { EmailTemplateList } from "@/modules/communication/components/email-template-list";
import { EmailTemplateForm } from "@/modules/communication/components/email-template-form";
import { EmailSettingsForm } from "@/modules/communication/components/email-settings-form";
import { SendEmailForm } from "@/modules/communication/components/send-email-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import type { EmailTemplate, EmailSettings, ConnectionStatus } from "@/modules/communication/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useParams } from "next/navigation";
import { testSmtpConnectionAction, getEmailSettingsAction, sendEmailAction } from '@/modules/communication/actions'; // Import actions


// Helper to fetch data from API routes - CLIENT SIDE VERSION (kept for templates)
async function fetchData<T>(url: string, options?: RequestInit): Promise<T | null> { // Allow null return
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Communication Page - fetchData] Fetching from ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Communication Page - fetchData] Response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) { // Handle 404 explicitly
            console.log(`[Communication Page - fetchData] ${fullUrl} not found (404), returning null.`);
            return null;
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            let errorPayload: { message?: string; error?: string } = {};
            try { errorPayload = JSON.parse(errorText || '{}'); } catch {}
            errorMessage = errorPayload.message || errorPayload.error || errorMessage;
            console.error(`[Communication Page - fetchData] HTTP error for ${fullUrl}: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        const text = await response.text();
        if (!text) {
           console.log(`[Communication Page - fetchData] Received empty response body for ${fullUrl}, returning null.`);
           return null;
        }
        console.log(`[Communication Page - fetchData] Received data for ${fullUrl}, parsing JSON...`);
        return JSON.parse(text) as T;

    } catch (error: any) {
           console.error(`[Communication Page - fetchData] Failed to fetch ${fullUrl}: ${error.message}`);
           throw error;
    }
}

// Define admin email - fetch from environment variables
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'; // Fallback for local dev

// Function to send notification email (Keep or move to a helper)
async function sendAdminNotification(error: any) {
     if (!ADMIN_EMAIL) {
        console.error("Admin email not configured. Cannot send failure notification.");
        return;
    }
     // Placeholder for Nodemailer setup and sending logic using *internal* SMTP
     console.log(`[Notification] Simulating sending INTERNAL notification to ${ADMIN_EMAIL} about error: ${error.message}`);
     // In real code:
     // 1. Setup Nodemailer transporter using INTERNAL_SMTP settings from .env
     // 2. Construct email content
     // 3. Send email
}

export default function TenantCommunicationPage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  // Store safe settings (without password) fetched from action
  const [safeSettings, setSafeSettings] = React.useState<Omit<EmailSettings, 'smtpPassword'> | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = React.useState(true);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<EmailTemplate | null>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("templates");
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>('idle');

  // --- Background Connection Check ---
  // This function now simply calls the action and updates state.
  // It relies on the action to fetch the correct settings internally.
  const checkConnectionInBackground = React.useCallback(async () => {
    console.log("[Communication Page - checkConnectionInBackground] Starting background check via action...");
    setConnectionStatus('checking');
    try {
        // Call the action which fetches settings internally
        const result = await testSmtpConnectionAction();

        if (!result.success) {
            console.error('[Communication Page - checkConnectionInBackground] Background check failed:', result.message);
            setConnectionStatus('failed');
            // Send admin notification on failure
            // await sendAdminNotification({ message: `Background SMTP check failed: ${result.message}` });
        } else {
             console.log("[Communication Page - checkConnectionInBackground] Background check successful.");
            setConnectionStatus('success');
        }
    } catch (error: any) {
        console.error('[Communication Page - checkConnectionInBackground] Error during background check action call:', error);
        setConnectionStatus('failed');
        // await sendAdminNotification({ message: `Error during background SMTP check: ${error.message}` });
    }
  }, []); // No dependencies needed as it uses context from action

  // --- Fetch Settings ---
 const fetchSettings = React.useCallback(async () => {
    console.log("[Communication Page - fetchSettings] Starting fetch via getEmailSettingsAction...");
    setIsLoadingSettings(true);
    setSettingsError(null);
    setConnectionStatus('checking');
    try {
        // Use the server action to get settings (password is excluded)
        const data = await getEmailSettingsAction();
        console.log("[Communication Page - fetchSettings] Safe settings received from action:", data ? JSON.stringify(data) : 'null');

        if (data && data.smtpHost) { // Check essential fields returned by action
            console.log("[Communication Page - fetchSettings] Valid safe settings data found.");
            setSafeSettings(data);
            // Trigger background check *after* fetching settings
             checkConnectionInBackground(); // Call the background check
        } else {
            console.log("[Communication Page - fetchSettings] No valid settings data found (null or incomplete).");
            setSafeSettings(null);
            setConnectionStatus('unconfigured');
        }
    } catch (err: any) {
        console.error("[Communication Page - fetchSettings] Error during action call:", err.message);
        setSettingsError("Failed to load email settings.");
        setConnectionStatus('failed');
        setSafeSettings(null);
        toast({
            title: "Error Loading Settings",
            description: err.message || "Could not fetch settings.",
            variant: "destructive",
        });
    } finally {
        setIsLoadingSettings(false);
        console.log("[Communication Page - fetchSettings] Fetch finished.");
    }
}, [toast, checkConnectionInBackground]); // Added checkConnectionInBackground dependency


  // --- Fetch Templates ---
  const fetchTemplates = React.useCallback(async () => {
    console.log("[Communication Page - fetchTemplates] Starting fetch...");
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
      // API route for templates is fine, still using fetchData helper
      const data = await fetchData<EmailTemplate[]>('/api/communication/templates');
      console.log("[Communication Page - fetchTemplates] Data received:", data);
      setTemplates(data || []);
    } catch (err: any) {
      console.error("[Communication Page - fetchTemplates] Error during fetch:", err.message);
      setTemplateError("Failed to load email templates.");
      toast({
        title: "Error Loading Templates",
        description: err.message || "Could not fetch templates.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
       console.log("[Communication Page - fetchTemplates] Fetch finished.");
    }
  }, [toast]);


   // --- Initial Data Fetch ---
  React.useEffect(() => {
    console.log("[Communication Page - useEffect] Initializing data fetch.");
    fetchTemplates();
    fetchSettings(); // Fetches settings AND triggers background check
  }, [fetchTemplates, fetchSettings]);

  // --- Handlers ---
  const handleTemplateFormSuccess = () => {
    console.log("[Communication Page - handleTemplateFormSuccess] Triggering refetch.");
    setIsTemplateFormOpen(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

   const handleEditTemplate = (template: EmailTemplate) => {
     console.log("[Communication Page - handleEditTemplate] Setting template for edit:", template.id);
     setEditingTemplate(template);
     setIsTemplateFormOpen(true);
   };

   const handleAddNewTemplate = () => {
     console.log("[Communication Page - handleAddNewTemplate] Opening form for new template.");
     setEditingTemplate(null);
     setIsTemplateFormOpen(true);
   };

   const handleTemplateDialogClose = (open: boolean) => {
        console.log("[Communication Page - handleTemplateDialogClose] Dialog open state changed:", open);
        if (!open) { setEditingTemplate(null); }
        setIsTemplateFormOpen(open);
    }

    const handleSettingsSuccess = async () => {
        console.log("[Communication Page - handleSettingsSuccess] Settings saved, triggering refetch and check.");
        // Await fetchSettings which includes the checkConnectionInBackground call
        await fetchSettings();
    }

    // Manual test connection now calls the action directly
    const handleManualTestConnection = async () => {
        console.log("[Communication Page - handleManualTestConnection] Triggering test via action...");
        setConnectionStatus('checking');
        try {
             // Call action without args - it uses saved settings
             const result = await testSmtpConnectionAction();
             const success = result.success;
             setConnectionStatus(success ? 'success' : 'failed');
             toast({
                 title: success ? "Connection Successful" : "Connection Test Failed",
                 description: result.message,
                 variant: success ? "default" : "destructive",
                 className: success ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" : "",
                 duration: success ? 5000 : 8000,
             });
             if (!success) {
                 // await sendAdminNotification({ message: `Manual SMTP test failed: ${result.message}` });
             }
             return success; // Return success state
         } catch (error: any) {
             console.error("[Communication Page - handleManualTestConnection] Error during action call:", error);
             setConnectionStatus('failed');
             toast({
                 title: "Connection Test Error",
                 description: error.message || "An unexpected error occurred during the test.",
                 variant: "destructive",
             });
              // await sendAdminNotification({ message: `Error during manual SMTP test: ${error.message}` });
             return false; // Return false on error
         }
    }


    // Helper to render connection status indicator
    const renderConnectionStatus = () => {
        // Use safeSettings to determine if settings are loaded
        const settingsLoaded = !!safeSettings && safeSettings.smtpHost;
        console.log(`[Communication Page - renderConnectionStatus] Status: ${connectionStatus}, LoadingSettings: ${isLoadingSettings}, SettingsLoaded: ${settingsLoaded}`);

        if (isLoadingSettings) {
            return <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</span>;
        }

        switch (connectionStatus) {
            case 'checking':
                return <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking...</span>;
            case 'success':
                return <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Connected</span>;
            case 'failed':
                return <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" /> Connection Failed</span>;
             case 'unconfigured':
                 return <span className="text-xs text-yellow-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unconfigured</span>;
            case 'idle':
            default:
                 // Show idle only if settings are present but check hasn't finished (less likely now)
                 if (settingsLoaded) {
                      return <span className="text-xs text-muted-foreground">Status: Idle</span>;
                 }
                 return <span className="text-xs text-yellow-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unconfigured</span>;
        }
    };

    // Determine if email sending is configured based on connection status
    const isEmailConfigured = connectionStatus === 'success';
    const isEmailMisconfigured = connectionStatus === 'failed';
    const isEmailUnconfigured = connectionStatus === 'unconfigured';
    const isLoadingStatus = connectionStatus === 'checking' || connectionStatus === 'idle';


  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Mail className="h-6 w-6" /> Communication Hub for {tenantDomain}
        </h1>
         <Dialog open={isTemplateFormOpen} onOpenChange={handleTemplateDialogClose}>
             <DialogTrigger asChild>
                 <Button onClick={handleAddNewTemplate} className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4"/> Create Email Template
                 </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                 <DialogHeader>
                     <DialogTitle>{editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}</DialogTitle>
                     <DialogDescription>
                         {editingTemplate ? 'Update the details for this email template.' : 'Define a new template for communications.'}
                     </DialogDescription>
                 </DialogHeader>
                 <EmailTemplateForm
                    template={editingTemplate ?? undefined}
                    onSuccess={handleTemplateFormSuccess}
                  />
             </DialogContent>
         </Dialog>
      </div>

       {/* Alert if email sending is not configured or misconfigured */}
        {(isEmailUnconfigured || isEmailMisconfigured) && !isLoadingSettings && connectionStatus !== 'checking' && (
             <Alert variant={isEmailUnconfigured ? "default" : "destructive"} className={isEmailUnconfigured ? "bg-yellow-50 border-yellow-300 text-yellow-800 [&>svg]:text-yellow-600 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 dark:[&>svg]:text-yellow-500" : ""}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Email Sending {isEmailUnconfigured ? 'Not Configured' : 'Configuration Issue'}</AlertTitle>
                <AlertDescription>
                {isEmailUnconfigured
                    ? 'Email sending functionality is unavailable. Please configure your SMTP settings in the '
                    : 'There seems to be an issue with your email settings. Please review and test them in the '}
                <button onClick={() => setActiveTab("settings")} className={`font-medium underline ${isEmailUnconfigured ? 'hover:text-yellow-900 dark:hover:text-yellow-200' : 'hover:text-destructive/80'}`}>
                    Settings tab
                </button>
                .
                </AlertDescription>
            </Alert>
        )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="templates">Email Templates</TabsTrigger>
              <TabsTrigger value="send" disabled={connectionStatus !== 'success'}>
                  <Send className="mr-1 h-4 w-4"/> Send Email
                  {connectionStatus !== 'success' && <AlertTriangle className="ml-2 h-3 w-3 text-yellow-600 dark:text-yellow-500" title="Email not configured or status issue" />}
              </TabsTrigger>
              <TabsTrigger value="settings">
                 <Settings className="mr-1 h-4 w-4"/> Settings
                 {/* Use connectionStatus directly for icons */}
                 {connectionStatus === 'checking' && <Loader2 className="ml-2 h-3 w-3 animate-spin"/>}
                 {connectionStatus === 'success' && <CheckCircle className="ml-2 h-3 w-3 text-green-600"/>}
                 {connectionStatus === 'failed' && <XCircle className="ml-2 h-3 w-3 text-red-600"/>}
                 {connectionStatus === 'unconfigured' && <AlertTriangle className="ml-2 h-3 w-3 text-yellow-600"/>}
              </TabsTrigger>
          </TabsList>

          {/* Email Templates Tab */}
          <TabsContent value="templates">
              <Card className="shadow-sm mt-4">
                  <CardHeader>
                      <CardTitle>Manage Email Templates</CardTitle>
                      <CardDescription>View, edit, or create reusable email templates.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {isLoadingTemplates && (
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                          </div>
                      )}
                      {templateError && <p className="text-center text-destructive py-10">{templateError}</p>}
                      {!isLoadingTemplates && !templateError && (
                           templates.length === 0 ? (
                               <div className="text-center py-10 text-muted-foreground">
                                   No email templates created yet. Click "Create Email Template" above to add one.
                               </div>
                           ) : (
                               <EmailTemplateList
                                  templates={templates}
                                  onEdit={handleEditTemplate}
                                  onDeleteSuccess={fetchTemplates}
                               />
                           )
                      )}
                  </CardContent>
              </Card>
          </TabsContent>

          {/* Send Email Tab */}
          <TabsContent value="send">
               <Card className="shadow-sm mt-4">
                  <CardHeader>
                      <CardTitle>Compose Email</CardTitle>
                      <CardDescription>Send emails using saved templates or custom content.</CardDescription>
                  </CardHeader>
                   <CardContent>
                        {isLoadingTemplates ? (
                            <Skeleton className="h-64 w-full" />
                        ) : isEmailConfigured ? (
                             <SendEmailForm templates={templates} connectionStatus={connectionStatus}/>
                         ) : (
                             <div className="flex items-center justify-center h-40 bg-muted rounded-md">
                               <p className="text-muted-foreground text-center px-4">
                                  {isLoadingStatus ? 'Checking email configuration...' :
                                   isEmailMisconfigured ? 'Email configuration failed. Please check the Settings tab.' :
                                   'Email sending is disabled. Please configure your SMTP settings in the Settings tab.'}
                               </p>
                             </div>
                         )}
                   </CardContent>
              </Card>
          </TabsContent>

           {/* Settings Tab */}
           <TabsContent value="settings">
                <Card className="shadow-sm mt-4">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Communication Settings</span>
                            {renderConnectionStatus()} {/* Display derived connection status */}
                        </CardTitle>
                        <CardDescription>Configure how emails are sent from the system (e.g., SMTP server details).</CardDescription>
                    </CardHeader>
                    <CardContent>
                         {isLoadingSettings && (
                            <div className="space-y-4">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-1/4 ml-auto" />
                            </div>
                         )}
                         {settingsError && <p className="text-center text-destructive py-10">{settingsError}</p>}
                         {!isLoadingSettings && !settingsError && (
                            <EmailSettingsForm
                                initialSettings={safeSettings} // Pass safe settings (no password)
                                onSuccess={handleSettingsSuccess}
                                onTestConnectionTrigger={handleManualTestConnection} // Pass the handler for the test button trigger
                                connectionStatus={connectionStatus} // Pass down status for button styling
                             />
                         )}
                    </CardContent>
                </Card>
           </TabsContent>
      </Tabs>
    </div>
  );
}

