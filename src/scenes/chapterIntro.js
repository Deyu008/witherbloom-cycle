// scenes/chapterIntro.js — 章节开始过场
import { text, FONT } from '../pixelfont.js';
import { CHAPTERS } from '../data/chapters.js';
import { DIALOGS } from '../data/dialog.js';

export class ChapterIntroScene {
  constructor(game) { this.game = game; this.t = 0; this.phase = 'fade'; this.phaseT = 0; this.chapter = 1; this.quote = ''; this.bg = null; this.lines = []; this.lineIdx = 0; this.lineT = 0; this.skipRequested = false; }

  enter(opts) {
    this.t = 0;
    this.phaseT = 0;
    this.chapter = opts.chapter;
    this.phase = 'fade';
    this.skipRequested = false;
    const ch = CHAPTERS.find(c => c.id === this.chapter);
    this.bg = this.game.assets.cutscenes[ch.bgScene] || null;
    this.quote = ch.subtitle;
    // 收集本章节的开场白
    this.lines = this._gatherIntroLines(this.chapter);
    this.lineIdx = 0;
    this.lineT = 0;
    this.game.audio.sfxChapter();
  }

  _gatherIntroLines(chapter) {
    if (chapter === 1) return DIALOGS.intro_opening.lines;
    if (chapter === 2) return [
      { speaker: '旁白', text: '夏之墟的火,烧了三百年的哀伤。' },
      { speaker: '旁白', text: '你踏过铁桥,看见锻炉城的红光。' },
    ];
    if (chapter === 3) return [
      { speaker: '旁白', text: '秋之墓没有哭声,只有名字。' },
      { speaker: '旁白', text: '你走过一千零一块石碑,在第一百零二块前停下。' },
      { speaker: '石碑', text: '——寂渊。被遗忘者。被记得的人。' },
    ];
    if (chapter === 4) return [
      { speaker: '旁白', text: '冬之渊,寒铁桥的尽头。' },
      { speaker: '旁白', text: '你看见那座镜子做成的王座,上面坐着——' },
      { speaker: '回响者', text: '——一个,没有脸的人。' },
    ];
    return [];
  }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    const k = this.game.input;
    if (k.keysJustPressed.has('Space') || k.keysJustPressed.has('Enter') || k.mouseJustClicked) {
      this.skipRequested = true;
    }
    // 第一阶段: 淡入
    if (this.phase === 'fade') {
      if (this.phaseT > 1.2) {
        this.phase = 'quote';
        this.phaseT = 0;
      }
      return;
    }
    // 第二阶段: 章节标题
    if (this.phase === 'quote') {
      if (this.phaseT > 2.0 || this.skipRequested) {
        this.phase = 'lines';
        this.phaseT = 0;
        this.lineT = 0;
      }
      return;
    }
    // 第三阶段: 开场白逐行
    if (this.phase === 'lines') {
      this.lineT += dt;
      if (this.lineT > 1.5 || this.skipRequested) {
        this.lineIdx++;
        this.lineT = 0;
        this.skipRequested = false;
        if (this.lineIdx >= this.lines.length) {
          this.phase = 'fadeout';
          this.phaseT = 0;
        }
      }
      return;
    }
    // 在 lines 阶段持续按 Space/Enter 加速结束
    if (this.phase === 'lines' && (this.skipRequested || (this.lineT > 0.3 && (k.keysJustPressed.has('Space') || k.keysJustPressed.has('Enter'))))) {
      this.lineIdx = this.lines.length; // 跳到最后
      this.phase = 'fadeout';
      this.phaseT = 0;
      return;
    }
    if (this.phase === 'fadeout') {
      if (this.phaseT > 0.6) {
        // 进入游戏,同时播放章节过场标题卡(Ken Burns 缓推)
        this.game.playChapterTransition(this.chapter);
        this.game.goto('game', { chapter: this.chapter });
      }
    }
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    let fade = 0;
    if (this.phase === 'fade') fade = 1 - (this.phaseT / 1.2);
    if (this.phase === 'fadeout') fade = this.phaseT / 0.6;
    if (this.bg && fade < 1) {
      // Ken Burns:背景随时间缓慢放大(1.0→1.10),产生电影推移感
      const kb = 1 + Math.min(1, this.t / 6) * 0.10;
      const scale = Math.max(W / this.bg.width, H / this.bg.height) * kb;
      const w = this.bg.width * scale, h = this.bg.height * scale;
      ctx.globalAlpha = 1 - fade;
      ctx.drawImage(this.bg, (W - w) / 2, (H - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }

    if (this.phase === 'quote' || this.phase === 'lines') {
      const ch = CHAPTERS.find(c => c.id === this.chapter);
      // 顶部文字区暗幕:提亮画面后,深浅色文字都需要背板支撑对比度
      const scrim = ctx.createLinearGradient(0, 0, 0, 360);
      scrim.addColorStop(0, 'rgba(6, 4, 14, 0.82)');
      scrim.addColorStop(1, 'rgba(6, 4, 14, 0)');
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, 360);
      // 顶部章节标题(淡入加快:0.6s 到位,避免长时间几乎不可见)
      const a = this.phase === 'quote' ? Math.min(1, this.phaseT * 1.8) : 1;
      ctx.globalAlpha = a;
      text(ctx, `第 ${ch.id} 章`, W / 2, 100, 'medium', '#c9b06a', { align: 'center' });
      text(ctx, ch.name, W / 2, 140, 'hero', '#f4ecd0', { align: 'center', shadowColor: 'rgba(10,6,20,0.9)', shadowOffset: { x: 3, y: 3 } });
      text(ctx, this.quote, W / 2, 230, 'large', '#e8dcc0', { align: 'center', shadowColor: 'rgba(10,6,20,0.85)', shadowOffset: { x: 2, y: 2 } });
      ctx.globalAlpha = 1;
    }

    if (this.phase === 'lines') {
      const line = this.lines[this.lineIdx];
      if (line) {
        // 文字逐字淡入
        const lt = this.lineT;
        const reveal = Math.min(1, lt * 1.5);
        const visible = line.text.substring(0, Math.floor(line.text.length * reveal));
        // 黑色对话框
        ctx.fillStyle = 'rgba(8, 6, 16, 0.85)';
        ctx.fillRect(80, H - 200, W - 160, 140);
        ctx.strokeStyle = '#3a2a5a';
        ctx.lineWidth = 2;
        ctx.strokeRect(81, H - 199, W - 162, 138);
        text(ctx, line.speaker, 110, H - 180, 'medium', '#e0b76a');
        text(ctx, visible, 110, H - 140, 'medium', '#f4ecd0');
      }
      // 跳过提示
      const blink = (Math.sin(this.t * 4) + 1) * 0.5;
      ctx.globalAlpha = blink * 0.7;
      text(ctx, '按 SPACE 跳过', W - 110, H - 30, 'small', '#a8945a', { align: 'right' });
      ctx.globalAlpha = 1;
    }
  }
}
