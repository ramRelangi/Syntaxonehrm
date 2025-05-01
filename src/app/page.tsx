import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect users from the root path to the dashboard
  // In a real app, you might redirect to login if not authenticated
  redirect('/dashboard');
}
