
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

// Combined schema for domain selection + login
const domainLoginSchema = z.object({
  companyDomain: z.string().min(1, "Company domain is required").regex(/^[a-zA-Z0-9-]+$/, "Invalid domain format"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type DomainLoginFormInputs = z.infer<typeof domainLoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<DomainLoginFormInputs>({
    resolver: zodResolver(domainLoginSchema),
    defaultValues: {
      companyDomain: "",
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<DomainLoginFormInputs> = async (data) => {
    setIsLoading(true);
    const { companyDomain, email, password } = data;
    console.log("Login attempt for domain:", companyDomain, "with email:", email);

    // --- TODO: Real Authentication Logic ---
    // 1. Send companyDomain, email, password to your backend API (e.g., /api/auth/login)
    // 2. Backend verifies tenant domain, finds user, checks password hash.
    // 3. Backend sets a session cookie (e.g., using httpOnly cookie).
    // 4. Backend returns success/error.

    // --- Mock Authentication Logic ---
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (email.includes('fail')) {
      toast({
        title: "Login Failed",
        description: "Invalid credentials or domain. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    } else {
      toast({
        title: "Login Successful",
        description: "Welcome back!",
        variant: "default",
      });
      // Redirect to the tenant-specific dashboard (using middleware rewrite)
      // The browser URL will remain subdomain.domain.com/dashboard
      // The internal Next.js route is /<domain>/dashboard
      router.push('/dashboard'); // The middleware will handle the rewrite
      // No need to setIsLoading(false) here as we are navigating away
    }
    // --- End Mock Logic ---
  };

  const watchedDomain = form.watch("companyDomain");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login to StreamlineHR</CardTitle>
          <CardDescription>Enter your company domain and credentials</CardDescription>
        </CardHeader>
        <CardContent>
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
                          .{process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'streamlinehr.app'}
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      {/* Update forgot password link to include domain */}
                      <Link
                        href={watchedDomain ? `/forgot-password/${watchedDomain}` : '#'}
                        className={`text-sm font-medium text-primary hover:underline ${!watchedDomain ? 'opacity-50 pointer-events-none' : ''}`}
                        aria-disabled={!watchedDomain}
                        tabIndex={!watchedDomain ? -1 : undefined}
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
