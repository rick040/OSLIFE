import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── shadcn semantic tokens (CSS-variable driven, light + dark) ──────
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'muted-foreground': 'hsl(var(--muted-foreground))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },

        // ── OSLIFE neutrals (now var-driven so views adapt to dark) ─────────
        canvas: 'hsl(var(--canvas))', // app background
        surface: 'hsl(var(--surface))', // cards
        sunken: 'hsl(var(--sunken))', // insets, ghost buttons, hover
        line: 'hsl(var(--line))', // hairlines, tracks, dividers
        scrim: 'hsl(var(--scrim))', // modal overlay base

        // ── text (warm ramp, var-driven) ────────────────────────────────────
        ink: { DEFAULT: 'hsl(var(--ink))', soft: 'hsl(var(--ink-soft))' },
        muted: 'hsl(var(--muted-foreground))',
        faint: 'hsl(var(--faint))',

        // ── brand (var-driven; lightened in dark for legibility) ────────────
        forest: { DEFAULT: 'hsl(var(--forest))', hi: 'hsl(var(--forest-hi))' },
        lime: { DEFAULT: 'hsl(var(--lime))', hi: 'hsl(var(--lime-hi))' },

        // ── domains (muted, sophisticated; .deep = readable text) ───────────
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
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 2s infinite',
        'flow-dash': 'flow-dash 1s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
