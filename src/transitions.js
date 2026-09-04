// transitions.js — 章节过场演出(标题卡 + Ken Burns 缓推)
// 时间轴(总时长 ~4.5s):
//   0.0~0.5s  淡入黑场
//   0.5~3.0s  过场图 Ken Burns 缓慢放大(1.0 → 1.12)
//   3.0~4.0s  章节标题居中淡入(叠在图上)
//   4.0~4.5s  整体淡出到黑
// 用法: fx.startChapterTransition(chapter, img); 每帧 fx.update(dt); 末层 fx.render(ctx, W, H);
// img 为 HTMLImageElement(可空,空则只播黑场+标题)。

import { text } from './pixelfont.js';
import { PAL } from './palette.js';

export const CHAPTER_TITLES = {
  1: '第一章 · 春之森 — 醒来',
  2: '第二章 · 夏之墟 — 燃烧',
  3: '第三章 · 秋之墓 — 埋葬',
  4: '第四章 · 冬之渊 — 和解',
};

const FADE_IN_DUR = 0.5;    // 淡入黑场
const IMAGE_DUR = 2.5;      // Ken Burns 图展示
const TITLE_DUR = 1.0;      // 标题淡入
const FADE_OUT_DUR = 0.5;   // 淡出
const T_IMAGE = FADE_IN_DUR;                       // 0.5 图开始
const T_TITLE = T_IMAGE + IMAGE_DUR;               // 3.0 标题开始
const T_OUT = T_TITLE + TITLE_DUR;                 // 4.0 淡出开始
const DURATION = T_OUT + FADE_OUT_DUR;             // 4.5 总时长
const KB_ZOOM = 0.12;       // Ken Burns 总放大量(1.0 → 1.12)

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeInOut(t) { return t * t * (3 - 2 * t); }

export class TransitionEffect {
  constructor() {
    this.active = false;
    this.t = 0;
    this.chapter = 1;
    this.img = null;
  }

  // chapter: 1~4;cutsceneImg: HTMLImageElement | null
  startChapterTransition(chapter, cutsceneImg = null) {
    this.active = true;
    this.t = 0;
    this.chapter = chapter;
    this.img = cutsceneImg || null;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= DURATION) {
      this.active = false;
      this.t = DURATION;
    }
  }

  render(ctx, W, H) {
    if (!this.active) return;
    const t = this.t;

    // 底色:开头 0.5s 黑幕淡入(alpha 0→1,盖住游戏画面),之后全黑
    ctx.save();
    ctx.globalAlpha = t < FADE_IN_DUR ? easeInOut(clamp01(t / FADE_IN_DUR)) : 1;
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Ken Burns 进度(图展示阶段 0→1,之后保持在 1)
    const kb = clamp01((t - T_IMAGE) / IMAGE_DUR);

    // 过场图(cover 铺满 + 缓慢放大,中心偏移产生轻微推移感)
    if (this.img && t >= T_IMAGE) {
      const iw = this.img.width || this.img.naturalWidth || W;
      const ih = this.img.height || this.img.naturalHeight || H;
      const scale = Math.max(W / iw, H / ih) * (1 + KB_ZOOM * easeInOut(kb));
      const dw = iw * scale, dh = ih * scale;
      // 缓慢向右下推移(总位移 2% 屏宽)
      const dx = (W - dw) / 2 - W * 0.02 * easeInOut(kb);
      const dy = (H - dh) / 2 - H * 0.02 * easeInOut(kb);
      ctx.save();
      ctx.imageSmoothingEnabled = false; // 像素风保持硬边缘
      ctx.drawImage(this.img, dx, dy, dw, dh);
      // 图上压一层暗角,保证标题可读
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 章节标题:3.0~4.0s 居中淡入,金色大标题 + 上下细金线
    if (t >= T_TITLE) {
      const a = clamp01((t - T_TITLE) / TITLE_DUR);
      const title = CHAPTER_TITLES[this.chapter] || '';
      ctx.save();
      ctx.globalAlpha = a;
      const cy = H / 2;
      ctx.fillStyle = 'rgba(224,183,106,0.4)';
      ctx.fillRect(W / 2 - 220, cy - 40, 440, 1);
      ctx.fillRect(W / 2 - 220, cy + 40, 440, 1);
      text(ctx, title, W / 2, cy - 21, 'title', PAL.gold, { align: 'center' });
      ctx.restore();
    }

    // 末尾淡出:整体再压一层黑,确保结束时纯黑无缝衔接下一场景
    if (t >= T_OUT) {
      const a = clamp01((t - T_OUT) / FADE_OUT_DUR);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
}
