"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Copy,
  HardDrive,
  ShieldAlert,
  CloudCog,
} from "lucide-react";

const navItems = [
  { href: "/overview",    label: "Overview",    icon: LayoutDashboard },
  { href: "/duplicates",  label: "Duplicates",  icon: Copy },
  { href: "/large-files", label: "Large Files", icon: HardDrive },
  { href: "/risky-files", label: "Risky Files", icon: ShieldAlert },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "var(--sidebar-width)",
        minWidth: "var(--sidebar-width)",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: "20px 20px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "linear-gradient(135deg, var(--google-blue), #0d47a1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CloudCog size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.2 }}>
            Drive Hygiene
          </div>
          <div style={{ fontWeight: 500, fontSize: 11, color: "var(--text-secondary)" }}>
            Advisor
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                fontWeight: active ? 600 : 400,
                fontSize: 14,
                color: active ? "var(--google-blue)" : "var(--text-secondary)",
                background: active ? "var(--google-blue-light)" : "transparent",
                textDecoration: "none",
                transition: "background 0.12s, color 0.12s",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface-3)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-hint)",
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Drive Hygiene Advisor</div>
        <div>Prototype · Mock Mode</div>
      </div>
    </aside>
  );
}
