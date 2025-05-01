import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, FileText, Calendar, BarChart2, UploadCloud } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  // Mock data - replace with actual data fetching
  const metrics = {
    totalEmployees: 125,
    openPositions: 8,
    upcomingLeaves: 5,
    pendingTasks: 3, // Example: Pending approvals, onboarding steps etc.
  };

  const quickLinks = [
    { href: '/employees/add', label: 'Add New Employee', icon: Users },
    { href: '/recruitment/create', label: 'Create Job Posting', icon: Briefcase },
    { href: '/leave/request', label: 'Request Leave', icon: Calendar },
    { href: '/smart-resume-parser', label: 'Parse Resume', icon: UploadCloud },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>

      {/* Key Metrics Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalEmployees}</div>
            <p className="text-xs text-muted-foreground">+2 since last month</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.openPositions}</div>
             <Link href="/recruitment" className="text-xs text-primary hover:underline">View jobs</Link>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Leaves</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.upcomingLeaves}</div>
             <Link href="/leave" className="text-xs text-primary hover:underline">View calendar</Link>
          </CardContent>
        </Card>
         <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.pendingTasks}</div>
             <p className="text-xs text-muted-foreground">Requires attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links Section */}
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Access common HR tasks quickly.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
                 <Button key={link.href} variant="outline" asChild className="justify-start gap-3 text-left h-auto py-3">
                     <Link href={link.href}>
                         <link.icon className="h-5 w-5 text-primary" />
                         <span className="text-sm font-medium">{link.label}</span>
                     </Link>
                 </Button>
            ))}
         </CardContent>
      </Card>

      {/* Placeholder for other dashboard sections (e.g., charts, recent activity) */}
      <div className="grid gap-6 lg:grid-cols-2">
           <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Employee Distribution</CardTitle>
                 <CardDescription>Placeholder for departmental chart.</CardDescription>
              </CardHeader>
              <CardContent>
                 {/* TODO: Add ShadCN Chart component here */}
                 <div className="h-60 w-full flex items-center justify-center bg-muted rounded-md">
                    <BarChart2 className="h-12 w-12 text-muted-foreground" />
                 </div>
              </CardContent>
           </Card>
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Placeholder for activity feed.</CardDescription>
              </CardHeader>
              <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>- John Doe requested leave.</li>
                      <li>- New hire Jane Smith onboarded.</li>
                      <li>- Payroll processed for May.</li>
                       <li>- Performance review scheduled for Alex B.</li>
                  </ul>
              </CardContent>
           </Card>
      </div>
    </div>
  );
}
