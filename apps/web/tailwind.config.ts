import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ash: {
          50: "#f7f4f2",
          100: "#efe9e4",
          200: "#d9cfc6",
          300: "#bdaea2",
          400: "#9c887a",
          500: "#7f6b5b",
          600: "#675346",
          700: "#4f3e34",
          800: "#3a2c24",
          900: "#241b16"
        }
      }
    }
  },
  plugins: []
};

export default config;
