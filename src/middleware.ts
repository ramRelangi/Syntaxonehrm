
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/login', '/register', '/forgot-password', '/jobs']; // '/' removed, handled separately

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';

  // Normalize hostname (remove port for local development)
  const normalizedHostname = hostname.split(':')[0];
  console.log(`[Middleware] Request URL: ${request.url}, Hostname: ${normalizedHostname}, Path: ${url.pathname}`);

  // --- Static Assets and Next.js Internals ---
  // Allow all requests for Next.js internal files, static assets, and API routes not needing tenant context
   if (
     url.pathname.startsWith('/_next') ||
     url.pathname.startsWith('/api/') || // Allow all API routes (they should handle their own auth/tenant logic)
     url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2)$/) // Allow common static file extensions
    ) {
     console.log(`[Middleware] Allowing internal/static/API access to: ${url.pathname}`);
     return NextResponse.next();
   }

  // --- Root Domain Handling ---
  if (normalizedHostname === ROOT_DOMAIN || IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`))) {
     console.log(`[Middleware] Handling root domain request for: ${url.pathname}`);

     // Special case: If root '/' is requested, redirect to '/register' (as per new requirement)
     if (url.pathname === '/') {
         console.log('[Middleware] Redirecting root / to /register');
         url.pathname = '/register';
         return NextResponse.redirect(url);
     }

     // Allow access to defined public paths on the root domain
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => {
        // Exact match for /login, /register, etc., or startsWith for /jobs/..., /forgot-password/...
        return url.pathname === path || url.pathname.startsWith(path + '/');
     });

     if (isPublicRootPath) {
        console.log(`[Middleware] Allowing public root path access: ${url.pathname}`);
        return NextResponse.next(); // Allow access to /login, /register, /jobs/* etc.
     }

     // For any other path on the root domain, redirect to register (new default)
     console.log(`[Middleware] Path "${url.pathname}" on root domain is not public. Redirecting to /register.`);
     url.pathname = '/register';
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
  // If hostname doesn't match root or a valid subdomain structure, redirect to root registration.
  console.log(`[Middleware] Unknown hostname or structure: ${hostname}. Redirecting to root /register.`);
  const registerUrl = request.nextUrl.clone();
  const port = registerUrl.port ? `:${registerUrl.port}` : '';
  registerUrl.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:'; // Ensure correct protocol
  registerUrl.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
  registerUrl.pathname = '/register';
  registerUrl.search = ''; // Clear query params
  return NextResponse.redirect(registerUrl);
}

export const config = {
  // Matcher includes all paths EXCEPT the ones explicitly excluded below
   matcher: [
     // Exclude static files, images, API routes, and Next.js internals
     '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
   ],
};
