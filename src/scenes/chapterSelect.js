// scenes/chapterSelect.js — 章节选择
import { text, FONT } from '../pixelfont.js';
import { state } from '../state.js';
import { CHAPTERS } from '../data/chapters.js';

export class ChapterSelectScene {
  constructor(game) { this.game = game; this.t = 0; this.index = 0; }

  enter() { this.t = 0; this.index = 0; }

  update(dt) {
    this.t += dt;
    const k = this.game.input;
    if (k.keysJustPressed.has('ArrowLeft') || k.keysJustPressed.has('KeyA')) {
      this.index = Math.max(0, this.index - 1);
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('ArrowRight') || k.keysJustPressed.has('KeyD')) {
      this.index = Math.min(CHAPTERS.length - 1, this.index + 1);
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) {
      const ch = CHAPTERS[this.index];
      if (state.unlockedChapters.includes(ch.id)) {
        this.game.audio.sfxChapter();
        this.game.goto('chapterIntro', { chapter: ch.id });
      } else {
        this.game.audio.sfxClick();
      }
    }
    if (k.keysJustPressed.has('Escape') || k.keysJustPressed.has('Backspace')) {
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
