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

        // ── OSLIFE neutrals — deep obsidian, dark-only ───────────────────────
        canvas: 'hsl(var(--canvas))', // app background
        surface: 'hsl(var(--surface))', // cards
        sunken: 'hsl(var(--sunken))', // insets, ghost buttons, hover/elevated
        line: 'hsl(var(--line))', // hairlines, tracks, dividers
        'line-strong': 'hsl(var(--line-strong))', // emphasized edge — hover/active affordance
        scrim: 'hsl(var(--scrim))', // modal overlay base

        // ── text ─────────────────────────────────────────────────────────
        ink: { DEFAULT: 'hsl(var(--ink))', soft: 'hsl(var(--ink-soft))' },
        muted: 'hsl(var(--muted-foreground))',
        faint: 'hsl(var(--faint))',

        // ── brand accent (icons/progress/focus — buttons use the ink/canvas
        // inverse instead, see .btn-primary in index.css) ───────────────────
        forest: { DEFAULT: 'hsl(var(--forest))', hi: 'hsl(var(--forest-hi))' },
        lime: { DEFAULT: 'hsl(var(--lime))', hi: 'hsl(var(--lime-hi))' },

        // ── domains — luminescent glyph + text, never a saturated card fill.
        // `deep` is the lighter tint (one step up the same Tailwind ramp)
        // used as readable text/border on a domain-tinted pill.
        parkingyou: { DEFAULT: '#60A5FA', deep: 'var(--parkingyou-deep)' },
        prjct: { DEFAULT: '#A78BFA', deep: 'var(--prjct-deep)' },
        buurtkaart: { DEFAULT: '#34D399', deep: 'var(--buurtkaart-deep)' },
        personal: { DEFAULT: '#FBBF24', deep: 'var(--personal-deep)' },
        cross: { DEFAULT: '#F87171', deep: 'var(--cross-deep)' },
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
        // see --shadow-* in index.css: cards are flat (none) by design —
        // only floating overlays (modals/sheets) keep shadow-pop.
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
          '0%': { boxShadow: '0 0 0 0 rgba(248,113,113,0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgba(248,113,113,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(248,113,113,0)' },
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
        // HeyraOrb — idle is a slow, calm breathe; thinking is faster and
        // reaches a brighter peak so the orb visibly "comes alive" while a
        // brain call is in flight, without needing a JS animation library.
        'orb-breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.06)', opacity: '1' },
        },
        'orb-think': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)', opacity: '0.9' },
          '50%': { transform: 'scale(1.12) rotate(8deg)', opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'pulse-ring': 'pulse-ring 2s infinite',
        'flow-dash': 'flow-dash 1s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'orb-breathe': 'orb-breathe 4.5s ease-in-out infinite',
        'orb-think': 'orb-think 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
