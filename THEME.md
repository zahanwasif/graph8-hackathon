# Theme

> Ported from Veleads. The tokens, components and rules are the same; only the product
> surfaces differ.

Electric indigo + violet, built on Tailwind v4 CSS-first tokens in OKLCH.

**`src/app/globals.css` is generated.** Do not hand-edit the `oklch()` values — edit
`scripts/theme/palette.mjs` and run:

```bash
npm run theme:build   # regenerate src/app/globals.css from palette.mjs
npm run theme:check   # assert every WCAG pair + sRGB gamut; exits non-zero on failure
```

Hand-editing the CSS silently breaks the guarantee that `theme:check` describes what ships.

---

## How the layers fit together

| Layer | Where | Purpose |
|---|---|---|
| `scripts/theme/palette.mjs` | source of truth | `[L, C, H]` per token, plus the WCAG pairs to assert |
| `scripts/theme/oklch.mjs` | — | OKLCH→sRGB→WCAG luminance, no dependencies |
| `scripts/theme/gen.mjs` | generator | emits `src/app/globals.css` |
| `scripts/theme/check.mjs` | gate | prints the contrast table, fails the build on a regression |
| `src/app/globals.css` | generated | `@theme inline` mappings + `:root` / `.dark` values |

Every token gets a `--color-*` line in `@theme inline`. **Without that line Tailwind emits no
utility for it** — adding `--foo` alone does nothing.

---

## Core ramp

| Token | Role |
|---|---|
| `--background` | app canvas, faintly cool white |
| `--foreground` | primary text — near-black with a violet cast, never pure `#000` |
| `--card` / `--popover` | raised surfaces |
| `--muted` | subtle fills, table stripes |
| `--muted-foreground` | secondary / meta text |
| `--secondary` | tinted neutral button |
| `--accent` / `--accent-foreground` | **the subtle hover + selected surface.** Not the brand violet — see below |
| `--border` | hairlines (decorative) |
| `--input` | field borders |
| `--ring` | focus ring, indigo |
| `--primary` / `--primary-foreground` | brand indigo — CTAs, links, active nav, unread dots |
| `--violet` / `--violet-foreground` | the expressive secondary |
| `--destructive` | destructive actions |

### Why `--accent` is not the brand violet

The brief specified `accent` as vivid violet. In shadcn semantics `--accent` is the *subtle
hover/selected fill* (`hover:bg-accent/50`, `data-[highlighted]:bg-accent`), and it is used that
way in **17 places** here — dropdown highlights, the inbox selected row, analytics range pills,
the lead-source grid. Making it vivid would paint every hover state saturated violet.

So `--accent` stays a violet-*tinted* neutral, and the expressive violet lives in **`--violet`**
(for surfaces) and **`--chart-2`** (for data). Reach for `--violet` when you want the brand's
second voice; never repurpose `--accent` for it.

---

## Status tokens

Five families, four tokens each. **Light and dark are separate designs, not inversions.**

| Family | Means |
|---|---|
| `success` (emerald) | connection accepted, reply received, step completed |
| `warning` (amber) | pending, rate-limited, needs attention |
| `info` (sky) | scheduled, queued, informational |
| `danger` (rose) | failed, bounced, blocked |
| `neutral` (slate) | draft, paused, archived |

| Suffix | Use it for | Never |
|---|---|---|
| `--<s>` | chart marks, progress-bar fills | text, icons |
| `--<s>-fg` | badge text **and status icons** | large filled areas |
| `--<s>-bg` | badge / banner tint | text |
| `--<s>-border` | badge / banner hairline | anything load-bearing |

**Status icons use `-fg`, not the solid.** The solids sit at 2.2–2.9:1 on a light card — fine for a
chart line, too weak for a 12px icon. The `-fg` tokens clear 6.4:1.

### Colour is never the only signal

Every status must also carry an icon or a text label. Reply-green and bounce-red are
indistinguishable to a red-green colourblind user; the icon is what actually communicates.

---

## Categorical data palette

`--chart-1` … `--chart-6`: indigo 274, violet 305, cyan 205, emerald 156, amber 76, rose 18.

**A metric keeps its hue everywhere it appears** — campaign list, stat tile, chart series, legend.
"Connections sent" is `--chart-1` in all three or the system is not doing its job.

Also used by `lib/avatar-color.ts` to map a name hash onto an avatar background.

Several pairs are close in *luminance* (light 2/3, 3/4, 4/5). They are separated by hue, and every
chart series is directly labelled or legended — do not rely on luminance alone to tell them apart.

---

## Gradient and elevation

- `--gradient-brand` — 135° indigo→violet. **Sparingly**: one CTA per screen, and empty-state
  washes. It is not a background texture.
- `--elevation-xs/sm/md/lg/xl` → `shadow-xs` … `shadow-xl`. Tinted (`oklch(0.4 0.05 285 / …)`) in
  light so shadows belong to the palette; near-black and heavier in dark, where a tinted shadow
  reads as haze.

## Motion

`--ease-standard` (`cubic-bezier(.4,0,.2,1)`), `--duration-fast` 150ms, `--duration-base` 200ms.
Hover and focus only — no entrance animation on page load. A global `prefers-reduced-motion` block
in `globals.css` collapses durations and kills transforms.

---

## Primitives

Everything in `components/ui/` is shadcn **base-nova** on `@base-ui/react` (except
`dropdown-menu` and `select`, still Radix). Extend with the shadcn CLI, not by hand --
but note two things about it:

1. It writes `import { cn } from "cn"`. That is wrong; fix it to `@/lib/utils`.
2. **It silently overwrites files it treats as dependencies.** It clobbered `button.tsx`
   (destroying the `nativeButton`/`rendersNativeButton` logic the sidebar needs for
   `render={<Link/>}`), `dialog.tsx`, `input.tsx` and `textarea.tsx`. Run every `add` you
   need first, then re-apply local edits.

The ones carrying the design system:

| Primitive | What to reach for |
|---|---|
| `Badge` | `variant="success\|warning\|info\|danger\|neutral"` -- **always with an icon** |
| `Card` | `accent="chart-1".."chart-6"` / a status, plus `accentSide="top\|left"` |
| `Alert` | same status variants, plus `rule` for the 3px left rule |
| `Progress` | `variant="gradient"` for brand, `variant="chart-N"` to match a metric |
| `EmptyState` | **every** "nothing here" view; gradient wash, optional `action` |
| `LoadingState` | **every** whole-page/panel wait; use `Skeleton` instead when the result's shape is known |
| `PageHeader` | **every** page title; `size="sm"` for detail views, `back` for a back link, `actions` for the CTA |
| `Avatar` | pair with `avatarColorStyle(name)` + `initials(name)` from `lib/avatar-color.ts` |

Dropzones, the sequence wait pill and dashed *buttons* keep their dashed borders on purpose --
`EmptyState` is for "nothing here yet", not for "drop a file here".

### The three shapes of an empty view

Use the same component everywhere; only the props change.

| Where | Props |
|---|---|
| A page or a panel | defaults |
| Inside a bordered container -- a table `colSpan` cell, a dialog body | `bordered={false}` |
| A tight space -- a dropdown, a small panel | `size="sm"` (often with `bordered={false}`) |

`bordered={false}` exists because a bordered empty state inside a bordered table draws two
boxes. It drops the dashed border *and* the wash, keeping the icon chip, title and action, so
an empty table still reads as part of the table.

**An empty view is not an error view.** Failures stay `text-destructive`; `EmptyState` is
reserved for "there is nothing here", which is why it gets the friendly indigo wash.

## Page anatomy

Every page is the same three parts in the same order, so a new screen has no decisions left:

1. **`<PageHeader>`** — `text-2xl` title, one-line description, and the primary action in
   `actions`. Detail views (campaign detail, list detail) use `size="sm"` plus a `back` button;
   a 2xl title there competes with the tab row.
2. **Toolbar** (optional) — search, filters. Never the create button: that lives in the header.
3. **Content** — a table in
   `overflow-x-auto rounded-xl border border-border bg-card shadow-xs`, or an `EmptyState`.

**The primary create action is `variant="gradient"`, once per page, in `PageHeader actions`.**
Secondary actions beside it are `variant="outline"` (see "New collection" next to "New list").

Tables use the `Table` primitive. The one exception is `records/records-table.tsx`, which keeps
a hand-rolled `<table>` for its sticky first column and `calc()` sizing — its header classes are
kept in sync with `TableHead` by hand.

The sequence builder's `builder-toolbar.tsx` keeps its own `text-sm` title on purpose: it is
full-screen editor chrome, not a page.

## Status mapping in the product

| Surface | Source of truth |
|---|---|
| Integration connection state | `src/components/integrations/integration-card.tsx` (`STATE_META`) |
| Member role | `src/components/workspace-settings/workspace-members-client.tsx` (`RoleBadge`) |

## Third-party surfaces

Clerk does not follow the tokens on its own:

- **Clerk** renders its own DOM. `src/lib/clerk-appearance.ts` hands it CSS vars via `variables`;
  use `clerkAuthAppearance` on `<SignIn>`/`<SignUp>` and `clerkSidebarAppearance` on
  `<UserButton>`/`<OrganizationSwitcher>`.

## Adding a new coloured surface

1. **Reach for an existing token first.** A new "orange for X" is almost always `warning`.
2. If it is genuinely new, add it to **`scripts/theme/palette.mjs`** in *both* `light` and `dark`.
3. Add the pair you care about to `PAIRS` (WCAG-enforced), `DECORATIVE` (hairlines), or
   `REPORTED` (measured but not gated).
4. Add the token name to `COLOR_TOKENS` in `gen.mjs` so it gets a `--color-*` mapping.
5. `npm run theme:build && npm run theme:check`.
6. Show it in `/theme-preview`.

Never write a raw hex or a Tailwind palette literal (`text-emerald-600`, `bg-amber-50`) in app
code. The Phase 0 audit found 76 such lines across 32 files; that is the drift this system exists
to prevent.

---

## Contrast

`npm run theme:check` is the authority. Assertions follow WCAG 1.4.3 (4.5:1 body text) and 1.4.11
(3:1 focus indicators and meaningful graphics).

Measured floors at time of writing — light / dark:

| Pair | Light | Dark |
|---|---|---|
| body text on canvas | 17.6 | 17.0 |
| meta text on canvas | 5.4 | 7.6 |
| meta on muted fill | 5.0 | 6.1 |
| primary button label | 5.0 | 5.9 |
| violet button label | 4.6 | 6.5 |
| link / brand text on card | 5.2 | 5.6 |
| status badge text (worst of 5) | 5.8 | 6.5 |
| status icon on card (worst of 5) | 6.5 | 8.4 |
| focus ring vs surround (worst) | 4.7 | 4.8 |
| chart mark on card (worst of 6) | 3.2 | 5.9 |
| field border (worst surface) | 3.0 | 3.0 |

### One deliberate departure

**Hairlines are ~1.2–1.6:1 and that is correct.** WCAG 1.4.11 covers what you must perceive to
*operate* a control. A decorative separator between a card and the canvas is not that. Forcing 3:1
produces a heavy grid, not hairlines — shadcn stock ships 1.26:1, and Linear/Primer sit in the same
band. These are asserted in `DECORATIVE` at a "visible at all" floor instead.

`--input` is **not** in that category and is fully enforced: a field's border is what identifies
the control, so it is asserted at 3:1 against every surface a field sits on — `background`, `card`
and `muted`. In dark mode the binding surface is `card`, not `background`, because a light border
loses contrast against a lighter surface. `REPORTED` is currently empty: nothing is exempt.
