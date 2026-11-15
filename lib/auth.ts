import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import pool from './db';
import { rateLimit } from './rate-limit';
import { clientIp } from './request';
import type { NextAuthOptions } from 'next-auth';
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

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 7 * 24 * 3600, updateAge: 24 * 3600 },
  pages: {
    signIn: '/fr/login',
    error:  '/fr/login',
  },
  providers: [
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
    async jwt({ token, user }) {
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
