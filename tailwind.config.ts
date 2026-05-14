import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e14",
        surface: {
          DEFAULT: "#121821",
          1: "#161e2a",
          2: "#1a2230",
        },
        divider: {
          DEFAULT: "#222e3f",
          strong: "#2c3a4f",
        },
        fg: {
          DEFAULT: "#f5f9ff",
          muted: "#9aa9bc",
          faint: "#5b6b80",
        },
        accent: {
          DEFAULT: "#177AA9",
          light: "#3DA3D2",
          dim: "#0e5a7e",
        },
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        // brochure print colors — used only inside /internal/brochure renderer
        brochure: {
          fg: "#585860", // Trinity gray, sampled from the logo
          muted: "#7a7a82",
          line: "#c4c4c8",
          trinity: "#1078a8", // Trinity blue, sampled from the logo
          gray: "#585860",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        brand: ["var(--font-brand)", "var(--font-sans)", "sans-serif"],
      },
      boxShadow: {
        "glow-accent":
          "0 0 0 1px rgba(23,122,169,0.4), 0 4px 20px rgba(23,122,169,0.15)",
        panel:
          "0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
