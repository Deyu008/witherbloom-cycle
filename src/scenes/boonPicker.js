// scenes/boonPicker.js — 回响祝福三选一(从 game.js 抽出的独立状态机)
// GameScene 通过 _boonOffer/_boonQueue getter 委托到本类,
// 外部脚本(playtest/screenshot)的旧接口保持可用。
import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { BOON_POOL, BOON_RARITY_INFO, BOON_SKIP_GOLD, drawBoonChoices } from '../data/boons.js';
import { MenuNav } from '../menuNav.js';

export class BoonPicker {
  constructor(game, scene) {
    this.game = game;      // Game 主类(音频/浮字/横幅)
    this.scene = scene;    // GameScene(player / 对话与暂停状态门控)
    this.queue = [];       // 待弹出的祝福(minRarity)
    this.offer = null;     // 当前三选一 { rarity, choices, idx, t }
    // 统一导航:←→(手柄/键盘)+ 鼠标/触屏点卡直接选;S 跳过保留
    this.nav = new MenuNav(game, { horizontal: true, onConfirm: (i) => this.pick(i) });
  }

  enqueue(minRarity = 'common') { this.queue.push(minRarity); }

  tryOpen() {
    if (this.offer || this.queue.length === 0) return;
    const s = this.scene;
    if (s.dialogActive || s.paused || s.chapterComplete || s.echoLogOpen || s.helpOpen) return;
    const minRarity = this.queue.shift();
    const { rarity, choices } = drawBoonChoices(Math.random, state.boonPity, state.heroClass, state.boons, minRarity);
    if (choices.length === 0) { // 池子抽干(极端情况):直接折现
      state.gold += BOON_SKIP_GOLD;
      return;
    }
    this.offer = { rarity, choices, idx: 0, t: 0 };
    this.nav.index = 0;
    this.game.audio.sfxSecret();
  }

  update(dt) {
    const k = this.game.input;
    const o = this.offer;
    o.t += dt;
    const n = o.choices.length;
    for (let i = 0; i < n; i++) {
      if (k.keysJustPressed.has(`Digit${i + 1}`)) return this.pick(i);
    }
    this.nav.index = o.idx;
    this.nav.update();
    o.idx = this.nav.index;
    // S = 跳过(+50 金补偿,参考 Hades 跳过换金币;ESC 走暂停,不绑定跳过)
    if (k.keysJustPressed.has('KeyS')) {
      state.gold += BOON_SKIP_GOLD;
      this.settlePity(o.rarity);
      this.game.audio.sfxPickup(760);
      this.game.spawnFloatText(this.scene.player.x, this.scene.player.y - 40, `跳过 · +${BOON_SKIP_GOLD} 金`, '#e0b76a');
      this.offer = null;
    }
  }

  pick(i) {
    const def = this.offer.choices[i];
    if (!def) return;
    // 稀有度取卡面 def.rarity(形态祝福是 aspect 金色;存 roll 稀有度会让 HUD 着色错成蓝色)
    state.boons.push({ id: def.id, rarity: def.rarity });
    this.settlePity(this.offer.rarity);
    // 即刻生效类:上限提升同时回血/回蓝
    if (def.mods.maxHp) {
      state.maxHp += def.mods.maxHp;
      this.scene.player.maxHp = state.maxHp;
      this.scene.player.heal(def.mods.maxHp);
    }
    if (def.mods.maxMp) {
      state.maxMp += def.mods.maxMp;
      state.mp = Math.min(state.maxMp, state.mp + def.mods.maxMp);
    }
    this.game.audio.sfxChapter();
    this.game.spawnLevelUpParticles(this.scene.player.x, this.scene.player.y);
    this.game._banner = { text: `获得祝福 · ${def.name}`, color: BOON_RARITY_INFO[def.rarity].color, life: 2.4 };
    this.game.spawnFloatText(this.scene.player.x, this.scene.player.y - 52, def.desc, '#f4ecd0', { px: 16, vy: 38, life: 1.6 });
    this.offer = null;
  }

  // 保底结算:普通 → pity 增加;稀有以上 → 清零(STS pity counter)
  settlePity(rarity) {
    if (rarity === 'common') state.boonPity = Math.min(1, state.boonPity + 0.08);
    else state.boonPity = 0;
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const o = this.offer;
    ctx.fillStyle = 'rgba(6,4,12,0.82)';
    ctx.fillRect(0, 0, W, H);
    const info = BOON_RARITY_INFO[o.rarity];
    text(ctx, '◆ 回响祝福 ◆', W / 2, 64, 'title', info.color, { align: 'center' });
    text(ctx, `本次稀有度〔${info.label}〕 · 选择一枚,效力持续至本章结束`, W / 2, 116, 'small', '#a9a07e', { align: 'center' });
    const n = o.choices.length;
    const cardW = 260, cardH = 300, gap = 40;
    const x0 = (W - (n * cardW + (n - 1) * gap)) / 2;
    for (let i = 0; i < n; i++) {
      const def = o.choices[i];
      const x = x0 + i * (cardW + gap);
      const y = 170;
      const sel = i === o.idx;
      this.nav.hit(i, x, y, cardW, cardH);
      const col = BOON_RARITY_INFO[def.rarity].color;
      const owned = state.boons.filter(b => b.id === def.id).length;
      ctx.fillStyle = sel ? 'rgba(30,22,54,0.98)' : 'rgba(18,14,32,0.95)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = sel ? col : 'rgba(120,100,150,0.5)';
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeRect(x + 1, y + 1, cardW - 2, cardH - 2);
      if (sel) {
        const pulse = 0.6 + 0.4 * Math.sin(o.t * 5);
        ctx.globalAlpha = pulse * 0.18;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, cardW, cardH);
        ctx.globalAlpha = 1;
      }
      // 编号角标
      text(ctx, `${i + 1}`, x + 12, y + 12, 'medium', col);
      text(ctx, def.name, x + cardW / 2, y + 66, 'large', col, { align: 'center' });
      text(ctx, BOON_RARITY_INFO[def.rarity].label + (def.cls ? ' · 职业专属' : ''), x + cardW / 2, y + 106, 'small', '#8b7f5e', { align: 'center' });
      ctx.strokeStyle = 'rgba(183,140,224,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 30, y + 138); ctx.lineTo(x + cardW - 30, y + 138); ctx.stroke();
      this.scene._renderWrapped(ctx, def.desc, x + 26, y + 158, cardW - 52, 'medium', '#d6c8a4');
      // 底部常驻信息行:卡片不再下半空置(选中态由边框+脉冲表达,不挤占卡内空间)
      ctx.strokeStyle = 'rgba(120,100,150,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 30, y + cardH - 42); ctx.lineTo(x + cardW - 30, y + cardH - 42); ctx.stroke();
      text(ctx, owned > 0 ? `已持有 ×${owned}` : (def.cls ? '职业专属' : '本章生效'),
        x + cardW / 2, y + cardH - 30, 'small', owned > 0 ? '#e0b76a' : '#8b7f5e', { align: 'center' });
    }
    // 操作提示放在卡片正下方(y520):H-46 会压到底部技能栏的残影上
    text(ctx, `1/2/3 或 ←→+ENTER 选择 · S 跳过(+${BOON_SKIP_GOLD} 金) · ESC 暂停`, W / 2, 520, 'small', '#a9a07e', { align: 'center' });
  }
}
