/**
 * Deterministic avatar colour: a name hashes onto one of the six categorical hues, so the
 * same person is the same colour on every screen and across reloads. Hues come from the
 * chart palette (see THEME.md) rather than a private list, so avatars stay in the system.
 */

const CHART_HUES = 6;

/** FNV-1a. Small, stable, and no dependency -- we only need even spread, not crypto. */
function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 1-based index into --chart-1 .. --chart-6. */
export function avatarHueIndex(name: string | null | undefined) {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return CHART_HUES; // empty names all land on one hue rather than colliding with 'a'
  return (hash(key) % CHART_HUES) + 1;
}

/**
 * Inline style for an avatar fallback. The tint is the hue at low alpha so the initials stay
 * legible; the text uses the full-strength hue, which clears 3:1 on card in both modes.
 */
export function avatarColorStyle(name: string | null | undefined): React.CSSProperties {
  const hue = `var(--chart-${avatarHueIndex(name)})`;
  return {
    backgroundColor: `color-mix(in oklch, ${hue} 16%, var(--card))`,
    color: `color-mix(in oklch, ${hue} 80%, var(--foreground))`,
  };
}

/** "Ada Lovelace" -> "AL", "cher" -> "C", "" -> "?" */
export function initials(name: string | null | undefined) {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
