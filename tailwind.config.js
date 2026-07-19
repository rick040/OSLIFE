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
        'line-strong': 'hsl(var(--line-strong))', // emphasized edge — hover/active affordance
        scrim: 'hsl(var(--scrim))', // modal overlay base

        // ── text (warm ramp, var-driven) ────────────────────────────────────
        ink: { DEFAULT: 'hsl(var(--ink))', soft: 'hsl(var(--ink-soft))' },
        muted: 'hsl(var(--muted-foreground))',
        faint: 'hsl(var(--faint))',

        // ── brand (var-driven; lightened in dark for legibility) ────────────
        forest: { DEFAULT: 'hsl(var(--forest))', hi: 'hsl(var(--forest-hi))' },
        lime: { DEFAULT: 'hsl(var(--lime))', hi: 'hsl(var(--lime-hi))' },

        // ── domains (muted, sophisticated; .deep = readable text) ───────────
        // .deep is var-driven and flips per mode: a dark, saturated stop in
        // light mode (readable on the pastel bg-{domain}/12 tint) inverts to
        // a light pastel of the same hue in dark mode — a dark-mode card
        // would otherwise render dark-on-dark text if .deep stayed locked.
        parkingyou: { DEFAULT: '#6E8CA8', deep: 'var(--parkingyou-deep)' },
        prjct: { DEFAULT: '#9385B0', deep: 'var(--prjct-deep)' },
        buurtkaart: { DEFAULT: '#6FA07C', deep: 'var(--buurtkaart-deep)' },
        personal: { DEFAULT: '#C6A05B', deep: 'var(--personal-deep)' },
        cross: { DEFAULT: '#C58392', deep: 'var(--cross-deep)' },
      },
      fontFamily: {
        // Figtree — warmer, rounder terminals than Inter; matches the app's
        // organic "warm paper" identity better while keeping the same
        // no-nonsense grotesque proportions for data-dense screens.
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // theme-aware (see --shadow-* in index.css): dark mode swaps in
        // deeper drops + an inset rim highlight so cards lift off a dark
        // canvas instead of reading flat.
        card: 'var(--shadow-card)',
        'card-lg': 'var(--shadow-card-lg)',
        pop: 'var(--shadow-pop)',
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
