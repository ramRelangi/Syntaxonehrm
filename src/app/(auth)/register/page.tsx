"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
// import { z } from 'zod'; // Zod schema is now in auth/types
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { registrationSchema, type RegistrationFormData } from '@/modules/auth/types'; // Correct import
import { registerTenantAction } from '@/modules/auth/actions'; // Correct import

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  console.log("Rendering RegisterPage component"); // Debug log

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      companyName: "",
      companyDomain: "",
      adminName: "", // Added admin name
      adminEmail: "",
      adminPassword: "",
    },
  });

  const onSubmit: SubmitHandler<RegistrationFormData> = async (data) => {
    setIsLoading(true);
    console.log("Registration form submitted with data:", data); // Debug log

    try {
        // Call the server action
        const result = await registerTenantAction(data);
        console.log("Server action result:", result); // Debug log

        if (result.success && result.tenant) {
             toast({
                title: "Registration Successful",
                description: `Company "${result.tenant.name}" created. Please login.`,
                className: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900 dark:text-green-100 dark:border-green-700",
             });
             router.push('/login'); // Redirect to login page
             // No need to setIsLoading(false) as we navigate away
        } else {
            const errorMessage = result.errors?.[0]?.message || 'Registration failed. Please try again.';
            console.error("Registration failed:", errorMessage, result.errors); // Debug log
            toast({
                title: "Registration Failed",
                description: errorMessage,
                variant: "destructive",
            });
            setIsLoading(false);
            // Set specific field errors if available from action
            if (result.errors?.some(e => e.path?.includes('companyDomain'))) {
                form.setError("companyDomain", { type: 'server', message: errorMessage });
            } else if (result.errors?.some(e => e.path?.includes('adminEmail'))) {
                form.setError("adminEmail", { type: 'server', message: errorMessage });
            } else {
                 form.setError("root.serverError", { type: 'server', message: errorMessage });
            }
        }
    } catch (error) {
        console.error("Unexpected error during registration submission:", error); // Debug log
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Register for StreamlineHR</CardTitle>
          <CardDescription>Create your company account and admin user</CardDescription>
        </CardHeader>
        <CardContent>
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
                name="companyDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Choose Your Domain</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                         <Input placeholder="your-company" {...field} className="rounded-r-none lowercase" />
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
                name="adminEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Email (Admin)</FormLabel>
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
