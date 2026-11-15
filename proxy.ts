import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const LOCALES = ['fr', 'en'] as const;
const DEFAULT_LOCALE = 'fr';

function detectLocale(request: NextRequest): string {
  const cookieLang = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLang && LOCALES.includes(cookieLang as typeof LOCALES[number])) {
    return cookieLang;
  }
  const acceptLang = request.headers.get('accept-language') ?? '';
  const preferred = acceptLang.split(',')[0].trim().slice(0, 2).toLowerCase();
  return LOCALES.includes(preferred as typeof LOCALES[number]) ? preferred : DEFAULT_LOCALE;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth: a state-changing API call coming from a browser must come from our own
 * origin. Server-to-server calls (Flutterwave webhook, local scheduler) send no Origin header.
 */
function foreignOrigin(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'cross-site';
  try {
    return new URL(origin).host !== request.headers.get('host');
  } catch {
    return true;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    if (foreignOrigin(request)) {
      return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
    }
    return NextResponse.next();
  }

  const isInternal =
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    /\.(.+)$/.test(pathname);

  if (isInternal) return NextResponse.next();

  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );

  // Redirect to locale-prefixed URL if missing
  if (!hasLocale) {
    const locale = detectLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  // Protect dashboard routes — redirect to login if no session
  const isDashboard = LOCALES.some((l) => pathname.startsWith(`/${l}/dashboard`));
  if (isDashboard) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const lang = LOCALES.find((l) => pathname.startsWith(`/${l}/`)) ?? DEFAULT_LOCALE;
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `/${lang}/login`;
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
