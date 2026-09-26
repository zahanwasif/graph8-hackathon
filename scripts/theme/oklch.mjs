// OKLCH -> sRGB -> WCAG relative luminance. No deps.
export function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bb];
}
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function inGamut(L, C, H) {
  return oklchToRgb(L, C, H).every((c) => c >= -0.0005 && c <= 1.0005);
}
export function luminance(L, C, H) {
  // WCAG luminance uses linear-light sRGB, which is what oklchToRgb already returns
  // (after clamping out-of-gamut values the way a browser does).
  const [r, g, b] = oklchToRgb(L, C, H).map((c) => Math.min(1, Math.max(0, c)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function hex(L, C, H) {
  return (
    '#' +
    oklchToRgb(L, C, H)
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function contrast(a, b) {
  const l1 = luminance(...a),
    l2 = luminance(...b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
