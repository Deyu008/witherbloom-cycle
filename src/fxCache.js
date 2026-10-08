// fxCache.js — 热路径光晕预烘焙缓存
// 之前每帧每实体 createRadialGradient + rgba 模板字符串(玩家/BOSS/精英光环、
// echo 弹、刻印光柱、泉水),渐变对象创建 + addColorStop 字符串解析 + 带渐变
// 光栅化都偏贵且随实体数线性增长。这里按颜色键预烘焙小精灵,运行时
// drawImage + globalAlpha 表达脉冲,稳态零分配。
// 注意:烘焙的边缘是透明黑 —— 只用于 'lighter' 合成的发光(全部现有用法均是)。
const _cache = new Map();

function bake(stops, size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  cx.fillStyle = g;
  cx.fillRect(0, 0, size, size);
  return c;
}

// glow(key, stops, size):自定义多段渐变
export function glow(key, stops, size = 96) {
  let c = _cache.get(key);
  if (!c) { c = bake(stops, size); _cache.set(key, c); }
  return c;
}

// glowOf(color, core?):线性衰减发光球;传 core 时中心更亮(白色热核,三段)
export function glowOf(color, core = null) {
  const key = (core || '#fff') + '|' + color;
  return glow(key, core
    ? [[0, core], [0.35, color], [1, 'rgba(0,0,0,0)']]
    : [[0, color], [1, 'rgba(0,0,0,0)']], 96);
}

// 在 (x,y) 画一个预烘焙光球(直径 d,透明度 a;调用方自管合成模式)
export function drawGlow(ctx, color, x, y, d, a, core = null) {
  const spr = glowOf(color, core);
  ctx.globalAlpha = a;
  ctx.drawImage(spr, x - d / 2, y - d / 2, d, d);
  ctx.globalAlpha = 1;
}
