"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { FlaskConical, LogIn, LogOut, User } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const isMockMode = !process.env.NEXT_PUBLIC_GOOGLE_CLIENT_CONFIGURED;

export default function Header({ title, subtitle }: HeaderProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const showMockBadge = !isAuthenticated;

  return (
    <header
      style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 32px",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Demo Mode Badge — shown when not authenticated */}
        {showMockBadge && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--google-yellow-light)",
              border: "1px solid var(--google-yellow)",
              borderRadius: 20,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 500,
              color: "#f9ab00",
            }}
          >
            <FlaskConical size={14} />
            Demo Mode — Sample data
          </div>
        )}

        {/* Auth button */}
        {isLoading ? (
          <div className="spinner" />
        ) : isAuthenticated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* User info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--google-green-light)",
                border: "1px solid var(--google-green)",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--google-green)",
              }}
            >
              <User size={13} />
              {session?.user?.email ?? "Connected"}
            </div>
            <button
              id="sign-out-btn"
              className="btn-secondary"
              onClick={() => signOut()}
              style={{ fontSize: 12, padding: "7px 14px", gap: 6 }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        ) : (
          <button
            id="sign-in-btn"
            className="btn-primary"
            onClick={() => signIn("google")}
            style={{ fontSize: 13, padding: "8px 18px" }}
          >
            <LogIn size={15} /> Connect Google Drive
          </button>
        )}
      </div>
    </header>
  );
}
