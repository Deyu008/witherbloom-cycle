// scenes/conversion.js — 资源转换(露珠 / 余烬 / 枯叶 互转)
//
// 在暂停菜单里打开。三种资源按 2:1 损耗互相转换:
//   - 2 露珠 (dew)  → 1 余烬 (ember)
//   - 2 余烬 (ember) → 1 枯叶 (leaf)
//   - 2 枯叶 (leaf)  → 1 露珠 (dew)
//
// 规则:
//   - 仅在 source ≥ 2 时可转换;ENTER 触发。
//   - 转换后 source -= 2,target += 1。
//   - 反馈:sfxClick + 玩家脚下浮动文字 "转换! -2 露珠 +1 余烬"。
//   - ESC 返回暂停菜单(经 game.setScene('_fromConversion') 让 GameScene.enter 重新弹出暂停窗)。
import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { SPRITE_LIB } from '../sprite.js';

// 三个转换方向,显示顺序固定
const CONVERSIONS = [
  { from: 'dew',   to: 'ember', label: '露珠', color: '#8ad0e0', icon: 'dew' },
  { from: 'ember', to: 'leaf',  label: '余烬', color: '#e87a3c', icon: 'ember' },
  { from: 'leaf',  to: 'dew',   label: '枯叶', color: '#a8d860', icon: 'leaf' },
];

export class ConversionScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.menuIndex = 0;
    this.flashMsg = '';
    this.flashLife = 0;
  }

  enter(opts = {}) {
    this.t = 0;
    this.menuIndex = 0;
    this.flashMsg = '';
    this.flashLife = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.flashLife > 0) this.flashLife -= dt;
    if (this.flashLife <= 0) this.flashMsg = '';

    const k = this.game.input;
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) {
      this.menuIndex = (this.menuIndex - 1 + CONVERSIONS.length) % CONVERSIONS.length;
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) {
      this.menuIndex = (this.menuIndex + 1) % CONVERSIONS.length;
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) {
      this._tryConvert(CONVERSIONS[this.menuIndex]);
    }
    if (k.keysJustPressed.has('Escape')) {
      this.game.audio.sfxClick();
      // 返回暂停菜单:和 skillTree 同样的 setScene + _fromConversion 标记模式
      this.game.setScene('game', { _fromConversion: true, chapter: this.game.scenes.game.chapter });
    }
  }

  _tryConvert(conv) {
    const src = state[conv.from] || 0;
    if (src < 2) {
      this._flash(`${conv.label}不足 · 需要 2`);
      this.game.audio.sfxClick();
      return;
    }
    state[conv.from] = src - 2;
    state[conv.to] = (state[conv.to] || 0) + 1;
    // 反馈
    this.game.audio.sfxClick();
    const srcLabel = conv.from === 'dew' ? '露珠' : conv.from === 'ember' ? '余烬' : '枯叶';
    const tgtLabel = conv.to === 'dew' ? '露珠' : conv.to === 'ember' ? '余烬' : '枯叶';
    this._flash(`转换! -2 ${srcLabel} +1 ${tgtLabel}`);
    // 玩家脚下浮动文字
    const px = this.game.scenes.game?.player?.x ?? 0;
    const py = this.game.scenes.game?.player?.y ?? 0;
    this.game.spawnFloatText(px, py - 36, `转换! -2 ${srcLabel} +1 ${tgtLabel}`, conv.color);
    this.game.spawnHitParticles(px, py - 10, conv.color);
  }

  _flash(msg) {
    this.flashMsg = msg;
    this.flashLife = 1.6;
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景
    ctx.fillStyle = 'rgba(8, 6, 16, 0.92)';
    ctx.fillRect(0, 0, W, H);
    // 蓝绿色径向光晕
    const cx = W / 2, cy = 200;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 320);
    grad.addColorStop(0, 'rgba(106, 200, 224, 0.16)');
    grad.addColorStop(1, 'rgba(106, 200, 224, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 标题
    text(ctx, '资 源 转 换', W / 2, 60, 'hero', '#f4ecd0', {
      align: 'center', shadowColor: '#1a3a4a', shadowOffset: { x: 3, y: 3 },
    });
    text(ctx, 'CONVERSION · 2:1 ratio, half lost to the cycle', W / 2, 130, 'small', '#a8945a', { align: 'center' });

    // 顶部:当前三种资源
    const resY = 178;
    const res = [
      { icon: SPRITE_LIB.icons.dew,   n: state.dew   || 0, label: '露珠', color: '#8ad0e0' },
      { icon: SPRITE_LIB.icons.ember, n: state.ember || 0, label: '余烬', color: '#e87a3c' },
      { icon: SPRITE_LIB.icons.leaf,  n: state.leaf  || 0, label: '枯叶', color: '#a8d860' },
    ];
    const slotW = 200;
    const totalW = res.length * slotW;
    let rx = (W - totalW) / 2;
    for (const r of res) {
      if (r.icon) ctx.drawImage(r.icon, rx, resY + 16, 28, 28);
      text(ctx, `${r.label} ${r.n}`, rx + 38, resY + 18, 'large', r.color);
      rx += slotW;
    }

    // 三个转换选项
    const cardX = (W - 560) / 2;
    const cardY = 250;
    const cardW = 560;
    const cardH = 96;
    const cardGap = 18;

    for (let i = 0; i < CONVERSIONS.length; i++) {
      const conv = CONVERSIONS[i];
      const y = cardY + i * (cardH + cardGap);
      this._renderOption(ctx, cardX, y, cardW, cardH, conv, i === this.menuIndex);
    }

    // 底部提示
    text(ctx, '↑↓ 选择   ·   ENTER 转换   ·   ESC 返回暂停',
      W / 2, H - 80, 'small', '#a8945a', { align: 'center' });

    // 闪烁提示(转换成功 / 不足)
    if (this.flashLife > 0 && this.flashMsg) {
      const a = Math.min(1, this.flashLife);
      ctx.globalAlpha = a;
      text(ctx, this.flashMsg, W / 2, H - 50, 'medium', '#a8e8b0', {
        align: 'center', shadowColor: '#000', shadowOffset: { x: 1, y: 1 },
      });
      ctx.globalAlpha = 1;
    }
  }

  _renderOption(ctx, x, y, w, h, conv, selected) {
    const srcCount = state[conv.from] || 0;
    const canConvert = srcCount >= 2;
    const fromIcon = SPRITE_LIB.icons[conv.icon];
    const toIcon = SPRITE_LIB.icons[conv.to];

    // 框
    ctx.fillStyle = selected ? 'rgba(40, 60, 70, 0.92)' : 'rgba(20, 16, 30, 0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = selected ? conv.color : '#3a4a5a';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // 不可用时整体灰化
    if (!canConvert) ctx.globalAlpha = 0.55;

    // 源资源图标 × 2
    if (fromIcon) {
      const ix1 = x + 22, iy = y + (h - fromIcon.height) / 2;
      ctx.drawImage(fromIcon, ix1, iy);
      ctx.drawImage(fromIcon, ix1 + fromIcon.width + 6, iy);
      // ×2 标识
      text(ctx, '×2', ix1 + fromIcon.width * 2 + 16, y + h / 2, 'large', '#f4ecd0', { align: 'left' });
    }

    // 箭头 + 目标资源(文字紧跟图标流动排布,不再右对齐压回图标)
    const tgtLabel0 = conv.to === 'dew' ? '露珠' : conv.to === 'ember' ? '余烬' : '枯叶';
    const ax = x + w / 2 + 10;
    text(ctx, '→', ax, y + h / 2, 'large', conv.color, { align: 'center' });
    if (toIcon) {
      ctx.drawImage(toIcon, ax + 34, y + (h - toIcon.height) / 2);
      text(ctx, `1 ${tgtLabel0}`, ax + 34 + toIcon.width + 10, y + h / 2, 'medium', conv.color);
    }

    ctx.globalAlpha = 1;

    // 选中指示器
    if (selected) {
      ctx.fillStyle = conv.color;
      ctx.fillRect(x - 8, y + 8, 4, h - 16);
    }
  }
}