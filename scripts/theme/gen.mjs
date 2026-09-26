// Emits app/globals.css from palette.mjs, so the shipped CSS and the contrast
// checker can never drift apart. Run: npm run theme:build
import { light, dark, chart } from './palette.mjs';

const ok = ([L, C, H]) => `oklch(${L} ${C} ${H})`;

const GROUPS = [
  [
    'surfaces',
    ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground'],
  ],
  [
    'neutral surfaces — `accent` is the subtle hover/selected fill, not the brand violet',
    [
      'muted',
      'muted-foreground',
      'secondary',
      'secondary-foreground',
      'accent',
      'accent-foreground',
    ],
  ],
  [
    'brand — indigo is primary, violet is the expressive secondary',
    ['primary', 'primary-foreground', 'violet', 'violet-foreground'],
  ],
  ['destructive', ['destructive', 'destructive-foreground']],
  ['lines', ['border', 'input', 'ring']],
  [
    'status — success: accepted, replied, step completed',
    ['success', 'success-fg', 'success-bg', 'success-border'],
  ],
  [
    'status — warning: pending, rate-limited, needs attention',
    ['warning', 'warning-fg', 'warning-bg', 'warning-border'],
  ],
  [
    'status — info: scheduled, queued, informational',
    ['info', 'info-fg', 'info-bg', 'info-border'],
  ],
  [
    'status — danger: failed, bounced, blocked',
    ['danger', 'danger-fg', 'danger-bg', 'danger-border'],
  ],
  [
    'status — neutral: draft, paused, archived',
    ['neutral', 'neutral-fg', 'neutral-bg', 'neutral-border'],
  ],
  [
    'sidebar',
    [
      'sidebar',
      'sidebar-foreground',
      'sidebar-primary',
      'sidebar-primary-foreground',
      'sidebar-accent',
      'sidebar-accent-foreground',
      'sidebar-border',
      'sidebar-ring',
    ],
  ],
];

function block(tok, mode) {
  const out = [];
  for (const [label, keys] of GROUPS) {
    out.push(`  /* ${label} */`);
    for (const k of keys) {
      if (!tok[k]) throw new Error('missing token: ' + k + ' (' + mode + ')');
      out.push(`  --${k}: ${ok(tok[k])};`);
    }
    out.push('');
  }
  out.push('  /* categorical data palette — same metric is the same hue everywhere */');
  for (let i = 1; i <= 6; i++) out.push(`  --chart-${i}: ${ok(chart[mode][i])};`);
  return out.join('\n');
}

// --- token -> tailwind utility namespace mappings -------------------------------
const COLOR_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'muted',
  'muted-foreground',
  'secondary',
  'secondary-foreground',
  'accent',
  'accent-foreground',
  'primary',
  'primary-foreground',
  'violet',
  'violet-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'success',
  'success-fg',
  'success-bg',
  'success-border',
  'warning',
  'warning-fg',
  'warning-bg',
  'warning-border',
  'info',
  'info-fg',
  'info-bg',
  'info-border',
  'danger',
  'danger-fg',
  'danger-bg',
  'danger-border',
  'neutral',
  'neutral-fg',
  'neutral-bg',
  'neutral-border',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
];

const css = `@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* A ".light" island inside ".dark" (the side-by-side theme preview) must win, so the
 * dark variant explicitly excludes anything under ".light". With no ".light" in the
 * tree -- the normal case -- the :not() is always true and this behaves as before. */
@custom-variant dark (&:is(.dark *):not(.light, .light *));

/* ---------------------------------------------------------------------------
 * Design tokens (ported from Veleads). GENERATED FILE — do not hand-edit the oklch() values.
 * Edit scripts/theme/palette.mjs, then \`npm run theme:build\`. Every value here is
 * contrast-checked by \`npm run theme:check\`; hand-editing silently breaks that
 * guarantee. Token reference and usage rules live in THEME.md.
 * ------------------------------------------------------------------------- */

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);

${COLOR_TOKENS.map((t) => `  --color-${t}: var(--${t});`).join('\n')}

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);

  /* Tinted elevation — shadows belong to the palette, they are not neutral grey. */
  --shadow-xs: var(--elevation-xs);
  --shadow-sm: var(--elevation-sm);
  --shadow-md: var(--elevation-md);
  --shadow-lg: var(--elevation-lg);
  --shadow-xl: var(--elevation-xl);

  --ease-out: var(--ease-standard);
}

:root,
.light {
  --radius: 0.625rem;

${block(light, 'light')}

  /* Sparingly: the single most important CTA per screen, and empty-state washes. */
  --gradient-brand: linear-gradient(135deg, var(--primary) 0%, var(--violet) 100%);

  /* Tinted, not neutral grey. */
  --elevation-xs: 0 1px 2px oklch(0.4 0.05 285 / 0.06);
  --elevation-sm: 0 1px 2px oklch(0.4 0.05 285 / 0.06), 0 2px 6px oklch(0.4 0.05 285 / 0.05);
  --elevation-md: 0 2px 4px oklch(0.4 0.05 285 / 0.06), 0 6px 14px oklch(0.4 0.05 285 / 0.08);
  --elevation-lg: 0 4px 8px oklch(0.4 0.05 285 / 0.07), 0 12px 28px oklch(0.4 0.05 285 / 0.1);
  --elevation-xl: 0 8px 16px oklch(0.4 0.05 285 / 0.08), 0 24px 48px oklch(0.4 0.05 285 / 0.12);

  /* Motion */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-base: 200ms;
}

.dark {
${block(dark, 'dark')}

  --gradient-brand: linear-gradient(135deg, var(--primary) 0%, var(--violet) 100%);

  /* Dark surfaces need depth from a darker, heavier shadow than light mode. */
  --elevation-xs: 0 1px 2px oklch(0 0 0 / 0.3);
  --elevation-sm: 0 1px 2px oklch(0 0 0 / 0.3), 0 2px 6px oklch(0 0 0 / 0.28);
  --elevation-md: 0 2px 4px oklch(0 0 0 / 0.32), 0 6px 14px oklch(0 0 0 / 0.36);
  --elevation-lg: 0 4px 8px oklch(0 0 0 / 0.36), 0 12px 28px oklch(0 0 0 / 0.42);
  --elevation-xl: 0 8px 16px oklch(0 0 0 / 0.4), 0 24px 48px oklch(0 0 0 / 0.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }

  /* Chrome/Safari paint the native scrollbar from color-scheme; without this the
   * dark theme gets a white scrollbar and white form-control chrome. */
  :root {
    color-scheme: light;
  }
  .dark {
    color-scheme: dark;
  }
  .light {
    color-scheme: light;
  }
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* Transform-based lifts and the skeleton shimmer are the two motions that
   * actually move things; neutralise them rather than just shortening them. */
  [data-slot],
  .hover-lift {
    transform: none !important;
  }
}
`;

process.stdout.write(css);
