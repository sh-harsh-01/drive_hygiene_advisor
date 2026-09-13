import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * NextAuth configuration.
 *
 * Scope: drive.metadata.readonly — read file metadata only.
 * No file content access is requested (see DECISIONS.md — Decision 5).
 *
 * The access token is stored in the JWT and forwarded server-side to the
 * GoogleDriveProvider in the /api/drive/analyze route. It is never sent
 * to the browser.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.metadata.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    /**
     * Persist the OAuth access token in the JWT so the server can pass
     * it to GoogleDriveProvider without ever exposing it to the browser.
     */
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        // Store expiry so we could refresh in production
        token.expiresAt = account.expires_at;
      }
      return token;
    },

    /**
     * Expose only non-sensitive fields to the client session.
     * The access token stays server-side in the JWT only.
     */
    async session({ session, token }) {
      session.user = session.user ?? {};
      // Attach a flag so the client knows the user is authenticated
      (session as unknown as Record<string, unknown>).authenticated = true;
      // Attach userId for cache keying (not the token itself)
      (session as unknown as Record<string, unknown>).userId = (token as JWT & { sub?: string }).sub ?? "unknown";
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
