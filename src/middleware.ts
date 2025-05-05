
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Subdomains to ignore (e.g., www, api)
const IGNORED_SUBDOMAINS = ['www', 'api'];
// Root domain (can be fetched from env var, default to localhost for dev)
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';

// Paths that are public on the root domain
const PUBLIC_ROOT_PATHS = ['/register', '/forgot-password', '/jobs'];

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
       normalizedHostname.match(/^192\.168\.\d+\.\d+$/) || // Local IPs
       normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) || // Local IPs
       normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/) || // Local IPs
       IGNORED_SUBDOMAINS.some(sub => normalizedHostname.startsWith(`${sub}.${ROOT_DOMAIN}`));

  // --- Root Domain Handling ---
  if (isRootDomainRequest) {
     console.log(`[Middleware] Handling root domain request for: ${url.pathname}`);

     // Redirect root '/' to '/register'
     if (url.pathname === '/') {
         console.log('[Middleware] Root / requested. Redirecting to /register.');
         url.pathname = '/register';
         return NextResponse.redirect(url);
     }

     // Allow access to defined public paths on the root domain
     const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => {
        // Match exact path or path starting with the public path + '/'
        return url.pathname === path || url.pathname.startsWith(path + '/');
     });

     // Allow /login on root as well (This should ideally not be hit directly, users go to subdomain login)
     if (isPublicRootPath || url.pathname === '/login') {
        console.log(`[Middleware] Allowing public root path or root login access: ${url.pathname}`);
        return NextResponse.next();
     }

     // For any other path on the root domain, redirect to register (as it's the root entry)
     console.log(`[Middleware] Path "${url.pathname}" on root domain is not public. Redirecting to /register.`);
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
    requestHeaders.set('X-Tenant-Domain', subdomain); // Set header

    const originalPath = url.pathname;
    const domainSegment = `/${subdomain}`;

    // REMOVED: Specific redirection for /jobs from subdomain to root
    // if (originalPath === '/jobs' || originalPath.startsWith('/jobs/')) { ... }

    // Rewrite root path '/' on subdomain to login page within the auth group
    if (originalPath === '/') {
        console.log(`[Middleware] Subdomain root / requested. Rewriting to internal path /login`);
        url.pathname = `/login`; // Rewrite to the root (auth) login page
        return NextResponse.rewrite(url, {
             request: { headers: requestHeaders },
        });
    }
    // Handle specific auth routes on subdomains, rewrite them to the root auth group
    else if (originalPath === '/login') {
        console.log(`[Middleware] Rewriting subdomain login path ${hostname}${originalPath} to internal path /login`);
        url.pathname = `/login`; // Path is already correct for auth group
        return NextResponse.rewrite(url, {
             request: { headers: requestHeaders },
        });
    } else if (originalPath.startsWith('/forgot-password')) {
        console.log(`[Middleware] Rewriting subdomain forgot password path ${hostname}${originalPath} to internal path ${originalPath}`);
        url.pathname = originalPath; // Path is already correct for auth group
        return NextResponse.rewrite(url, {
             request: { headers: requestHeaders },
        });
    }
    // Rewrite other app paths to the internal /[domain]/... structure
    else {
        // Only rewrite if it doesn't already start with the domain segment (prevent internal rewrite loops)
        // AND ensure it's not an internal Next.js or API path missed earlier
        if (!originalPath.startsWith('/_next/') && !originalPath.startsWith('/api/') && !originalPath.startsWith(domainSegment + '/')) {
            url.pathname = `${domainSegment}${originalPath}`;
            console.log(`[Middleware] Rewriting app path ${hostname}${originalPath} to internal path ${url.pathname}`);
            return NextResponse.rewrite(url, {
                request: { headers: requestHeaders },
            });
        } else {
             // If it already starts with /demo/ or similar, or is _next/api, just pass headers
             console.log(`[Middleware] Passing through already rewritten or internal path: ${originalPath}`);
              return NextResponse.rewrite(url, {
                request: { headers: requestHeaders }, // Still pass headers for consistency
            });
        }
    }
  }

  // --- Fallback for Unknown Hostnames ---
  // If hostname doesn't match root, known dev IPs, or a valid subdomain structure, redirect to root register page.
  console.log(`[Middleware] Unknown hostname or structure: ${hostname}. Redirecting to root /register.`);
  const registerUrlRedirect = request.nextUrl.clone();
  const port = registerUrlRedirect.port ? `:${registerUrlRedirect.port}` : '';
  registerUrlRedirect.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:'; // Ensure correct protocol
  registerUrlRedirect.host = `${ROOT_DOMAIN}${port}`; // Ensure redirect goes to ROOT_DOMAIN
  registerUrlRedirect.pathname = '/register'; // Redirect to register
  registerUrlRedirect.search = ''; // Clear query params
  return NextResponse.redirect(registerUrlRedirect);
}

export const config = {
  // Matcher includes all paths EXCEPT the ones explicitly excluded below
   matcher: [
     // Exclude static files, images, API routes, and Next.js internals
     '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
   ],
};
