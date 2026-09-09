// scenes/shop.js — 旅商店面(金币消耗出口)
// 村庄 NPC「游商」处按 T 进入;↑↓ 选择,ENTER 购买(可重复),ESC 回到原地。
import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { SPRITE_LIB } from '../sprite.js';
import { SHOP_ITEMS, buyItem, applyPurchase } from '../data/shop.js';

export class ShopScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.menuIndex = 0;
    this.flashMsg = '';
    this.flashLife = 0;
  }

  enter() { this.t = 0; this.menuIndex = 0; this.flashMsg = ''; this.flashLife = 0; }

  update(dt) {
    this.t += dt;
    if (this.flashLife > 0) this.flashLife -= dt;
    if (this.flashLife <= 0) this.flashMsg = '';

    const k = this.game.input;
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) {
      this.menuIndex = (this.menuIndex - 1 + SHOP_ITEMS.length) % SHOP_ITEMS.length;
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) {
      this.menuIndex = (this.menuIndex + 1) % SHOP_ITEMS.length;
      this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) {
      this._tryBuy(SHOP_ITEMS[this.menuIndex]);
    }
    if (k.keysJustPressed.has('Escape')) {
      this.game.audio.sfxClick();
      this.game.setScene('game', { _fromShop: true, chapter: this.game.scenes.game.chapter });
    }
  }

  _tryBuy(item) {
    const r = buyItem(item, state.gold);
    if (!r.ok) {
      this._flash(r.msg);
      this.game.audio.sfxClick();
      return;
    }
    state.gold -= item.price;
    applyPurchase(item, state, this.game.scenes.game?.player);
    this._flash(r.msg);
    this.game.audio.sfxPickup(880);
  }

  _flash(msg) { this.flashMsg = msg; this.flashLife = 1.6; }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景:暖色旅商幕布
    ctx.fillStyle = 'rgba(10, 8, 16, 0.92)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = 190;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
    grad.addColorStop(0, 'rgba(224, 183, 106, 0.14)');
    grad.addColorStop(1, 'rgba(224, 183, 106, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    text(ctx, '游 商 尘', W / 2, 56, 'hero', '#f4ecd0', {
      align: 'center', shadowColor: '#4a3a1a', shadowOffset: { x: 3, y: 3 },
    });
    text(ctx, '"拾来的旧物,换你的金子。"', W / 2, 124, 'small', '#a8945a', { align: 'center' });
    text(ctx, `金币 ${state.gold}`, W / 2, 160, 'large', '#e0b76a', { align: 'center' });

    // 货架:单列大卡(图标 + 名称 + 说明 + 价格)
    const cardX = (W - 620) / 2, cardW = 620, cardH = 88, gap = 14;
    const cardY = 210;
    for (let i = 0; i < SHOP_ITEMS.length; i++) {
      const it = SHOP_ITEMS[i];
      const y = cardY + i * (cardH + gap);
      const sel = i === this.menuIndex;
      const affordable = state.gold >= it.price;
      ctx.fillStyle = sel ? 'rgba(50, 38, 24, 0.95)' : 'rgba(22, 17, 28, 0.92)';
      ctx.fillRect(cardX, y, cardW, cardH);
      ctx.strokeStyle = sel ? '#e0b76a' : '#3a3a4a';
      ctx.lineWidth = sel ? 3 : 1.5;
      ctx.strokeRect(cardX + 1, y + 1, cardW - 2, cardH - 2);
      if (sel) {
        ctx.fillStyle = '#e0b76a';
        ctx.fillRect(cardX - 8, y + 8, 4, cardH - 16);
      }
      const icon = SPRITE_LIB.icons[it.icon];
      if (icon) ctx.drawImage(icon, cardX + 20, y + (cardH - icon.height) / 2);
      text(ctx, it.name, cardX + 86, y + 14, 'large', affordable ? '#f4ecd0' : '#7a6f5a');
      text(ctx, it.desc, cardX + 86, y + 52, 'small', '#8b7f5e');
      // 价格(右对齐;买不起标红)
      text(ctx, `${it.price} 金`, cardX + cardW - 20, y + (cardH - 22) / 2, 'medium',
        affordable ? '#e0b76a' : '#c14d4d', { align: 'right' });
    }

    text(ctx, '↑↓ 选择   ·   ENTER 购买   ·   ESC 离开',
      W / 2, H - 28, 'small', '#a8945a', { align: 'center' });

    if (this.flashLife > 0 && this.flashMsg) {
      ctx.globalAlpha = Math.min(1, this.flashLife);
      text(ctx, this.flashMsg, W / 2, H - 52, 'medium', '#a8e8b0', {
        align: 'center', shadowColor: '#000', shadowOffset: { x: 1, y: 1 },
      });
      ctx.globalAlpha = 1;
    }
  }
}
