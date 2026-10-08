import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./tests/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: "rgb(var(--surface-canvas) / <alpha-value>)",
          panel: "rgb(var(--surface-panel) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
          line: "rgb(var(--surface-line) / <alpha-value>)",
        },
        ink: {
          primary: "rgb(var(--ink-primary) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        accent: {
          teal: "rgb(var(--accent-teal) / <alpha-value>)",
          amber: "rgb(var(--accent-amber) / <alpha-value>)",
          rose: "rgb(var(--accent-rose) / <alpha-value>)",
        },
      },
      boxShadow: {
        focus: "0 0 0 3px rgb(var(--accent-teal) / 0.28)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      transitionDuration: {
        micro: "var(--motion-micro)",
        ui: "var(--motion-ui)",
        overlay: "var(--motion-overlay)",
        panel: "var(--motion-panel)",
        screen: "var(--motion-screen)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
        spring: "var(--ease-spring)",
        "out-soft": "var(--ease-out-soft)",
      },
    },
  },
  plugins: [],
};

export default config;
