/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Mono', 'monospace'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      // ---------------------------------------------------------------------
      // WCAG AA verified palette - issue #181
      //
      // Re-measure with `npm run audit:contrast`. Ratios below are measured
      // against the lightest app surface (#16202b), the worst case for light
      // text on a dark background.
      //
      // Solid token contrast on #16202b:
      //   neon.cyan  #00f5ff  12.16:1  (AA + AAA)
      //   neon.green #39ff14  12.14:1  (AA + AAA)
      //   neon.amber #ffb800   9.49:1  (AA + AAA)
      //   white      #ffffff  16.46:1  (AAA)
      //
      // Minimum opacity for body text (>= 4.5:1 on #16202b):
      //   text-white/60       6.72:1
      //   text-neon-cyan/60   5.19:1
      //   text-neon-green/60  5.15:1
      //   text-neon-amber/70  5.26:1   (amber/60 is only 4.22:1 - do not use)
      //
      // Re-run the audit after changing any colour or opacity.
      // ---------------------------------------------------------------------
      colors: {
        neon: { cyan: '#00f5ff', green: '#39ff14', amber: '#ffb800' },
        dark: { 900: '#020408', 800: '#060d14', 700: '#0a1628' },
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin 8s linear infinite',
      },
    },
  },
  plugins: [],
}
