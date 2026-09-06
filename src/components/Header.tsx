"use client";

import Image from "next/image";
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
    <header className="sticky top-0 z-40 border-b border-alchemy-border/80 bg-alchemy-bg/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:py-4">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-alchemy-gold/50"
        >
          <Image
            src="/brand/audio-alchemy-mark.png"
            alt=""
            width={36}
            height={36}
            className="h-8 w-8 shrink-0 rounded-lg shadow-glow-gold sm:h-9 sm:w-9"
            priority
          />
          <span className="truncate text-base font-semibold tracking-tight text-alchemy-gold transition-colors group-hover:text-alchemy-goldSoft sm:text-lg">
            Audio Alchemy
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Primary">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                  active
                    ? "border border-alchemy-gold/70 bg-alchemy-elevated text-alchemy-gold shadow-glow-gold"
                    : "border border-transparent text-alchemy-muted hover:bg-alchemy-elevated/60 hover:text-alchemy-text"
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
