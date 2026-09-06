"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Create" },
  { href: "/library", label: "Library" },
  { href: "/ownership", label: "Ownership" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="border-b border-alchemy-border/80 bg-alchemy-bg/70 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-alchemy-accent to-violet-700 text-sm font-bold text-white shadow-lg shadow-violet-900/40">
            AA
          </span>
          <span className="text-lg font-semibold tracking-tight text-alchemy-text group-hover:text-alchemy-accentHover transition-colors">
            Audio Alchemy
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-alchemy-elevated text-alchemy-text"
                    : "text-alchemy-muted hover:text-alchemy-text hover:bg-alchemy-elevated/60"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
