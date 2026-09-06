# Audio Alchemy — Exploratory client architecture

This document describes how experimental client shells relate to the Next.js core. The Tauri and Capacitor folders are scaffolds for future evaluation, not polished or supported releases.

## Runtime topology

Clients (Browser/PWA, Tauri window, Capacitor WebView) talk HTTP(S) to a Next.js Node host.
That host owns App Router UI, /api routes, better-sqlite3 under data/, and the ACE-Step HTTP client.
ACE-Step GPU inference stays on its own API host.

Hard rule: Android/iOS never embed SQLite or ACE-Step. Mobile shells always call a hosted Next URL
(capacitor.config.ts server.url / CAPACITOR_SERVER_URL).

## PWA

Manifest: src/app/manifest.ts. Icons: public/icons/. SW: public/sw.js. Register in production via ServiceWorkerRegister.
Chrome/Edge need HTTPS or localhost plus manifest + SW. /api is never cached.


## Desktop shell (Tauri 2)

Status: **exploratory scaffold**. Do not describe this as a shipped desktop application.

- Config: src-tauri/tauri.conf.json
- App id: com.audioalchemy.app
- Product name: Audio Alchemy
- Dev loads local Next on port 3000
- frontendDist is the desktop-dist stub
- SQLite stays in Node

## Mobile shell (Capacitor)

Status: **exploratory scaffold**. Do not build a supported mobile client until the audio-quality gate has been evaluated and a secure hosted architecture is deliberately approved.

- Config file: capacitor.config.ts
- Override URL with CAPACITOR_SERVER_URL
- Platform folders: android and ios
- Sync scripts in package.json
- Phones load hosted Next only

## Phase status

A Job durability: done
B Library management: done
C Create UX: done
D ACE-Step hardening: done
E Exploratory installable shells: scaffolded; production packaging and support deferred
F Auth / multi-device sync: out of MVP

## Deferred client work

- Optional Next sidecar for packaged desktop
- CI for desktop artifacts on Windows runners
- Production HTTPS URL for Capacitor, only after the audio-quality and hosting gates
- Mobile safe-area CSS and background audio plugin
- Optional ACE-Step models picker in Advanced
