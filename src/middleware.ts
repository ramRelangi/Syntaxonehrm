
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/login', '/register', '/forgot-password', '/jobs'];

// Paths within the tenant application context (used for rewriting)
// Ensure ALL tenant-specific modules are listed here.
const TENANT_APP_PATHS = [
    '/dashboard',
    '/employees',
    '/recruitment',
    '/payroll',
    '/leave',
    '/documents',
    '/reports',
    '/communication',
    '/smart-resume-parser',
    '/settings'
];


export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';

  // Normalize hostname (remove port for local development)
  const normalizedHostname = hostname.split(':')[0];
  console.log(`[Middleware] Request URL: ${request.url}, Hostname: ${normalizedHostname}, Path: ${url.pathname}`);

  // --- Static Assets and Next.js Internals ---
  if (
     url.pathname.startsWith('/_next') ||
     url.pathname.startsWith('/api/') || // Allow all API routes
     url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2|ttf)$/) // Allow common static file extensions, added ttf
    ) {
     console.log(`[Middleware] Allowing internal/static/API access to: ${url.pathname}`);
     return NextResponse.next();
   }

   // --- Determine if the request is for the root domain (or equivalent like localhost/IP in dev) ---
   // Stricter check: Only ROOT_DOMAIN or common local dev hostnames are root
   const isRootDomainRequest =
       normalizedHostname === ROOT_DOMAIN ||
       normalizedHostname === 'localhost' ||
       normalizedHostname === '127.0.0.1' ||
       normalizedHostname.match(/^192\.168\.\d+\.\d+$/) ||
       normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) ||
       normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/) ||
       IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`));


  // --- Root Domain Handling (including localhost/IPs for dev) ---
  if (isRootDomainRequest) {
     console.log(`[Middleware] Handling root domain equivalent request for: ${url.pathname}`);

     // Special case: If root '/' is requested, redirect to '/register'
     if (url.pathname === '/') {
         console.log('[Middleware] Root / requested. Redirecting to /register.');
         url.pathname = '/register';
         return NextResponse.redirect(url);
     }

     // Allow access to defined public paths on the root domain/IP
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => {
        // Allow exact match or path starting with the public path + '/' (e.g., /jobs/123)
        return url.pathname === path || url.pathname.startsWith(path + '/');
     });

     if (isPublicRootPath) {
        console.log(`[Middleware] Allowing public root path access: ${url.pathname}`);
        // Allow access to /register, /login, /jobs/* etc.
        // Ensure the /login and /forgot-password requests are not rewritten
        return NextResponse.next();
     }

     // For any other path on the root domain/IP, redirect to register
     console.log(`[Middleware] Path "${url.pathname}" on root equivalent domain is not public. Redirecting to /register.`);
     url.pathname = '/register';
     return NextResponse.redirect(url);
  }

  // --- Subdomain Handling ---
  const subdomainMatch = normalizedHostname.match(`^(.*)\\.${ROOT_DOMAIN}$`);
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  console.log(`[Middleware] Extracted subdomain: ${subdomain}`);

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    // Valid subdomain detected
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Domain', subdomain); // Set header for API routes and page props

    // Check if the path is an application path that needs rewriting OR the root path for the subdomain
    const isAppPath = url.pathname === '/' || TENANT_APP_PATHS.some(p => url.pathname.startsWith(p));

    // Handle special case for /login and /forgot-password on subdomains - pass through WITHOUT rewrite
    const isTenantAuthPath = url.pathname === '/login' || url.pathname.startsWith('/forgot-password');

    if (isTenantAuthPath) {
        console.log(`[Middleware] Passing through subdomain auth path ${url.pathname} with header`);
         return NextResponse.next({
            request: { headers: requestHeaders },
        });
    }
    // Rewrite app paths
    else if (isAppPath) {
         // Rewrite to include subdomain context: demo.domain.com/dashboard -> domain.com/demo/dashboard
         const originalPath = url.pathname;
         // The root '/' for the subdomain is handled by '/[domain]/page.tsx' which redirects to dashboard
         url.pathname = `/${subdomain}${originalPath === '/' ? '' : originalPath}`;
         console.log(`[Middleware] Rewriting app path ${hostname}${originalPath} to internal path ${url.pathname}`);
         return NextResponse.rewrite(url, {
             request: { headers: requestHeaders },
         });
    } else {
        // It's a subdomain request, but NOT for an app path or auth path (e.g., /some/other/path)
        // This might indicate a 404 within the tenant context. Let Next.js handle it by passing through.
        // The pages/[domain]/[...slug] route or similar should handle 404s.
        console.log(`[Middleware] Passing through unknown subdomain path ${url.pathname} with header`);
        return NextResponse.next({
            request: { headers: requestHeaders },
        });
    }
  }

  // --- Fallback for Unknown Hostnames ---
  // If hostname doesn't match root, known dev IPs, or a valid subdomain structure, redirect to root register page.
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
