
import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect users from the root path to the register page
  redirect('/register');
}
