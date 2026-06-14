/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "sans-serif"],
        display: ["Syne", "sans-serif"],
      },
      colors: {
        bg: {
          primary: "#0a0c10",
          secondary: "#0f1117",
          tertiary: "#151820",
          card: "#141720",
        },
        accent: {
          purple: "#6c63ff",
          violet: "#a78bfa",
          green: "#10d9a0",
          amber: "#f59e0b",
          blue: "#60a5fa",
          pink: "#f472b6",
          red: "#f87171",
        },
      },
      animation: {
        "bounce-slow": "bounce 1.2s infinite",
      },
    },
  },
  plugins: [],
};
