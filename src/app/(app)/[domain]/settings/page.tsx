
// src/app/(app)/[domain]/settings/page.tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Settings, AlertTriangle } from "lucide-react";
import { getSessionData, isAdminFromSession } from '@/modules/auth/actions';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface SettingsPageProps {
  params: { domain: string };
}

export default async function TenantSettingsPage({ params }: SettingsPageProps) {
  const tenantDomain = params.domain;

  const session = await getSessionData();
  if (!session?.userId) {
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:9002`;
    let port = '';
    try { const url = new URL(baseUrl); if (url.port && url.port !== '80' && url.port !== '443') port = `:${url.port}`; } catch {}
    const loginUrl = `${protocol}://${params.domain}.${rootDomain}${port}/login`;
    redirect(loginUrl);
  }

  const isAdmin = await isAdminFromSession();
  if (!isAdmin) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Alert variant="destructive" className="max-w-md">
               <AlertTriangle className="h-5 w-5" />
               <AlertTitle>Unauthorized Access</AlertTitle>
               <AlertDescription>
                   You do not have permission to view this page. Please contact your administrator.
               </AlertDescription>
           </Alert>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
        <Settings className="h-6 w-6" /> Settings for {tenantDomain}
      </h1>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Company Settings</CardTitle>
            <CardDescription>Manage your company's configuration.</CardDescription>
         </CardHeader>
         <CardContent>
            <p className="text-muted-foreground">Tenant-specific settings (e.g., branding, integrations, user roles) will be managed here.</p>
            <div className="mt-4 h-60 w-full flex items-center justify-center bg-muted rounded-md">
                <p className="text-muted-foreground">Settings Placeholder</p>
             </div>
         </CardContent>
      </Card>
    </div>
  );
}
