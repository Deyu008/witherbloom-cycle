// scenes/chapterSelect.js — 章节选择
import { text, FONT } from '../pixelfont.js';
import { state } from '../state.js';
import { CHAPTERS } from '../data/chapters.js';
import { MenuNav } from '../menuNav.js';

export class ChapterSelectScene {
  constructor(game) {
    this.game = game; this.t = 0; this.index = 0;
    // 横排菜单:←→ 步进(统一回绕;锁定章跳过)
    this.nav = new MenuNav(game, { horizontal: true, onConfirm: (i) => this._confirm(i) });
  }

  enter() { this.t = 0; this.index = 0; this.nav.index = 0; }

  _confirm(i) {
    const ch = CHAPTERS[i];
    if (!ch) return;
    if (state.unlockedChapters.includes(ch.id)) {
      this.game.audio.sfxChapter();
      this.game.goto('chapterIntro', { chapter: ch.id });
    } else {
      this.game.audio.sfxClick();
    }
  }

  update(dt) {
    this.t += dt;
    const k = this.game.input;
    // 布局参数与 render 一致(登记命中矩形供指针)
    const cardW = 240, cardH = 360, gap = 30;
    const totalW = CHAPTERS.length * cardW + (CHAPTERS.length - 1) * gap;
    const startX = (this.game.canvas.width - totalW) / 2;
    for (let i = 0; i < CHAPTERS.length; i++) {
      this.nav.hit(i, startX + i * (cardW + gap), 140, cardW, cardH,
        state.unlockedChapters.includes(CHAPTERS[i].id));
    }
    this.nav.update();
    this.index = this.nav.index;
    if (k.justPressed('cancel') || k.justPressed('back')) {
      this.game.audio.sfxClick();
      this.game.goto('title');
    }
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1428');
    g.addColorStop(1, '#0a0a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 标题
    text(ctx, '章  节  选  择', W / 2, 60, 'large', '#f4ecd0', {
      align: 'center', shadowColor: '#3a2a5a', shadowOffset: { x: 2, y: 2 },
    });

    const cardW = 240, cardH = 360, gap = 30;
    const totalW = CHAPTERS.length * cardW + (CHAPTERS.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY = 140;
    for (let i = 0; i < CHAPTERS.length; i++) {
      const ch = CHAPTERS[i];
      const x = startX + i * (cardW + gap);
      const unlocked = state.unlockedChapters.includes(ch.id);
      const selected = i === this.index;
      // 卡片
      ctx.fillStyle = selected ? '#2a1a4a' : '#1a1428';
      ctx.fillRect(x, cardY, cardW, cardH);
      ctx.strokeStyle = selected ? '#b78ce0' : '#3a2a5a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, cardY + 1, cardW - 2, cardH - 2);
      // 顶部色带
      ctx.fillStyle = ch.color;
      ctx.fillRect(x, cardY, cardW, 8);
      // 章节号
      text(ctx, `第 ${ch.id} 章`, x + cardW / 2, cardY + 30, 'medium', unlocked ? '#f4ecd0' : '#5a4a6a', { align: 'center' });
      text(ctx, ch.name, x + cardW / 2, cardY + 70, 'large', unlocked ? '#e0b76a' : '#5a4a6a', { align: 'center' });
      text(ctx, ch.subtitle, x + cardW / 2, cardY + 110, 'small', '#8b7f5e', { align: 'center' });
      // 描述(锁定卡不画:0.7 暗化压不住它,会和"未解锁"叠字)
      if (unlocked) {
        const desc = ch.description;
        const lines = this._wrap(desc, 12);
        for (let li = 0; li < lines.length; li++) {
          text(ctx, lines[li], x + cardW / 2, cardY + 160 + li * 18, 'small', '#a89474', { align: 'center' });
        }
      }
      // 锁定
      if (!unlocked) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, cardY, cardW, cardH);
        text(ctx, '未解锁', x + cardW / 2, cardY + cardH / 2 - 10, 'medium', '#5a4a6a', { align: 'center' });
        text(ctx, '完成前一章', x + cardW / 2, cardY + cardH / 2 + 20, 'small', '#5a4a6a', { align: 'center' });
      }
    }
    // 操作提示
    text(ctx, '← → 选择章节    ENTER 开始    ESC 返回', W / 2, H - 40, 'small', '#a8945a', { align: 'center' });
  }

  _wrap(text, charsPerLine) {
    const out = [];
    let line = '';
    for (const ch of text) {
      line += ch;
      if (line.length >= charsPerLine) {
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
    return out;
  }
}
