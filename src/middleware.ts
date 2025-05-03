
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/login', '/register', '/forgot-password', '/jobs'];

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
     url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2|ttf)$/) // Allow common static file extensions
    ) {
     console.log(`[Middleware] Allowing internal/static/API access to: ${url.pathname}`);
     return NextResponse.next();
   }

   // --- Determine if the request is for the root domain (or equivalent like localhost/IP in dev) ---
   const isRootDomainRequest =
       normalizedHostname === ROOT_DOMAIN ||
       normalizedHostname === 'localhost' ||
       normalizedHostname === '127.0.0.1' ||
       normalizedHostname.match(/^192\.168\.\d+\.\d+$/) ||
       normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) ||
       normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/) ||
       IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`));

  // --- Root Domain Handling ---
  if (isRootDomainRequest) {
     console.log(`[Middleware] Handling root domain request for: ${url.pathname}`);

     // Redirect root '/' to '/login' (Start page)
     if (url.pathname === '/') {
         console.log('[Middleware] Root / requested. Redirecting to /login.');
         url.pathname = '/login';
         return NextResponse.redirect(url);
     }

     // Allow access to defined public paths on the root domain
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => {
        return url.pathname === path || url.pathname.startsWith(path + '/');
     });

     if (isPublicRootPath) {
        console.log(`[Middleware] Allowing public root path access: ${url.pathname}`);
        return NextResponse.next();
     }

     // For any other path on the root domain, redirect to login
     console.log(`[Middleware] Path "${url.pathname}" on root domain is not public. Redirecting to /login.`);
     url.pathname = '/login';
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

    const originalPath = url.pathname;
    const domainSegment = `/${subdomain}`;

    // Check if the path already starts with the domain segment
    if (originalPath.startsWith(domainSegment + '/') || originalPath === domainSegment) {
        console.log(`[Middleware] Path ${originalPath} already contains domain segment. Passing through with header.`);
        // If it already starts with /<domain>/, just pass it through but with the header set
        return NextResponse.next({
            request: { headers: requestHeaders },
        });
    } else if (originalPath === '/') {
        // If the root path '/' is requested on a subdomain, rewrite to the tenant's dashboard
        url.pathname = `${domainSegment}/dashboard`;
        console.log(`[Middleware] Rewriting subdomain root path ${hostname}${originalPath} to internal dashboard path ${url.pathname}`);
        return NextResponse.rewrite(url, {
            request: { headers: requestHeaders },
        });
    } else {
        // Otherwise, rewrite other paths to the internal /[domain]/... structure
        url.pathname = `${domainSegment}${originalPath}`;
        console.log(`[Middleware] Rewriting subdomain path ${hostname}${originalPath} to internal path ${url.pathname}`);
        return NextResponse.rewrite(url, {
            request: { headers: requestHeaders },
        });
    }
  }

  // --- Fallback for Unknown Hostnames ---
  // If hostname doesn't match root, known dev IPs, or a valid subdomain structure, redirect to root login page.
  console.log(`[Middleware] Unknown hostname or structure: ${hostname}. Redirecting to root /login.`);
  const loginUrlRedirect = request.nextUrl.clone();
  const port = loginUrlRedirect.port ? `:${loginUrlRedirect.port}` : '';
  loginUrlRedirect.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:'; // Ensure correct protocol
  loginUrlRedirect.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
  loginUrlRedirect.pathname = '/login';
  loginUrlRedirect.search = ''; // Clear query params
  return NextResponse.redirect(loginUrlRedirect);
}

export const config = {
  // Matcher includes all paths EXCEPT the ones explicitly excluded below
   matcher: [
     // Exclude static files, images, API routes, and Next.js internals
     '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
   ],
};
