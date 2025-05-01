import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function LeavePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Leave Management</h1>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary"/> Leave Overview</CardTitle>
            <CardDescription>Manage leave requests, track balances, and view the company calendar.</CardDescription>
         </CardHeader>
         <CardContent>
            <p className="text-muted-foreground">Leave request forms, approval workflows, balance tracking, and a team leave calendar will be implemented here.</p>
             {/* Placeholder for future calendar/list */}
             <div className="mt-4 h-60 w-full flex items-center justify-center bg-muted rounded-md">
                <p className="text-muted-foreground">Leave Calendar / Request List Placeholder</p>
             </div>
         </CardContent>
      </Card>
    </div>
  );
}
