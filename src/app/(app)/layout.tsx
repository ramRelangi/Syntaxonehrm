
'use client'; // Add 'use client' directive

import * as React from 'react';
import { usePathname } from 'next/navigation'; // Import usePathname
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
import { Home, Users, FileText, Briefcase, Calendar, BarChart2, LogOut, UploadCloud, Settings } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// Mock user data - replace with actual session/auth data
const user = {
  name: 'Admin User',
  email: 'admin@company.com',
  initials: 'AU',
  avatarUrl: '', // Optional: 'https://github.com/shadcn.png'
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
  { href: '/smart-resume-parser', label: 'Resume Parser', icon: UploadCloud },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); // Get current path

  return (
    <div className="flex min-h-screen">
        {/* SidebarProvider is now in RootLayout */}
        <Sidebar
           variant="sidebar" // Choose variant: 'sidebar', 'floating', 'inset'
           collapsible="icon" // Choose collapsible: 'offcanvas', 'icon', 'none'
           side="left"
        >
            <SidebarHeader className="items-center justify-between p-4">
                <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg text-primary">
                 {/* Placeholder Logo - Replace with actual logo */}
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 3v18M3 12h18"/></svg> {/* Simple cross as placeholder */}
                 <span className="hidden group-data-[state=expanded]:inline">StreamlineHR</span>
                </Link>
                <SidebarTrigger className="hidden md:flex" />
            </SidebarHeader>

            <SidebarContent className="flex-1 overflow-y-auto p-4">
                <SidebarMenu>
                    {navItems.map((item) => (
                        <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                                asChild
                                isActive={pathname.startsWith(item.href) && (item.href !== '/dashboard' || pathname === '/dashboard')} // Check startsWith for active state, special case dashboard
                                tooltip={item.label} // Tooltip shown when collapsed
                            >
                                <Link href={item.href}>
                                    <item.icon className="h-5 w-5" />
                                    <span className="truncate">{item.label}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
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
                         {/* Ideally link to a settings page */}
                         <SidebarMenuButton tooltip="Settings">
                            <Settings className="h-5 w-5"/>
                            <span>Settings</span>
                         </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                         {/* In real app, this button would trigger logout logic */}
                          <SidebarMenuButton tooltip="Logout" className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20">
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
                 <h1 className="flex-1 text-lg font-semibold">StreamlineHR</h1>
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

    