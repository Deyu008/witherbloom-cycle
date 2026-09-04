// balance.js — 集中所有游戏数值(玩家基线/职业修正/敌人/BOSS/技能/掉率)
// 规则:任何数值改动只能在这里发生,模块从 balance.js 导入使用。
// 数值搬运自 enemy.js / boss.js / player.js / state.js,保持完全等价(不修改)。
//
// Build: 本文件同时被 esbuild 打包进 dist/game.js;dev 模式由 index.html 直接 import。

// ─────────────────────────────────────────────────────────────
// 玩家基础属性(无职业修正前)
// ─────────────────────────────────────────────────────────────
export const PLAYER_BASE = {
  hp: 100,
  mp: 60,
  speed: 150,
  attackDamage: 14,
  attackRange: 84,
  mpRegen: 1.6, // 被动法力回复/秒(player.js 乘 CLASS_MODS.mpRegenMul)
};

// ─────────────────────────────────────────────────────────────
// 职业修正(应用 PLAYER_BASE 后的最终值,避免分散算式)
// 计算口径沿用 player.js 原 inline 写法,Math.round 取整结果已固化:
//   recall: mp = round(60*1.3) = 78;  atk = round(14*0.85) = 12;  hp = 100
//   forge:  hp = round(100*1.3) = 130; mp = round(60*0.8) = 48;  atk = 14
//   weave:  hp = round(100*0.9) = 90;  mp = 60;                  atk = 14
// ─────────────────────────────────────────────────────────────
export const CLASS_MODS = {
  recall: {
    label: '回响倾向',
    hp: 100,
    mp: 78,
    attackDamage: 12,
    cooldownMul: 1.0,        // 原值不乘
    mpRegenMul: 1.0,
  },
  forge: {
    label: '锻体倾向',
    hp: 130,
    mp: 48,
    attackDamage: 14,
    cooldownMul: 1.0,
    mpRegenMul: 0.8,        // 法力上限 -20% 等价于无被动回复(原写法)
  },
  weave: {
    label: '织梦倾向',
    hp: 90,
    mp: 60,
    attackDamage: 14,
    cooldownMul: 0.75,      // 所有技能 cd × 0.75
    mpRegenMul: 1.0,
  },
};

// ─────────────────────────────────────────────────────────────
// 普通敌人数值(由 enemy.js 7-19 行整体搬入,字段完全一致)
// ─────────────────────────────────────────────────────────────
// charge: true 的敌人会在中距离蓄力后向玩家冲锋(可闪避),丰富走位博弈
export const ENEMY_DATA = {
  forest_spirit: { hp: 26, dmg: 7, speed: 64, ai: 'melee', xp: 6, gold: 3, size: 30, color: '#6fb872' },
  moss_lurker:   { hp: 55, dmg: 12, speed: 38, ai: 'melee', xp: 12, gold: 5, size: 38, color: '#5a8a4a', charge: true },
  vine_wraith:   { hp: 32, dmg: 10, speed: 70, ai: 'ranged', xp: 10, gold: 4, size: 34, range: 220, color: '#7a5a8a' },
  ember_imp:     { hp: 36, dmg: 14, speed: 96, ai: 'melee', xp: 13, gold: 6, size: 30, color: '#e87a3c' },
  forge_knight:  { hp: 90, dmg: 18, speed: 52, ai: 'melee', xp: 20, gold: 9, size: 40, color: '#5a5a66' },
  ash_phantom:   { hp: 30, dmg: 16, speed: 78, ai: 'ranged', xp: 15, gold: 6, size: 34, range: 240, color: '#7a4a4a' },
  grave_warden:  { hp: 66, dmg: 18, speed: 56, ai: 'melee', xp: 18, gold: 8, size: 38, color: '#5a5a70' },
  ink_scholar:   { hp: 38, dmg: 16, speed: 66, ai: 'ranged', xp: 16, gold: 7, size: 34, range: 230, color: '#4a3a6a' },
  frost_lurker:  { hp: 54, dmg: 20, speed: 82, ai: 'melee', xp: 22, gold: 9, size: 34, color: '#8aa9c4', charge: true },
  mirror_knight: { hp: 82, dmg: 22, speed: 60, ai: 'melee', xp: 24, gold: 11, size: 40, color: '#a8b8d0' },
  void_seeker:   { hp: 48, dmg: 24, speed: 88, ai: 'ranged', xp: 26, gold: 11, size: 36, range: 250, color: '#3a2a4a' },
};

// ─────────────────────────────────────────────────────────────
// BOSS 数值(由 boss.js 8-31 行整体搬入)
// ─────────────────────────────────────────────────────────────
export const BOSS_DATA = {
  forest_keeper: { name: '守林人 · 艾温', chapter: 1, hp: 300, dmg: 14, color: '#6fb872', size: 96, projColor: '#a8e8b0',
    phases: [
      { name: '等待', line: '我在等……',           attackRate: 2.2 },
      { name: '回响', line: '你想起了什么?',       attackRate: 1.8 },
      { name: '记忆', line: '现在,让我听你说。',   attackRate: 1.4 },
    ] },
  burning_king:  { name: '焚身王 · 阿撒兹勒', chapter: 2, hp: 450, dmg: 18, color: '#e87a3c', size: 110, projColor: '#ff8040',
    phases: [
      { name: '哀火', line: '火,会带走一切。',     attackRate: 2.0 },
      { name: '焚城', line: '哀伤还没有烧尽。',    attackRate: 1.4 },
    ] },
  chronomancer:  { name: '编年者 · 赛弗', chapter: 3, hp: 600, dmg: 22, color: '#8a7ab0', size: 104, projColor: '#b0a0e0',
    phases: [
      { name: '编录', line: '所有事件,都已被记下。', attackRate: 2.0 },
      { name: '改写', line: '但有些事,该被改写。',   attackRate: 1.4 },
    ] },
  forgotten:     { name: '寂渊 · 被遗忘者', chapter: 4, hp: 900, dmg: 28, color: '#b78ce0', size: 120, projColor: '#c8a8ff',
    phases: [
      { name: '虚无', line: '……你来了。',           attackRate: 2.2 },
      { name: '悔恨', line: '我曾有过名字。',       attackRate: 1.6 },
      { name: '回响', line: '现在,让我记住你。',    attackRate: 1.3 },
    ] },
};

// 第 4 章寂渊回廊的悔恨化身:独立数值表,避免 3 个迷你 BOSS 都继承到 900HP
export const MINIBOSS_DATA = {
  regret_childhood: { name: '悔恨 · 童年', chapter: 4, hp: 140, dmg: 14, color: '#b0c8e8', size: 72, projColor: '#c8d8f0',
    phases: [{ name: '悔恨·童年', attackRate: 2.2 }] },
  regret_doubt:     { name: '悔恨 · 怀疑', chapter: 4, hp: 150, dmg: 16, color: '#a8b8d0', size: 72, projColor: '#c0d0e8',
    phases: [{ name: '悔恨·怀疑', attackRate: 2.0 }] },
  regret_abandon:   { name: '悔恨 · 抛弃', chapter: 4, hp: 160, dmg: 18, color: '#8a9ab4', size: 74, projColor: '#a8b8d0',
    phases: [{ name: '悔恨·抛弃', attackRate: 2.0 }] },
};

export const MINIBOSS_FALLBACK = {
  name: '悔恨', chapter: 4, hp: 150, dmg: 14, color: '#a8b8d0', size: 70, projColor: '#c0d0e8',
  phases: [{ name: '悔恨', attackRate: 2.0 }],
};

// ─────────────────────────────────────────────────────────────
// 技能基线冷却(由 state.js 22-29 行整体搬入)
// 注意:level/currentCd 为运行时字段,技能在 freshState() 内构造时
// 由 spread 注入 — 这里只放基线表,不动运行时副本。
// ─────────────────────────────────────────────────────────────
export const SKILL_BASE = {
  slash:  { name: '回声斩', level: 1, cooldown: 0.3,  desc: '近战普通攻击' },
  dash:   { name: '余烬闪', level: 1, cooldown: 1.0,  desc: '冲刺一段距离' },
  recall: { name: '追忆',   level: 1, cooldown: 4.0,  desc: '释放回声,造成魔法伤害' },
  shield: { name: '枯荣之护', level: 1, cooldown: 8.0,  desc: '短暂无敌' },
  echo:   { name: '回响共鸣', level: 1, cooldown: 12.0, desc: '治疗自身并清空小怪仇恨' },
  heal:   { name: '晨露',   level: 0, cooldown: 20.0, desc: '消耗露珠大幅回血' },
};

// ─────────────────────────────────────────────────────────────
// 敌人死亡掉率(由 enemy.js onKilled 134-139 行内联 drops 整体搬入)
// ─────────────────────────────────────────────────────────────
export const DROP_RATES = [
  { chance: 0.45, type: 'dew' },
  { chance: 0.30, type: 'ember' },
  { chance: 0.15, type: 'leaf' },
  { chance: 0.35, type: 'gold' },
];

// ─────────────────────────────────────────────────────────────
// 战斗手感与深度(CONBAT = COMBAT 手感块,全部集中在此便于调参)
// ─────────────────────────────────────────────────────────────
export const COMBAT = {
  // 暴击
  critChance: 0.14,     // 基础暴击率(连击加成另计)
  critMul: 1.6,         // 暴击伤害倍率
  critComboBonus: 0.10, // 连击 ≥5 后额外 +10% 暴击率(capped)

  // 连击(combo):命中累计,受击清零;高连击给伤害/蓝量奖励
  comboWindow: 3.0,     // 距上次命中最长间隔(秒),超时清零
  comboDmgSteps: [      // [达到连击数, 伤害乘子]
    [5, 1.10],
    [12, 1.20],
    [22, 1.32],
  ],
  comboMpPerHit: 2,     // 每次命中额外回蓝(鼓励贴身输出循环技能)

  // 完美闪避:冲刺无敌帧内"本应命中"触发 → 子弹时间 + 回蓝奖励
  perfectDodgeGrace: 0.12, // 冲刺结束后仍算"完美窗口"的宽限(秒)
  perfectDodgeMp: 18,
  perfectDodgeSlowmo: { scale: 0.32, time: 0.5 }, // 时间缩放与持续

  // 精英敌人
  eliteChance: 0.08,
  eliteHpMul: 2.4,
  eliteDmgMul: 1.4,
  eliteSizeMul: 1.35,
  eliteRewardMul: 3,

  // BOSS 接触伤害(防止贴身白嫖;有 0.8s 玩家 i-frame 兜底)
  bossContactDmgMul: 0.45,
  bossContactIframe: 0.8,
  bossEnrageAt: 0.25,       // HP 低于此占比进入狂暴
  bossEnrageSpeedMul: 1.45,
  bossEnrageRateMul: 0.72,  // 攻击间隔缩短
  bossBlinkCdMin: 7,        // 相位 ≥1 的瞬步换位冷却区间(秒)
  bossBlinkCdMax: 11,

  // 敌人走位:垂直于连线的正弦绕行摆幅,避免挤成一列"贪吃蛇"
  strafeAmp: 0.55,
  strafeFreq: 2.4,

  // 击杀反馈
  killShakeMinHp: 60,   // 高血量敌人死亡追加更明显的震屏
};

// 刻印守护战:拾取刻印刷出的一波警觉敌人(数量随章节);全灭有额外奖励
export const SEAL_AMBUSH_COUNTS = { 1: 3, 2: 4, 3: 4, 4: 5 };
export const SEAL_AMBUSH_REWARD = { xp: 20, heal: 15 };

// 连击伤害乘子(纯函数,供单测):达到阈值取最高档
export function comboMultiplier(count) {
  let m = 1;
  for (const [need, mul] of COMBAT.comboDmgSteps) {
    if (count >= need) m = mul;
  }
  return m;
}

// ===== 职业主题色:贯穿玩家全部 VFX(光环/护盾/闪避/弧光/法弹)=====
// color = 十六进制(描边/粒子);rgb = 同色 RGB 串(渐变模板用)
export const CLASS_THEME = {
  recall: { color: '#b78ce0', rgb: '183,140,224' },  // 追忆:紫
  forge:  { color: '#ff9a3c', rgb: '255,154,60' },   // 锻体:余烬橙
  weave:  { color: '#4ec8e8', rgb: '78,200,232' },   // 织梦:织梦青
};