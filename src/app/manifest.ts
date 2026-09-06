import type { MetadataRoute } from "next";

/**
 * Web App Manifest for Chrome/Edge/Android installability.
 * Requirements covered: name, short_name, start_url, display=standalone,
 * theme/background colors, 192 + 512 PNG icons (any + maskable).
 * Served at /manifest.webmanifest by Next.js App Router.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Audio Alchemy",
    short_name: "Alchemy",
    description:
      "Ownership-first AI music generation. Create tracks you own, powered by ACE-Step or local mock mode.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    orientation: "any",
    categories: ["music", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
