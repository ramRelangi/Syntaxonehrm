import type { Metadata } from 'next';
import '../globals.css'; // Reuse global styles
import { Toaster } from '@/components/ui/toaster';

// Basic metadata for auth pages
export const metadata: Metadata = {
  title: 'StreamlineHR',
  description: 'Authentication',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
          {children}
          <Toaster />
      </body>
    </html>
  );
}
