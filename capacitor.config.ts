import type { CapacitorConfig } from "@capacitor/cli";

// Mobile shells MUST use a hosted Next API URL.
// Phones must NOT run local SQLite or ACE-Step.
// Set CAPACITOR_SERVER_URL or edit server.url before cap:sync.
// Examples: Codespace https://<id>-3000.app.github.dev
//           tunnel https://xxxx.ngrok-free.app
//           deploy https://your-app.example.com
//           Android emulator http://10.0.2.2:3000
//           adb reverse: http://localhost:3000

const HOSTED_NEXT_URL =
  process.env.CAPACITOR_SERVER_URL ?? "http://localhost:3000";

const config: CapacitorConfig = {
  appId: "com.audioalchemy.app",
  appName: "Audio Alchemy",
  webDir: "desktop-dist",
  server: {
    url: HOSTED_NEXT_URL,
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
