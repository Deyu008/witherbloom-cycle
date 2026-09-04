// _tools.js — 精灵生成工具与主角调色板
// 从原 sprite.js 拆出;像素生成逻辑保持不变,仅迁移位置。
// 依赖:palette.js 的 PAL(调色板)与 hex2rgb(recolor 用)。
import { PAL, hex2rgb } from '../palette.js';

// 开发期: 检查所有输入 grid 的行列长度一致性
function checkGrids(name, grids) {
  for (let i = 0; i < grids.length; i++) {
    const g = grids[i];
    if (!g) continue;
    const lines = g.split('\n').filter(l => l.length > 0);
    const w = lines[0]?.length ?? 0;
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].length !== w) {
        console.error(`[sprite] ${name}[${i}] line ${j} has length ${lines[j].length}, expected ${w}. Line: ${JSON.stringify(lines[j])}`);
      }
    }
  }
}
if (typeof window !== 'undefined') window.__spriteCheck = checkGrids;

// 生成 16-bit 风格 Canvas 精灵
// grid: 字符串数组,每个字符代表一种颜色(0 透明,. 黑色,_ 自定义...)
// 字符 → 颜色 的映射在 legend 中定义
// 返回 OffscreenCanvas 或 HTMLCanvasElement
export function makeSprite(grid, legend, scale = 1) {
  // grid 可以是字符串(多行)或字符串数组。统一处理。
  let lines;
  if (typeof grid === 'string') {
    lines = grid.split('\n').filter(l => l.length > 0);
  } else {
    lines = grid;
  }
  const h = lines.length;
  // 所有行 pad 到最长行
  let w = 0;
  for (const l of lines) w = Math.max(w, l.length);
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < h; y++) {
    const row = lines[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x] || ' ';
      const color = legend[ch];
      if (!color || color === ' ' || ch === ' ') continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas;
}

// 镜像精灵(用于朝左/朝右)
export function flipH(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.translate(c.width, 0);
  cx.scale(-1, 1);
  cx.drawImage(canvas, 0, 0);
  return c;
}

// 着色精灵(把某种"主题色"全部替换为目标色,常用于敌人变色变种)
export function recolor(canvas, fromHex, toHex) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(canvas, 0, 0);

  const img = cx.getImageData(0, 0, c.width, c.height);
  const fr = hex2rgb(fromHex);
  const tr = hex2rgb(toHex);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i+1], b = img.data[i+2], a = img.data[i+3];
    if (a === 0) continue;
    // 用欧氏距离匹配(允许微小误差)
    if (Math.abs(r - fr.r) < 8 && Math.abs(g - fr.g) < 8 && Math.abs(b - fr.b) < 8) {
      img.data[i] = tr.r; img.data[i+1] = tr.g; img.data[i+2] = tr.b; img.data[i+3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

// 主角调色板(HERO_FRAMES 专用,字符 → PAL 颜色)
export const L = {
  '.': null,  // 透明
  ' ': null,
  'k': PAL.black,
  'K': PAL.ink,
  'w': PAL.white,
  'W': PAL.parch,
  'p': PAL.parchDim,
  'g': PAL.gold,
  'G': PAL.goldSoft,
  // 角色
  'c': PAL.hero_cloak,
  'C': PAL.hero_cloakD,
  's': PAL.hero_skin,
  'S': '#a8784a',
  'h': PAL.hero_hair,
  'H': '#6a5a3a',
  'b': PAL.hero_boot,
  'B': PAL.hero_belt,
  'l': PAL.hero_glow,
  'L': PAL.hero_glowH,
};
