
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, MapPin, Calendar, DollarSign, ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { format, parseISO } from 'date-fns';
import type { JobPosting } from "@/modules/recruitment/types";
import { notFound } from 'next/navigation';

interface Params {
  params: { id: string };
}

// Helper to fetch data from API routes - SERVER SIDE VERSION
async function fetchData<T>(url: string, options?: RequestInit): Promise<T | undefined> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
    const formattedUrl = url.startsWith('/') ? url.substring(1) : url;
    const fullUrl = `${baseUrl.replace(/\/$/, '')}/${formattedUrl}`;

    try {
        const response = await fetch(fullUrl, { cache: 'no-store', ...options });
        if (response.status === 404) {
            return undefined; // Explicitly return undefined for 404
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Public detail fetch error for ${fullUrl}: ${errorText}`);
            throw new Error(`Failed to fetch job posting details. Status: ${response.status}`);
        }
        return await response.json() as T;
    } catch (error) {
        console.error(`Error fetching ${fullUrl}:`, error);
        if (error instanceof Error) {
           throw new Error(`Failed to fetch ${fullUrl}: ${error.message}`);
        } else {
            throw new Error(`Failed to fetch ${fullUrl}: An unknown error occurred.`);
        }
    }
}

// Helper to format date or return 'N/A'
const formatDateSafe = (dateString?: string): string => {
  if (!dateString) return 'N/A';
  try {
    return format(parseISO(dateString), 'MMMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
};

export async function generateMetadata({ params }: Params) {
    const job = await fetchData<JobPosting>(`/api/recruitment/postings/${params.id}`);
    if (!job) {
        return { title: 'Job Not Found' };
    }
    return {
        title: `${job.title} - Careers`,
        description: job.description.substring(0, 160) + '...', // Use first part of description
    };
}


export default async function JobDetailPage({ params }: Params) {
  const job = await fetchData<JobPosting>(`/api/recruitment/postings/${params.id}`);

  if (!job) {
    notFound(); // Trigger Next.js 404 page
  }

  // Optionally, filter out jobs that aren't 'Open' on the public site
   if (job.status !== 'Open') {
     notFound(); // Or show a specific message like "This position is no longer available."
   }


  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
          <Button variant="outline" size="sm" asChild>
             <Link href="/jobs">
               <ArrowLeft className="mr-2 h-4 w-4" /> Back to Careers
             </Link>
          </Button>
       </div>

       <Card className="shadow-lg">
         <CardHeader>
           <div className="flex justify-between items-start gap-4 mb-2">
               <CardTitle className="text-2xl md:text-3xl">{job.title}</CardTitle>
               <Badge variant="secondary" className="shrink-0 mt-1">{job.location}</Badge>
           </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                 <span className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> {job.department}</span>
                 {job.salaryRange && <span className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> {job.salaryRange}</span>}
                 <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Posted: {formatDateSafe(job.datePosted)}</span>
                 {job.closingDate && <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Closes: {formatDateSafe(job.closingDate)}</span>}
            </div>
         </CardHeader>
         <CardContent className="space-y-6">
            {/* Render description with whitespace preservation */}
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
               {job.description}
            </div>

            {/* Application Button/Link */}
            <div className="pt-6 border-t">
                {/* TODO: Replace '#' with the actual application link or system */}
                <Button size="lg" asChild className="w-full sm:w-auto">
                    <a href="#" target="_blank" rel="noopener noreferrer">
                       Apply Now <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">Click "Apply Now" to submit your application through our external portal.</p>
            </div>
         </CardContent>
       </Card>
    </div>
  );
}
