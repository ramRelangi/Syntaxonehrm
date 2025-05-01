import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react"; // Reusing FileText, consider Folder icon if available

export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Document Center</h1>
      <Card className="shadow-sm">
         <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary"/> Company Documents</CardTitle>
            <CardDescription>Store and manage company policies, employee documents, and templates.</CardDescription>
         </CardHeader>
         <CardContent>
            <p className="text-muted-foreground">Document uploading, categorization, search, access control, and version history features will be implemented here.</p>
            {/* Placeholder for future document list/grid */}
             <div className="mt-4 h-60 w-full flex items-center justify-center bg-muted rounded-md">
                <p className="text-muted-foreground">Document Repository Placeholder</p>
             </div>
         </CardContent>
      </Card>
    </div>
  );
}
