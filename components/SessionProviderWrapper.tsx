"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client component wrapper for NextAuth SessionProvider.
 * Required because SessionProvider uses React context, which only works
 * in Client Components — but app/layout.tsx is a Server Component.
 */
export default function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
