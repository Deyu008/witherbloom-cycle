// scenes/title.js — 标题画面
import { drawText, text, FONT, textWidth } from '../pixelfont.js';
import { PAL } from '../palette.js';
import { state, applySave, freshState } from '../state.js';

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
  }

  enter(opts) {
    this.t = 0;
    this.menuIndex = 0;
    this.game.audio.init();
    this.game.audio.startMusic(0, 'title');
    // 专属标题插画(mmx 生成);失败则退回纯色渐变
    this.bg = this.game.assets.cutscenes.title || null;
  }

  newGame() {
    this.game.audio.sfxChapter();
    this.game.audio.stopMusic();
    if (this.game.save) this.game.save.clear();
    Object.assign(state, freshState());
    this.game.goto('classSelect', { chapter: 1, isNewGame: true });
  }

  continueGame() {
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
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) {
      this.menuIndex = (this.menuIndex - 1 + this.menuItems.length) % this.menuItems.length;
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) {
      this.menuIndex = (this.menuIndex + 1) % this.menuItems.length;
      this.game.audio.sfxHover();
    }
    // 仅键盘确认:鼠标点击不做"任意处确认"——否则误触会直接执行
    // 当前选中项(如"开始新游戏"),有清掉存档的风险。
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) {
      this.game.audio.sfxClick();
      this.menuItems[this.menuIndex].action();
    }
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
    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      const selected = i === this.menuIndex;
      const y = menuY + i * menuH;
      // 选中框
      if (selected) {
        ctx.fillStyle = 'rgba(183, 140, 224, 0.15)';
        ctx.fillRect(W/2 - 200, y - 8, 400, 40);
        ctx.fillStyle = '#b78ce0';
        ctx.fillRect(W/2 - 220, y - 8, 8, 8);
        ctx.fillRect(W/2 + 212, y - 8, 8, 8);
      }
      const c = selected ? '#f4ecd0' : '#a8945a';
      text(ctx, item.text, W / 2, y, 'large', c, {
        align: 'center',
        shadowColor: selected ? '#5a3a8a' : '#3a2a1a',
        shadowOffset: { x: 2, y: 2 },
      });
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
