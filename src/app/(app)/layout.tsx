
'use client'; // Add 'use client' directive

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation'; // Import usePathname and useRouter
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider, // Conceptually here, but RootLayout handles provider
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Home, Users, FileText, Briefcase, Calendar, BarChart2, LogOut, UploadCloud, Settings, Mail } from 'lucide-react'; // Added Mail icon
import Link from 'next/link';
import Image from 'next/image';
import { logoutAction } from '@/modules/auth/actions'; // Import the logout action
import { useToast } from '@/hooks/use-toast'; // Import useToast for feedback

// TODO: Replace Mock user data with actual session/auth data from a context or hook
// This data should include the tenant's domain or ID.
const user = {
  name: 'Admin User', // Fetch from session
  email: 'admin@company.com', // Fetch from session
  initials: 'AU', // Generate from name
  avatarUrl: '', // Optional: Fetch from session or profile
  tenantDomain: 'demo', // IMPORTANT: Fetch this from session
};

// Define navigation items
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/recruitment', label: 'Recruitment', icon: Briefcase },
  { href: '/payroll', label: 'Payroll', icon: FileText }, // Using FileText for Payroll
  { href: '/leave', label: 'Leave', icon: Calendar }, // Added Leave
  { href: '/documents', label: 'Documents', icon: FileText }, // Using FileText for Documents
  { href: '/reports', label: 'Reports', icon: BarChart2 }, // Added Reports
  { href: '/communication', label: 'Communication', icon: Mail }, // Added Communication
  { href: '/smart-resume-parser', label: 'Resume Parser', icon: UploadCloud },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); // Get current path relative to the tenant rewrite (e.g., /dashboard)
  const router = useRouter();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await logoutAction(); // The action now handles the redirect to the correct domain login
       toast({ title: "Logged Out", description: "You have been successfully logged out." });
       // Redirect might happen server-side in action, but client-side refresh can help.
       // router.push('/login'); // Not needed if action redirects correctly
       // router.refresh(); // Potentially refresh to ensure state is cleared
    } catch (error) {
       console.error("Logout failed:", error);
       toast({ title: "Logout Failed", description: "Could not log out. Please try again.", variant: "destructive" });
    }
  };


  return (
    <div className="flex min-h-screen">
        {/* SidebarProvider is now in RootLayout */}
        <Sidebar
           variant="sidebar" // Choose variant: 'sidebar', 'floating', 'inset'
           collapsible="icon" // Choose collapsible: 'offcanvas', 'icon', 'none'
           side="left"
        >
            <SidebarHeader className="items-center justify-between p-4">
                 {/* Link to tenant dashboard */}
                 <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg text-primary">
                 {/* Placeholder Logo - Replace with actual logo */}
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 3v18M3 12h18"/></svg> {/* Simple cross as placeholder */}
                 <span className="hidden group-data-[state=expanded]:inline">SyntaxHive Hrm</span>
                 </Link>
                <SidebarTrigger className="hidden md:flex" />
            </SidebarHeader>

            <SidebarContent className="flex-1 overflow-y-auto p-4">
                <SidebarMenu>
                    {navItems.map((item) => {
                        // Check if the current tenant-relative path starts with the item's href
                        const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/dashboard');
                        return (
                            <SidebarMenuItem key={item.href}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={isActive}
                                    tooltip={item.label} // Tooltip shown when collapsed
                                >
                                    {/* Links are tenant-relative, middleware handles rewrite */}
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

            <SidebarFooter className="border-t p-4">
                 {/* User profile section */}
                 <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                       <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="professional user avatar" />
                       <AvatarFallback>{user.initials}</AvatarFallback>
                     </Avatar>
                     <div className="hidden group-data-[state=expanded]:block">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                     </div>
                 </div>
                 {/* Separator can be added if needed */}
                 {/* <SidebarSeparator /> */}
                 <SidebarMenu className="mt-4">
                      <SidebarMenuItem>
                         {/* Link to tenant settings page */}
                         <SidebarMenuButton tooltip="Settings" asChild>
                             <Link href="/settings"> {/* Tenant-relative settings path */}
                                <Settings className="h-5 w-5"/>
                                <span>Settings</span>
                            </Link>
                         </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                          {/* Attach the handleLogout function to onClick */}
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

        <SidebarInset className="flex-1 overflow-auto">
            {/* Mobile Header (optional, can be part of page content) */}
             <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 md:hidden">
                <SidebarTrigger />
                 {/* Potentially show tenant name here */}
                 <h1 className="flex-1 text-lg font-semibold">{user.tenantDomain || 'SyntaxHive Hrm'}</h1>
                {/* Add mobile-specific header items if needed */}
             </header>

            {/* Main Content Area */}
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 {children}
            </main>
        </SidebarInset>
    </div>
  );
}
