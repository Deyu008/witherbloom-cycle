// pixelfont.js — 文本渲染(统一用 canvas 原生字体)
// 中英文同一字体栈,风格一致、永不乱码。保留 text()/textWidth()/FONT 接口。
//
// 约定: text(ctx, str, x, y, size, color, opts)
//   (x, y) = 文本左上角(align='left')或锚点(center/right 时 y 仍是顶部)
//   size: 'small' | 'medium' | 'large' | 'title' | 'hero' | 数字(px)
//   opts: { align:'left'|'center'|'right', shadow:true|color, weight:'bold'|'normal', lh:行高px }

export const FONT = {
  small: 16,
  medium: 22,
  large: 30,
  title: 42,
  hero: 56,
};

const FONT_STACK = '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", "SimHei", "WenQuanYi Zen Hei", sans-serif';

function resolveSize(size) {
  if (typeof size === 'number') return size;
  return FONT[size] ?? FONT.medium;
}

export function text(ctx, str, x, y, size = 'medium', color = '#f4ecd0', opts = {}) {
  if (str == null) return 0;
  str = String(str);
  const px = resolveSize(size);
  const align = opts.align ?? 'left';
  const weight = opts.weight ?? 'bold';
  const lh = opts.lh ?? Math.round(px * 1.25);

  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

  const lines = str.split('\n');
  // 阴影(描边)让文字在任何背景上都清晰
  if (opts.shadow !== false) {
    const sc = (typeof opts.shadow === 'string') ? opts.shadow : 'rgba(0,0,0,0.85)';
    ctx.lineWidth = Math.max(2, Math.round(px / 7));
    ctx.strokeStyle = sc;
    ctx.lineJoin = 'round';
    for (let i = 0; i < lines.length; i++) {
      ctx.strokeText(lines[i], x, y + i * lh);
    }
  }
  ctx.fillStyle = color;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lh);
  }
  ctx.restore();
  return textWidth(ctx, str, px, weight);
}

export function textWidth(ctx, str, size = 'medium', weight = 'bold') {
  const px = resolveSize(size);
  ctx.save();
  ctx.font = `${weight} ${px}px ${FONT_STACK}`;
  let max = 0;
  for (const line of String(str).split('\n')) {
    const w = ctx.measureText(line).width;
    if (w > max) max = w;
  }
  ctx.restore();
  return max;
}

// 兼容旧代码(drawText)
export function drawText(ctx, str, x, y, opts = {}) {
  return text(ctx, str, x, y, opts.scale ? sizeFromScale(opts.scale) : (opts.size ?? 'medium'), opts.color ?? '#f4ecd0', opts);
}
function sizeFromScale(s) {
  if (s <= 2) return 'small';
  if (s <= 3) return 'medium';
  if (s <= 4) return 'large';
  if (s <= 5) return 'title';
  return 'hero';
}
