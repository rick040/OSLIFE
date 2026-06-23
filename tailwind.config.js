/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── surfaces (warm paper) ───────────────────────────────
        canvas: '#F2F3EC', // app background
        surface: '#FFFFFF', // cards
        sunken: '#F4F5EE', // insets, ghost buttons, hover
        line: '#E7E9DE', // hairlines, tracks, dividers
        scrim: '#14160F', // modal overlay base

        // ── text (warm near-black ramp) ─────────────────────────
        ink: { DEFAULT: '#1B1D17', soft: '#44483A' },
        muted: '#5C6150',
        faint: '#8C9080',

        // ── brand ───────────────────────────────────────────────
        forest: { DEFAULT: '#34431F', hi: '#455A29' },
        lime: { DEFAULT: '#C7E04F', hi: '#D2E86A' },

        // ── domains (muted, sophisticated; .deep = readable text) ─
        parkingyou: { DEFAULT: '#6E8CA8', deep: '#3F586E' },
        prjct: { DEFAULT: '#9385B0', deep: '#5C4F79' },
        buurtkaart: { DEFAULT: '#6FA07C', deep: '#44694F' },
        personal: { DEFAULT: '#C6A05B', deep: '#856325' },
        cross: { DEFAULT: '#C58392', deep: '#8A5260' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,15,0.04), 0 10px 28px -18px rgba(20,22,15,0.16)',
        'card-lg': '0 2px 6px rgba(20,22,15,0.05), 0 28px 56px -28px rgba(20,22,15,0.20)',
        pop: '0 16px 40px -16px rgba(20,22,15,0.24)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(197,131,146,0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(197,131,146,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(197,131,146,0)' },
        },
        'flow-dash': {
          to: { strokeDashoffset: '-20' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 2s infinite',
        'flow-dash': 'flow-dash 1s linear infinite',
      },
    },
  },
  plugins: [],
}
