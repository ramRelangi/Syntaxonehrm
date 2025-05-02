
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
// Use tenant-specific login schema (no domain field needed)
import { tenantLoginSchema, type TenantLoginFormInputs } from '@/modules/auth/types';
// Import login action (assuming it exists and handles tenant context)
// import { loginAction } from '@/modules/auth/actions';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [tenantDomain, setTenantDomain] = useState<string | null>(null);
  const [rootDomain, setRootDomain] = useState<string>('localhost');
  const [port, setPort] = useState<string>('9002');
  const [fullTenantUrl, setFullTenantUrl] = useState<string | null>(null);

  // Attempt to infer domain from hostname on client-side
  useEffect(() => {
    const currentRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    const currentProtocol = window.location.protocol;
    const hostname = window.location.hostname;
    console.log(`[LoginPage Effect] Hostname: ${hostname}, Root Domain: ${currentRootDomain}, Port: ${currentPort}`);

    setRootDomain(currentRootDomain);
    setPort(currentPort);

    const isRootDomainRequest =
       hostname === currentRootDomain ||
       hostname === 'localhost' ||
       hostname === '127.0.0.1' ||
       hostname.match(/^192\.168\.\d+\.\d+$/) ||
       hostname.match(/^10\.\d+\.\d+\.\d+$/) ||
       hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/);

    if (isRootDomainRequest) {
        setTenantDomain(null);
        const rootUrl = `${currentProtocol}//${hostname}${currentPort !== '80' && currentPort !== '443' ? `:${currentPort}` : ''}/login`;
        setFullTenantUrl(rootUrl);
        console.log(`[LoginPage Effect] On root domain. Full Login URL: ${rootUrl}`);
        return;
    }

    // Match subdomains like 'demo.localhost' or 'demo.syntaxhivehrm.app'
    const match = hostname.match(`^(.*)\\.${currentRootDomain}$`);
    const subdomain = match ? match[1] : null;
    console.log(`[LoginPage Effect] Extracted subdomain: ${subdomain}`);

    if (subdomain && !['www', 'api'].includes(subdomain)) {
        setTenantDomain(subdomain);
        const tenantUrl = `${currentProtocol}//${hostname}${currentPort !== '80' && currentPort !== '443' ? `:${currentPort}` : ''}/login`;
        setFullTenantUrl(tenantUrl);
        console.log(`[LoginPage Effect] Tenant domain set to: ${subdomain}. Full Login URL: ${tenantUrl}`);
    } else {
        setTenantDomain(null);
         const rootUrl = `${currentProtocol}//${hostname}${currentPort !== '80' && currentPort !== '443' ? `:${currentPort}` : ''}/login`;
         setFullTenantUrl(rootUrl);
         console.log(`[LoginPage Effect] No tenant domain detected or on root domain. Full Login URL: ${rootUrl}`);
    }
}, []);


  const form = useForm<TenantLoginFormInputs>({
    resolver: zodResolver(tenantLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<TenantLoginFormInputs> = async (data) => {
    setIsLoading(true);
    const { email, password } = data;
    // The domain is inferred by the middleware/backend.
    console.log(`Login attempt with email: ${email} (Tenant context from domain: ${tenantDomain})`);

    // --- TODO: Real Authentication Logic ---
    // Replace mock logic with call to your actual login server action or API endpoint
    // const result = await loginAction({ email, password }); // Example action call
    //
    // if (!result.success) {
    //   toast({ title: "Login Failed", description: result.error || "Invalid credentials.", variant: "destructive" });
    //   setIsLoading(false);
    // } else {
    //   toast({ title: "Login Successful", description: "Welcome back!" });
    //   router.push('/dashboard'); // Redirect to tenant dashboard (relative path)
    // }
    // --- End Real Logic Placeholder ---

    // --- Mock Authentication Logic ---
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (email.includes('fail')) {
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
      // Redirect to the tenant-specific dashboard (middleware handles rewrite)
      router.push('/dashboard'); // Relative path, middleware ensures context
    }
    // --- End Mock Logic ---
  };

  // Construct forgot password link dynamically
  // If on tenant domain, link to /forgot-password/[domain], else to root /forgot-password
  const forgotPasswordHref = tenantDomain
    ? `/forgot-password/${tenantDomain}` // Tenant-specific forgot password
    : '/forgot-password'; // Root forgot password

  const displayLocation = tenantDomain
      ? `company: ${tenantDomain}`
      : `the main portal`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login to SyntaxHive Hrm</CardTitle>
           {fullTenantUrl && (
                <CardDescription>
                    {`Enter your credentials for ${displayLocation}`}
                    <span className="block text-xs text-muted-foreground mt-1">({tenantDomain ? `${tenantDomain}.${rootDomain}${port !== '80' && port !== '443' ? `:${port}` : ''}` : `${rootDomain}${port !== '80' && port !== '443' ? `:${port}` : ''}`})</span>
                </CardDescription>
           )}
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      {/* Link to relevant forgot password page */}
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
           {/* Link to root registration page */}
           <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Register your company
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
