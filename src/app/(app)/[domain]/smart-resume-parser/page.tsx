
// src/app/(app)/[domain]/smart-resume-parser/page.tsx
"use client";

import * as React from 'react'; // Added React import
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { parseResume, ParseResumeOutput } from '@/modules/ai/flows/smart-resume-parser';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UploadCloud, CheckCircle, XCircle, User, Mail, Phone, Linkedin, Settings, Wrench, AlertTriangle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Badge } from '@/components/ui/badge';
import { useParams } from "next/navigation";
// For client-side role check, you might need a hook or context that provides session info.
// As this is a client component, it can't directly use server actions for session checking on initial render easily.
// Assuming a simple isAdmin prop or context for now.
// For a more robust solution, the parent server component would do the check.

const formSchema = z.object({
  resumeFile: z
    .instanceof(FileList)
    .refine((files) => files?.length === 1, "Resume file is required.")
    .refine((files) => files?.[0]?.size <= 5 * 1024 * 1024, `Max file size is 5MB.`)
    .refine(
      (files) => ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(files?.[0]?.type),
      ".pdf, .docx, .txt files are accepted."
    ),
});

type FormValues = z.infer<typeof formSchema>;

// Assume isAdmin is passed as a prop or from context
// For this example, we'll mock it. Replace with actual logic.
const MOCK_IS_ADMIN = true; // Replace this with actual role check

export default function TenantSmartResumeParserPage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParseResumeOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const { toast } = useToast();

  // Client-side check for admin (replace with actual role from session/context)
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    // Simulate fetching admin status (replace with actual session check)
    // This should ideally be done by the parent Server Component and passed as a prop
    const checkAdminStatus = async () => {
        // Example: fetch('/api/auth/session').then(res => res.json()).then(data => setIsAdmin(data.userRole === 'Admin'));
        setIsAdmin(MOCK_IS_ADMIN); // Using mock for now
    };
    checkAdminStatus();
  }, []);


  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    setError(null);
    setParsedData(null);
    setFileName(data.resumeFile[0].name);

    try {
      const file = data.resumeFile[0];
      const resumeDataUri = await fileToBase64(file);

      if (!resumeDataUri.startsWith('data:') || !resumeDataUri.includes(';base64,')) {
         throw new Error("File could not be read correctly. Please try again.");
      }
      const result = await parseResume({ resumeDataUri });
      setParsedData(result);
      toast({
        title: "Resume Parsed Successfully",
        description: `Extracted information from ${file.name}.`,
         className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
      });
    } catch (err: any) {
      console.error("Parsing error:", err);
      const errorMessage = err.message || "An unexpected error occurred during parsing.";
      setError(errorMessage);
      toast({
        title: "Parsing Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

   const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setFileName(files[0].name);
      form.setValue('resumeFile', files);
      form.trigger('resumeFile');
      setParsedData(null);
      setError(null);
    } else {
      setFileName(null);
      form.resetField('resumeFile');
    }
  };

  if (isAdmin === null) { // Still checking admin status
      return (
          <div className="flex items-center justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
      );
  }

  if (!isAdmin) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
           <Alert variant="destructive" className="max-w-md">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>Unauthorized Access</AlertTitle>
              <AlertDescription>
                  You do not have permission to use the Smart Resume Parser.
              </AlertDescription>
          </Alert>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Smart Resume Parser for {tenantDomain}</h1>
       <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Upload Resume</CardTitle>
          <CardDescription>Upload a resume file (PDF, DOCX, TXT - max 5MB) to extract key information using AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="resumeFile">Resume File</Label>
              <div className="flex items-center space-x-2">
                 <Input
                  id="resumeFile"
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  {...form.register('resumeFile')}
                  onChange={handleFileChange}
                  />
                 <Label
                    htmlFor="resumeFile"
                    className="flex items-center justify-center w-full h-10 px-4 py-2 border rounded-md cursor-pointer hover:bg-accent text-sm"
                 >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {fileName || "Choose File"}
                 </Label>
                <Button type="submit" disabled={isLoading || !form.formState.isValid}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Parsing...
                    </>
                  ) : (
                    "Parse Resume"
                  )}
                </Button>
               </div>
                {form.formState.errors.resumeFile && (
                 <p className="text-sm font-medium text-destructive">{form.formState.errors.resumeFile.message}</p>
               )}
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Parsing {fileName}...</span>
        </div>
      )}

      {error && !isLoading && (
        <Alert variant="destructive">
           <XCircle className="h-4 w-4"/>
          <AlertTitle>Error Parsing Resume</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {parsedData && !isLoading && (
        <Card className="shadow-sm">
          <CardHeader>
             <CardTitle className="flex items-center gap-2">
                 <CheckCircle className="h-5 w-5 text-green-600" />
                 Parsed Information
             </CardTitle>
            <CardDescription>Review the extracted details from {fileName}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary"/>Candidate</h3>
              <p>{parsedData.name || <span className="text-muted-foreground italic">Not found</span>}</p>
            </div>
             <div>
               <h3 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-4 w-4 text-primary"/>Contact Details</h3>
               <div className="space-y-1 pl-6">
                  <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground"/> Email: {parsedData.contactDetails?.email || <span className="text-muted-foreground italic">Not found</span>}</p>
                  <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground"/> Phone: {parsedData.contactDetails?.phone || <span className="text-muted-foreground italic">Not found</span>}</p>
                  <p className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground"/> LinkedIn: {parsedData.contactDetails?.linkedin ? <a href={parsedData.contactDetails.linkedin} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{parsedData.contactDetails.linkedin}</a> : <span className="text-muted-foreground italic">Not found</span>}</p>
               </div>
            </div>
             <div>
              <h3 className="text-lg font-semibold flex items-center gap-2"><Wrench className="h-4 w-4 text-primary"/>Skills</h3>
              {parsedData.skills && parsedData.skills.length > 0 ? (
                 <div className="flex flex-wrap gap-2 mt-2">
                  {parsedData.skills.map((skill, index) => (
                    <Badge key={index} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground italic">No skills found.</p>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary"/>Experience</h3>
              {parsedData.experience && parsedData.experience.length > 0 ? (
                <ul className="list-disc pl-6 space-y-1 mt-2 text-sm">
                  {parsedData.experience.map((exp, index) => (
                    <li key={index}>{exp}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground italic">No experience found.</p>
              )}
            </div>
             <div className="pt-4 border-t">
                 <Button disabled>
                    Pre-fill Application (Coming Soon)
                 </Button>
             </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
