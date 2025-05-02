
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'streamlinehr.app'; // Replace with your actual root domain

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';

  // Normalize hostname (remove port for local development)
  const normalizedHostname = hostname.split(':')[0];
  console.log(`[Middleware] Request URL: ${request.url}, Hostname: ${normalizedHostname}`);

  // Check if the request is for the root domain or an ignored subdomain
  if (normalizedHostname === ROOT_DOMAIN || IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`))) {
    // Allow access to specific public paths on the root domain
    const publicRootPaths = ['/register', '/jobs', '/api/recruitment/postings']; // Add /api/recruitment/postings
    const isPublicRootPath = publicRootPaths.some(path => url.pathname.startsWith(path));

    if (isPublicRootPath || url.pathname.startsWith('/_next') || url.pathname.startsWith('/favicon.ico') || url.pathname.startsWith('/api/auth/')) {
      console.log(`[Middleware] Allowing public root access to: ${url.pathname}`);
      return NextResponse.next();
    }

    // If accessing the root path or other non-public paths on root, redirect to registration
    if (url.pathname === '/') {
      console.log('[Middleware] Redirecting root access / to /register');
      url.pathname = '/register';
      return NextResponse.redirect(url);
    }
    // For other paths on root domain, potentially show a generic page or redirect to register
    // console.log(`[Middleware] Blocking non-public root access to: ${url.pathname}, redirecting to /register`);
    // url.pathname = '/register';
    // return NextResponse.redirect(url);
    console.log(`[Middleware] Allowing non-specific root path access (e.g., static assets): ${url.pathname}`);
    return NextResponse.next(); // Allow other requests like static assets
  }

  // Extract potential subdomain
  const subdomainMatch = normalizedHostname.match(`^(.*)\\.${ROOT_DOMAIN}$`);
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  console.log(`[Middleware] Extracted subdomain: ${subdomain}`);

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    // Subdomain detected, rewrite URL to include subdomain context
    // Example: Rewrite `subdomain.domain.com/dashboard` to `domain.com/[subdomain]/dashboard`
    const originalPath = url.pathname;
    url.pathname = `/${subdomain}${originalPath}`;
    console.log(`[Middleware] Rewriting ${normalizedHostname}${originalPath} to ${url.pathname}`);
    return NextResponse.rewrite(url);
  }

  // If no specific handling, allow the request but log it
  console.log(`[Middleware] No specific handling for ${normalizedHostname}${url.pathname}, passing through.`);
  return NextResponse.next();
}

export const config = {
  // Matcher ignoring `/_next/` and `/api/` paths for static assets and API routes handled elsewhere
  // Also ignore specific static files like favicon.ico
  matcher: [
    '/((?!api/auth/register|api/communication/|api/genkit/|_next/static|_next/image|favicon.ico).*)', // Adjusted matcher
  ],
};
