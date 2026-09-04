// preview_imgsprites.mjs — 图片精灵全家福预览
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync, readdirSync } from 'fs';
const dir = '/root/projects/html-game/assets/img/sprites/';
const files = readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const SCALE = 2;
const CELL_W = 150, CELL_H = 280, PAD = 12, LABEL = 18;
const cols = 6;
const rows = Math.ceil(files.length / cols);
const canvas = createCanvas(cols * CELL_W + PAD, rows * CELL_H + PAD);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a1428'; ctx.fillRect(0, 0, canvas.width, canvas.height);
let i = 0;
for (const f of files) {
  const img = await loadImage(dir + f);
  const cx = (i % cols) * CELL_W + PAD;
  const cy = Math.floor(i / cols) * CELL_H + PAD;
  // checker bg to show transparency
  ctx.fillStyle = '#0c0a14'; ctx.fillRect(cx, cy, CELL_W - 8, CELL_H - LABEL - 8);
  const dw = (img.width) * SCALE, dh = (img.height) * SCALE;
  const ox = cx + (CELL_W - 8 - dw) / 2, oy = cy + (CELL_H - LABEL - 8 - dh);
  ctx.drawImage(img, ox, oy, dw, dh);
  ctx.fillStyle = '#8b7f5e'; ctx.font = '11px monospace';
  ctx.fillText(f.replace('.png',''), cx, cy + CELL_H - LABEL + 4);
  i++;
}
writeFileSync('/root/projects/html-game/assets/imgsprites_preview.png', canvas.toBuffer('image/png'));
console.log('preview', files.length, 'sprites');
