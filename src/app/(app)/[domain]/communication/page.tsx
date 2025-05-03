
// src/app/(app)/[domain]/communication/page.tsx
"use client"; // This page needs client-side interactivity

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, PlusCircle, MessageSquareText, Settings, CheckCircle, XCircle, AlertTriangle, Loader2, PlugZap, Send } from "lucide-react"; // Added Send
import { EmailTemplateList } from "@/modules/communication/components/email-template-list";
import { EmailTemplateForm } from "@/modules/communication/components/email-template-form";
import { EmailSettingsForm } from "@/modules/communication/components/email-settings-form"; // Import settings form
import { SendEmailForm } from "@/modules/communication/components/send-email-form"; // Import send email form
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
import type { EmailTemplate, EmailSettings, ConnectionStatus } from "@/modules/communication/types"; // Import types
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useParams } from "next/navigation"; // Import useParams

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T | null> { // Allow null return
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Communication Page - fetchData] Fetching from ${fullUrl}`);
    try {
        // API route handles tenant context via header
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Communication Page - fetchData] Response status for ${fullUrl}: ${response.status}`);

        // Special handling for 404 on settings fetch
        if (response.status === 404 && url.includes('/api/communication/settings')) {
            console.log("[Communication Page - fetchData] Settings not found (404), returning null.");
            return null; // Return null if settings endpoint returns 404
        }


        if (!response.ok) {
            // Attempt to parse error, provide fallback
            const errorText = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch {
                errorMessage = errorText || errorMessage;
            }
            console.error(`[Communication Page - fetchData] HTTP error for ${fullUrl}: ${errorMessage}`);
            throw new Error(errorMessage);
        }

        // Handle cases where response might be empty even with 200 OK
        const text = await response.text();
        if (!text) {
           console.log(`[Communication Page - fetchData] Received empty response body for ${fullUrl}, returning null.`);
           // If the response is ok but empty, treat it as null (relevant for initial settings GET)
           return null;
        }
        // Parse JSON only if text is not empty
        console.log(`[Communication Page - fetchData] Received data for ${fullUrl}, parsing JSON...`);
        return JSON.parse(text) as T;

    } catch (error: any) {
           console.error(`[Communication Page - fetchData] Failed to fetch ${fullUrl}: ${error.message}`);
           throw error; // Rethrow the error for specific handling in callers
    }
}


export default function TenantCommunicationPage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [settings, setSettings] = React.useState<EmailSettings | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = React.useState(true);
  const [templateError, setTemplateError] = React.useState<string | null>(null);
  const [settingsError, setSettingsError] = React.useState<string | null>(null);
  const [isTemplateFormOpen, setIsTemplateFormOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<EmailTemplate | null>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState("templates"); // Default to templates tab
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>('idle'); // State for connection status

  // --- Background Connection Check ---
  const checkConnectionInBackground = React.useCallback(async (currentSettings: EmailSettings | null) => {
     if (!currentSettings) {
       console.log("[Communication Page - checkConnectionInBackground] No settings provided, skipping check.");
       setConnectionStatus('unconfigured');
       return;
     }
    console.log("[Communication Page - checkConnectionInBackground] Starting background check...");
    setConnectionStatus('checking');
    try {
        const response = await fetch('/api/communication/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown connection error' }));
            console.error('[Communication Page - checkConnectionInBackground] Background check failed:', errorData.message);
            setConnectionStatus('failed');
            // Maybe send admin notification here if needed, but API might already do it
        } else {
             console.log("[Communication Page - checkConnectionInBackground] Background check successful.");
            setConnectionStatus('success');
        }
    } catch (error) {
        console.error('[Communication Page - checkConnectionInBackground] Error during background check:', error);
        setConnectionStatus('failed');
    }
  }, []); // No external dependencies, uses passed settings

  // --- Fetch Settings ---
 const fetchSettings = React.useCallback(async () => {
    console.log("[Communication Page - fetchSettings] Starting fetch...");
    setIsLoadingSettings(true);
    setSettingsError(null);
    setConnectionStatus('checking'); // Assume checking initially
    try {
        // API route handles tenant context via header
        const data = await fetchData<EmailSettings>('/api/communication/settings');
        console.log("[Communication Page - fetchSettings] Data received from fetchData:", data);
        // fetchData now returns null if 404 or empty, so check for truthiness
        if (data) {
            console.log("[Communication Page - fetchSettings] Valid settings data found.");
            setSettings(data);
            // Trigger background check only if settings data is present
             checkConnectionInBackground(data); // No await
        } else {
            console.log("[Communication Page - fetchSettings] No valid settings data found (null or empty).");
            setSettings(null); // Explicitly set to null if no valid settings
            setConnectionStatus('unconfigured'); // Set status if no settings found or empty
        }
    } catch (err: any) {
        console.error("[Communication Page - fetchSettings] Error during fetch:", err.message);
        setSettingsError("Failed to load email settings.");
        setConnectionStatus('failed'); // Indicate failure to fetch settings
        setSettings(null); // Ensure settings state is null on error
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
      // API route handles tenant context via header
      const data = await fetchData<EmailTemplate[]>('/api/communication/templates');
      console.log("[Communication Page - fetchTemplates] Data received:", data);
      // If data is null (though unlikely for templates GET), treat as empty array
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
    fetchSettings(); // This now includes the initial checkConnectionInBackground call if settings are valid
  }, [fetchTemplates, fetchSettings]); // Keep dependencies as they trigger the fetches

  // --- Handlers ---
  const handleTemplateFormSuccess = () => {
    console.log("[Communication Page - handleTemplateFormSuccess] Triggering refetch.");
    setIsTemplateFormOpen(false); // Close dialog
    setEditingTemplate(null); // Clear editing state
    fetchTemplates(); // Refetch templates
  };

   const handleEditTemplate = (template: EmailTemplate) => {
     console.log("[Communication Page - handleEditTemplate] Setting template for edit:", template.id);
     setEditingTemplate(template);
     setIsTemplateFormOpen(true);
   };

   const handleAddNewTemplate = () => {
     console.log("[Communication Page - handleAddNewTemplate] Opening form for new template.");
     setEditingTemplate(null); // Ensure not in edit mode
     setIsTemplateFormOpen(true);
   };

   const handleTemplateDialogClose = (open: boolean) => {
        console.log("[Communication Page - handleTemplateDialogClose] Dialog open state changed:", open);
        if (!open) {
            setEditingTemplate(null); // Reset editing state when dialog is closed
        }
        setIsTemplateFormOpen(open);
    }

    const handleSettingsSuccess = async () => {
        console.log("[Communication Page - handleSettingsSuccess] Settings saved, triggering refetch and check.");
        // Refetch settings AND trigger connection check *after* saving new settings
        await fetchSettings(); // Await fetchSettings here to ensure check runs after save
    }

    const handleManualTestConnectionResult = (success: boolean) => {
        console.log("[Communication Page - handleManualTestConnectionResult] Manual test result:", success);
        // Update status based on manual test result
        setConnectionStatus(success ? 'success' : 'failed');
    }


  // Determine if email sending is configured (based on state, not just presence of settings)
  const isEmailConfigured = connectionStatus === 'success';
  const isEmailMisconfigured = connectionStatus === 'failed';
  const isEmailUnconfigured = connectionStatus === 'unconfigured';
  // Treat idle and checking as loading states for disabling UI elements like the Send tab
  const isLoadingStatus = connectionStatus === 'checking' || connectionStatus === 'idle';


    // Helper to render connection status indicator
    const renderConnectionStatus = () => {
        console.log(`[Communication Page - renderConnectionStatus] Current status: ${connectionStatus}, isLoadingSettings: ${isLoadingSettings}, settings: ${!!settings}`);
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
                 // Show idle only if settings are present but check hasn't run/finished
                 // Now also check isLoadingStatus to avoid showing 'Idle' while 'checking'
                 if (settings && !isLoadingSettings && connectionStatus === 'idle') {
                     return <span className="text-xs text-muted-foreground">Status: Idle</span>;
                 }
                 // Otherwise show loading, checking, or unconfigured based on other states
                 return isLoadingSettings ? <span className="text-xs text-muted-foreground">Loading...</span> :
                        connectionStatus === 'checking' ? <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking...</span> :
                        <span className="text-xs text-yellow-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unconfigured</span>;
        }
    };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Mail className="h-6 w-6" /> Communication Hub for {tenantDomain}
        </h1>
         {/* Button is specific to template creation, keep it here */}
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
       {/* Show alert only when not loading AND status is relevant (unconfigured/failed) */}
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
          {/* Use simpler status icons for tabs */}
          <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="templates">Email Templates</TabsTrigger>
              {/* Send tab is disabled if connection is not explicitly successful */}
              <TabsTrigger value="send" disabled={connectionStatus !== 'success'}>
                  <Send className="mr-1 h-4 w-4"/> Send Email
                  {connectionStatus !== 'success' && <AlertTriangle className="ml-2 h-3 w-3 text-yellow-600 dark:text-yellow-500" title="Email not configured or status issue" />}
              </TabsTrigger>
              <TabsTrigger value="settings">
                 <Settings className="mr-1 h-4 w-4"/> Settings
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
                        ) : isEmailConfigured ? ( // Check only if configured
                             <SendEmailForm templates={templates} connectionStatus={connectionStatus}/>
                         ) : (
                             <div className="flex items-center justify-center h-40 bg-muted rounded-md">
                               <p className="text-muted-foreground text-center px-4">
                                  {connectionStatus === 'checking' ? 'Checking email configuration...' :
                                   connectionStatus === 'failed' ? 'Email configuration failed. Please check the Settings tab.' :
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
                            {renderConnectionStatus()} {/* Display connection status */}
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
                                initialSettings={settings}
                                onSuccess={handleSettingsSuccess}
                                onTestResult={handleManualTestConnectionResult} // Pass handler for manual test result
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
