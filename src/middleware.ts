
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MOCK_SESSION_COOKIE } from '@/lib/auth'; // For checking if logged in

const IGNORED_SUBDOMAINS = ['www', 'api', 'mail', 'ftp', 'assets']; // Add common ones
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
// Public paths accessible on the root domain without requiring login
const PUBLIC_ROOT_PATHS = ['/register', '/forgot-password', '/jobs'];
// Auth paths that should always be rewritten to the (auth) group, even on subdomains
const AUTH_PATHS = ['/login', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  const normalizedHostname = hostname.split(':')[0]; // Remove port
  const sessionCookie = request.cookies.get(MOCK_SESSION_COOKIE);

  console.log(`[Middleware] Request URL: ${url.toString()}, Hostname: ${normalizedHostname}, Path: ${url.pathname}, Session: ${sessionCookie ? 'Exists' : 'None'}`);

  // Skip middleware for static assets and API routes
  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api/') || // API routes are handled separately
    url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2|ttf|webmanifest)$/)
  ) {
    console.log(`[Middleware] Bypassing for asset/API: ${url.pathname}`);
    return NextResponse.next();
  }

  // Determine if the request is for the root domain (e.g., localhost, yourdomain.com)
  const isEffectivelyRootDomain =
    normalizedHostname === ROOT_DOMAIN ||
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname.match(/^192\.168\.\d+\.\d+$/) || // Local IPs
    normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) || // Local IPs
    normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/); // Local IPs

  if (isEffectivelyRootDomain) {
    console.log(`[Middleware] Root domain request for: ${url.pathname}`);
    // If root path on root domain, redirect to /register (auth group)
    if (url.pathname === '/') {
      console.log(`[Middleware] Root domain, root path. Redirecting to /register.`);
      url.pathname = '/register';
      return NextResponse.redirect(url);
    }
    // Allow access to public root paths (register, forgot-password (root version), public jobs board)
    const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => url.pathname.startsWith(path));
    if (isPublicRootPath) {
        console.log(`[Middleware] Root domain, public path ${url.pathname}. Allowing.`);
        return NextResponse.next(); // These are in the (auth) or root /jobs group
    }
    // Root login page is allowed, but usually users are directed to subdomain login
    if (url.pathname.startsWith('/login')) {
        console.log(`[Middleware] Root domain, login path. Allowing.`);
        return NextResponse.next();
    }
    // Other paths on root domain (that aren't public) should redirect to /register
    console.log(`[Middleware] Root domain, non-public path ${url.pathname}. Redirecting to /register.`);
    url.pathname = '/register';
    return NextResponse.redirect(url);
  }

  // --- Subdomain Handling ---
  const subdomainMatch = normalizedHostname.match(new RegExp(`^(.*)\\.${ROOT_DOMAIN.replace(/\./g, '\\.')}$`));
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    console.log(`[Middleware] Tenant subdomain: ${subdomain}, Path: ${url.pathname}`);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Domain', subdomain); // Used by API routes/actions to identify tenant

    // Handle paths like /login, /forgot-password/[domain] on a subdomain.
    // These should map to the (auth) group pages.
    // The actual path for forgot-password on a subdomain might be /forgot-password/[subdomain]
    if (AUTH_PATHS.some(authPath => url.pathname === authPath || url.pathname.startsWith(`${authPath}/`))) {
        // Pathname is already correct for the (auth) group pages (e.g. /login, or /forgot-password/[domain_param])
        // For /forgot-password/[domain], the [domain] param will be the subdomain.
        let rewritePath = url.pathname;
        if (url.pathname.startsWith('/forgot-password/') && !url.pathname.startsWith(`/forgot-password/${subdomain}`)) {
           // Ensure the path is specific to this subdomain if it has a dynamic segment.
           // This is less critical as the forgot password page for tenant uses the hostname.
        }
        console.log(`[Middleware] Auth path on subdomain ${subdomain}. Rewriting to path: ${rewritePath} (auth group)`);
        url.pathname = rewritePath; // The actual path is already suitable for (auth) group
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }


    // If at subdomain root (e.g., demo.localhost:9002/)
    if (url.pathname === '/') {
        if (!sessionCookie) {
            console.log(`[Middleware] Tenant root ${subdomain}, no session. Redirecting to /login on this subdomain.`);
            // Redirect to the login page of the current subdomain
            url.pathname = `/login`;
            return NextResponse.redirect(url); // Full redirect to change URL bar
        } else {
            console.log(`[Middleware] Tenant root ${subdomain}, HAS session. Rewriting to /${subdomain}/dashboard`);
            url.pathname = `/${subdomain}/dashboard`; // Internal rewrite to (app) group
            return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
        }
    }

    // All other paths on a subdomain are assumed to be for the (app) group.
    // Prepend /subdomain to the path if not already present (to match (app)/[domain] structure)
    if (!url.pathname.startsWith(`/${subdomain}/`)) {
      console.log(`[Middleware] App path on subdomain ${subdomain}. Rewriting ${url.pathname} to /${subdomain}${url.pathname}`);
      url.pathname = `/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // If path already starts with /subdomain/, just pass headers
    console.log(`[Middleware] Passing through already rewritten or internal path for subdomain ${subdomain}: ${url.pathname}`);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // If it's not root and not a recognized subdomain structure, redirect to root register.
  console.log(`[Middleware] Unrecognized hostname structure: ${normalizedHostname}. Redirecting to root /register.`);
  const rootRegisterUrl = request.nextUrl.clone();
  const currentPort = rootRegisterUrl.port ? `:${rootRegisterUrl.port}` : '';
  rootRegisterUrl.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
  rootRegisterUrl.host = `${ROOT_DOMAIN}${currentPort}`;
  rootRegisterUrl.pathname = '/register';
  rootRegisterUrl.search = ''; // Clear any query params
  return NextResponse.redirect(rootRegisterUrl);
}

export const config = {
  matcher: [
    // Match all paths except for static assets, images, favicon, and API routes
    '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
  ],
};
