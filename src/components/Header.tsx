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
    <header className="sticky top-0 z-40 border-b border-alchemy-gold/15 bg-alchemy-bg/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="group flex items-center gap-2">
          <span className="inline-flex h-10 w-8 shrink-0 items-center justify-center overflow-hidden">
            <Image
              src="/brand/audio-alchemy-mark.png"
              alt="Audio Alchemy"
              width={280}
              height={493}
              className="h-10 w-auto drop-shadow-[0_0_8px_rgba(230,184,77,0.25)]"
              priority
            />
          </span>
          <span className="bg-gradient-to-r from-alchemy-text via-alchemy-text to-alchemy-gold bg-clip-text text-lg font-semibold tracking-tight text-transparent transition-opacity group-hover:opacity-90">
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
                    ? "border border-alchemy-gold/20 bg-alchemy-gold/10 text-alchemy-gold"
                    : "border border-transparent text-alchemy-muted hover:border-alchemy-border hover:bg-alchemy-elevated/60 hover:text-alchemy-text"
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
