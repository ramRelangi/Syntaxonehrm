
// src/app/(app)/[domain]/communication/page.tsx
"use client"; // This page needs client-side interactivity

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, PlusCircle, Settings, CheckCircle, XCircle, AlertTriangle, Loader2, PlugZap, Send } from "lucide-react";
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
import { testSmtpConnectionAction, getEmailSettingsAction } from '@/modules/communication/actions';
import { sendAdminNotification } from '@/modules/auth/actions'; // Corrected import path


async function fetchData<T>(url: string, options?: RequestInit): Promise<T | null> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    console.log(`[Communication Page - fetchData] Fetching from ${fullUrl}`);
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        console.log(`[Communication Page - fetchData] Response status for ${fullUrl}: ${response.status}`);

        if (response.status === 404) {
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

export default function TenantCommunicationPage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
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

  const checkConnectionInBackground = React.useCallback(async () => {
    console.log("[Communication Page - checkConnectionInBackground] Starting background check via action...");
    setConnectionStatus('checking');
    try {
        const result = await testSmtpConnectionAction();

        if (!result.success) {
            console.error('[Communication Page - checkConnectionInBackground] Background check failed:', result.message);
            setConnectionStatus('failed');
            await sendAdminNotification( // Use the imported function
                 `Background SMTP Check Failed (Tenant: ${tenantDomain})`,
                 `Tenant: ${tenantDomain}\nError: ${result.message}`
            );
        } else {
             console.log("[Communication Page - checkConnectionInBackground] Background check successful.");
            setConnectionStatus('success');
        }
    } catch (error: any) {
        console.error('[Communication Page - checkConnectionInBackground] Error during background check action call:', error);
        setConnectionStatus('failed');
        await sendAdminNotification( // Use the imported function
            `Error during Background SMTP Check (Tenant: ${tenantDomain})`,
            `Tenant: ${tenantDomain}\nError: ${error.message}`
        );
    }
  }, [tenantDomain]);

 const fetchSettings = React.useCallback(async () => {
    console.log("[Communication Page - fetchSettings] Starting fetch via getEmailSettingsAction...");
    setIsLoadingSettings(true);
    setSettingsError(null);
    setConnectionStatus('checking');
    try {
        const data = await getEmailSettingsAction();
        console.log("[Communication Page - fetchSettings] Safe settings received from action:", data ? JSON.stringify(data) : 'null');

        if (data && data.smtpHost) {
            console.log("[Communication Page - fetchSettings] Valid safe settings data found.");
            setSafeSettings(data);
             checkConnectionInBackground();
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
}, [toast, checkConnectionInBackground]);


  const fetchTemplates = React.useCallback(async () => {
    console.log("[Communication Page - fetchTemplates] Starting fetch...");
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
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


  React.useEffect(() => {
    console.log("[Communication Page - useEffect] Initializing data fetch.");
    fetchTemplates();
    fetchSettings();
  }, [fetchTemplates, fetchSettings]);

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
        await fetchSettings();
    }

    const handleManualTestConnection = async () => {
        console.log("[Communication Page - handleManualTestConnection] Triggering test via action...");
        setConnectionStatus('checking');
        try {
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
                  await sendAdminNotification( // Use the imported function
                     `Manual SMTP Test Failed (Tenant: ${tenantDomain})`,
                     `Tenant: ${tenantDomain}\nError: ${result.message}`
                 );
             }
             return success;
         } catch (error: any) {
             console.error("[Communication Page - handleManualTestConnection] Error during action call:", error);
             setConnectionStatus('failed');
             toast({
                 title: "Connection Test Error",
                 description: error.message || "An unexpected error occurred during the test.",
                 variant: "destructive",
             });
              await sendAdminNotification( // Use the imported function
                 `Error during Manual SMTP Test (Tenant: ${tenantDomain})`,
                 `Tenant: ${tenantDomain}\nError: ${error.message}`
             );
             return false;
         }
    }


    const renderConnectionStatus = () => {
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
                 if (settingsLoaded) {
                      return <span className="text-xs text-muted-foreground">Status: Idle</span>;
                 }
                 return <span className="text-xs text-yellow-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unconfigured</span>;
        }
    };

    const isEmailConfigured = connectionStatus === 'success';
    const isEmailMisconfigured = connectionStatus === 'failed';
    const isEmailUnconfigured = connectionStatus === 'unconfigured';
    const isLoadingStatus = connectionStatus === 'checking' || connectionStatus === 'idle';


  return (
    <div className="flex flex-col gap-6">
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
                 {connectionStatus === 'checking' && <Loader2 className="ml-2 h-3 w-3 animate-spin"/>}
                 {connectionStatus === 'success' && <CheckCircle className="ml-2 h-3 w-3 text-green-600"/>}
                 {connectionStatus === 'failed' && <XCircle className="ml-2 h-3 w-3 text-red-600"/>}
                 {connectionStatus === 'unconfigured' && <AlertTriangle className="ml-2 h-3 w-3 text-yellow-600"/>}
              </TabsTrigger>
          </TabsList>

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

           <TabsContent value="settings">
                <Card className="shadow-sm mt-4">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Communication Settings</span>
                            {renderConnectionStatus()}
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
                                initialSettings={safeSettings}
                                onSuccess={handleSettingsSuccess}
                                onTestConnectionTrigger={handleManualTestConnection}
                                connectionStatus={connectionStatus}
                             />
                         )}
                    </CardContent>
                </Card>
           </TabsContent>
      </Tabs>
    </div>
  );
}
