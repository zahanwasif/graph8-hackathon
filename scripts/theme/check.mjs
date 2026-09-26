import { contrast, hex, oklchToRgb } from './oklch.mjs';
import { light, dark, chart, PAIRS, DECORATIVE, REPORTED } from './palette.mjs';

const clipError = (L, C, H) => Math.max(...oklchToRgb(L, C, H).map((c) => Math.max(0, -c, c - 1)));

let fails = 0;
const rows = [];

function run(list, tok, mode, kind) {
  for (const [fg, bg, label, min] of list) {
    const r = contrast(tok[fg], tok[bg]);
    const ok = r >= min;
    if (!ok && kind !== 'reported') fails++;
    rows.push({ mode, kind, label, fg, bg, r, min, ok });
  }
}

for (const [mode, tok] of [
  ['light', light],
  ['dark', dark],
]) {
  run(PAIRS, tok, mode, 'wcag');
  run(DECORATIVE, tok, mode, 'decorative');
  run(REPORTED, tok, mode, 'reported');

  const clipped = Object.entries(tok)
    .map(([k, v]) => [k, clipError(...v)])
    .filter(([, e]) => e > 0.005);
  if (clipped.length) {
    fails += clipped.length;
    console.log(
      '!! ' + mode + ' OUT OF sRGB:',
      clipped.map(([k, e]) => k + ' ' + e.toFixed(3)).join(', '),
    );
  }
}

for (const mode of ['light', 'dark']) {
  const surf = mode === 'light' ? light.card : dark.card;
  for (let i = 1; i <= 6; i++) {
    const c = chart[mode][i];
    const r = contrast(c, surf);
    if (r < 3) fails++;
    rows.push({
      mode,
      kind: 'chart',
      label: 'chart-' + i + ' mark on card',
      r,
      min: 3,
      ok: r >= 3,
    });
    const e = clipError(...c);
    if (e > 0.005) {
      fails++;
      console.log('!! ' + mode + ' chart-' + i + ' out of sRGB by ' + e.toFixed(3));
    }
  }
}

for (const mode of ['light', 'dark']) {
  console.log('\n===== ' + mode.toUpperCase() + ' =====');
  for (const kind of ['wcag', 'chart', 'decorative', 'reported']) {
    const sub = rows.filter((x) => x.mode === mode && x.kind === kind);
    if (!sub.length) continue;
    console.log('-- ' + kind);
    for (const x of sub) {
      console.log(
        '  ' + x.label.padEnd(30),
        x.r.toFixed(2).padStart(6),
        ('>=' + x.min).padStart(6),
        x.kind === 'reported' ? (x.ok ? 'ok' : 'BELOW TARGET (documented)') : x.ok ? 'ok' : 'FAIL',
      );
    }
  }
}

console.log('\n===== CHART PAIRWISE LUMINANCE SEPARATION (informational) =====');
for (const mode of ['light', 'dark']) {
  const weak = [];
  for (let i = 1; i <= 6; i++)
    for (let j = i + 1; j <= 6; j++) {
      const r = contrast(chart[mode][i], chart[mode][j]);
      if (r < 1.15) weak.push(i + '/' + j + ' ' + r.toFixed(2));
    }
  console.log(
    '  ' + mode.padEnd(6),
    weak.length ? 'close in luminance: ' + weak.join(', ') : 'all separated',
  );
}

console.log('\n===== HEX =====');
for (const [name, tok] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(
    '  ' + name + ':',
    ['background', 'foreground', 'primary', 'violet', 'success', 'warning', 'info', 'danger']
      .map((k) => k + ' ' + hex(...tok[k]))
      .join('  '),
  );
}
console.log('  chart light:', [1, 2, 3, 4, 5, 6].map((i) => hex(...chart.light[i])).join(' '));
console.log('  chart dark: ', [1, 2, 3, 4, 5, 6].map((i) => hex(...chart.dark[i])).join(' '));

console.log(fails ? '\n' + fails + ' FAILURES' : '\nALL ASSERTIONS PASS');
process.exit(fails ? 1 : 0);
