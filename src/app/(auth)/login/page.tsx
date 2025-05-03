"use client";

import * as React from 'react'; // Import React
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import useRouter for client-side redirection
import { z } from 'zod';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { tenantLoginSchema, type TenantLoginFormInputs } from '@/modules/auth/types';
import { loginAction } from '@/modules/auth/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LoginPage() {
  const router = useRouter(); // Use useRouter hook
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [tenantDomain, setTenantDomain] = useState<string | null>(null);
  const [rootDomain, setRootDomain] = useState<string>('localhost');
  const [port, setPort] = useState<string>(''); // Store port correctly
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [isRootLogin, setIsRootLogin] = useState(false);

  useEffect(() => {
      if (typeof window !== 'undefined') {
        const currentRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
        const currentPort = window.location.port; // Port can be empty string
        const currentProtocol = window.location.protocol;
        const hostname = window.location.hostname;
        console.log(`[LoginPage Effect] Hostname: ${hostname}, Root Domain: ${currentRootDomain}, Port: ${currentPort}`);

        setRootDomain(currentRootDomain);
        setPort(currentPort);

        const displayPortString = (currentPort && currentPort !== '80' && currentPort !== '443') ? `:${currentPort}` : '';

        const isRoot =
           hostname === currentRootDomain ||
           hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname.match(/^192\.168\.\d+\.\d+$/) ||
           hostname.match(/^10\.\d+\.\d+\.\d+$/) ||
           hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/);

        if (isRoot) {
            setIsRootLogin(true);
            setTenantDomain(null);
            setDisplayUrl(`${currentRootDomain}${displayPortString}`);
            console.log(`[LoginPage Effect] On root domain. Display URL: ${currentRootDomain}${displayPortString}`);
        } else {
            const match = hostname.match(`^(.*)\\.${currentRootDomain}$`);
            const subdomain = match ? match[1] : null;
            console.log(`[LoginPage Effect] Extracted subdomain: ${subdomain}`);

            if (subdomain && !['www', 'api'].includes(subdomain)) {
                setIsRootLogin(false);
                setTenantDomain(subdomain);
                setDisplayUrl(`${subdomain}.${currentRootDomain}${displayPortString}`);
                console.log(`[LoginPage Effect] Tenant domain set to: ${subdomain}. Display URL: ${subdomain}.${currentRootDomain}${displayPortString}`);
            } else {
                setIsRootLogin(true);
                setTenantDomain(null);
                setDisplayUrl(`${hostname}${displayPortString}`);
                console.log(`[LoginPage Effect] No valid tenant subdomain detected. Display URL: ${hostname}${displayPortString}`);
            }
        }
      }
  }, []); // Empty dependency array, runs once on mount


  const form = useForm<TenantLoginFormInputs>({
    resolver: zodResolver(tenantLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<TenantLoginFormInputs> = async (data) => {
    setIsLoading(true);
    // The action determines tenant context from headers/domain implicitly
    console.log(`Login attempt with email: ${data.email}`);

    try {
      // Pass validated data to the action
      const result = await loginAction(data);

      if (!result.success) {
        toast({ title: "Login Failed", description: result.error || "Invalid credentials.", variant: "destructive" });
        setIsLoading(false);
      } else {
        toast({ title: "Login Successful", description: "Welcome back!" });
        // Redirect to tenant dashboard on the CLIENT side after successful login
        router.push('/dashboard'); // Relative path, middleware handles rewrite
      }
    } catch (error: any) {
        console.error("Login action error:", error);
        toast({ title: "Login Error", description: error.message || "An unexpected error occurred.", variant: "destructive" });
        setIsLoading(false);
    }
  };

  // Construct forgot password link dynamically based on client-side detection
  const forgotPasswordHref = tenantDomain
    ? `/forgot-password/${tenantDomain}`
    : '/forgot-password';

  const displayLocation = tenantDomain
      ? `company: ${tenantDomain}`
      : `the main portal`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login to SyntaxHive Hrm</CardTitle>
           {displayUrl !== null ? ( // Render only when displayUrl is determined
                <CardDescription>
                    {`Enter your credentials for ${displayLocation}`}
                    <span className="block text-xs text-muted-foreground mt-1">({displayUrl})</span>
                </CardDescription>
           ) : (
                <CardDescription>Loading...</CardDescription> // Show loading state
           )}
        </CardHeader>
        <CardContent>
            {isRootLogin && displayUrl !== null && (
                <Alert variant="default" className="mb-4 bg-blue-50 border-blue-300 text-blue-800 [&>svg]:text-blue-600 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300 dark:[&>svg]:text-blue-500">
                    <AlertTitle>Root Login</AlertTitle>
                    <AlertDescription>
                         Please use your company's unique login URL (e.g., your-company.{rootDomain}) to access your account. If you don't have one, <Link href="/register" className='font-medium underline'>register here</Link>.
                    </AlertDescription>
                </Alert>
            )}
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
                      <Link
                        href={forgotPasswordHref}
                        className={`text-sm font-medium text-primary hover:underline ${isRootLogin ? 'pointer-events-none opacity-50' : ''}`} // Disable on root
                        aria-disabled={isRootLogin}
                        tabIndex={isRootLogin ? -1 : undefined}
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
              <Button type="submit" className="w-full" disabled={isLoading || isRootLogin}>
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
              Need an account?{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">
                  Register your company
              </Link>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
