// scenes/title.js — 标题画面
import { drawText, text, FONT, textWidth } from '../pixelfont.js';
import { PAL } from '../palette.js';
import { applySave } from '../state.js';
import { MenuNav } from '../menuNav.js';

const CLASS_NAMES = { recall: '追忆者', forge: '锻体者', weave: '织梦者' };

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.menuIndex = 0;
    this.menuItems = [
      { text: '开始新游戏', action: () => this.newGame() },
      { text: '继续游戏', action: () => this.continueGame() },
      { text: '章节选择', action: () => this.game.goto('chapterSelect') },
      { text: '退出', action: () => this.exit() },
    ];
    this.bg = null;
    this.confirmNewGame = false; // 新游戏二次确认态(有存档时)
    this.nav = new MenuNav(game, { onConfirm: (i) => this._confirm(i) });
  }

  _confirm(i) {
    const it = this.menuItems[i];
    if (!it) return;
    if (it.text === '继续游戏' && !this._hasSave()) { this.game.audio.sfxClick(); return; } // 灰显双保险
    this.game.audio.sfxClick();
    it.action();
  }

  enter(opts) {
    this.t = 0;
    this.menuIndex = 0;
    this.nav.index = 0;
    this.confirmNewGame = false;
    this.game.audio.init();
    this.game.audio.startMusic(0, 'title');
    // 专属标题插画(mmx 生成);失败则退回纯色渐变
    this.bg = this.game.assets.cutscenes.title || null;
  }

  _hasSave() { return !!(this.game.save && this.game.save.hasSave()); }

  newGame() {
    // 有存档先二次确认:clear() 会清掉全部进度,误触不可挽回
    if (this._hasSave() && !this.confirmNewGame) {
      this.confirmNewGame = true;
      this.game.audio.sfxClick();
      return;
    }
    this.game.audio.sfxChapter();
    this.game.audio.stopMusic();
    // 存档清除与状态重置延迟到职业确认时执行(classSelect._confirm):
    // 在职业选择按 ESC 返回标题的路径上,旧存档必须完好无损
    this.game.goto('classSelect', { chapter: 1, isNewGame: true });
  }

  continueGame() {
    if (!this._hasSave()) return; // 无存档:菜单项已灰显,双保险
    this.game.audio.sfxChapter();
    this.game.audio.stopMusic();
    const save = this.game.save.getLast();
    if (save) {
      applySave(save);
      this.game.goto('chapterIntro', { chapter: state.currentChapter, isContinue: true });
    }
  }

  exit() {
    // 浏览器中无法"退出",只显示信息
    this.menuItems[3].text = '感谢游玩';
    this.menuItems[3].action = () => {};
  }

  update(dt) {
    this.t += dt;
    const k = this.game.input;
    if (this.confirmNewGame) {
      if (k.justPressed('confirm')) {
        this.confirmNewGame = false;
        this.newGame(); // 已确认,直接执行
      } else if (k.justPressed('cancel') || k.justPressed('back')) {
        this.confirmNewGame = false;
        this.game.audio.sfxClick();
      }
      return; // 确认期间锁菜单导航
    }
    // 统一导航:键盘步进跳过灰显项;鼠标 hover/点击限定在菜单矩形内(任意处点击不再误触)
    this.menuIndex = this.nav.index;
    this.nav.update();
    this.menuIndex = this.nav.index;
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景
    if (this.bg) {
      // 拉伸绘制 + 暗化
      const scale = Math.max(W / this.bg.width, H / this.bg.height);
      const w = this.bg.width * scale, h = this.bg.height * scale;
      ctx.drawImage(this.bg, (W - w) / 2, (H - h) / 2, w, h);
      // 暗化层(轻罩:原 0.5 把夜景插画压成一片黑,只剩轮廓)
      ctx.fillStyle = 'rgba(8, 6, 16, 0.28)';
      ctx.fillRect(0, 0, W, H);
    } else {
      // 纯色渐变
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1a1428');
      g.addColorStop(1, '#0a0a14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // 紫色光晕(离屏预渲染一次, 每帧仅缩放绘制, 避免每帧建 radialGradient)
    const t = this.t;
    const glowR = 200 + Math.sin(t * 0.6) * 30;
    const cx = W * 0.5, cy = H * 0.32;
    if (!TitleScene._glowSprite) {
      const g = document.createElement('canvas');
      g.width = 256; g.height = 256;
      const gx = g.getContext('2d');
      const rg = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
      rg.addColorStop(0, 'rgba(183, 140, 224, 0.4)');
      rg.addColorStop(1, 'rgba(183, 140, 224, 0)');
      gx.fillStyle = rg; gx.fillRect(0, 0, 256, 256);
      TitleScene._glowSprite = g;
    }
    ctx.drawImage(TitleScene._glowSprite, cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    // 标题
    const titleAlpha = Math.min(1, this.t * 0.5);
    ctx.globalAlpha = titleAlpha;
    text(ctx, '回  声  ·  枯  荣  之  环', W / 2, 100, 'hero', '#f4ecd0', {
      align: 'center',
      shadowColor: '#3a2a5a',
      shadowOffset: { x: 3, y: 3 },
    });
    text(ctx, 'ECHOES · THE WITHERBLOOM CYCLE', W / 2, 180, 'small', '#a8945a', {
      align: 'center',
    });
    ctx.globalAlpha = 1;

    // 发光落叶(标题下方飘落的回声光点;插画里已有树,不再画程序树)
    for (let i = 0; i < 16; i++) {
      const a = (this.t * 0.3 + i * 0.4) % (Math.PI * 2);
      const fallY = (this.t * 30 + i * 50) % H;
      const x = W/2 + Math.cos(a) * 200 * Math.sin(this.t * 0.5 + i);
      const y = (fallY + i * 30) % H;
      const alpha = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(183, 140, 224, ${alpha * 0.7})`;
      ctx.fillRect(x, y, 3, 3);
    }

    // 菜单
    const menuY = 420;
    const menuH = 60;
    const hasSave = this._hasSave();
    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      // 无存档时"继续游戏"灰显不可选
      const disabled = item.text === '继续游戏' && !hasSave;
      const selected = i === this.menuIndex && !disabled;
      const y = menuY + i * menuH;
      // 选中框
      if (selected) {
        ctx.fillStyle = 'rgba(183, 140, 224, 0.15)';
        ctx.fillRect(W/2 - 200, y - 8, 400, 40);
        ctx.fillStyle = '#b78ce0';
        ctx.fillRect(W/2 - 220, y - 8, 8, 8);
        ctx.fillRect(W/2 + 212, y - 8, 8, 8);
      }
      const c = disabled ? '#4a4356' : (selected ? '#f4ecd0' : '#a8945a');
      this.nav.hit(i, W / 2 - 200, y - 8, 400, 40, !disabled);
      text(ctx, disabled ? '继续游戏(无存档)' : item.text, W / 2, y, 'large', c, {
        align: 'center',
        shadowColor: selected ? '#5a3a8a' : '#3a2a1a',
        shadowOffset: { x: 2, y: 2 },
      });
    }

    // 存档预览:菜单上方一行,让"继续游戏"不再盲选
    if (hasSave) {
      const save = this.game.save.getLast();
      if (save) {
        const cls = CLASS_NAMES[save.heroClass] || '回响者';
        const mins = Math.floor((save.playTime || 0) / 60);
        const label = `存档:第 ${save.currentChapter || 1} 章 · ${cls} · ${mins} 分钟`;
        const lw = textWidth(ctx, label, 'small');
        ctx.fillStyle = 'rgba(8,6,14,0.6)';
        ctx.fillRect(W / 2 - lw / 2 - 10, menuY - 42, lw + 20, 24);
        text(ctx, label, W / 2, menuY - 36, 'small', '#d6c8a4', { align: 'center' });
      }
    }

    // 新游戏二次确认弹窗
    if (this.confirmNewGame) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, H);
      const bw = 520, bh = 180, bx = (W - bw) / 2, by = H / 2 - bh / 2;
      ctx.fillStyle = 'rgba(16,12,28,0.98)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#c14d4d'; ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      text(ctx, '开始新游戏将清除现有存档', W / 2, by + 34, 'medium', '#e8a0a0', { align: 'center' });
      text(ctx, '此操作无法撤销', W / 2, by + 66, 'small', '#a8945a', { align: 'center' });
      const blink = (Math.sin(this.t * 5) + 1) * 0.5;
      ctx.globalAlpha = 0.6 + blink * 0.4;
      text(ctx, 'ENTER 确认清除   ·   ESC 取消', W / 2, by + 118, 'medium', '#f4ecd0', { align: 'center' });
      ctx.globalAlpha = 1;
    }

    // 提示
    if (this.t > 1.5) {
      const blink = (Math.sin(this.t * 4) + 1) * 0.5;
      ctx.globalAlpha = blink * 0.7;
      text(ctx, '↑ ↓ 选择   ·   ENTER 确认', W / 2, H - 40, 'small', '#a8945a', { align: 'center' });
      ctx.globalAlpha = 1;
    }

    // 版本
    text(ctx, 'v0.2  ·  A Witherbloom Tale', 20, H - 30, 'small', '#5a4a6a');
  }
}
