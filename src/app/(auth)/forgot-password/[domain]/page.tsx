"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { z } from 'zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { tenantForgotPasswordSchema, type TenantForgotPasswordFormInputs } from '@/modules/auth/types'; // Use tenant-specific schema

export default function TenantForgotPasswordPage() {
  const { toast } = useToast();
  const params = useParams();
  const domain = params.domain as string; // Get domain from URL
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<TenantForgotPasswordFormInputs>({
    resolver: zodResolver(tenantForgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit: SubmitHandler<TenantForgotPasswordFormInputs> = async (data) => {
    setIsLoading(true);
    console.log("Forgot password data for domain:", domain, data);
    // --- Mock Forgot Password Logic ---
    // In a real app, call your backend API, passing the domain
    // e.g., await fetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ ...data, domain }) });
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsSubmitted(true); // Show the confirmation message

    toast({
      title: "Password Reset Email Sent",
      description: `If an account exists for ${data.email} at ${domain}.streamlinehr.app, you will receive an email with reset instructions.`,
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
      duration: 8000,
    });
  };

  // Ensure domain is loaded before rendering form
  if (!domain) {
      return (
         <div className="flex min-h-screen items-center justify-center bg-background px-4">
             <Card className="w-full max-w-md shadow-lg">
                 <CardHeader>
                    <CardTitle>Loading...</CardTitle>
                 </CardHeader>
                 <CardContent>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                 </CardContent>
             </Card>
         </div>
      );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Forgot Password for {domain}?</CardTitle>
          {!isSubmitted ? (
             <CardDescription>Enter your email to receive reset instructions.</CardDescription>
          ) : (
             <CardDescription className="text-green-700 dark:text-green-300">Check your email for the password reset link.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!isSubmitted ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Domain is now taken from URL */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="m@example.com" {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                     </>
                   ) : (
                     "Send Reset Link"
                   )}
                </Button>
              </form>
            </Form>
             ) : (
             <div className="text-center text-sm">
               Didn't receive the email? Check your spam folder or{' '}
               <button onClick={() => setIsSubmitted(false)} className="font-medium text-primary hover:underline">
                 try again
               </button>.
             </div>
          )}
          <div className="mt-4 text-center text-sm">
            Remembered your password?{' '}
            {/* Link back to the tenant-specific login page */}
            <Link href={`/login/${domain}`} className="font-medium text-primary hover:underline">
              Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
