// scenes/skillInfo.js — 技能图鉴:说明 + 动态演示(解决"不知道技能是什么效果")
// 左列 6 技能(冷却按当前职业乘区换算);右侧演示面板用真实精灵循环播放技能实际效果;
// 底部为当前职业的差异说明(冷却乘区/回蓝乘区/专属形态祝福)。
// 返回:ESC → setScene('game', {_fromSkillInfo}) 由 GameScene.enter 重新弹暂停窗。
import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { SPRITE_LIB } from '../sprite.js';
import { SKILL_BASE, CLASS_MODS } from '../data/balance.js';
import { BOON_POOL } from '../data/boons.js';
import { MenuNav } from '../menuNav.js';

const PAL_GRAY = '#a9a07e';
const PAL_GOLD = '#e0b76a';

// 技能条目:数值与 player.js 实现一一对应(改动技能时同步这里)
const SKILL_INFO = [
  {
    key: 'slash', btn: 'J / 鼠标', name: '回声斩', cost: null, cdKey: 'slash',
    lines: [
      '三段连击:横扫 → 上挑(击退×2) → 劈砸(伤害+20% · 范围+30% · 震屏)。',
      '每次命中回 2 点法力;连击链持续命中最高 +32% 伤害,受击打断。',
    ],
  },
  {
    key: 'dash', btn: 'SPACE', name: '余烬闪', cost: 0, cdKey: 'dash',
    lines: [
      '朝移动方向冲刺,冲刺期间与收招瞬间无敌。',
      '无敌帧内穿过攻击判定「完美闪避」:子弹时间 + 回复 18 法力。',
    ],
  },
  {
    key: 'recall', btn: 'Q', name: '追忆', cost: 12, cdKey: 'recall',
    lines: [
      '放出回声法弹,造成 24 + 等级×4 魔法伤害,命中沿途目标。',
      '追忆者的专属祝福「回响穿透」可让法弹穿透 2 名敌人。',
    ],
  },
  {
    key: 'shield', btn: 'E', name: '枯荣之护', cost: 20, cdKey: 'shield',
    lines: [
      '1.4 秒完全无敌(弹幕、接触伤害、危险地形一概无效)。',
      '适合硬吃 Boss 一轮齐射,或贴身输出时顶住反击。',
    ],
  },
  {
    key: 'echo', btn: 'R', name: '回响共鸣', cost: 30, cdKey: 'echo',
    lines: [
      '回复 40 点生命,并清空全场小怪的仇恨(围攻解围技)。',
      '注意:再次攻击后仇恨会重新累积,留到最危急时用。',
    ],
  },
  {
    key: 'heal', btn: 'F', name: '晨露', cost: null, cdKey: null, count: '露珠×1',
    lines: [
      '消耗 1 枚露珠回复 30 点生命;露珠由敌人掉落。',
      '满血时使用会被拒绝(不浪费露珠)。',
    ],
  },
];

export class SkillInfoScene {
  constructor(game) {
    this.game = game;
    this.idx = 0;
    this.t = 0;
    this.nav = new MenuNav(game);
  }

  enter() { this.t = 0; this.nav.index = 0; this.idx = 0; }

  update(dt) {
    this.t += dt;
    const k = this.game.input;
    // 左列布局参数与 render 一致(指针命中;列表无确认动作,点击仅选中)
    const listX = 56, listY = 140, lh = 64;
    for (let i = 0; i < SKILL_INFO.length; i++) {
      this.nav.hit(i, listX - 10, listY + i * lh - 10, 400, lh - 4);
    }
    this.nav.update();
    this.idx = this.nav.index;
    if (k.justPressed('cancel') || k.justPressed('back')) {
      this.game.audio.sfxClick();
      this.game.setScene('game', { _fromSkillInfo: true, chapter: this.game.scenes.game.chapter });
    }
  }

  // 当前技能的有效冷却(职业乘区换算,展示真实数值)
  effCd(item) {
    if (!item.cdKey) return null;
    const cls = CLASS_MODS[state.heroClass] || CLASS_MODS.recall;
    return (SKILL_BASE[item.cdKey]?.cooldown ?? 0) * cls.cooldownMul;
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#171226');
    g.addColorStop(1, '#0a0a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    text(ctx, '◆ 技能图鉴 ◆', W / 2, 44, 'title', '#f4ecd0', { align: 'center' });
    const cls = CLASS_MODS[state.heroClass] || CLASS_MODS.recall;
    text(ctx, `当前倾向:${cls.label} — 技能全职业通用,数值随倾向变化`, W / 2, 92, 'small', PAL_GRAY, { align: 'center' });

    // 左列:技能列表
    const listX = 56, listY = 140, lh = 64;
    for (let i = 0; i < SKILL_INFO.length; i++) {
      const it = SKILL_INFO[i];
      const sel = i === this.idx;
      const y = listY + i * lh;
      if (sel) { ctx.fillStyle = 'rgba(183,140,224,0.16)'; ctx.fillRect(listX - 10, y - 10, 400, lh - 4); }
      // 按键徽章
      ctx.fillStyle = sel ? '#2a1a4a' : '#16102a';
      ctx.fillRect(listX, y - 4, 74, 26);
      ctx.strokeStyle = sel ? '#b78ce0' : '#3a2a5a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(listX + 0.5, y - 3.5, 73, 25);
      text(ctx, it.btn, listX + 37, y + 1, 'small', sel ? '#f4ecd0' : PAL_GRAY, { align: 'center' });
      text(ctx, (sel ? '▶ ' : '  ') + it.name, listX + 88, y, sel ? 'medium' : 'small', sel ? '#f4ecd0' : PAL_GRAY);
      // 一行摘要
      const cd = this.effCd(it);
      const costTxt = it.cost == null ? (it.count || '') : (it.cost > 0 ? `耗 ${it.cost} 法力` : '无消耗');
      const cdTxt = cd != null ? ` · 冷却 ${cd.toFixed(cd < 1 ? 2 : 1)}s` : '';
      text(ctx, costTxt + cdTxt, listX + 88, y + 26, 'small', sel ? PAL_GOLD : '#8b7f5e');
    }

    // 右侧:演示面板(外层定高容器:不同技能描述行数不同,统一边界避免翻页时底边跳动)
    const dx = 500, dy = 136, dw = W - dx - 56, dh = 386;
    const outerY = dy - 28, outerH = (H - 70) - outerY;
    ctx.fillStyle = 'rgba(8,6,14,0.55)';
    ctx.fillRect(dx - 16, outerY, dw + 32, outerH);
    ctx.strokeStyle = 'rgba(183,140,224,0.25)'; ctx.lineWidth = 1;
    ctx.strokeRect(dx - 15.5, outerY + 0.5, dw + 31, outerH - 1);
    ctx.fillStyle = 'rgba(12,9,22,0.92)';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(183,140,224,0.4)'; ctx.lineWidth = 2;
    ctx.strokeRect(dx + 1, dy + 1, dw - 2, dh - 2);
    this._renderDemo(ctx, dx, dy, dw, dh);

    // 演示面板下方:描述(行距收紧,职业说明与页脚提示不再叠印)
    const it = SKILL_INFO[this.idx];
    const descY = dy + dh + 18;
    text(ctx, `${it.btn} · ${it.name}`, dx, descY, 'medium', PAL_GOLD);
    this._wrap(ctx, it.lines[0], dx, descY + 30, dw, 'small', '#d6c8a4');
    this._wrap(ctx, it.lines[1], dx, descY + 58, dw, 'small', '#a9a07e');
    // 职业差异说明
    const aspect = BOON_POOL.find(b => b.rarity === 'aspect' && b.cls === state.heroClass);
    const cdPct = Math.round((1 - cls.cooldownMul) * 100);
    const clsNote = cls.id === 'recall'
      ? `倾向加成:法力上限 +30% · 专属祝福「${aspect?.name || '回响穿透'}」`
      : cls.id === 'forge'
        ? `倾向加成:生命上限 +30% · 专属祝福「${aspect?.name || '巨剑横扫'}」`
        : `倾向加成:技能冷却 -${cdPct}% · 专属祝福「${aspect?.name || '织梦加速'}」`;
    text(ctx, clsNote, dx, descY + 92, 'small', '#8ad0e0');

    text(ctx, '↑↓ 选择技能 · ESC 返回', W / 2, H - 36, 'small', PAL_GRAY, { align: 'center' });
  }

  // ===== 演示面板 =====
  _renderDemo(ctx, dx, dy, dw, dh) {
    const it = SKILL_INFO[this.idx];
    const cx = dx + dw / 2, groundY = dy + dh - 52;
    // 演示舞台:深色地板 + 网格透视线(填补空置感,给动作一个"场地")
    const floorH = dh - (groundY - dy);
    ctx.fillStyle = 'rgba(30,24,48,0.55)';
    ctx.fillRect(dx + 2, groundY, dw - 4, floorH - 2);
    ctx.strokeStyle = 'rgba(120,104,150,0.22)'; ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = groundY + (floorH * i) / 4;
      ctx.beginPath(); ctx.moveTo(dx + 2, y); ctx.lineTo(dx + dw - 2, y); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const x0 = dx + 10 + ((dw - 20) / 8) * i;
      ctx.beginPath(); ctx.moveTo(x0, groundY); ctx.lineTo(dx + dw / 2 + (x0 - dx - dw / 2) * 1.6, dy + dh - 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(224,183,106,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(dx + 30, groundY); ctx.lineTo(dx + dw - 30, groundY); ctx.stroke();
    const hero = SPRITE_LIB.heroVariants?.[state.heroClass]?.idle?.[0] || SPRITE_LIB.hero?.idle?.[0];
    const foeA = SPRITE_LIB.enemies?.forest_spirit?.[0];
    const foeB = SPRITE_LIB.enemies?.forest_spirit?.[1] || foeA;
    const foe = Math.floor(this.t * 3) % 2 === 0 ? foeA : foeB;
    const heroH = 96;
    const drawHero = (x, alpha = 1, tilt = 0) => {
      if (!hero) return;
      const drawW = hero.width * (heroH / hero.height);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, groundY);
      if (tilt) ctx.rotate(tilt);
      ctx.drawImage(hero, -drawW / 2, -heroH, drawW, heroH);
      ctx.restore();
    };
    const drawFoe = (x, hp = 1, h = 44) => {
      if (!foe) return;
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * hp;
      ctx.drawImage(foe, x - foe.width / 2, groundY - h, foe.width, h);
      ctx.restore();
      // 木桩血条
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - 22, groundY - h - 12, 44, 5);
      ctx.fillStyle = '#d65858';
      ctx.fillRect(x - 21, groundY - h - 11, 42 * Math.max(0, hp), 3);
    };
    const ring = (x, y, r, color, a = 1, dash = null) => {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };
    const floatTxt = (x, y, str, color, phase) => {
      const k = Math.max(0, Math.min(1, phase));
      ctx.save();
      ctx.globalAlpha = 1 - k;
      text(ctx, str, x, y - k * 26, 'small', color, { align: 'center' });
      ctx.restore();
    };
    const T = this.t;
    const hx0 = cx - 170, fx = cx + 150;

    if (it.key === 'slash') {
      // 三段连击:0.5s 节拍 × 3,弧光扫过 + 木桩掉血
      const beat = (T % 2.6) / 2.6;
      const stage = Math.min(2, Math.floor(beat * 3));
      const phase = beat * 3 - stage;
      const dmg = [18, 16, 24][stage] ?? 18;
      const hp = 1 - (stage + Math.max(0, phase - 0.25)) / 3.4;
      drawFoe(fx, hp);
      drawHero(hx0 + Math.min(phase * 60, 26), 1, phase < 0.22 ? -0.1 : 0.06);
      if (phase > 0.04 && phase < 0.75) {
        const p = Math.min(1, (phase - 0.04) / 0.45);
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.95;
        ctx.strokeStyle = stage === 2 ? '#ffd070' : '#fff0c0';
        ctx.lineWidth = 8 * (1 - p * 0.5);
        const spread = stage === 0 ? 1.9 : stage === 2 ? 1.3 : 1.6;
        const start = -spread / 2 + spread * p * 0.6 - 0.5;
        ctx.beginPath(); ctx.arc(hx0 + 52, groundY - 52, 62, start, start + spread * 0.55); ctx.stroke();
        // 内圈细弧提亮
        ctx.globalAlpha = (1 - p) * 0.6;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(hx0 + 52, groundY - 52, 52, start + 0.08, start + spread * 0.5); ctx.stroke();
        ctx.restore();
      }
      if (phase > 0.18 && phase < 0.95) floatTxt(fx, groundY - 78, `${dmg}${stage === 2 ? '!' : ''}`, stage === 2 ? '#e0b76a' : '#f4ecd0', (phase - 0.18) / 0.77);
      text(ctx, `连击 ${stage + 1}/3`, dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    } else if (it.key === 'dash') {
      // 冲刺残影 + 完美闪避定格
      const p = (T % 2.6) / 2.6;
      const travel = Math.min(1, p / 0.45);
      const x = hx0 + travel * (fx - 60 - hx0);
      // 敌方来袭弹(在冲刺中段穿过玩家)
      const projX = dx + 80 + (p * 2.6 * 260) % (dw - 100);
      if (p > 0.05 && p < 0.5) {
        ctx.fillStyle = '#ff8050';
        ctx.beginPath(); ctx.arc(dx + dw - 90 - p * 2 * (dw / 2 - 90), groundY - 44, 7, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 1; i <= 3; i++) drawHero(x - i * 24, 0.16 * (4 - i));
      drawHero(x, 1);
      if (p > 0.45 && p < 0.9) {
        ring(x, groundY - 40, 34, '#bfefff', 1 - (p - 0.45) / 0.45, [6, 5]);
        floatTxt(x, groundY - 96, '完美闪避!', '#bfefff', (p - 0.45) / 0.45);
      }
      text(ctx, '无敌帧穿过攻击 → 子弹时间 + 回蓝', dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    } else if (it.key === 'recall') {
      // 法弹飞行 + 命中爆裂
      const p = (T % 2.2) / 2.2;
      drawFoe(fx, 1 - Math.max(0, (p - 0.55) / 1.2));
      drawHero(hx0);
      if (p < 0.55) {
        const q = p / 0.55;
        const px = hx0 + 30 + q * (fx - hx0 - 30);
        for (let i = 1; i <= 4; i++) {
          ctx.globalAlpha = 0.5 - i * 0.1;
          ctx.fillStyle = '#b78ce0';
          ctx.beginPath(); ctx.arc(px - i * 14, groundY - 44, 8 - i, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const grad = ctx.createRadialGradient(px, groundY - 44, 0, px, groundY - 44, 20);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, '#b78ce0'); grad.addColorStop(1, 'rgba(183,140,224,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(px, groundY - 44, 20, 0, Math.PI * 2); ctx.fill();
      } else if (p < 0.95) {
        const q = (p - 0.55) / 0.4;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.globalAlpha = 1 - q;
          ctx.fillStyle = '#d8c0ff';
          ctx.beginPath(); ctx.arc(fx + Math.cos(a) * (14 + q * 36), groundY - 44 + Math.sin(a) * (10 + q * 26), 3.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        floatTxt(fx, groundY - 66, `${24 + state.level * 4}`, '#b78ce0', q);
      }
      text(ctx, '耗 12 法力 · 伤害随等级成长', dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    } else if (it.key === 'shield') {
      // 无敌环弹开来袭弹
      const p = (T % 2.6) / 2.6;
      drawHero(hx0);
      const rr = 40 + Math.sin(T * 5) * 3;
      ring(hx0, groundY - 40, rr, '#8aa9c4', 0.85, [10, 7]);
      ring(hx0, groundY - 40, rr * 0.8, '#c4d8e8', 0.35);
      for (let i = 0; i < 3; i++) {
        const q = (p * 3 - i + 1) % 1;
        if (q <= 0 || q >= 1) continue;
        const sx = dx + dw - 40, ex = hx0 + rr;
        const px = sx - q * (sx - ex);
        if (q > 0.96) continue; // 到达环面即湮灭
        ctx.fillStyle = '#ff8050';
        ctx.beginPath(); ctx.arc(px, groundY - 40 - (i - 1) * 18, 6, 0, Math.PI * 2); ctx.fill();
      }
      floatTxt(hx0, groundY - 96, '无敌 1.4s', '#8aa9c4', Math.max(0, (p - 0.5) / 0.5));
      text(ctx, '弹幕 · 接触 · 地形伤害全部无效', dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    } else if (it.key === 'echo') {
      // 回血粒子 + 血条回复 + 仇恨熄灭
      const p = (T % 2.8) / 2.8;
      drawHero(hx0);
      // 玩家血条
      const hpw = 120;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(hx0 - hpw / 2, groundY + 14, hpw, 7);
      ctx.fillStyle = '#d65858'; ctx.fillRect(hx0 - hpw / 2 + 1, groundY + 15, (hpw - 2) * Math.min(1, 0.35 + p * 0.65), 5);
      // 上升治疗粒子(确定性相位)
      for (let i = 0; i < 10; i++) {
        const ph = (T * 0.8 + i * 0.37) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = '#a8e8b0';
        ctx.beginPath(); ctx.arc(hx0 + Math.sin(i * 2.1) * 26, groundY - ph * 70, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (p > 0.4) {
        const q = (p - 0.4) / 0.6;
        floatTxt(hx0, groundY - 92, '+40', '#a8e8b0', q);
        ring(hx0, groundY - 40, 20 + q * 150, '#a8e8b0', 1 - q);
      }
      // 两个小怪:仇恨"!"→ 熄灭
      for (const ox of [110, 210]) {
        drawFoe(dx + dw - 90 - (ox - 110), 1, 34);
        const mx = dx + dw - 90 - (ox - 110);
        if (p < 0.45) {
          text(ctx, '!', mx, groundY - 66, 'medium', '#ff5050', { align: 'center' });
        } else {
          ctx.globalAlpha = 0.4;
          text(ctx, '…', mx, groundY - 66, 'medium', '#8b7f5e', { align: 'center' });
          ctx.globalAlpha = 1;
        }
      }
      text(ctx, '回复 40 生命 · 清空全场小怪仇恨', dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    } else if (it.key === 'heal') {
      // 露珠 + 蓝滴 + 回复
      const p = (T % 2.0) / 2.0;
      drawHero(hx0);
      if (p < 0.35) {
        const q = p / 0.35;
        const oy = groundY - 110 + q * 70;
        ctx.fillStyle = '#8ad0e0';
        ctx.beginPath(); ctx.arc(hx0, oy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(hx0 - 2, oy - 2, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        const q = (p - 0.35) / 0.65;
        for (let i = 0; i < 8; i++) {
          const ph = (q + i * 0.11) % 1;
          ctx.globalAlpha = 1 - ph;
          ctx.fillStyle = '#8ad0e0';
          ctx.beginPath(); ctx.arc(hx0 + Math.sin(i * 1.7) * 22, groundY - ph * 56, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        floatTxt(hx0, groundY - 92, '+30', '#8ad0e0', q);
      }
      text(ctx, '消耗露珠 ×1 · 敌人掉落补给', dx + dw / 2, dy + 28, 'small', PAL_GRAY, { align: 'center' });
    }
  }

  // 简易换行(与 GameScene._renderWrapped 同思路)
  _wrap(ctx, str, x, y, maxW, size, color) {
    let line = '', yOff = 0;
    const px = typeof size === 'number' ? size : 16;
    const lh = Math.round(px * 1.5);
    for (const ch of str) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        text(ctx, line, x, y + yOff, size, color);
        yOff += lh;
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line) text(ctx, line, x, y + yOff, size, color);
  }
}
