
"use client"; // This page needs client-side interactivity

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, PlusCircle, MessageSquareText, Settings } from "lucide-react";
import { EmailTemplateList } from "@/modules/communication/components/email-template-list";
import { EmailTemplateForm } from "@/modules/communication/components/email-template-form";
import { EmailSettingsForm } from "@/modules/communication/components/email-settings-form"; // Import settings form
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
import type { EmailTemplate, EmailSettings } from "@/modules/communication/types"; // Import EmailSettings type
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from 'lucide-react';

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
            throw new Error(errorMessage);
        }
        // Handle cases where response might be empty (e.g., GET settings before configured)
        const text = await response.text();
        return text ? JSON.parse(text) : ({} as T) // Return empty object if no content
    } catch (error: any) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
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

  // --- Fetch Settings ---
  const fetchSettings = React.useCallback(async () => {
    setIsLoadingSettings(true);
    setSettingsError(null);
    try {
      const data = await fetchData<EmailSettings | null>('/api/communication/settings');
      // API returns {} if not set, handle this case
      setSettings(data && Object.keys(data).length > 0 ? data : null);
    } catch (err: any) {
      setSettingsError("Failed to load email settings.");
      toast({
        title: "Error Loading Settings",
        description: err.message || "Could not fetch settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSettings(false);
    }
  }, [toast]);

  // --- Initial Data Fetch ---
  React.useEffect(() => {
    fetchTemplates();
    fetchSettings();
  }, [fetchTemplates, fetchSettings]);

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

    const handleSettingsSuccess = () => {
        fetchSettings(); // Refetch settings after successful save
    }

  // Determine if email sending is configured (kept for potential future use or display logic)
  const isEmailConfigured = !!settings && settings.smtpHost && settings.smtpUser;

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

       {/* Alert if email sending is not configured */}
        {!isEmailConfigured && !isLoadingSettings && (
            <Alert variant="destructive" className="bg-yellow-50 border-yellow-300 text-yellow-800 [&>svg]:text-yellow-600 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300 dark:[&>svg]:text-yellow-500">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Email Sending Not Configured</AlertTitle>
                <AlertDescription>
                Email sending functionality might be limited. Please configure your SMTP settings in the{' '}
                <button onClick={() => setActiveTab("settings")} className="font-medium underline hover:text-yellow-900 dark:hover:text-yellow-200">
                    Settings tab
                </button>
                {' '}to enable full sending capabilities.
                </AlertDescription>
            </Alert>
        )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="templates">Email Templates</TabsTrigger>
              {/* Removed the disabled attribute to always enable the tab */}
              <TabsTrigger value="send">Send Email</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger> {/* Always enabled */}
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
                      <CardTitle>Send Email</CardTitle>
                      <CardDescription>Compose and send emails using saved templates or custom content.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center h-40 bg-muted rounded-md">
                       {/* Keep the content indicating development status */}
                       <p className="text-muted-foreground"><MessageSquareText className="inline h-5 w-5 mr-1" /> Email sending UI is under development.</p>
                       {/* Show warning if not configured */}
                       {!isEmailConfigured && !isLoadingSettings && (
                            <p className="text-yellow-600 dark:text-yellow-400 text-sm ml-4">(Email settings not configured)</p>
                       )}
                  </CardContent>
              </Card>
          </TabsContent>

           {/* Settings Tab */}
           <TabsContent value="settings">
                <Card className="shadow-sm mt-4">
                    <CardHeader>
                        <CardTitle>Communication Settings</CardTitle>
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
                             />
                         )}
                    </CardContent>
                </Card>
           </TabsContent>
      </Tabs>
    </div>
  );
}

