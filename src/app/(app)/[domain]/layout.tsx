
// src/app/(app)/[domain]/layout.tsx

// This layout simply passes children through, as the main AppLayout handles the sidebar etc.
// The primary purpose is to establish the [domain] segment in the route structure.

import * as React from 'react';

export default function TenantAppLayout({ children }: { children: React.ReactNode }) {
  // You could potentially fetch tenant-specific layout data here if needed,
  // but keep it minimal to avoid conflicts with the main AppLayout.
  // The AppLayout itself can fetch user/tenant data based on session.
  return <>{children}</>;
}
