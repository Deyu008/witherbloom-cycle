// uiKit.js — 统一程序化 UI 套件(像素级精准, 替代拉伸变形的贴图框)
// 设计语言: 深色半透面板 + 1px 描边 + 内高光 + 金色角饰; 条状用竖向渐变+顶部高光+分段刻度。
// 全部整数坐标 fillRect 画线, 保证 pixel-crisp。

const GOLD = '#e0b76a';
const VIOLET = '#b78ce0';

function px(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

// 通用面板: 深色底 + 外描边 + 内高光 + 四角金色 L 饰
export function panel(ctx, x, y, w, h, opts = {}) {
  const { accent = VIOLET, corner = GOLD, fill = 'rgba(10,8,18,0.82)', cornerLen = 6 } = opts;
  px(ctx, x, y, w, h, fill);
  // 外描边 1px
  px(ctx, x, y, w, 1, accent); px(ctx, x, y + h - 1, w, 1, accent);
  px(ctx, x, y, 1, h, accent); px(ctx, x + w - 1, y, 1, h, accent);
  // 内高光 1px (inset 2)
  px(ctx, x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,0.06)');
  px(ctx, x + 2, y + 2, 1, h - 4, 'rgba(255,255,255,0.06)');
  // 四角 L 饰
  if (cornerLen > 0) {
    px(ctx, x, y, cornerLen, 2, corner); px(ctx, x, y, 2, cornerLen, corner);
    px(ctx, x + w - cornerLen, y, cornerLen, 2, corner); px(ctx, x + w - 2, y, 2, cornerLen, corner);
    px(ctx, x, y + h - 2, cornerLen, 2, corner); px(ctx, x, y + h - cornerLen, 2, cornerLen, corner);
    px(ctx, x + w - cornerLen, y + h - 2, cornerLen, 2, corner); px(ctx, x + w - 2, y + h - cornerLen, 2, cornerLen, corner);
  }
}

// 进度条: 背景 + 竖向渐变填充 + 顶部高光 + 分段刻度 + 描边
const _gradCache = new WeakMap();
function vGrad(ctx, h, color) {
  let m = _gradCache.get(ctx);
  if (!m) { m = new Map(); _gradCache.set(ctx, m); }
  const key = color + '|' + h;
  let g = m.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shadeLight(color, 0.35));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shadeLight(color, -0.25));
    m.set(key, g);
  }
  return g;
}

export function bar(ctx, x, y, w, h, frac, color, opts = {}) {
  const { bg = 'rgba(0,0,0,0.55)', ticks = 0, highlight = true } = opts;
  frac = Math.max(0, Math.min(1, frac));
  px(ctx, x, y, w, h, bg);
  const fw = Math.round(w * frac);
  if (fw > 0) {
    ctx.save();
    ctx.translate(0, y);
    ctx.fillStyle = vGrad(ctx, h, color);
    ctx.fillRect(x, 0, fw, h);
    ctx.restore();
    if (highlight && h >= 6) px(ctx, x, y + 1, fw, 1, 'rgba(255,255,255,0.28)');
  }
  // 分段刻度
  if (ticks > 0) {
    for (let i = 1; i < ticks; i++) {
      const tx = Math.round(x + (w / ticks) * i);
      px(ctx, tx, y + 1, 1, h - 2, 'rgba(0,0,0,0.3)');
    }
  }
  // 描边
  px(ctx, x - 1, y - 1, w + 2, 1, 'rgba(0,0,0,0.8)'); px(ctx, x - 1, y + h, w + 2, 1, 'rgba(0,0,0,0.8)');
  px(ctx, x - 1, y - 1, 1, h + 2, 'rgba(0,0,0,0.8)'); px(ctx, x + w, y - 1, 1, h + 2, 'rgba(0,0,0,0.8)');
}

// 技能槽: 斜角bevel + 描边 + 就绪角点
export function slot(ctx, x, y, size, opts = {}) {
  const { ready = false, accent = VIOLET } = opts;
  px(ctx, x, y, size, size, 'rgba(10,8,18,0.85)');
  // bevel: 左上亮 / 右下暗
  px(ctx, x + 1, y + 1, size - 2, 1, 'rgba(255,255,255,0.08)');
  px(ctx, x + 1, y + 1, 1, size - 2, 'rgba(255,255,255,0.08)');
  px(ctx, x + 1, y + size - 2, size - 2, 1, 'rgba(0,0,0,0.6)');
  px(ctx, x + size - 2, y + 1, 1, size - 2, 'rgba(0,0,0,0.6)');
  // 描边
  px(ctx, x, y, size, 1, accent); px(ctx, x, y + size - 1, size, 1, accent);
  px(ctx, x, y, 1, size, accent); px(ctx, x + size - 1, y, 1, size, accent);
  if (ready) px(ctx, x + size - 3, y + 1, 2, 2, GOLD);
}

// 对话框: 双层描边 + 角饰 + 顶部名牌底板
export function dialogBox(ctx, x, y, w, h, opts = {}) {
  const { accent = '#3a2a5a', inner = 'rgba(183,140,224,0.25)' } = opts;
  px(ctx, x, y, w, h, 'rgba(10,8,18,0.94)');
  px(ctx, x, y, w, 2, accent); px(ctx, x, y + h - 2, w, 2, accent);
  px(ctx, x, y, 2, h, accent); px(ctx, x + w - 2, y, 2, h, accent);
  px(ctx, x + 3, y + 3, w - 6, 1, inner); px(ctx, x + 3, y + h - 4, w - 6, 1, inner);
  px(ctx, x + 3, y + 3, 1, h - 6, inner); px(ctx, x + w - 4, y + 3, 1, h - 6, inner);
  // 四角金色 L
  const L = 10;
  px(ctx, x, y, L, 2, GOLD); px(ctx, x, y, 2, L, GOLD);
  px(ctx, x + w - L, y, L, 2, GOLD); px(ctx, x + w - 2, y, 2, L, GOLD);
  px(ctx, x, y + h - 2, L, 2, GOLD); px(ctx, x, y + h - L, 2, L, GOLD);
  px(ctx, x + w - L, y + h - 2, L, 2, GOLD); px(ctx, x + w - 2, y + h - L, 2, L, GOLD);
}

// Boss 血条框: 主题色描边 + 两端斜切 + 顶部中心菱形
export function bossFrame(ctx, x, y, w, h, color) {
  px(ctx, x, y, w, h, 'rgba(8,6,14,0.94)');
  px(ctx, x, y, w, 1, color); px(ctx, x, y + h - 1, w, 1, color);
  px(ctx, x, y, 1, h, color); px(ctx, x + w - 1, y, 1, h, color);
  px(ctx, x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,0.06)');
  // 两端斜切角饰
  const n = 6;
  for (let i = 0; i < n; i++) {
    px(ctx, x + i, y + i, 1, 1, color); px(ctx, x + w - 1 - i, y + i, 1, 1, color);
    px(ctx, x + i, y + h - 1 - i, 1, 1, color); px(ctx, x + w - 1 - i, y + h - 1 - i, 1, 1, color);
  }
  // 顶部中心菱形
  const cx = x + w / 2, cy = y;
  px(ctx, cx - 2, cy - 2, 4, 4, color);
  px(ctx, cx - 1, cy - 3, 2, 6, color); px(ctx, cx - 3, cy - 1, 6, 2, color);
}

// 小地图框: 双层描边 + 角刻度
export function minimapFrame(ctx, x, y, w, h) {
  px(ctx, x - 2, y - 2, w + 4, h + 4, 'rgba(8,6,14,0.7)');
  px(ctx, x - 2, y - 2, w + 4, 1, 'rgba(224,183,106,0.5)'); px(ctx, x - 2, y + h + 1, w + 4, 1, 'rgba(224,183,106,0.5)');
  px(ctx, x - 2, y - 2, 1, h + 4, 'rgba(224,183,106,0.5)'); px(ctx, x + w + 1, y - 2, 1, h + 4, 'rgba(224,183,106,0.5)');
  px(ctx, x, y, w, 1, 'rgba(0,0,0,0.7)'); px(ctx, x, y + h - 1, w, 1, 'rgba(0,0,0,0.7)');
  px(ctx, x, y, 1, h, 'rgba(0,0,0,0.7)'); px(ctx, x + w - 1, y, 1, h, 'rgba(0,0,0,0.7)');
  const t = 4;
  px(ctx, x - 2, y - 2, t, 2, GOLD); px(ctx, x - 2, y - 2, 2, t, GOLD);
  px(ctx, x + w + 2 - t, y - 2, t, 2, GOLD); px(ctx, x + w, y - 2, 2, t, GOLD);
  px(ctx, x - 2, y + h, t, 2, GOLD); px(ctx, x - 2, y + h + 2 - t, 2, t, GOLD);
  px(ctx, x + w + 2 - t, y + h, t, 2, GOLD); px(ctx, x + w, y + h + 2 - t, 2, t, GOLD);
}

// 明暗工具
function shadeLight(hex, amt) {
  const h = hex.replace('#', '');
  let r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
