
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/login', '/register', '/forgot-password', '/jobs']; // '/' handled separately

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';

  // Normalize hostname (remove port for local development)
  const normalizedHostname = hostname.split(':')[0];
  console.log(`[Middleware] Request URL: ${request.url}, Hostname: ${normalizedHostname}, Path: ${url.pathname}`);

  // --- Static Assets and Next.js Internals ---
  // Allow all requests for Next.js internal files, static assets, and API routes
   if (
     url.pathname.startsWith('/_next') ||
     url.pathname.startsWith('/api/') || // Allow all API routes (they should handle their own auth/tenant logic)
     url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2)$/) // Allow common static file extensions
    ) {
     console.log(`[Middleware] Allowing internal/static/API access to: ${url.pathname}`);
     return NextResponse.next();
   }

   // Determine if the request is for the root domain (or equivalent like localhost/IP in dev)
   const isRootDomainRequest =
       normalizedHostname === ROOT_DOMAIN ||
       normalizedHostname === 'localhost' ||
       normalizedHostname === '127.0.0.1' ||
       // Add a check for typical local network IPs if needed, though this can be broad
       normalizedHostname.match(/^192\.168\.\d+\.\d+$/) ||
       normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) ||
       normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/);


  // --- Root Domain Handling (including localhost/IPs for dev) ---
  if (isRootDomainRequest || IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`))) {
     console.log(`[Middleware] Handling root domain equivalent request for: ${url.pathname}`);

     // Special case: If root '/' is requested, allow access (redirect handled by page.tsx)
     if (url.pathname === '/') {
         console.log('[Middleware] Allowing root / access (redirect to /login handled by page).');
         return NextResponse.next();
     }

     // Allow access to defined public paths on the root domain/IP
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => {
        // Exact match or startsWith for nested public routes
        return url.pathname === path || url.pathname.startsWith(path + '/');
     });

     if (isPublicRootPath) {
        console.log(`[Middleware] Allowing public root path access: ${url.pathname}`);
        return NextResponse.next(); // Allow access to /login, /register, /jobs/* etc.
     }

     // For any other path on the root domain/IP, redirect to login (as per current setup)
     console.log(`[Middleware] Path "${url.pathname}" on root equivalent domain is not public. Redirecting to /login.`);
     url.pathname = '/login';
     return NextResponse.redirect(url);
  }

  // --- Subdomain Handling ---
  const subdomainMatch = normalizedHostname.match(`^(.*)\\.${ROOT_DOMAIN}$`);
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  console.log(`[Middleware] Extracted subdomain: ${subdomain}`);

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    // Subdomain detected
    // Add X-Tenant-Domain header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Domain', subdomain);

    // Rewrite URL to include subdomain context for application routes
    // Example: Rewrite `subdomain.domain.com/dashboard` to `domain.com/<subdomain>/dashboard`
    const originalPath = url.pathname;
    url.pathname = `/${subdomain}${originalPath}`;
    console.log(`[Middleware] Rewriting ${hostname}${originalPath} to internal path ${url.pathname}`);
    return NextResponse.rewrite(url, {
       request: {
          headers: requestHeaders,
        },
     });
  }

  // --- Fallback for Unknown Hostnames ---
  // If hostname doesn't match root, known dev IPs, or a valid subdomain structure, redirect to root login.
  console.log(`[Middleware] Unknown hostname or structure: ${hostname}. Redirecting to root /login.`);
  const loginUrl = request.nextUrl.clone();
  const port = loginUrl.port ? `:${loginUrl.port}` : '';
  loginUrl.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:'; // Ensure correct protocol
  loginUrl.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
  loginUrl.pathname = '/login';
  loginUrl.search = ''; // Clear query params
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Matcher includes all paths EXCEPT the ones explicitly excluded below
   matcher: [
     // Exclude static files, images, API routes, and Next.js internals
     '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
   ],
};
