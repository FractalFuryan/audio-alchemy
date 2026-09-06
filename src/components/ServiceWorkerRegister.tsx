"use client";

import { useEffect } from "react";

/** Registers public/sw.js in production so Chrome/Edge can install the PWA. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed", err));
  }, []);

  return null;
}
