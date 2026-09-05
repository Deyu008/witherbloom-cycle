// tiles.js — 程序化纹理 Tile 集(32x32, 种子噪声+边缘光+专属细节)
// 取代原 8x8 双色网格, 提升地面质感以匹配精细立绘。导出名/键保持不变。
import { PAL } from '../palette.js';

// 可复现随机数(mulberry32), 保证同 tile 每次生成一致
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZE = 32;
function makeCanvas() {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

// 通用纹理: 底色 + 噪声斑点 + 边缘受光/背光 + 可选细节回调
function tex(seed, base, dark, light, detail) {
  const [c, x] = makeCanvas();
  const r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, SIZE, SIZE);
  // 噪声斑点
  const n = 46;
  for (let i = 0; i < n; i++) {
    const px = (r() * SIZE) | 0, py = (r() * SIZE) | 0;
    const s = r() < 0.7 ? 1 : 2;
    x.fillStyle = r() < 0.5 ? dark : light;
    x.globalAlpha = 0.25 + r() * 0.35;
    x.fillRect(px, py, s, s);
  }
  x.globalAlpha = 1;
  // 边缘光: 顶/左受光, 底/背背光
  x.fillStyle = light; x.globalAlpha = 0.18; x.fillRect(0, 0, SIZE, 1); x.fillRect(0, 0, 1, SIZE);
  x.fillStyle = '#000'; x.globalAlpha = 0.28; x.fillRect(0, SIZE - 1, SIZE, 1); x.fillRect(SIZE - 1, 0, 1, SIZE);
  x.globalAlpha = 1;
  if (detail) detail(x, r);
  return c;
}

function line(x, x0, y0, x1, y1, color, alpha) {
  x.strokeStyle = color; x.globalAlpha = alpha; x.lineWidth = 1;
  x.beginPath(); x.moveTo(x0 + 0.5, y0 + 0.5); x.lineTo(x1 + 0.5, y1 + 0.5); x.stroke();
  x.globalAlpha = 1;
}

export function makeTileSet() {
  const t = {};
  t.grass = tex(11, PAL.ch1_grass, '#2e5e3a', PAL.ch1_grassH, (x, r) => {
    for (let i = 0; i < 3; i++) { x.fillStyle = i === 2 ? '#e0b76a' : '#e89cb4'; x.fillRect((r()*30)|0, (r()*30)|0, 2, 2); }
  });
  t.grassLeaf = tex(12, PAL.ch1_grass, '#2e5e3a', PAL.ch1_grassH, (x, r) => {
    x.fillStyle = PAL.ch1_leaf;
    for (let i = 0; i < 4; i++) { const px=(r()*28)|0, py=(r()*28)|0; x.fillRect(px, py, 3, 2); x.fillRect(px+1, py+2, 2, 2); }
  });
  t.mossStone = tex(13, PAL.ch1_bark, '#2a1a14', PAL.ch1_barkH, (x, r) => {
    x.fillStyle = '#4a7a4a'; x.globalAlpha = 0.7;
    for (let i = 0; i < 5; i++) x.fillRect((r()*30)|0, (r()*10)|0, 3, 2);
    x.globalAlpha = 1;
  });
  t.brick = tex(21, PAL.ch2_ash, '#1a0e0e', PAL.ch2_ashH, (x) => {
    line(x, 0, 8, 32, 8, '#1a0e0e', 0.6); line(x, 0, 16, 32, 16, '#1a0e0e', 0.6); line(x, 0, 24, 32, 24, '#1a0e0e', 0.6);
    line(x, 8, 0, 8, 8, '#1a0e0e', 0.5); line(x, 24, 0, 24, 8, '#1a0e0e', 0.5);
    line(x, 16, 8, 16, 16, '#1a0e0e', 0.5); line(x, 8, 16, 8, 24, '#1a0e0e', 0.5); line(x, 24, 16, 24, 24, '#1a0e0e', 0.5);
    line(x, 16, 24, 16, 32, '#1a0e0e', 0.5);
  });
  t.iron = tex(22, PAL.ch2_iron, '#17171c', PAL.ch2_ironH, (x) => {
    x.fillStyle = PAL.ch2_ironH;
    for (const [rx, ry] of [[4,4],[26,4],[4,26],[26,26]]) x.fillRect(rx, ry, 2, 2);
    line(x, 2, 16, 30, 16, '#17171c', 0.5);
  });
  t.ember = tex(23, PAL.ch2_ember, '#8a3a1a', PAL.ch2_emberH, (x, r) => {
    x.fillStyle = '#ffc060';
    for (let i = 0; i < 4; i++) { x.globalAlpha = 0.8; x.fillRect((r()*30)|0, (r()*30)|0, 2, 2); }
    x.globalAlpha = 1;
  });
  t.grave = tex(31, PAL.ch3_grave, '#20202a', PAL.ch3_graveH, (x) => {
    line(x, 16, 6, 16, 20, '#20202a', 0.6); line(x, 10, 12, 22, 12, '#20202a', 0.6);
  });
  t.stone = tex(32, PAL.ch3_grave, '#20202a', PAL.ch3_graveH, (x) => {
    line(x, 4, 4, 14, 14, '#20202a', 0.5); line(x, 14, 14, 12, 26, '#20202a', 0.5); line(x, 20, 6, 28, 16, '#20202a', 0.4);
  });
  t.stoneDark = tex(33, '#26242e', '#1a1820', '#332f3e', (x) => {
    line(x, 0, 16, 32, 16, '#1a1820', 0.4);
  });
  t.iceDark = tex(41, '#2c4258', '#1c2c3c', '#3a5570', (x) => {
    line(x, 2, 26, 26, 2, '#3a5570', 0.35); line(x, 8, 30, 30, 8, '#3a5570', 0.25);
  });
  t.ice = tex(42, PAL.ch4_ice, PAL.ch4_iceD, PAL.ch4_iceH, (x) => {
    line(x, 2, 26, 26, 2, '#ffffff', 0.4); line(x, 8, 30, 30, 8, '#ffffff', 0.3); line(x, 0, 12, 12, 0, '#ffffff', 0.25);
  });
  t.mirrorIce = tex(43, PAL.ch4_iceD, '#3a4a6a', PAL.ch4_mirror, (x) => {
    line(x, 0, 20, 20, 0, PAL.ch4_mirror, 0.5); line(x, 10, 32, 32, 10, PAL.ch4_mirror, 0.4);
  });
  t.water = tex(51, PAL.ch1_water, '#3a5a7a', '#6a9aba', (x, r) => {
    x.strokeStyle = '#8ad0e0'; x.globalAlpha = 0.4; x.lineWidth = 1;
    for (let yy = 6; yy < 32; yy += 9) { x.beginPath(); for (let xx = 0; xx <= 32; xx += 4) { x.lineTo(xx + 0.5, yy + (xx % 8 === 0 ? 0 : 1) + 0.5); } x.stroke(); }
    x.globalAlpha = 1;
  });
  return t;
}
