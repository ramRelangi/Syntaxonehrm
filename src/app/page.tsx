
import { redirect } from 'next/navigation';

// This page component ensures that accessing the root domain's root path '/'
// redirects to the registration page. The middleware handles subdomain routing.
export default function RootPage() {
  redirect('/register');
}
