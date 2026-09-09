// usage: node sample_rows.mjs <png> <rowFrom> <rowTo>
import { createCanvas, loadImage } from "@napi-rs/canvas";
const [p, r0, r1] = [process.argv[2], +process.argv[3], +process.argv[4]];
const img = await loadImage(p);
const W = img.width, H = img.height;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");
ctx.drawImage(img, 0, 0);
const d = ctx.getImageData(0, 0, W, H).data;
const hist = new Map();
for (let y = Math.max(0, r0); y <= Math.min(H - 1, r1); y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (d[i + 3] === 0) continue;
  const key = d[i] + "," + d[i + 1] + "," + d[i + 2];
  hist.set(key, (hist.get(key) || 0) + 1);
}
console.log([...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + ":" + v).join("  "));
