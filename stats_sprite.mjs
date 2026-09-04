// usage: node stats_sprite.mjs <png>
// Prints opaque fraction, bbox, and top opaque colors histogram + magenta residue counts.
import { createCanvas, loadImage } from "@napi-rs/canvas";
const p = process.argv[2];
const img = await loadImage(p);
const W = img.width, H = img.height;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");
ctx.drawImage(img, 0, 0);
const d = ctx.getImageData(0, 0, W, H).data;
let opaque = 0, minX = W, minY = H, maxX = 0, maxY = 0;
const hist = new Map();
let bright = 0, family = 0, shadow = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (d[i + 3] === 0) continue;
  opaque++;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  const r = d[i], g = d[i + 1], b = d[i + 2];
  if (r > 150 && b > 140 && g < 110) bright++;
  if (r > 90 && b > 85 && (r - g) > 60 && (b - g) > 50) family++;
  if (r > 90 && b > 60 && g < 120 && (r - g) > 55 && (b - g) > 25 && (b - g) < 60) shadow++;
  const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
  hist.set(key, (hist.get(key) || 0) + 1);
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(JSON.stringify({
  size: W + "x" + H,
  opaque, opaqueFrac: +(opaque / (W * H)).toFixed(3),
  bbox: [minX, minY, maxX, maxY],
  brightMagenta: bright, magentaFamily: family, magentaShadow: shadow,
  topColors: top.map(([k, v]) => k + ":" + v)
}));
