
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MOCK_SESSION_COOKIE } from '@/lib/auth'; // For checking if logged in

const IGNORED_SUBDOMAINS = ['www', 'api', 'mail', 'ftp', 'assets']; // Add common ones
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
const PUBLIC_ROOT_PATHS = ['/register', '/forgot-password', '/jobs'];

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  const normalizedHostname = hostname.split(':')[0];
  const sessionCookie = request.cookies.get(MOCK_SESSION_COOKIE);

  console.log(`[Middleware] Path: ${url.pathname}, Host: ${normalizedHostname}, Session: ${sessionCookie ? 'Exists' : 'None'}`);

  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2|ttf|webmanifest)$/)
  ) {
    return NextResponse.next();
  }

  const isEffectivelyRootDomain =
    normalizedHostname === ROOT_DOMAIN ||
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname.match(/^192\.168\.\d+\.\d+$/) ||
    normalizedHostname.match(/^10\.\d+\.\d+\.\d+$/) ||
    normalizedHostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/);

  if (isEffectivelyRootDomain) {
    console.log(`[Middleware] Root domain request for: ${url.pathname}`);
    if (url.pathname === '/') {
      url.pathname = '/register'; // Default root action is register
      return NextResponse.redirect(url);
    }
    const isPublicPath = PUBLIC_ROOT_PATHS.some(path => url.pathname.startsWith(path));
    if (isPublicPath || url.pathname.startsWith('/login') || url.pathname.startsWith('/forgot-password')) { // login/forgot on root are allowed but might redirect
      return NextResponse.next();
    }
    // If not a public root path, and on root domain, redirect to register
    url.pathname = '/register';
    return NextResponse.redirect(url);
  }

  // Subdomain handling
  const subdomainMatch = normalizedHostname.match(new RegExp(`^(.*)\\.${ROOT_DOMAIN.replace(/\./g, '\\.')}$`));
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Domain', subdomain); // Keep this for API routes

    console.log(`[Middleware] Tenant subdomain: ${subdomain}, Path: ${url.pathname}`);

    // If on subdomain root, and no session, rewrite to /login (auth group)
    if (url.pathname === '/' && !sessionCookie) {
      console.log(`[Middleware] Tenant root, no session. Rewriting to /login for domain ${subdomain}`);
      url.pathname = `/login`; // Rewrite to the (auth) login page
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    // If on subdomain root, and HAS session, rewrite to /dashboard (app group)
    if (url.pathname === '/' && sessionCookie) {
        console.log(`[Middleware] Tenant root, HAS session. Rewriting to /${subdomain}/dashboard for domain ${subdomain}`);
        url.pathname = `/${subdomain}/dashboard`;
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // Allow access to /login and /forgot-password on subdomain, rewriting to auth group
    if (url.pathname.startsWith('/login') || url.pathname.startsWith('/forgot-password')) {
      console.log(`[Middleware] Auth path on subdomain. Rewriting ${url.pathname} to auth group for domain ${subdomain}`);
      // Pathname is already correct for the (auth) group pages
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // All other paths on a subdomain are assumed to be for the app group.
    // Prepend /subdomain to the path unless it's already there (to avoid rewrite loops)
    if (!url.pathname.startsWith(`/${subdomain}/`)) {
      console.log(`[Middleware] App path on subdomain. Rewriting ${url.pathname} to /${subdomain}${url.pathname}`);
      url.pathname = `/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
    // If already correctly prefixed (e.g. /subdomain/dashboard), just pass headers
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // If it's not root and not a recognized subdomain structure, redirect to root register.
  console.log(`[Middleware] Unrecognized hostname structure: ${normalizedHostname}. Redirecting to root /register.`);
  const rootRegisterUrl = request.nextUrl.clone();
  const port = rootRegisterUrl.port ? `:${rootRegisterUrl.port}` : '';
  rootRegisterUrl.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
  rootRegisterUrl.host = `${ROOT_DOMAIN}${port}`;
  rootRegisterUrl.pathname = '/register';
  rootRegisterUrl.search = '';
  return NextResponse.redirect(rootRegisterUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
  ],
};
