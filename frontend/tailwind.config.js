/** @type {import('tailwindcss').Config} */
const tailwindConfig = {
  content: ["./app/**/*.{js,jsx}", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        dune: {
          black: "#000000",
          ink: "#0A0908",
          surface: "#121110",
          border: "#2A2320",
          amber: "#D97706",
          amberLight: "#F59E0B",
          amberDeep: "#92400E",
          sand: "#E7D9C4",
        },
      },
      fontFamily: {
        display: ["'Bebas Neue'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
      backgroundImage: {
        "dune-gradient": "linear-gradient(180deg, #000000 0%, #120D08 60%, #000000 100%)",
        "amber-gradient": "linear-gradient(90deg, #92400E 0%, #D97706 50%, #F59E0B 100%)",
      },
      boxShadow: {
        amberGlow: "0 0 40px -10px rgba(217, 119, 6, 0.45)",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.7s ease-out both",
        flicker: "flicker 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default tailwindConfig;
