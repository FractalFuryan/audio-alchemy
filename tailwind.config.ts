import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        alchemy: {
          bg: "#0a0a0f",
          surface: "#12121a",
          elevated: "#1a1a26",
          border: "#2a2a3a",
          muted: "#8b8b9e",
          text: "#f0f0f5",
          accent: "#a78bfa",
          accentHover: "#c4b5fd",
          gold: "#fbbf24",
          success: "#34d399",
          danger: "#f87171",
        },
      },
    },
  },
  plugins: [],
};

export default config;
