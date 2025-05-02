
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTenantByDomain } from '@/modules/auth/lib/db'; // Import DB function

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
// Default port for local development (read directly from process.env where needed)
// const PORT = process.env.PORT || '9002';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/register', '/forgot-password', '/jobs']; // Login is handled separately

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';

  // Normalize hostname (remove port for local development)
  const normalizedHostname = hostname.split(':')[0];
  console.log(`[Middleware] Request URL: ${request.url}, Hostname: ${normalizedHostname}`);

  // --- Static Assets and Next.js Internals ---
  // Allow all requests for Next.js internal files, static assets, and API routes not needing tenant context
   if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/favicon.ico') || url.pathname.startsWith('/api/auth/register') || url.pathname.startsWith('/api/recruitment/postings') || url.pathname.startsWith('/api/communication/test-connection') || url.pathname.startsWith('/api/genkit/')) {
     console.log(`[Middleware] Allowing internal/static/public API access to: ${url.pathname}`);
     return NextResponse.next();
   }

  // --- Root Domain Handling ---
  if (normalizedHostname === ROOT_DOMAIN || IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`))) {
     // Allow access to defined public paths on the root domain
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => url.pathname.startsWith(path));
     if (isPublicRootPath) {
        console.log(`[Middleware] Allowing public root path access: ${url.pathname}`);
        return NextResponse.next();
     }

     // Specific handling for the root login page
     if (url.pathname === '/login') {
         console.log(`[Middleware] Allowing root login page access: ${url.pathname}`);
         return NextResponse.next(); // Allow access to /login on the root domain
     }

     // Redirect root path '/' to registration page (or login, depending on default preference)
     if (url.pathname === '/') {
      // console.log('[Middleware] Redirecting root / to /register');
      // url.pathname = '/register';
       console.log('[Middleware] Redirecting root / to /login');
       url.pathname = '/login';
       return NextResponse.redirect(url);
     }

    // For any other path on the root domain, redirect to registration (prevents access to app internals via root)
     console.log(`[Middleware] Path "${url.pathname}" on root domain is not public or root. Redirecting to /login.`);
     url.pathname = '/login';
     return NextResponse.redirect(url);
  }

  // --- Subdomain Handling ---
  const subdomainMatch = normalizedHostname.match(`^(.*)\\.${ROOT_DOMAIN}$`);
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  console.log(`[Middleware] Extracted subdomain: ${subdomain}`);

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    // Subdomain detected

    // Verify tenant exists before rewriting (optional but recommended)
    try {
        const tenant = await getTenantByDomain(subdomain);
        if (!tenant) {
            console.log(`[Middleware] Tenant domain "${subdomain}" not found in DB. Redirecting to registration.`);
            const registerUrl = request.nextUrl.clone();
             const port = registerUrl.port ? `:${registerUrl.port}` : '';
             registerUrl.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
             registerUrl.pathname = '/register';
             registerUrl.searchParams.set('error', 'tenant_not_found');
             return NextResponse.redirect(registerUrl);
        }
        console.log(`[Middleware] Tenant domain "${subdomain}" verified.`);
    } catch (error) {
        console.error(`[Middleware] Error verifying tenant domain "${subdomain}":`, error);
        // Decide how to handle DB errors - fail open (rewrite) or fail closed (redirect)?
        // Redirecting to an error page or root login might be safer.
         const errorUrl = request.nextUrl.clone();
         const port = errorUrl.port ? `:${errorUrl.port}` : '';
         errorUrl.host = `${ROOT_DOMAIN}${port}`;
         errorUrl.pathname = '/login'; // Redirect to root login on error
         errorUrl.searchParams.set('error', 'db_error');
         return NextResponse.redirect(errorUrl);
    }


    // Rewrite URL to include subdomain context for application routes
    // Example: Rewrite `subdomain.domain.com/dashboard` to `domain.com/[subdomain]/dashboard`
    const originalPath = url.pathname;
    // Set a header to easily access the tenant ID/domain in API routes and server components
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Id', subdomain); // Set tenant identifier

    url.pathname = `/${subdomain}${originalPath}`;
    console.log(`[Middleware] Rewriting ${hostname}${originalPath} to ${url.pathname}`);
    return NextResponse.rewrite(url, {
       request: {
          headers: requestHeaders,
        },
     });
  }

  // If no specific handling, block access or redirect to a default page (e.g., root login)
  // This prevents access via unexpected hostnames.
  console.log(`[Middleware] Unknown hostname or structure: ${hostname}. Redirecting to /login.`);
  const loginUrl = request.nextUrl.clone();
  const port = loginUrl.port ? `:${loginUrl.port}` : '';
  loginUrl.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Matcher includes all paths EXCEPT the ones explicitly excluded below
   matcher: [
     '/((?!_next/static|_next/image|favicon.ico|api/auth/register|api/recruitment/postings|api/communication/test-connection|api/genkit/).*)',
   ],
};
