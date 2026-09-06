import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gen-gradient": "linear-gradient(90deg, #a876ff 0%, #e6b84d 100%)",
      },
      colors: {
        alchemy: {
          bg: "#0c0812",
          surface: "#171020",
          elevated: "#21152d",
          border: "#3b284d",
          muted: "#aca0b9",
          text: "#f7f1fb",
          accent: "#a876ff",
          accentHover: "#cfb5ff",
          gold: "#e6b84d",
          success: "#34d399",
          danger: "#f87171",
        },
      },
    },
  },
  plugins: [],
};

export default config;
