"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { z } from 'zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { tenantLoginSchema, type TenantLoginFormInputs } from '@/modules/auth/types'; // Import tenant-specific schema

export default function TenantLoginPage() {
  const router = useRouter();
  const params = useParams();
  const domain = params.domain as string; // Get domain from URL
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<TenantLoginFormInputs>({
    resolver: zodResolver(tenantLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<TenantLoginFormInputs> = async (data) => {
    setIsLoading(true);
    console.log("Login data for domain:", domain, data);
    // --- Mock Authentication Logic ---
    // In a real app, you'd call your backend API here, passing the domain
    // e.g., const response = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ ...data, domain }) });
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate success or failure based on some condition (e.g., email)
    if (data.email.includes('fail')) {
       toast({
        title: "Login Failed",
        description: "Invalid credentials. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    } else {
      toast({
        title: "Login Successful",
        description: "Welcome back!",
        variant: "default",
      });
      // Redirect to dashboard on successful login
      router.push('/dashboard');
      // No need to setIsLoading(false) here as we are navigating away
    }
    // --- End Mock Logic ---
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
          <CardTitle className="text-2xl font-bold">Login to {domain}</CardTitle>
          <CardDescription>Enter your email and password to login</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
               {/* Domain is now taken from URL, no input field needed */}
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                       {/* Update forgot password link to include domain */}
                       <Link
                        href={`/forgot-password/${domain}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
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
                     <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait
                   </>
                 ) : (
                   "Login"
                 )}
              </Button>
            </form>
          </Form>
           <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{' '}
            {/* Link to the main registration page */}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Register Company
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
