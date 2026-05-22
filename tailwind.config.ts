import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Trinity-matched light palette. Sampled from trinitysurfaces.com
        // and the Trinity tile logo. Token names match the previous dark
        // palette so all pages re-theme without code changes.
        bg: "#FFFFFF",
        surface: {
          DEFAULT: "#F7F6F2",
          1: "#EFEEE7",
          2: "#E8E0CD", // Trinity warm cream — sparingly, for emphasis bands
        },
        divider: {
          DEFAULT: "#E5E4DA",
          strong: "#D8D7D7", // Trinity divider grey
        },
        fg: {
          DEFAULT: "#0d0f0b", // Trinity warm off-black
          muted: "#5f6062", // Trinity warm grey
          faint: "#9C9B96",
        },
        accent: {
          // Trinity blue — sampled from the logo, locked.
          DEFAULT: "#177AA9",
          light: "#3DA3D2",
          dim: "#0e5a7e",
          wash: "#E7F1F7", // very faint blue for tinted blocks
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
          "0 0 0 1px rgba(23,122,169,0.25), 0 1px 2px rgba(23,122,169,0.06)",
        panel:
          "0 1px 0 rgba(13,15,11,0.04), 0 4px 14px rgba(13,15,11,0.06)",
        rest: "0 1px 0 rgba(13,15,11,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
