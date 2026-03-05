import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#0F172A",
        foreground: "#F1F5F9",
        muted: {
          DEFAULT: "#111827",
          foreground: "#94A3B8"
        },
        border: "#1F2937",
        accent: {
          emerald: "#10B981",
          crimson: "#EF4444"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.625rem",
        sm: "0.5rem"
      },
      boxShadow: {
        card: "0 18px 45px rgba(15, 23, 42, 0.7)"
      }
    }
  },
  plugins: []
};

export default config;
