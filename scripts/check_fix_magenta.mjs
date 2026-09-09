// usage: node check_fix_magenta.mjs <png> [force]
// Counts residue classes among non-transparent pixels:
//   bright  = r>150 && b>140 && g<110                     (bright magenta)
//   family  = r>90 && b>85 && r-g>60 && b-g>50            (pink / orchid disc)
//   shadow  = r>90 && b>60 && g<120 && r-g>55 && 25<b-g<60 (dark magenta / crimson shadow)
// If bright>30 || family>30 || shadow>30 (or force): global color-key pass removing
// pixels within euclidean distance 60 of the magenta bg (8E219C) plus all three
// residue classes; re-saves. Prints counts before/after.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "fs";

const p = process.argv[2];
const force = process.argv[3] === "force";
const img = await loadImage(p);
const W = img.width, H = img.height;
const c = createCanvas(W, H);
const ctx = c.getContext("2d");
ctx.drawImage(img, 0, 0);
const data = ctx.getImageData(0, 0, W, H);
const d = data.data;

const A = (i) => d[i + 3] > 0;
const isBright = (i) => d[i] > 150 && d[i + 2] > 140 && d[i + 1] < 110;
const isFamily = (i) => d[i] > 90 && d[i + 2] > 85 &&
  (d[i] - d[i + 1]) > 60 && (d[i + 2] - d[i + 1]) > 50;
const isShadow = (i) => d[i] > 90 && d[i + 2] > 60 && d[i + 1] < 120 &&
  (d[i] - d[i + 1]) > 55 && (d[i + 2] - d[i + 1]) > 25 && (d[i + 2] - d[i + 1]) < 60;

function count(dd) {
  let bright = 0, family = 0, shadow = 0;
  for (let i = 0; i < dd.length; i += 4) {
    if (dd[i + 3] === 0) continue;
    const r = dd[i], g = dd[i + 1], b = dd[i + 2];
    if (r > 150 && b > 140 && g < 110) bright++;
    if (r > 90 && b > 85 && (r - g) > 60 && (b - g) > 50) family++;
    if (r > 90 && b > 60 && g < 120 && (r - g) > 55 && (b - g) > 25 && (b - g) < 60) shadow++;
  }
  return { bright, family, shadow };
}

const before = count(d);
console.log("bright_magenta_pixels=" + before.bright + " magenta_family_pixels=" + before.family + " magenta_shadow_pixels=" + before.shadow);

if (force || before.bright > 30 || before.family > 30 || before.shadow > 30) {
  const bg = [0x8E, 0x21, 0x9C];
  const TOL2 = 60 * 60;
  let removed = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    let kill = (r > 150 && b > 140 && g < 110);
    if (!kill) kill = (r > 90 && b > 85 && (r - g) > 60 && (b - g) > 50);
    if (!kill) kill = (r > 90 && b > 60 && g < 120 && (r - g) > 55 && (b - g) > 25 && (b - g) < 60);
    if (!kill) {
      const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
      if (dr * dr + dg * dg + db * db < TOL2) kill = true;
    }
    if (kill) { d[i + 3] = 0; removed++; }
  }
  ctx.putImageData(data, 0, 0);
  writeFileSync(p, c.toBuffer("image/png"));
  const after = count(ctx.getImageData(0, 0, W, H).data);
  console.log("color_key_removed=" + removed + " bright_magenta_after=" + after.bright + " magenta_family_after=" + after.family + " magenta_shadow_after=" + after.shadow);
} else {
  console.log("OK_no_fix_needed");
}
