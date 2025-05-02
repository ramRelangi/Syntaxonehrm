
"use client"; // This page needs client-side interactivity for dialogs and data fetching

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, PlusCircle, MessageSquareText } from "lucide-react"; // Use MessageSquareText for placeholder
import { EmailTemplateList } from "@/modules/communication/components/email-template-list";
import { EmailTemplateForm } from "@/modules/communication/components/email-template-form";
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
import type { EmailTemplate } from "@/modules/communication/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Helper to fetch data from API routes - CLIENT SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('/') ? url : `/${url}`;
    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error: any) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
    }
}

export default function CommunicationPage() {
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<EmailTemplate | null>(null);
  const { toast } = useToast();

  const fetchTemplates = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchData<EmailTemplate[]>('/api/communication/templates');
      setTemplates(data);
    } catch (err: any) {
      setError("Failed to load email templates.");
      toast({
        title: "Error",
        description: err.message || "Could not fetch templates.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleFormSuccess = () => {
    setIsFormOpen(false); // Close dialog
    setEditingTemplate(null); // Clear editing state
    fetchTemplates(); // Refetch data
  };

   const handleEdit = (template: EmailTemplate) => {
     setEditingTemplate(template);
     setIsFormOpen(true);
   };

   const handleAddNew = () => {
     setEditingTemplate(null); // Ensure not in edit mode
     setIsFormOpen(true);
   };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            // Reset editing state when dialog is closed externally
            setEditingTemplate(null);
        }
        setIsFormOpen(open);
    }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <Mail className="h-6 w-6" /> Communication Hub
        </h1>
         {/* Using Dialog for Add/Edit Template */}
         <Dialog open={isFormOpen} onOpenChange={handleDialogClose}>
             <DialogTrigger asChild>
                 <Button onClick={handleAddNew} className="shadow-sm">
                    <PlusCircle className="mr-2 h-4 w-4"/> Create Email Template
                 </Button>
             </DialogTrigger>
             <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"> {/* Adjust width/height */}
                 <DialogHeader>
                     <DialogTitle>{editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}</DialogTitle>
                     <DialogDescription>
                         {editingTemplate ? 'Update the details for this email template.' : 'Define a new template for communications.'}
                     </DialogDescription>
                 </DialogHeader>
                 <EmailTemplateForm
                    template={editingTemplate ?? undefined}
                    onSuccess={handleFormSuccess}
                  />
             </DialogContent>
         </Dialog>
      </div>

      <Tabs defaultValue="templates" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-3"> {/* Adjust grid cols as needed */}
              <TabsTrigger value="templates">Email Templates</TabsTrigger>
              <TabsTrigger value="send" disabled>Send Email</TabsTrigger> {/* Placeholder */}
              <TabsTrigger value="settings" disabled>Settings</TabsTrigger> {/* Placeholder */}
          </TabsList>

          {/* Email Templates Tab */}
          <TabsContent value="templates">
              <Card className="shadow-sm mt-4">
                  <CardHeader>
                      <CardTitle>Manage Email Templates</CardTitle>
                      <CardDescription>View, edit, or create reusable email templates for various HR communications.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {isLoading && (
                          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                              <Skeleton className="h-[200px] w-full rounded-lg" />
                          </div>
                      )}
                      {error && <p className="text-center text-destructive py-10">{error}</p>}
                      {!isLoading && !error && (
                           templates.length === 0 ? (
                               <div className="text-center py-10 text-muted-foreground">
                                   No email templates created yet. Click "Create Email Template" to add one.
                               </div>
                           ) : (
                               <EmailTemplateList
                                  templates={templates}
                                  onEdit={handleEdit}
                                  onDeleteSuccess={fetchTemplates} // Pass refetch function as delete success callback
                               />
                           )
                      )}
                  </CardContent>
              </Card>
          </TabsContent>

          {/* Placeholder for Send Email Tab */}
          <TabsContent value="send">
               <Card className="shadow-sm mt-4">
                  <CardHeader>
                      <CardTitle>Send Email</CardTitle>
                      <CardDescription>Compose and send emails using saved templates or custom content (feature coming soon).</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center h-40 bg-muted rounded-md">
                      <p className="text-muted-foreground"><MessageSquareText className="inline h-5 w-5 mr-1" /> Email sending functionality is under development.</p>
                  </CardContent>
              </Card>
          </TabsContent>

           {/* Placeholder for Settings Tab */}
           <TabsContent value="settings">
                <Card className="shadow-sm mt-4">
                    <CardHeader>
                        <CardTitle>Communication Settings</CardTitle>
                        <CardDescription>Configure email sending settings, signatures, etc. (feature coming soon).</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center h-40 bg-muted rounded-md">
                        <p className="text-muted-foreground"><Settings className="inline h-5 w-5 mr-1" /> Communication settings are under development.</p>
                    </CardContent>
                </Card>
           </TabsContent>
      </Tabs>
    </div>
  );
}
