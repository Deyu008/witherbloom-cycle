// scenes/skillTree.js — 回响树 · 碎片驱动的技能解锁与升级
//
// 在暂停菜单里打开。展示所有 state.skills 节点,玩家花 state.shards
// 解锁/升级。规则:
//   - cost = current_level * 2 (level 0→1 = 2, level 1→2 = 4, level 2→3 = 6 ...)
//   - 升级后 cooldown *= 0.85(level 1 0.3s → level 2 0.255s → level 3 ≈ 0.217s)
//   - 当 heal 解锁(level 0→1)时,自动 push 到 state.skillBar
//   - shards 不够 → 灰色禁用,ENTER 无效
//   - ESC → 回到暂停菜单
import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { ICON_SKILL } from '../sprite.js';
import { MenuNav } from '../menuNav.js';

// 节点显示顺序(锁定时也能展示,鼓励解锁)
const NODE_ORDER = ['slash', 'dash', 'recall', 'shield', 'echo', 'heal'];

function costFor(level) {
  // level 0 (未解锁) → 解锁 cost = 2 (= 0*2 + 2 不,规格说 cost = current_level * 2)
  // 规格:"Unlocking heal from 0→1 costs 2" + "current_level * 2"
  // 0 * 2 = 0 不对。统一采用 current_level * 2,heal 0→1 用 2(即 current_level 0 → 2 一次性)
  // 但 1→2 = 2, 2→3 = 4。规格说"level 1→2 costs 2, level 2→3 costs 4"。所以 cost = level * 2
  // 解锁 heal (level 0→1) 时,按规格 costs 2,采用 (level + 1) * 2? 不对。
  // 解: cost = (level === 0 ? 2 : level * 2)。
  return level === 0 ? 2 : level * 2;
}

function nextLevelCost(level) {
  return costFor(level);
}

export class SkillTreeScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.menuIndex = 0;
    this.flashMsg = '';       // 短暂提示(碎片不足 等)
    this.flashLife = 0;
    this.nav = new MenuNav(game, { onConfirm: (i) => this._tryUpgrade(NODE_ORDER[i]) });
  }

  enter(opts = {}) {
    this.t = 0;
    this.menuIndex = 0;
    this.nav.index = 0;
    this.flashMsg = '';
    this.flashLife = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.flashLife > 0) this.flashLife -= dt;
    if (this.flashLife <= 0) this.flashMsg = '';

    const k = this.game.input;
    // 2 列网格布局参数与 render 一致(指针命中)
    const cols = 2, cellW = 380, cellH = 142, gapX = 30, gapY = 22;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (this.game.canvas.width - totalW) / 2, startY = 204;
    for (let i = 0; i < NODE_ORDER.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      this.nav.hit(i, startX + col * (cellW + gapX), startY + row * (cellH + gapY), cellW, cellH);
    }
    this.nav.update();
    this.menuIndex = this.nav.index;
    if (k.justPressed('cancel') || k.justPressed('back')) {
      this.game.audio.sfxClick();
      // 返回暂停菜单:用 setScene(无淡入淡出)直达 game 场景,enter() 会识别 _fromSkillTree
      this.game.setScene('game', { _fromSkillTree: true, chapter: this.game.scenes.game.chapter });
    }
  }

  _tryUpgrade(key) {
    const sk = state.skills[key];
    if (!sk) return;
    const cur = sk.level;
    const maxLevel = 3;
    if (cur >= maxLevel) {
      this._flash(`${sk.name} 已至最高级 Lv${maxLevel}`);
      return;
    }
    const cost = nextLevelCost(cur);
    if (state.shards < cost) {
      this._flash(`碎片不足 · 需要 ${cost}`);
      this.game.audio.sfxClick();
      return;
    }
    // 扣碎片 + 升级
    state.shards -= cost;
    sk.level = cur + 1;
    sk.cooldown = sk.cooldown * 0.85;
    // 解锁 heal 时同步到 skillBar
    if (key === 'heal' && sk.level >= 1 && !state.skillBar.includes('heal')) {
      state.skillBar.push('heal');
    }
    // 反馈
    this.game.audio.sfxClick();
    const label = cur === 0 ? `${sk.name} 解锁` : `${sk.name} Lv${cur}→Lv${sk.level}`;
    this._flash(`${label} · -${cost} 碎片`);
    // 浮动文字(玩家脚下) —— player 可能不在当前 scene 但 spawnFloatText 在 game 上
    const px = this.game.scenes.game?.player?.x ?? 0;
    const py = this.game.scenes.game?.player?.y ?? 0;
    this.game.spawnFloatText(px, py - 36, `+1 Lv · -${cost}`, '#b78ce0');
    this.game.spawnLevelUpParticles(px, py - 20);
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
    // 紫色渐变光晕
    const cx = W / 2, cy = 200;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 320);
    grad.addColorStop(0, 'rgba(183, 140, 224, 0.18)');
    grad.addColorStop(1, 'rgba(183, 140, 224, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 标题
    text(ctx, '回  响  树', W / 2, 60, 'hero', '#f4ecd0', {
      align: 'center', shadowColor: '#3a2a5a', shadowOffset: { x: 3, y: 3 },
    });
    text(ctx, 'ECHO TREE · spend shards to awaken', W / 2, 130, 'small', '#a8945a', { align: 'center' });

    // 顶部状态: 当前碎片
    text(ctx, `◆ 碎片 ${state.shards}`, W / 2, 170, 'large', '#b78ce0', { align: 'center' });

    // 2 列布局(节点行距加大填满纵向:3×142+2×22=470,网格 204-674,底部提示不叠)
    const cols = 2;
    const cellW = 380, cellH = 142;
    const gapX = 30, gapY = 22;
    const totalW = cols * cellW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 204;

    for (let i = 0; i < NODE_ORDER.length; i++) {
      const key = NODE_ORDER[i];
      const sk = state.skills[key];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cellW + gapX);
      const y = startY + row * (cellH + gapY);
      this._renderNode(ctx, x, y, cellW, cellH, key, sk, i === this.menuIndex);
    }

    // 底部提示(网格下沿 656 之下;闪烁提示再下移,两者不叠)
    text(ctx, '↑↓ 选择   ·   ENTER 解锁 / 升级   ·   ESC 返回暂停',
      W / 2, H - 28, 'small', '#a8945a', { align: 'center' });

    // 闪烁提示(碎片不足 / 满级)
    if (this.flashLife > 0 && this.flashMsg) {
      const a = Math.min(1, this.flashLife);
      ctx.globalAlpha = a;
      text(ctx, this.flashMsg, W / 2, H - 52, 'medium', '#e87a3c', {
        align: 'center', shadowColor: '#000', shadowOffset: { x: 1, y: 1 },
      });
      ctx.globalAlpha = 1;
    }
  }

  _renderNode(ctx, x, y, w, h, key, sk, selected) {
    const cost = nextLevelCost(sk.level);
    const affordable = state.shards >= cost;
    const locked = sk.level === 0;
    const maxed = sk.level >= 3;

    // 框
    ctx.fillStyle = selected ? 'rgba(60, 40, 90, 0.92)' : 'rgba(20, 16, 30, 0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = selected ? '#b78ce0' : '#3a2a5a';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    // 图标
    const icon = ICON_SKILL[key];
    if (icon) {
      const ix = x + 18, iy = y + (h - icon.height) / 2;
      // 锁定 / 满级时灰化
      if (!affordable || maxed) ctx.globalAlpha = 0.45;
      ctx.drawImage(icon, ix, iy);
      ctx.globalAlpha = 1;
    }

    // 名称(large 30px 收进 y14..44,与下方描述留出间隙)
    const textColor = selected ? '#f4ecd0' : (affordable ? '#d6c8a4' : '#8b7f5e');
    text(ctx, sk.name, x + 80, y + 14, 'large', textColor);

    // 等级 (右对齐)
    const lvText = `Lv ${sk.level} / 3`;
    text(ctx, lvText, x + w - 18, y + 22, 'medium', maxed ? '#e0b76a' : textColor, { align: 'right' });

    // 描述
    text(ctx, sk.desc, x + 80, y + 50, 'small', selected ? '#a8945a' : '#8b7f5e');

    // 冷却
    const cdLabel = `冷却 ${sk.cooldown.toFixed(2)}s`;
    text(ctx, cdLabel, x + 80, y + 72, 'small', '#8b7f5e');

    // 升级按钮 / 状态文字
    let btnText, btnColor;
    if (maxed) {
      btnText = '已至最高';
      btnColor = '#e0b76a';
    } else if (locked) {
      btnText = (affordable ? '解锁' : '✕ 碎片不足') + ` · ${cost} 碎片`;
      btnColor = affordable ? '#b78ce0' : '#8b7f5e';
    } else {
      btnText = (affordable ? `升级 Lv${sk.level + 1}` : `✕ 升级 Lv${sk.level + 1}`) + ` · ${cost} 碎片`;
      btnColor = affordable ? '#b78ce0' : '#8b7f5e';
    }
    text(ctx, btnText, x + 80, y + 98, 'medium', btnColor);

    // 选中指示器
    if (selected) {
      ctx.fillStyle = '#b78ce0';
      ctx.fillRect(x - 8, y + 8, 4, h - 16);
    }
  }
}