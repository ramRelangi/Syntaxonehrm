

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


// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (!response.ok) {
            // Attempt to parse error, provide fallback
            const errorText = await response.text();
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch {
                // If JSON parsing fails, use the raw text if available
                errorMessage = errorText || errorMessage;
            }
             // Special handling for 404 on settings fetch
            if (response.status === 404 && url.includes('/api/communication/settings')) {
                console.log("Settings not found (404), returning {}");
                return {} as T; // Return empty object if settings not found
            }
            throw new Error(errorMessage);
        }
        // Handle cases where response might be empty (e.g., GET settings before configured)
        const text = await response.text();
        return text ? JSON.parse(text) : ({} as T) // Return empty object if no content
    } catch (error: any) {
           // Log error but rethrow
           console.error(`Failed to fetch ${fullUrl}: ${error.message}`);
           throw error;
           // Throw original error for specific handling (like 404 above) or rethrow a generic one
          // throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
    }
}


export default function CommunicationPage() {
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
  const checkConnectionInBackground = React.useCallback(async (currentSettings: EmailSettings) => {
    // No need to check for null/empty here as fetchSettings handles it
    setConnectionStatus('checking');
    try {
        const response = await fetch('/api/communication/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSettings),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown connection error' }));
            console.error('Background connection check failed:', errorData.message);
            setConnectionStatus('failed');
        } else {
            setConnectionStatus('success');
        }
    } catch (error) {
        console.error('Error during background connection check:', error);
        setConnectionStatus('failed');
    }
  }, []); // No dependencies, relies on passed settings

  // --- Fetch Settings ---
 const fetchSettings = React.useCallback(async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);
    // Don't reset status immediately, let the check handle it
    // setConnectionStatus('idle');
    try {
        const data = await fetchData<EmailSettings | null>('/api/communication/settings');
        // Check if data is null or empty object and has required fields
        if (data && Object.keys(data).length > 0 && data.smtpHost && data.fromEmail) {
            setSettings(data);
            // Trigger background check only if settings seem complete
            // Run check but don't await it here, let it update state in background
             checkConnectionInBackground(data); // No await
        } else {
            setSettings(null); // Explicitly set to null if no valid settings
            setConnectionStatus('unconfigured'); // Set status if no settings found or incomplete
        }
    } catch (err: any) {
         // Don't set 'unconfigured' status on fetch error, only if 404 or empty
        setSettingsError("Failed to load email settings.");
        setConnectionStatus('failed'); // Indicate failure to fetch settings
        toast({
            title: "Error Loading Settings",
            description: err.message || "Could not fetch settings.",
            variant: "destructive",
        });
    } finally {
        setIsLoadingSettings(false);
    }
}, [toast, checkConnectionInBackground]); // Added checkConnectionInBackground dependency


  // --- Fetch Templates ---
  const fetchTemplates = React.useCallback(async () => {
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
      const data = await fetchData<EmailTemplate[]>('/api/communication/templates');
      setTemplates(data);
    } catch (err: any) {
      setTemplateError("Failed to load email templates.");
      toast({
        title: "Error Loading Templates",
        description: err.message || "Could not fetch templates.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [toast]);


   // --- Initial Data Fetch and Background Check ---
  React.useEffect(() => {
    fetchTemplates();
    fetchSettings(); // This now includes the initial checkConnectionInBackground call if settings are valid
  }, [fetchTemplates, fetchSettings]); // Keep dependencies as they trigger the fetches

  // --- Handlers ---
  const handleTemplateFormSuccess = () => {
    setIsTemplateFormOpen(false); // Close dialog
    setEditingTemplate(null); // Clear editing state
    fetchTemplates(); // Refetch templates
  };

   const handleEditTemplate = (template: EmailTemplate) => {
     setEditingTemplate(template);
     setIsTemplateFormOpen(true);
   };

   const handleAddNewTemplate = () => {
     setEditingTemplate(null); // Ensure not in edit mode
     setIsTemplateFormOpen(true);
   };

   const handleTemplateDialogClose = (open: boolean) => {
        if (!open) {
            setEditingTemplate(null); // Reset editing state when dialog is closed
        }
        setIsTemplateFormOpen(open);
    }

    const handleSettingsSuccess = async () => {
        // Refetch settings AND trigger connection check *after* saving new settings
        await fetchSettings(); // Await fetchSettings here to ensure check runs after save
    }

    const handleManualTestConnectionResult = (success: boolean) => {
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
                 if (settings && !isLoadingSettings) {
                     return <span className="text-xs text-muted-foreground">Status: Idle</span>;
                 }
                 // Otherwise show checking or unconfigured based on other states
                 return isLoadingSettings ? <span className="text-xs text-muted-foreground">Loading...</span> : <span className="text-xs text-yellow-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unconfigured</span>;
        }
    };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Mail className="h-6 w-6" /> Communication Hub
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
        {(isEmailUnconfigured || isEmailMisconfigured) && !isLoadingSettings && !isLoadingStatus && (
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
              {/* Send tab is disabled if connection is not successful or still loading/checking */}
              <TabsTrigger value="send" disabled={!isEmailConfigured || isLoadingStatus}>
                  <Send className="mr-1 h-4 w-4"/> Send Email
                  {(!isEmailConfigured || isLoadingStatus) && <AlertTriangle className="ml-2 h-3 w-3 text-yellow-600 dark:text-yellow-500" title="Email not configured or status checking" />}
              </TabsTrigger>
              <TabsTrigger value="settings">
                 <Settings className="mr-1 h-4 w-4"/> Settings
                 {(connectionStatus === 'checking' || (connectionStatus === 'idle' && !isLoadingSettings && settings)) && <Loader2 className="ml-2 h-3 w-3 animate-spin"/>}
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
                        ) : isEmailConfigured && !isLoadingStatus ? ( // Only enable form if truly configured and not loading status
                             <SendEmailForm templates={templates} connectionStatus={connectionStatus}/>
                         ) : (
                             <div className="flex items-center justify-center h-40 bg-muted rounded-md">
                               <p className="text-muted-foreground text-center px-4">
                                  Email sending is disabled. Please configure and verify your SMTP settings in the Settings tab.
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


