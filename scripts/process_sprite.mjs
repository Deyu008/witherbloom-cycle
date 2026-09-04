// process_sprite.mjs — 边缘洪水填充抠背景 + 裁切 + 缩放
// usage: node scripts/process_sprite.mjs <in> <out> <targetHeight>
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';

const [inPath, outPath, targetH] = [process.argv[2], process.argv[3], parseInt(process.argv[4] || '96', 10)];

const img = await loadImage(inPath);
const W = img.width, H = img.height;
const c = createCanvas(W, H);
const ctx = c.getContext('2d');
ctx.drawImage(img, 0, 0);
const data = ctx.getImageData(0, 0, W, H);
const d = data.data;

// 参考背景色 = 四角平均
function px(x, y) { const i = (y * W + x) * 4; return [d[i], d[i+1], d[i+2]]; }
const corners = [px(0,0), px(W-1,0), px(0,H-1), px(W-1,H-1)];
const bg = [0,1,2].map(k => corners.reduce((s,p)=>s+p[k],0)/4);
const TOL = 70;
function nearBg(x, y) {
  const [r,g,b] = px(x,y);
  const dr=r-bg[0], dg=g-bg[1], db=b-bg[2];
  return (dr*dr+dg*dg+db*db) < TOL*TOL;
}

// 洪水填充:从所有边界像素开始,只扩散到 nearBg 的像素
const visited = new Uint8Array(W*H);
const stack = [];
function push(x,y){ const idx=y*W+x; if(!visited[idx]){ visited[idx]=1; stack.push(idx); } }
for (let x=0;x<W;x++){ push(x,0); push(x,H-1); }
for (let y=0;y<H;y++){ push(0,y); push(W-1,y); }
while (stack.length){
  const idx = stack.pop();
  const x = idx % W, y = (idx / W) | 0;
  if (!nearBg(x,y)) { visited[idx]=0; continue; } // 不是背景,撤销
  d[idx*4+3] = 0; // 透明
  if (x>0) push(x-1,y); if (x<W-1) push(x+1,y);
  if (y>0) push(x,y-1); if (y<H-1) push(x,y+1);
}
ctx.putImageData(data, 0, 0);

// bbox of opaque
let minX=W,minY=H,maxX=0,maxY=0;
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  if (d[(y*W+x)*4+3] > 0){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
}
if (maxX<=minX||maxY<=minY){ console.error('empty bbox'); process.exit(1); }
const bw=maxX-minX+1, bh=maxY-minY+1;
const scale = targetH / bh;
const tw = Math.max(1, Math.round(bw*scale));
const out = createCanvas(tw, targetH);
const octx = out.getContext('2d');
octx.imageSmoothingEnabled = true;
octx.drawImage(c, minX, minY, bw, bh, 0, 0, tw, targetH);
writeFileSync(outPath, out.toBuffer('image/png'));
console.log('bg', bg.map(Math.round).join(','), 'bbox', bw+'x'+bh, '->', tw+'x'+targetH);
