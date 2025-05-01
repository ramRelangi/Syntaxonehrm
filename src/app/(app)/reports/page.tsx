import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reporting & Analytics</h1>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5 text-primary"/> HR Reports</CardTitle>
            <CardDescription>Generate standard and custom reports on various HR metrics.</CardDescription>
         </CardHeader>
         <CardContent>
            <p className="text-muted-foreground">Pre-built report templates (headcount, turnover, diversity, etc.) and a custom report builder will be implemented here.</p>
             {/* Placeholder for future report list/builder */}
             <div className="mt-4 h-60 w-full flex items-center justify-center bg-muted rounded-md">
                <p className="text-muted-foreground">Report Builder / List Placeholder</p>
             </div>
         </CardContent>
      </Card>
    </div>
  );
}
