"use client";

import * as React from 'react';
import type { EmailTemplate } from '@/modules/communication/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Loader2, Eye } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useToast } from '@/hooks/use-toast';

interface EmailTemplateListProps {
  templates: EmailTemplate[];
  onEdit: (template: EmailTemplate) => void;
  onDeleteSuccess: () => void;
}

export function EmailTemplateList({ templates, onEdit, onDeleteSuccess }: EmailTemplateListProps) {
    const { toast } = useToast();
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const handleDelete = async (id: string, name: string) => {
        setDeletingId(id);
        console.log(`[Email Template List] Deleting template ${id} via API...`);
        try {
            const response = await fetch(`/api/communication/templates/${id}`, { method: 'DELETE' });

            let result: any;
            let responseText: string | null = null;
            try {
                responseText = await response.text();
                if (responseText) result = JSON.parse(responseText);
            } catch (e) {
                if (!response.ok) throw new Error(responseText || `HTTP error! Status: ${response.status}`);
                result = {}; // OK but no JSON body
            }

            if (!response.ok) {
                console.error("[Email Template List] API Delete Error:", result);
                throw new Error(result?.error || result?.message || `Failed to delete ${name}`);
            }

             console.log("[Email Template List] API Delete Success:", result);

            toast({
                title: "Template Deleted",
                description: `Template "${name}" has been successfully deleted.`,
                className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
            });
            onDeleteSuccess(); // Trigger refetch in parent

        } catch (error: any) {
            console.error("[Email Template List] Delete error:", error);
            toast({
                title: "Deletion Failed",
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setDeletingId(null);
        }
    };

  if (templates.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No email templates created yet.
      </div>
    );
  }

  return (
    <TooltipProvider>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
            <Card key={template.id} className="shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    {template.usageContext && <Badge variant="outline">{template.usageContext}</Badge>}
                </div>
                <CardDescription className="text-xs text-muted-foreground pt-1 line-clamp-1">
                  Subject: {template.subject}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <Tooltip>
                   <TooltipTrigger asChild>
                       <p className="text-sm text-muted-foreground line-clamp-3">{template.body}</p>
                   </TooltipTrigger>
                   <TooltipContent className="max-w-sm whitespace-pre-wrap">
                       <p>{template.body}</p>
                   </TooltipContent>
               </Tooltip>
            </CardContent>
            <div className="flex items-center justify-end p-3 border-t">
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(template)} className="h-8 w-8">
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8" disabled={deletingId === template.id}>
                            {deletingId === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            <span className="sr-only">Delete</span>
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the email template "<strong>{template.name}</strong>". This action cannot be undone.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletingId === template.id}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(template.id!, template.name)} disabled={deletingId === template.id} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {deletingId === template.id ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
            </Card>
        ))}
        </div>
    </TooltipProvider>
  );
}
