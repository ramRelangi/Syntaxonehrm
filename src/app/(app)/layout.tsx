
'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Home, Users, FileText, Briefcase, Calendar, BarChart2, LogOut, UploadCloud, Settings, Mail, UserCog } from 'lucide-react';
import Link from 'next/link';
import { logoutAction } from '@/modules/auth/actions';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import type { UserRole } from '@/modules/auth/types'; // Ensure this import path is correct

interface AppLayoutProps {
  children: React.ReactNode;
  tenantId: string | null; // Can be null if session somehow invalid or not for a tenant context
  tenantDomain: string | null; // Can be null
  userRole: UserRole | null;
  userId: string | null; // This is user_id (UUID)
  username: string | null; // Username from session
}

export default function AppLayout({ children, tenantId, tenantDomain, userRole, userId, username }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const userDisplayName = username || (userId ? `User (${userId.substring(0,4)}...)` : 'User');
  const userInitials = username ? username.substring(0, 1).toUpperCase() : (userId ? userId.substring(0,1).toUpperCase() : 'U');

  console.log(`[AppLayout] Rendering. UserRole: ${userRole}, UserID: ${userId}, Username: ${username}, TenantDomain: ${tenantDomain}, TenantId: ${tenantId}`);

  const handleLogout = async () => {
    try {
      await logoutAction(); // This action now handles redirection
      toast({ title: "Logged Out", description: "You have been successfully logged out." });
      // No explicit router.push needed here if logoutAction handles redirection
    } catch (error) {
      console.error("Logout failed:", error);
      toast({ title: "Logout Failed", description: "Could not log out. Please try again.", variant: "destructive" });
    }
  };

  // Ensure tenantDomain is available for link construction
  const safeTenantDomain = tenantDomain || 'default'; // Fallback if tenantDomain is null

  const baseNavItems = [
    { href: `/${safeTenantDomain}/dashboard`, label: 'Dashboard', icon: Home, roles: ['Admin', 'Manager', 'Employee'] },
    { href: `/${safeTenantDomain}/recruitment`, label: 'Recruitment', icon: Briefcase, roles: ['Admin', 'Manager'] },
    { href: `/${safeTenantDomain}/payroll`, label: 'Payroll', icon: FileText, roles: ['Admin', 'Manager'] },
    { href: `/${safeTenantDomain}/leave`, label: 'Leave', icon: Calendar, roles: ['Admin', 'Manager', 'Employee'] },
    { href: `/${safeTenantDomain}/documents`, label: 'Documents', icon: FileText, roles: ['Admin', 'Manager'] },
    { href: `/${safeTenantDomain}/reports`, label: 'Reports', icon: BarChart2, roles: ['Admin', 'Manager'] },
    { href: `/${safeTenantDomain}/communication`, label: 'Communication', icon: Mail, roles: ['Admin', 'Manager'] },
    { href: `/${safeTenantDomain}/smart-resume-parser`, label: 'Resume Parser', icon: UploadCloud, roles: ['Admin', 'Manager'] },
  ];

  let employeeLink;
  if (userRole === 'Employee' && userId) {
    // "My Profile" link uses the userId (which is a UUID) in the path
    employeeLink = { href: `/${safeTenantDomain}/employees/${userId}`, label: 'My Profile', icon: UserCog, roles: ['Employee'] };
  } else {
    employeeLink = { href: `/${safeTenantDomain}/employees`, label: 'Employees', icon: Users, roles: ['Admin', 'Manager'] };
  }

  const navItems = [
    ...baseNavItems.filter(item => userRole && item.roles.includes(userRole)),
  ];

  if (employeeLink && userRole && employeeLink.roles.includes(userRole)) {
      const dashboardIndex = navItems.findIndex(item => item.label === 'Dashboard');
      if (dashboardIndex !== -1) {
          navItems.splice(dashboardIndex + 1, 0, employeeLink);
      } else {
          navItems.unshift(employeeLink); // Add to beginning if dashboard isn't there (shouldn't happen for valid roles)
      }
  }

  return (
    <div className="flex min-h-svh bg-background text-foreground">
        <Sidebar
           variant="sidebar"
           collapsible={isMobile ? "offcanvas" : "icon"}
           side="left"
           className="bg-sidebar text-sidebar-foreground border-sidebar-border"
        >
            <SidebarHeader className="items-center justify-between p-4 border-b border-sidebar-border">
                 <Link href={`/${safeTenantDomain}/dashboard`} className="flex items-center gap-2 font-semibold text-lg text-sidebar-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 3v18M3 12h18"/></svg>
                 <span className="hidden group-data-[state=expanded]:inline">SyntaxHive Hrm</span>
                 </Link>
                <SidebarTrigger className="md:hidden" />
            </SidebarHeader>

            <SidebarContent className="flex-1 overflow-y-auto p-2 md:p-4">
                <SidebarMenu>
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== `/${safeTenantDomain}/dashboard` && pathname.startsWith(item.href));
                        return (
                            <SidebarMenuItem key={item.href}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={isActive}
                                    tooltip={item.label}
                                >
                                    <Link href={item.href}>
                                        <item.icon className="h-5 w-5" />
                                        <span className="truncate">{item.label}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                     })}
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-4">
                 <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                       <AvatarImage src={undefined} alt={userDisplayName} data-ai-hint="professional user avatar"/>
                       <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">{userInitials}</AvatarFallback>
                     </Avatar>
                     <div className="hidden group-data-[state=expanded]:block">
                        <p className="text-sm font-medium leading-none">{userDisplayName}</p>
                        {/* <p className="text-xs leading-none text-muted-foreground">{user.email}</p> */}
                     </div>
                 </div>
                 <SidebarMenu className="mt-4">
                      {(userRole === 'Admin' || userRole === 'Manager') && (
                        <SidebarMenuItem>
                            <SidebarMenuButton tooltip="Settings" asChild isActive={pathname.startsWith(`/${safeTenantDomain}/settings`)}>
                                <Link href={`/${safeTenantDomain}/settings`}>
                                    <Settings className="h-5 w-5"/>
                                    <span>Settings</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                      )}
                      <SidebarMenuItem>
                          <SidebarMenuButton
                             tooltip="Logout"
                             className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                             onClick={handleLogout}
                          >
                             <LogOut className="h-5 w-5"/>
                             <span>Logout</span>
                          </SidebarMenuButton>
                     </SidebarMenuItem>
                 </SidebarMenu>
            </SidebarFooter>
        </Sidebar>

        <SidebarInset className="flex-1 overflow-y-auto flex flex-col">
              <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 md:hidden">
                <SidebarTrigger />
                 <h1 className="flex-1 text-lg font-semibold">{tenantDomain || 'SyntaxHive Hrm'}</h1>
              </header>
            <main className="flex-1 p-4 md:p-6 max-w-screen-2xl mx-auto w-full">
                 {children}
            </main>
        </SidebarInset>
    </div>
  );
}
