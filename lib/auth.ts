import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import TwitterProvider from 'next-auth/providers/twitter';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from './db';
import { rateLimit } from './rate-limit';
import { clientIp } from './request';
import type { NextAuthOptions } from 'next-auth';
import type { Provider } from 'next-auth/providers/index';
import type { RowDataPacket } from 'mysql2';

export interface DbUser extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password: string;
  plan: string;
  videos_used: number;
  videos_limit: number;
}

/**
 * Sign in / sign up with an external account. Each provider is enabled only when its app keys are set:
 *  - Google (Gmail):   GOOGLE_CLIENT_ID/SECRET, or the YouTube OAuth client of the same Google project
 *  - Facebook:         FACEBOOK_APP_ID/SECRET (same Meta app as Facebook Pages publishing)
 *  - Instagram:        INSTAGRAM_APP_ID/SECRET (Instagram Login: professional accounts only, no e-mail given)
 *  - X (Twitter):      X_CLIENT_ID/SECRET (OAuth 2.0, no e-mail given)
 * Callback URLs: https://synthia.ikelyane.com/api/auth/callback/{google|facebook|instagram|twitter}
 */
const env = (...k: string[]) => k.map((x) => process.env[x]).find(Boolean) ?? '';
const GOOGLE_ID = env('GOOGLE_CLIENT_ID', 'YOUTUBE_CLIENT_ID'), GOOGLE_SECRET = env('GOOGLE_CLIENT_SECRET', 'YOUTUBE_CLIENT_SECRET');
const FB_ID = env('FACEBOOK_APP_ID'), FB_SECRET = env('FACEBOOK_APP_SECRET');
const IG_ID = env('INSTAGRAM_APP_ID'), IG_SECRET = env('INSTAGRAM_APP_SECRET');
const X_ID = env('X_CLIENT_ID'), X_SECRET = env('X_CLIENT_SECRET');
const on = (id: string, secret: string, flag: string) => Boolean(id && secret && process.env[flag] !== 'off');

export const SOCIAL_LOGIN = ['google', 'facebook', 'instagram', 'twitter'] as const;
type SocialLogin = typeof SOCIAL_LOGIN[number];

/** Instagram Login (Instagram API with Instagram Login) as a custom OAuth provider. */
const InstagramLogin = {
  id: 'instagram', name: 'Instagram', type: 'oauth' as const,
  clientId: IG_ID, clientSecret: IG_SECRET, checks: ['state' as const],
  authorization: { url: 'https://www.instagram.com/oauth/authorize', params: { scope: 'instagram_business_basic', response_type: 'code' } },
  token: {
    url: 'https://api.instagram.com/oauth/access_token',
    async request({ params, provider }: { params: { code?: string }; provider: { callbackUrl: string } }) {
      const body = new URLSearchParams({ client_id: IG_ID, client_secret: IG_SECRET, grant_type: 'authorization_code',
        redirect_uri: provider.callbackUrl, code: String(params.code ?? '').replace(/#_$/, '') });
      const r = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
      const j = await r.json();
      const t = Array.isArray(j?.data) ? j.data[0] : j;            // both documented shapes
      if (!t?.access_token) throw new Error('instagram_token');
      return { tokens: { access_token: t.access_token, token_type: 'bearer' } };
    },
  },
  userinfo: {
    async request({ tokens }: { tokens: { access_token?: string } }) {
      const r = await fetch(`https://graph.instagram.com/me?fields=user_id,username,profile_picture_url&access_token=${encodeURIComponent(tokens.access_token ?? '')}`);
      return r.json();
    },
  },
  profile(p: { user_id?: string; id?: string; username?: string; profile_picture_url?: string }) {
    return { id: String(p.user_id ?? p.id), name: p.username ?? null, email: null, image: p.profile_picture_url ?? null };
  },
};

export const enabledSocialLogins: SocialLogin[] = [
  // With the YouTube client as fallback, Google sign-in waits for GOOGLE_LOGIN=on: its redirect URI
  // (/api/auth/callback/google) must first be added to that client in Google Cloud, or users get an error.
  ...((process.env.GOOGLE_CLIENT_ID ? on(GOOGLE_ID, GOOGLE_SECRET, 'GOOGLE_LOGIN') : process.env.GOOGLE_LOGIN === 'on' && Boolean(GOOGLE_ID && GOOGLE_SECRET))
    ? ['google' as const] : []),
  ...(on(FB_ID, FB_SECRET, 'FACEBOOK_LOGIN') ? ['facebook' as const] : []),
  ...(on(IG_ID, IG_SECRET, 'INSTAGRAM_LOGIN') ? ['instagram' as const] : []),
  ...(on(X_ID, X_SECRET, 'X_LOGIN') ? ['twitter' as const] : []),
];

/**
 * Synthia user for an external identity: already linked → that user; same verified e-mail → link it;
 * otherwise create the account. Instagram and X give no e-mail: the account gets a private placeholder
 * address (`<provider>-<id>@users.synthia.invalid`, never e-mailed) the user can change later.
 */
async function userForIdentity(provider: SocialLogin, subject: string, email: string | null, name: string | null): Promise<DbUser | null> {
  const [linked] = await pool.query<DbUser[]>(
    'SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ? LIMIT 1', [provider, subject]);
  if (linked[0]) return linked[0];
  let user: DbUser | undefined;
  if (email) {
    const [byEmail] = await pool.query<DbUser[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    user = byEmail[0];
  }
  if (!user) {
    const addr = email ?? `${provider}-${subject.replace(/[^\w.-]/g, '')}@users.synthia.invalid`;
    const pwd = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 10);
    await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [name?.slice(0, 255) ?? null, addr.slice(0, 255), pwd]);
    const [rows] = await pool.query<DbUser[]>('SELECT * FROM users WHERE email = ? LIMIT 1', [addr.slice(0, 255)]);
    user = rows[0];
  }
  if (!user) return null;
  await pool.query('INSERT IGNORE INTO auth_identities (user_id, provider, subject) VALUES (?, ?, ?)', [user.id, provider, subject.slice(0, 128)]);
  return user;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 7 * 24 * 3600, updateAge: 24 * 3600 },
  pages: {
    signIn: '/fr/login',
    error:  '/fr/login',
  },
  providers: [
    ...(enabledSocialLogins.includes('google') ? [GoogleProvider({
      clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET,
      authorization: { params: { scope: 'openid email profile', prompt: 'select_account' } },
    })] : []),
    ...(enabledSocialLogins.includes('facebook') ? [FacebookProvider({ clientId: FB_ID, clientSecret: FB_SECRET })] : []),
    ...(enabledSocialLogins.includes('instagram') ? [InstagramLogin as unknown as Provider] : []),
    ...(enabledSocialLogins.includes('twitter') ? [TwitterProvider({ clientId: X_ID, clientSecret: X_SECRET, version: '2.0' })] : []),
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email:    { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        // Brute-force brake: 10 attempts per e-mail address per 15 minutes.
        if (!rateLimit(`login:${credentials.email.toLowerCase()}`, 10, 15 * 60_000)) return null;
        // ...and 30 attempts per client IP (credential stuffing across many addresses).
        if (!rateLimit(`login-ip:${clientIp(req?.headers ?? {})}`, 30, 15 * 60_000)) return null;
        if (credentials.email.length > 255 || credentials.password.length > 200) return null;

        const [rows] = await pool.query<DbUser[]>(
          'SELECT * FROM users WHERE email = ? LIMIT 1',
          [credentials.email]
        );
        const user = rows[0];
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id:           String(user.id),
          name:         user.name,
          email:        user.email,
          plan:         user.plan,
          videos_used:  user.videos_used,
          videos_limit: user.videos_limit,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider === 'credentials') return true;
      if (account.provider === 'google') {
        const p = profile as { email?: string; email_verified?: boolean } | undefined;
        return Boolean(p?.email && p.email_verified);          // only verified Google e-mails
      }
      return SOCIAL_LOGIN.includes(account.provider as SocialLogin) && Boolean(account.providerAccountId);
    },
    async jwt({ token, user, account }) {
      if (account && account.provider !== 'credentials' && SOCIAL_LOGIN.includes(account.provider as SocialLogin)) {
        const provider = account.provider as SocialLogin;
        // Facebook e-mails are confirmed by Facebook; Google is checked in signIn; Instagram and X give none.
        const email = provider === 'google' || provider === 'facebook' ? (user?.email ?? null)?.toLowerCase() ?? null : null;
        const u = await userForIdentity(provider, account.providerAccountId, email, user?.name ?? null);
        if (!u) throw new Error('social_signin_failed');
        token.id = String(u.id); token.plan = u.plan; token.videos_used = u.videos_used; token.videos_limit = u.videos_limit;
        token.name = u.name ?? user?.name ?? null; token.email = u.email;
        return token;
      }
      if (user) {
        const u = user as unknown as { id: string; plan: string; videos_used: number; videos_limit: number };
        token.id           = u.id;
        token.plan         = u.plan;
        token.videos_used  = u.videos_used;
        token.videos_limit = u.videos_limit;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id                   = token.id as string;
        (session.user as { plan?: string }).plan               = token.plan as string;
        (session.user as { videos_used?: number }).videos_used = token.videos_used as number;
        (session.user as { videos_limit?: number }).videos_limit = token.videos_limit as number;
      }
      return session;
    },
  },
};
