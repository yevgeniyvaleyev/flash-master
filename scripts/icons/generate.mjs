// Generates the app icons from a vector description (no image tools needed): node scripts/icons/generate.mjs
// Motif: a padlock whose body holds three progress bars in topic colors — the top one full — and whose shackle is
// lifting open: do your units and the apps unlock.
// Shapes are signed distance fields with analytic anti-aliasing, written with pngjs (same renderer as AlgoMaster).
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const BG_TOP = [0x3b, 0x5b, 0xdb]; // app primary
const BG_BOTTOM = [0x22, 0x36, 0x9c];
const WHITE = [0xff, 0xff, 0xff];
const TRACK = [0xdc, 0xe3, 0xf7];
const BARS = [
  { color: [0x12, 0xb8, 0x86], fill: 1 }, // teal: target met
  { color: [0xf7, 0x67, 0x07], fill: 0.66 }, // orange
  { color: [0xf5, 0x9f, 0x00], fill: 0.36 }, // yellow
];

// Geometry in centered units (the glyph spans roughly -0.45..0.45; y grows downwards).
const BODY = { x0: -0.34, x1: 0.34, y0: -0.05, y1: 0.43, r: 0.09 };
const SHACKLE = { cx: 0, cy: -0.2, r: 0.2, w: 0.065 };
// The open shackle is lifted and its right leg stops short of the body.
const LIFT = -0.06;
const BAR = { x0: -0.235, x1: 0.235, h: 0.072, ys: [0.065, 0.19, 0.315] };

const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const qx = Math.abs(x - cx) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(y - cy) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const segment = (a, b, r) => (x, y) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) - r;
};
/** Upper half of a ring (the shackle's arch). */
const arch = (cx, cy, r, w) => (x, y) => {
  if (y <= cy) return Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
  // Below the centre: distance to the arch's two end caps.
  return Math.min(Math.hypot(x - cx + r, y - cy), Math.hypot(x - cx - r, y - cy)) - w;
};
const union =
  (...fs) =>
  (x, y) =>
    Math.min(...fs.map((f) => f(x, y)));

const s = SHACKLE;
const cy = s.cy + LIFT;
const shackle = union(
  arch(s.cx, cy, s.r, s.w),
  segment([s.cx - s.r, cy], [s.cx - s.r, BODY.y0 + 0.02], s.w), // left leg, into the body
  segment([s.cx + s.r, cy], [s.cx + s.r, cy + 0.07], s.w), // right leg, lifted out
);
const body = roundRect(BODY.x0, BODY.y0, BODY.x1, BODY.y1, BODY.r);
const track = (y) => roundRect(BAR.x0, y - BAR.h / 2, BAR.x1, y + BAR.h / 2, BAR.h / 2);
const fill = (y, f) => roundRect(BAR.x0, y - BAR.h / 2, BAR.x0 + (BAR.x1 - BAR.x0) * f, y + BAR.h / 2, BAR.h / 2);

/**
 * Renders layers onto a `size`² canvas. `scale` maps glyph units to the canvas (1 = the full width).
 * A layer is { sdf, color: [r,g,b] | (u,v)=>[r,g,b], erase?: true }; the background is a layer with sdf = null.
 */
function render(size, scale, layers) {
  const png = new PNG({ width: size, height: size });
  const unitPerPx = 1 / (size * scale);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      const v = (py + 0.5) / size;
      const x = (u - 0.5) / scale;
      const y = (v - 0.5) / scale;
      let [r, g, b, a] = [0, 0, 0, 0];
      for (const layer of layers) {
        // Coverage from the distance in pixels: 1 inside, 0 outside, linear across one pixel.
        const cov = layer.sdf ? Math.max(0, Math.min(1, 0.5 - layer.sdf(x, y) / unitPerPx)) : 1;
        if (cov === 0) continue;
        if (layer.erase) {
          a *= 1 - cov;
          continue;
        }
        const c = typeof layer.color === 'function' ? layer.color(u, v) : layer.color;
        const na = cov + a * (1 - cov);
        r = (c[0] * cov + r * a * (1 - cov)) / na;
        g = (c[1] * cov + g * a * (1 - cov)) / na;
        b = (c[2] * cov + b * a * (1 - cov)) / na;
        a = na;
      }
      const i = (py * size + px) * 4;
      png.data[i] = Math.round(r);
      png.data[i + 1] = Math.round(g);
      png.data[i + 2] = Math.round(b);
      png.data[i + 3] = Math.round(a * 255);
    }
  }
  return PNG.sync.write(png);
}

const gradient = (u, v) => {
  const t = Math.max(0, Math.min(1, (u + v) / 2));
  return BG_TOP.map((c, i) => c + (BG_BOTTOM[i] - c) * t);
};

const colorGlyph = [
  { sdf: shackle, color: WHITE },
  { sdf: body, color: WHITE },
  ...BAR.ys.map((y) => ({ sdf: track(y), color: TRACK })),
  ...BAR.ys.map((y, i) => ({ sdf: fill(y, BARS[i].fill), color: BARS[i].color })),
];
// Single-color silhouette (Android monochrome icon, notification icon): tracks cut out, fills back in.
const monoGlyph = [
  { sdf: union(shackle, body), color: WHITE },
  ...BAR.ys.map((y) => ({ sdf: track(y), erase: true })),
  ...BAR.ys.map((y, i) => ({ sdf: (x, yy) => fill(y, BARS[i].fill)(x, yy) + 0.018, color: WHITE })),
];
const background = { sdf: null, color: gradient };

// ICON_OUT=<dir> writes somewhere else for a preview.
const outDir = process.env.ICON_OUT ?? new URL('../../assets/', import.meta.url).pathname;
const out = (name, data) => {
  writeFileSync(`${outDir.replace(/\/$/, '')}/${name}`, data);
  console.log(`wrote ${outDir}${name}`);
};

// Adaptive icon layers are 108dp with a 66dp safe circle: keep the glyph within ~0.29 of the center.
out('icon.png', render(1024, 0.72, [background, ...colorGlyph]));
out('favicon.png', render(48, 0.72, [background, ...colorGlyph]));
out('splash-icon.png', render(512, 0.9, colorGlyph));
out('android-icon-background.png', render(512, 1, [background]));
out('android-icon-foreground.png', render(512, 0.52, colorGlyph));
out('android-icon-monochrome.png', render(432, 0.52, monoGlyph));
// Status bar icon: white silhouette on transparent; Android tints it.
out('notification-icon.png', render(96, 0.88, monoGlyph));
