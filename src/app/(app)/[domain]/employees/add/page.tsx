
"use client";

import * as React from "react";
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmployeeForm } from '@/modules/employees/components/employee-form';
import { UserPlus, Loader2, AlertTriangle } from "lucide-react";
import type { UserRole } from '@/modules/auth/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AddEmployeePageProps {
  // Params are accessed via hook
}

export default function TenantAddEmployeePage() {
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [currentUserRole, setCurrentUserRole] = React.useState<UserRole | null>(null);
  const [isLoadingRole, setIsLoadingRole] = React.useState(true);
  const [roleError, setRoleError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchUserRole = async () => {
      setIsLoadingRole(true);
      setRoleError(null);
      console.log("[Add Employee Page] Fetching user role...");
      try {
        const sessionResponse = await fetch('/api/auth/session');
        if (sessionResponse.ok) {
          const session = await sessionResponse.json();
          console.log("[Add Employee Page] Session details fetched:", session);
          setCurrentUserRole(session.userRole);
        } else {
          const errorData = await sessionResponse.json().catch(() => ({}));
          const errorMessage = errorData.error || errorData.message || "Could not verify user session for role check.";
          console.error("[Add Employee Page] Failed to fetch session details. Status:", sessionResponse.status, "Error:", errorMessage);
          setRoleError(errorMessage);
          setCurrentUserRole(null);
        }
      } catch (err: any) {
        console.error("[Add Employee Page] Error in fetchUserRole:", err);
        setRoleError("Error fetching session details: " + err.message);
        setCurrentUserRole(null);
      } finally {
        setIsLoadingRole(false);
      }
    };
    if (tenantDomain) {
      fetchUserRole();
    } else {
      setRoleError("Tenant domain not found in parameters.");
      setIsLoadingRole(false);
    }
  }, [tenantDomain]);

  if (!tenantDomain) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Configuration Error</AlertTitle>
          <AlertDescription>Could not determine tenant context.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoadingRole) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading user permissions...</p>
      </div>
    );
  }

  if (roleError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Permission Error</AlertTitle>
          <AlertDescription>{roleError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (currentUserRole !== 'Admin' && currentUserRole !== 'Manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Unauthorized Access</AlertTitle>
          <AlertDescription>You do not have permission to add new employees.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          <UserPlus className="h-6 w-6" /> Add New Employee
        </h1>
      </div>
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Employee Details</CardTitle>
          <CardDescription>Fill in the details for the new employee for {tenantDomain}.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeForm
            formTitle="Add New Employee"
            formDescription="Enter the employee's information below."
            submitButtonText="Add Employee"
            tenantDomain={tenantDomain}
            currentUserRole={currentUserRole}
          />
        </CardContent>
      </Card>
    </div>
  );
}
