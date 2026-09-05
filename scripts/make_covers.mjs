// make_covers.mjs — 从 key art 裁切多规格封面(cover-to-fill)
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
const src = await loadImage('/root/projects/html-game/assets/cover_keyart.png');
const sizes = [[616,353],[460,215],[630,500],[1280,720]];
for (const [w,h] of sizes) {
  const c = createCanvas(w,h); const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  const sr = src.width/src.height, tr = w/h;
  let sw, sh, sx, sy;
  if (sr > tr) { sh = src.height; sw = sh*tr; sx = (src.width-sw)/2; sy = 0; }
  else { sw = src.width; sh = sw/tr; sx = 0; sy = (src.height-sh)/2; }
  x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const out = '/root/projects/html-game/assets/cover_' + w + 'x' + h + '.png';
  writeFileSync(out, c.toBuffer('image/png'));
  console.log('cover', w+'x'+h);
}
