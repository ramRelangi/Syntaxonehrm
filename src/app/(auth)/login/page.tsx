
"use client";

import * as React from 'react'; // Import React
import { useState, useEffect } from 'react';
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

// Updated schema: Remove companyDomain
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  // State to hold the inferred domain (if needed for forgot password link)
  const [tenantDomain, setTenantDomain] = useState<string | null>(null);
  const [rootDomain, setRootDomain] = useState<string>('localhost');

  // Attempt to infer domain from hostname on client-side
  useEffect(() => {
    // This effect runs only on the client side
    const currentRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    setRootDomain(currentRootDomain);

    const hostname = window.location.hostname;
    const match = hostname.match(`^(.*)\\.${currentRootDomain}$`);
    const subdomain = match ? match[1] : null;

    if (subdomain && !['www', 'api'].includes(subdomain)) {
        setTenantDomain(subdomain);
    } else {
        // If on root domain or ignored subdomain, clear tenantDomain state
        setTenantDomain(null);
    }
}, []); // Empty dependency array ensures this runs once on mount


  const form = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<LoginFormInputs> = async (data) => {
    setIsLoading(true);
    const { email, password } = data;
    // The domain is no longer in the form data.
    // The backend API/action needs to determine the tenant based on context (e.g., header set by middleware).
    console.log(`Login attempt with email: ${email} (Tenant context handled by backend)`);

    // --- TODO: Real Authentication Logic ---
    // 1. Send email, password to backend API (e.g., /api/auth/login)
    // 2. Backend gets tenantId from header/middleware context.
    // 3. Find user by email WITHIN that tenantId.
    // 4. Verify password hash.
    // 5. Set session cookie (httpOnly).
    // 6. Return success/error.

    // --- Mock Authentication Logic ---
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (email.includes('fail')) {
      toast({
        title: "Login Failed",
        description: "Invalid credentials or tenant context. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    } else {
      toast({
        title: "Login Successful",
        description: "Welcome back!",
        variant: "default",
      });
      // Redirect to the tenant-specific dashboard (middleware handles rewrite)
      router.push('/dashboard'); // The middleware will handle the rewrite
      // No need to setIsLoading(false) here as we are navigating away
    }
    // --- End Mock Logic ---
  };

  // Construct forgot password link dynamically
  const forgotPasswordHref = tenantDomain ? `/forgot-password/${tenantDomain}` : '/forgot-password';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login to SyntaxHive Hrm</CardTitle>
          <CardDescription>
            {tenantDomain
             ? `Enter your credentials for ${tenantDomain}.${rootDomain}`
             : "Enter your email and password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Removed Company Domain Field */}
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
                      {/* Link to root forgot password page or tenant-specific if domain known */}
                      <Link
                        href={forgotPasswordHref}
                        className={`text-sm font-medium text-primary hover:underline`}
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
          {/* Removed "Register Company" link */}
          {/* <div className="mt-4 text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Register Company
            </Link>
          </div> */}
        </CardContent>
      </Card>
    </div>
  );
}
