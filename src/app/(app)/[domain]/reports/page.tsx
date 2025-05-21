
// src/app/(app)/[domain]/reports/page.tsx
"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { BarChart2, FileText, Settings, Download, PlusCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useParams } from "next/navigation";
// Removed unused auth imports as this page is client-side for now,
// server-side auth check would happen in layout or parent server component if needed.

const reportDataSources = [
  { value: "employees", label: "Employees" },
  { value: "leave", label: "Leave Requests" },
  { value: "recruitment", label: "Recruitment" },
];

const employeeFields = [
  { id: "name", label: "Name" },
  { id: "department", label: "Department" },
  { id: "position", label: "Position" },
  { id: "status", label: "Status" },
  { id: "hireDate", label: "Hire Date" },
];

const leaveFields = [
    { id: "employeeName", label: "Employee Name" },
    { id: "leaveTypeName", label: "Leave Type" },
    { id: "startDate", label: "Start Date" },
    { id: "endDate", label: "End Date" },
    { id: "status", label: "Status" },
];

function PreBuiltReportCard({ title, description, icon: Icon }: { title: string; description: string; icon: React.ElementType }) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </CardTitle>
         <Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" /> Generate</Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function TenantReportsPage() {
   const params = useParams();
   const tenantDomain = params.domain as string; // Get tenant domain from params
   const [selectedDataSource, setSelectedDataSource] = React.useState<string | null>(null);
   const [selectedFields, setSelectedFields] = React.useState<string[]>([]);

  const availableFields = React.useMemo(() => {
    if (selectedDataSource === "employees") return employeeFields;
    if (selectedDataSource === "leave") return leaveFields;
    return [];
  }, [selectedDataSource]);

  const handleFieldChange = (fieldId: string, checked: boolean | string) => {
    setSelectedFields(prev =>
      checked ? [...prev, fieldId] : prev.filter(id => id !== fieldId)
    );
  };

   const handleGenerateReport = () => {
    console.log("Generating report with:", { dataSource: selectedDataSource, fields: selectedFields });
    alert("Report generation logic not implemented yet.");
  };

  if (!tenantDomain) {
       return <div>Error: Could not determine tenant context.</div>;
   }


  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
        <BarChart2 className="h-6 w-6" /> Reporting & Analytics for {tenantDomain}
      </h1>

      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle>Pre-built Reports</CardTitle>
            <CardDescription>Quickly generate commonly used HR reports.</CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
           <PreBuiltReportCard title="Headcount Report" description="Current number of employees by department and status." icon={FileText} />
           <PreBuiltReportCard title="Turnover Analysis" description="Analyze employee turnover rates over a selected period." icon={FileText} />
           <PreBuiltReportCard title="Leave Balance Overview" description="View current leave balances for all employees." icon={FileText} />
         </CardContent>
      </Card>

      <Separator />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Custom Report Builder</CardTitle>
          <CardDescription>Create your own reports by selecting data sources and fields.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="space-y-2">
              <Label htmlFor="dataSource" className="font-semibold">1. Select Data Source</Label>
              <Select onValueChange={(value) => { setSelectedDataSource(value); setSelectedFields([]); }} value={selectedDataSource ?? ""}>
                <SelectTrigger id="dataSource" className="w-full md:w-[300px]">
                  <SelectValue placeholder="Choose data to report on..." />
                </SelectTrigger>
                <SelectContent>
                  {reportDataSources.map(source => (
                    <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
           </div>

           {selectedDataSource && (
             <div className="space-y-2">
                <Label className="font-semibold">2. Select Fields</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 border rounded-md bg-muted/50">
                  {availableFields.length > 0 ? availableFields.map(field => (
                    <div key={field.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`field-${field.id}`}
                        checked={selectedFields.includes(field.id)}
                        onCheckedChange={(checked) => handleFieldChange(field.id, checked)}
                      />
                      <Label htmlFor={`field-${field.id}`} className="text-sm font-normal cursor-pointer">
                        {field.label}
                      </Label>
                    </div>
                  )) : <p className="text-sm text-muted-foreground italic col-span-full">No fields available for this source yet.</p>}
                </div>
             </div>
           )}

           {selectedDataSource && selectedFields.length > 0 && (
             <div className="space-y-2">
                <Label className="font-semibold">3. Filters & Grouping (Optional)</Label>
                 <div className="p-4 border rounded-md space-y-4 bg-muted/50">
                    <p className="text-sm text-muted-foreground italic">Advanced filtering, grouping, and sorting options will be available here.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                        <Select disabled><SelectTrigger className="flex-1"><SelectValue placeholder="Filter Field..." /></SelectTrigger></Select>
                        <Select disabled><SelectTrigger className="flex-1"><SelectValue placeholder="Operator..." /></SelectTrigger></Select>
                        <Input disabled placeholder="Value..." className="flex-1"/>
                         <Button variant="ghost" size="sm" disabled><PlusCircle className="h-4 w-4" /></Button>
                    </div>
                 </div>
             </div>
           )}


            {selectedDataSource && selectedFields.length > 0 && (
                <div className="flex justify-end pt-4">
                    <Button onClick={handleGenerateReport} disabled={!selectedDataSource || selectedFields.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Generate Report
                    </Button>
                </div>
            )}

        </CardContent>
      </Card>
    </div>
  );
}
