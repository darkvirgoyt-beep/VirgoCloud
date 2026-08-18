import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#070914", panel: "#101326", nebula: "#7657ff", mint: "#55efc4", signal: "#76a7ff" },
      boxShadow: { glow: "0 0 0 1px rgba(151, 129, 255, .14), 0 20px 60px rgba(3, 4, 20, .45)" }
    }
  },
  plugins: []
} satisfies Config;
