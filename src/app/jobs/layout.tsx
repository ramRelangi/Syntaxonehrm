
import type { Metadata } from 'next';
import '../globals.css'; // Reuse global styles
import { Toaster } from '@/components/ui/toaster'; // Might be useful for potential future interactions

// Basic metadata for the public page
export const metadata: Metadata = {
  title: 'Careers - SyntaxHive Hrm', // Adjust title as needed
  description: 'View open positions and apply to join our team.',
};

export default function PublicJobBoardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
           {/* Simple Header */}
            <header className="border-b sticky top-0 bg-card z-10">
                {/* Responsive container */}
                <nav className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                     <a href="/" className="flex items-center gap-2 font-semibold text-lg text-primary">
                         {/* Re-use placeholder logo or add company logo */}
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M12 3v18M3 12h18"/></svg>
                         <span className="">SyntaxHive Hrm Careers</span> {/* Or Company Name */}
                     </a>
                     {/* Optional: Add link back to main company site */}
                     {/* <a href="https://yourcompany.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline hidden sm:block">Company Site</a> */}
                </nav>
            </header>

            {/* Main Content Area with responsive padding */}
            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
                 {children}
            </main>

            {/* Simple Footer */}
            <footer className="border-t mt-12 py-6 text-center text-sm text-muted-foreground">
                © {new Date().getFullYear()} SyntaxHive Hrm. All rights reserved. {/* Adjust company name */}
            </footer>

            <Toaster />
      </body>
    </html>
  );
}
