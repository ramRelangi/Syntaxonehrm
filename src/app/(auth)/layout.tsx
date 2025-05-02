import type { Metadata } from 'next';
import '../globals.css'; // Reuse global styles
import { Toaster } from '@/components/ui/toaster';

// Basic metadata for auth pages
export const metadata: Metadata = {
  title: 'SyntaxHive Hrm',
  description: 'Authentication',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Removed bg-background text-foreground as they are applied globally */}
      <body className="antialiased">
          {children}
          <Toaster />
      </body>
    </html>
  );
}
