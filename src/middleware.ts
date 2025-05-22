
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define the session cookie name directly in the middleware
const SESSION_COOKIE_NAME = 'syntaxHiveHrmSession';

const IGNORED_SUBDOMAINS = ['www', 'api', 'mail', 'ftp', 'assets'];
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost';
const PUBLIC_ROOT_PATHS = ['/register', '/forgot-password', '/jobs'];
const AUTH_PATHS = ['/login', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  const normalizedHostname = hostname.split(':')[0];
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME); // Use the locally defined constant

  console.log(`[Middleware] Request URL: ${url.toString()}, Hostname: ${normalizedHostname}, Path: ${url.pathname}, Session: ${sessionCookie ? 'Exists' : 'None'}`);

  if (
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.match(/\.(js|css|map|ico|png|jpg|jpeg|gif|svg|woff2|ttf|webmanifest)$/)
  ) {
    console.log(`[Middleware] Bypassing for asset/API: ${url.pathname}`);
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
      console.log(`[Middleware] Root domain, root path. Rewriting to /register.`);
      url.pathname = '/register';
      return NextResponse.rewrite(url); // Use rewrite to keep URL if desired, or redirect
    }
    const isPublicRootPath = PUBLIC_ROOT_PATHS.some(path => url.pathname.startsWith(path));
    if (isPublicRootPath) {
      console.log(`[Middleware] Root domain, public path ${url.pathname}. Allowing.`);
      return NextResponse.next();
    }
    if (url.pathname.startsWith('/login')) {
      console.log(`[Middleware] Root domain, login path. Allowing.`);
      return NextResponse.next();
    }
    console.log(`[Middleware] Root domain, non-public path ${url.pathname}. Rewriting to /register.`);
    url.pathname = '/register';
    return NextResponse.rewrite(url); // Use rewrite
  }

  const subdomainMatch = normalizedHostname.match(new RegExp(`^(.*)\\.${ROOT_DOMAIN.replace(/\./g, '\\.')}$`));
  const subdomain = subdomainMatch ? subdomainMatch[1] : null;

  if (subdomain && !IGNORED_SUBDOMAINS.includes(subdomain)) {
    console.log(`[Middleware] Tenant subdomain: ${subdomain}, Path: ${url.pathname}`);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('X-Tenant-Domain', subdomain);

    if (AUTH_PATHS.some(authPath => url.pathname === authPath || url.pathname.startsWith(`${authPath}/`))) {
      let rewritePath = url.pathname;
      if (url.pathname.startsWith('/forgot-password/') && url.pathname !== `/forgot-password/${subdomain}`) {
        // This ensures that /forgot-password/some-other-subdomain redirects to current subdomain's forgot password
        // or a general one if that's the design. For now, assuming forgot-password/[domain_param] structure.
        // If your forgot-password page for subdomains is just /forgot-password, this check might be too aggressive.
        // Based on current setup, /forgot-password/[domain] is the pattern.
      }
      console.log(`[Middleware] Auth path on subdomain ${subdomain}. Path: ${rewritePath} (auth group)`);
      // No need to prepend /auth or anything if the (auth) group uses paths like /login, /register directly.
      // The key is that these paths exist under src/app/(auth)/
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    if (url.pathname === '/') {
      if (!sessionCookie) {
        console.log(`[Middleware] Tenant root ${subdomain}, no session. Rewriting to /login on this subdomain (will be handled by (auth) group).`);
        url.pathname = `/login`;
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      } else {
        console.log(`[Middleware] Tenant root ${subdomain}, HAS session. Rewriting to /${subdomain}/dashboard`);
        url.pathname = `/${subdomain}/dashboard`;
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      }
    }

    if (!url.pathname.startsWith(`/${subdomain}/`)) {
      console.log(`[Middleware] App path on subdomain ${subdomain}. Rewriting ${url.pathname} to /${subdomain}${url.pathname}`);
      url.pathname = `/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    console.log(`[Middleware] Passing through already rewritten or internal path for subdomain ${subdomain}: ${url.pathname}`);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  console.log(`[Middleware] Unrecognized hostname structure: ${normalizedHostname}. Rewriting to root /register.`);
  const rootRegisterUrl = request.nextUrl.clone();
  const currentPort = rootRegisterUrl.port ? `:${rootRegisterUrl.port}` : '';
  rootRegisterUrl.protocol = process.env.NODE_ENV === 'production' ? 'https:' : 'http:';
  rootRegisterUrl.host = `${ROOT_DOMAIN}${currentPort}`;
  rootRegisterUrl.pathname = '/register';
  rootRegisterUrl.search = '';
  return NextResponse.rewrite(rootRegisterUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|images/|favicon.ico|api/).*)',
  ],
};
