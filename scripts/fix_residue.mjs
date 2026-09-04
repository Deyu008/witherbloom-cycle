// fix_residue.mjs — 清除透明 PNG 里残留的品红系大色块(光晕盘/地面阴影)
// usage: node scripts/fix_residue.mjs <file.png> [threshold]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
const file = process.argv[2];
const THRESH = parseInt(process.argv[3] || '120', 10);
const img = await loadImage(file);
const c = createCanvas(img.width, img.height);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);
const data = ctx.getImageData(0, 0, img.width, img.height);
const d = data.data;

function isMagentaFamily(r, g, b) {
  return r > 110 && b > 110 && g < r - 40 && g < b - 40;
}
// 直方图:量化到 /32 桶,统计品红系像素
const buckets = new Map();
for (let i = 0; i < d.length; i += 4) {
  if (d[i+3] === 0) continue;
  const r = d[i], g = d[i+1], b = d[i+2];
  if (!isMagentaFamily(r, g, b)) continue;
  const key = ((r/32)|0) + ',' + ((g/32)|0) + ',' + ((b/32)|0);
  buckets.set(key, (buckets.get(key) || 0) + 1);
}
// 移除计数超阈值的桶(大色块=残影/光晕);小面积(如法杖球)保留
let removed = 0;
for (let i = 0; i < d.length; i += 4) {
  if (d[i+3] === 0) continue;
  const r = d[i], g = d[i+1], b = d[i+2];
  if (!isMagentaFamily(r, g, b)) continue;
  const key = ((r/32)|0) + ',' + ((g/32)|0) + ',' + ((b/32)|0);
  if ((buckets.get(key) || 0) > THRESH) { d[i+3] = 0; removed++; }
}
ctx.putImageData(data, 0, 0);
writeFileSync(file, c.toBuffer('image/png'));
console.log(file.split('/').pop(), 'removed', removed);
