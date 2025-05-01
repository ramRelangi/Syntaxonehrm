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

const registerSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyDomain: z.string().min(1, "Company domain is required").regex(/^[a-zA-Z0-9-]+$/, "Domain can only contain letters, numbers, and hyphens"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterFormInputs = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RegisterFormInputs>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: "",
      companyDomain: "",
      email: "",
      password: "",
    },
  });

  const onSubmit: SubmitHandler<RegisterFormInputs> = async (data) => {
    setIsLoading(true);
    console.log("Registration data:", data);
    // --- Mock Registration Logic ---
    // In a real app, you'd call your backend API here to register the company and user
    // e.g., const response = await fetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
    // Handle potential errors like duplicate domain/email
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate success or failure
    if (data.companyDomain === 'fail-domain') {
       toast({
        title: "Registration Failed",
        description: "Company domain is already taken.",
        variant: "destructive",
      });
      setIsLoading(false);
    } else {
      toast({
        title: "Registration Successful",
        description: "Your company account has been created. Please login.",
         // Use the green accent color for success
        className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700", // Direct Tailwind for accent color example
      });
      // Redirect to login page after successful registration
      router.push('/login');
       // No need to setIsLoading(false) here as we are navigating away
    }
    // --- End Mock Logic ---
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Register for StreamlineHR</CardTitle>
          <CardDescription>Create your company account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                name="companyDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Choose Your Domain</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                         <Input placeholder="your-company" {...field} className="rounded-r-none" />
                         <span className="inline-flex items-center rounded-r-md border border-l-0 border-input bg-secondary px-3 text-sm text-muted-foreground">
                            .streamlinehr.app
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
                    <FormLabel>Your Email (Admin)</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" {...field} type="email" />
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
