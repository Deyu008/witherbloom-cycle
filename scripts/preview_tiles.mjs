// preview_tiles.mjs — 瓦片纹理预览
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
globalThis.document = { createElement: (t) => { if (t === 'canvas') return createCanvas(1,1); } };
const { makeTileSet } = await import('../src/sprites/tiles.js');
const tiles = makeTileSet();
const names = Object.keys(tiles);
const cols = 6, cell = 64, pad = 10, label = 16;
const rows = Math.ceil(names.length / cols);
const c = createCanvas(cols * cell + pad, rows * (cell + label) + pad);
const ctx = c.getContext('2d');
ctx.fillStyle = '#14101e'; ctx.fillRect(0, 0, c.width, c.height);
names.forEach((n, i) => {
  const cx = (i % cols) * cell + pad, cy = Math.floor(i / cols) * (cell + label) + pad;
  // 2x2 平铺展示无缝感
  const t = tiles[n];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ctx.drawImage(t, cx + a * 16, cy + b * 16, 16, 16);
  ctx.drawImage(t, cx, cy, 32, 32);
  ctx.fillStyle = '#8b7f5e'; ctx.font = '10px monospace'; ctx.fillText(n, cx, cy + 32 + 12);
});
writeFileSync('/root/projects/html-game/assets/tiles_preview.png', c.toBuffer('image/png'));
console.log('tiles preview', names.length);
