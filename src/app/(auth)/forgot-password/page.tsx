
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { rootForgotPasswordSchema, type RootForgotPasswordFormInputs } from '@/modules/auth/types'; // Use root schema

export default function RootForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'streamlinehr.app';

  const form = useForm<RootForgotPasswordFormInputs>({
    resolver: zodResolver(rootForgotPasswordSchema),
    defaultValues: {
      companyDomain: "",
      email: "",
    },
  });

  const onSubmit: SubmitHandler<RootForgotPasswordFormInputs> = async (data) => {
    setIsLoading(true);
    const { companyDomain, email } = data;
    console.log("Forgot password request for domain:", companyDomain, "Email:", email);

    // --- TODO: Real Forgot Password Logic ---
    // This logic is similar to the tenant-specific page, but triggered from the root
    // 1. Send email and domain to backend API (e.g., /api/auth/forgot-password)
    // 2. Backend verifies domain, finds user by email within that tenant.
    // 3. Generate token, store hash, send email with link (e.g., subdomain.domain.com/reset-password?token=...).

    // --- Mock Forgot Password Logic ---
    await new Promise(resolve => setTimeout(resolve, 1500));

    setIsLoading(false);
    setIsSubmitted(true); // Show the confirmation message

    toast({
      title: "Password Reset Email Sent",
      description: `If an account exists for ${email} at ${companyDomain}.${rootDomain}, you will receive an email with reset instructions.`,
      className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
      duration: 8000,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Forgot Your Password?</CardTitle>
          {!isSubmitted ? (
             <CardDescription>Enter your company domain and email to receive reset instructions.</CardDescription>
          ) : (
             <CardDescription className="text-green-700 dark:text-green-300">Check your email for the password reset link.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!isSubmitted ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
               <FormField
                control={form.control}
                name="companyDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Domain</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input
                          placeholder="your-company"
                          {...field}
                          className="rounded-r-none lowercase"
                          autoCapitalize="none"
                        />
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
            {/* Link back to the root login page, which should redirect based on domain */}
            <a href={`http://${form.watch("companyDomain")}.${rootDomain}`} className="font-medium text-primary hover:underline">
              Login
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
