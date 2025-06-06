
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
// Assume types are adjusted if necessary for tenant context
import { tenantForgotPasswordSchema, type TenantForgotPasswordFormInputs } from '@/modules/auth/types'; // Use tenant-specific schema

export default function TenantForgotPasswordPage() {
  const { toast } = useToast();
  const params = useParams();
  // The domain might now be part of a larger path segment depending on middleware rewrite
  // e.g., /[domain]/forgot-password/[domain] - this seems wrong.
  // Assuming middleware rewrites to /<domain>/forgot-password, params.domain should be the tenant domain.
  const domain = params.domain as string;
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'streamlinehr.app';

  const form = useForm<TenantForgotPasswordFormInputs>({
    resolver: zodResolver(tenantForgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit: SubmitHandler<TenantForgotPasswordFormInputs> = async (data) => {
    setIsLoading(true);
    console.log("Forgot password data for domain:", domain, data);

    // --- TODO: Real Forgot Password Logic ---
    // 1. Send email and domain to backend API (e.g., /api/auth/forgot-password)
    // 2. Backend finds user by email *within the specified tenant domain*.
    // 3. Generate a secure, time-limited reset token.
    // 4. Store the token hash associated with the user ID.
    // 5. Send an email to the user containing a link with the token (e.g., subdomain.domain.com/reset-password?token=...).
    // 6. Backend returns success/error.

    // --- Mock Forgot Password Logic ---
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsSubmitted(true); // Show the confirmation message

    toast({
      title: "Password Reset Email Sent",
      description: `If an account exists for ${data.email} at ${domain}.${rootDomain}, you will receive an email with reset instructions.`,
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
      duration: 8000,
    });
    // Don't reset form here, user might want to try again
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

  // Construct the full tenant domain for display and links
  const fullTenantDomain = `${domain}.${rootDomain}`;
  const loginUrl = `/login`; // Link to the root login page, middleware handles context

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Forgot Password for {domain}?</CardTitle>
          {!isSubmitted ? (
             <CardDescription>Enter your email address associated with {fullTenantDomain} to receive reset instructions.</CardDescription>
          ) : (
             <CardDescription className="text-green-700 dark:text-green-300">Check your email for the password reset link.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!isSubmitted ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Domain is taken from URL */}
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
            {/* Link back to the root login page */}
            <Link href={loginUrl} className="font-medium text-primary hover:underline">
              Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
