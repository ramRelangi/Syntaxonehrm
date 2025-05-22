
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { registrationSchema, type RegistrationFormData } from '@/modules/auth/types';
import { registerTenantAction } from '@/modules/auth/actions';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [rootDomain, setRootDomain] = React.useState('localhost');

  React.useEffect(() => {
    setRootDomain(process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost');
  }, []);

  console.log("Rendering RegisterPage component");

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      companyName: "",
      companySubdomain: "", // Changed from companyDomain
      adminName: "",
      adminUsername: "", // Added
      adminEmail: "",
      adminPassword: "",
    },
  });

  const onSubmit: SubmitHandler<RegistrationFormData> = async (data) => {
    setIsLoading(true);
    setRegistrationSuccess(false);
    setLoginUrl('');
    console.log("[registerTenantAction] Registration form submitted with data:", data);

    try {
        const result = await registerTenantAction(data);
        console.log("[registerTenantAction] Server action result:", result);

        if (result.success && result.tenant && result.loginUrl) {
             toast({
                title: "Registration Successful",
                description: `Company "${result.tenant.name}" created. Check your email for login instructions. Your login URL is ${result.loginUrl}`,
                className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
                duration: 15000,
             });
             setLoginUrl(result.loginUrl);
             setRegistrationSuccess(true);
             form.reset();
             setIsLoading(false);
        } else {
            const errorMessage = result.errors?.[0]?.message || 'Registration failed. Please try again.';
            console.error("[registerTenantAction] Registration failed:", errorMessage, result.errors);
            toast({
                title: "Registration Failed",
                description: errorMessage,
                variant: "destructive",
            });
            setIsLoading(false);
            if (result.errors?.some(e => e.path?.includes('companySubdomain'))) { // Changed from companyDomain
                form.setError("companySubdomain", { type: 'server', message: errorMessage });
            } else if (result.errors?.some(e => e.path?.includes('adminEmail'))) {
                form.setError("adminEmail", { type: 'server', message: errorMessage });
            } else if (result.errors?.some(e => e.path?.includes('adminUsername'))) {
                form.setError("adminUsername", { type: 'server', message: errorMessage });
            } else if (result.errors?.some(e => e.message?.includes('Database schema not initialized'))) {
                 form.setError("root.serverError", { type: 'server', message: errorMessage });
            } else {
                 form.setError("root.serverError", { type: 'server', message: errorMessage });
            }
        }
    } catch (error: any) {
        console.error("[registerTenantAction] Unexpected error during registration submission:", error);
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred. Please try again later.";
        toast({
            title: "Registration Error",
            description: errorMessage,
            variant: "destructive",
        });
        setIsLoading(false);
         form.setError("root.serverError", { type: 'unexpected', message: errorMessage });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 lg:p-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Register for SyntaxHive Hrm</CardTitle>
          {!registrationSuccess ? (
             <CardDescription>Create your company account and admin user</CardDescription>
          ) : (
             <CardDescription className="text-green-700 dark:text-green-300">Registration successful! Check your email.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {registrationSuccess ? (
             <Alert className="border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950">
               <AlertTitle className="text-green-800 dark:text-green-200">Registration Complete!</AlertTitle>
               <AlertDescription className="text-green-700 dark:text-green-300 space-y-2">
                 <p>Your company account has been created. You should receive a welcome email shortly with your login details.</p>
                 <p>Your unique login URL is:</p>
                 <div className="flex items-center gap-2 p-2 bg-background rounded border border-green-200 dark:border-green-800 overflow-x-auto">
                    <LinkIcon className="h-4 w-4 text-primary flex-shrink-0" />
                    <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-primary hover:underline break-all">
                        {loginUrl}
                    </a>
                 </div>
                 <p className="text-xs">Please bookmark this link for future access.</p>
                 <Button onClick={() => { setRegistrationSuccess(false); form.reset(); }} className="mt-4 w-full">Register Another Company</Button>
               </AlertDescription>
             </Alert>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
               {form.formState.errors.root?.serverError && (
                  <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
                      {form.formState.errors.root.serverError.message}
                  </FormMessage>
              )}
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Acme Corporation" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="companySubdomain" // Changed from companyDomain
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Choose Your Subdomain</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                           <Input placeholder="your-company" {...field} className="rounded-r-none lowercase" autoCapitalize='none'/>
                           <span className="inline-flex h-10 items-center rounded-r-md border border-l-0 border-input bg-secondary px-3 text-sm text-muted-foreground">
                              .{rootDomain}
                           </span>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="adminName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Full Name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="adminUsername" // Added
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Username</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., admin_john" {...field} autoCapitalize='none'/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adminEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admin Email</FormLabel>
                      <FormControl>
                        <Input placeholder="admin@yourcompany.com" {...field} type="email" />
                      </FormControl>
                       <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="adminPassword"
                  render={({ field }) => (
                    <FormItem>
                       <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} placeholder="••••••••" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                   {isLoading ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Account...
                     </>
                   ) : (
                     "Register Company"
                   )}
                </Button>
              </form>
            </Form>
             )}
           <div className="mt-4 text-center text-sm">
             Already have an account?{' '}
             <Link href="/login" className="font-medium text-primary hover:underline">
                Login
             </Link>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
