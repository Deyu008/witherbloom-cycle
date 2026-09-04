// boons.js — 局内"回响祝福"三选一(参考 Hades 祝福 / STS 保底 / VS 高频选择)
// 设计要点(来自调研):
//   · 稀有度顺序 roll:先 epic(5%)再 rare(10%),失败为 common;"最高档不白给"
//   · 保底(pity):每出一次普通,rare 与 epic 概率上升,出高稀有重置 —— 运气被托底
//   · 跳过必须有补偿:跳过 = +50 金(等价一次普通祝福的期望收益)
//   · 职业专属"形态"祝福:把 Hades 锤子祭坛降维进卡池(仅对应职业可见)
// 数值全部集中在本文件;生效逻辑见 player.boonMods()。

export const BOON_RARITY = {
  epic: 0.05,
  rare: 0.10,
  pityRarePerCommon: 0.02,   // 每次普通 → rare +2%
  pityEpicPerCommon: 0.005,  // 每次普通 → epic +0.5%
  pityMax: 0.40,
};

export const BOON_RARITY_INFO = {
  common: { label: '普通', color: '#d6c8a4' },
  rare:   { label: '稀有', color: '#6c8ee0' },
  epic:   { label: '史诗', color: '#e0a04a' },
  aspect: { label: '形态', color: '#ffcf4d' }, // 职业专属,按稀有度 rare 档 roll 出
};

// 稀有度顺序 roll(纯函数,可测)。pity ∈ [0,1]:连续普通的累积补偿。
// minRarity: 'common'|'rare' —— 迷你 BOSS 等来源保底稀有(参考 STS Boss 必稀有)。
export function rollBoonRarity(rand = Math.random, pity = 0, minRarity = 'common') {
  const p = Math.min(BOON_RARITY.pityMax, Math.max(0, pity));
  const epicC = BOON_RARITY.epic + p * BOON_RARITY.pityEpicPerCommon / BOON_RARITY.pityRarePerCommon;
  const rareC = BOON_RARITY.rare + p;
  const floorIdx = { common: 0, rare: 1, epic: 2 }[minRarity] ?? 0;
  if (floorIdx <= 2 && rand() < epicC) return 'epic';
  if (floorIdx <= 1 && rand() < rareC) return 'rare';
  return floorIdx === 2 ? 'epic' : floorIdx === 1 ? 'rare' : 'common';
}

// mods 键约定(全部为加性聚合;布尔/穿透类例外):
//   dmg 攻击乘区 / speed 移速 / mpRegen 被动回蓝乘区 / critChance 暴击率加
//   critMul 暴伤加 / cdMul 冷却乘区(负=缩短) / hitMp 命中回蓝加 / dodgeMp 完美闪避回蓝加
//   lifesteal 吸血比例 / dmgTaken 受伤乘区(负=减伤) / recallPierce 追忆弹穿透(布尔)
//   atkRange 攻击范围乘区 / maxHp / maxMp(选中即刻生效,死亡失去时回退)
export const BOON_POOL = [
  // ── 普通(白)──
  { id: 'might',    name: '力之回响', rarity: 'common', mods: { dmg: 0.10 }, desc: '攻击伤害 +10%' },
  { id: 'swift',    name: '疾风回响', rarity: 'common', mods: { speed: 0.08 }, desc: '移动速度 +8%' },
  { id: 'spring',   name: '涌泉回响', rarity: 'common', mods: { mpRegen: 0.35 }, desc: '被动回蓝 +35%' },
  { id: 'keen',     name: '锐眼回响', rarity: 'common', mods: { critChance: 0.06 }, desc: '暴击率 +6%' },
  { id: 'haste',    name: '迅法回响', rarity: 'common', mods: { cdMul: -0.08 }, desc: '技能冷却 -8%' },
  { id: 'evergreen',name: '常青回响', rarity: 'common', mods: { maxHp: 20 }, desc: '生命上限 +20(并回复)' },
  { id: 'deepool',  name: '深池回响', rarity: 'common', mods: { maxMp: 20 }, desc: '法力上限 +20(并回满差值)' },
  { id: 'stone',    name: '磐石回响', rarity: 'common', mods: { dmgTaken: -0.08 }, desc: '受到伤害 -8%' },
  // ── 稀有(蓝)──
  { id: 'fury',     name: '狂怒回响', rarity: 'rare', mods: { dmg: 0.22 }, desc: '攻击伤害 +22%' },
  { id: 'mindseye', name: '心眼回响', rarity: 'rare', mods: { critMul: 0.35 }, desc: '暴击伤害 +35%' },
  { id: 'gather',   name: '聚灵回响', rarity: 'rare', mods: { hitMp: 2 }, desc: '命中回蓝 +2/次' },
  { id: 'glimmer',  name: '残光回响', rarity: 'rare', mods: { dodgeMp: 10 }, desc: '完美闪避回蓝 +10' },
  { id: 'shadow',   name: '影步回响', rarity: 'rare', mods: { cdMul: -0.18 }, desc: '技能冷却 -18%' },
  { id: 'siphon',   name: '汲血回响', rarity: 'rare', mods: { lifesteal: 0.04 }, desc: '攻击伤害的 4% 转化为生命' },
  // ── 史诗(橙)──
  { id: 'wildfire', name: '燎原回响', rarity: 'epic', mods: { dmg: 0.40 }, desc: '攻击伤害 +40%' },
  { id: 'devour',   name: '噬魂回响', rarity: 'epic', mods: { lifesteal: 0.08, dmg: 0.10 }, desc: '吸血 8% · 攻击 +10%' },
  { id: 'timelag',  name: '时滞回响', rarity: 'epic', mods: { cdMul: -0.25, speed: 0.10 }, desc: '冷却 -25% · 移速 +10%' },
  // ── 形态(职业专属,稀有档 roll 出;Hades 锤子祭坛的降维版)──
  { id: 'pierce_asp',   name: '形态·回响穿透', rarity: 'aspect', cls: 'recall', mods: { recallPierce: 1 },
    desc: '追忆法弹可穿透 2 名敌人' },
  { id: 'sweep_asp',    name: '形态·巨剑横扫', rarity: 'aspect', cls: 'forge', mods: { atkRange: 0.30, dmg: 0.10 },
    desc: '攻击范围 +30% · 攻击 +10%' },
  { id: 'loomspeed_asp',name: '形态·织梦加速', rarity: 'aspect', cls: 'weave', mods: { cdMul: -0.15, mpRegen: 0.50 },
    desc: '冷却 -15% · 回蓝 +50%' },
];

export const BOON_SKIP_GOLD = 50;     // 跳过补偿(≈一次普通祝福的期望收益)
export const BOON_MAX_STACK = 2;      // 同名祝福最多叠加 2 层(形态类限 1)

// 聚合已持有祝福的 mods(纯函数,可测)。boons: [{id, rarity}]
export function computeBoonMods(boons) {
  const agg = {
    dmg: 0, speed: 0, mpRegen: 0, critChance: 0, critMul: 0, cdMul: 0,
    hitMp: 0, dodgeMp: 0, lifesteal: 0, dmgTaken: 0, atkRange: 0,
    recallPierce: 0,
  };
  for (const b of boons || []) {
    const def = BOON_POOL.find(x => x.id === b.id);
    if (!def) continue;
    for (const [k, v] of Object.entries(def.mods)) {
      if (k in agg) agg[k] += v;
    }
  }
  return agg;
}

// 抽 3 个不重复候选(含稀有度决定)。owned: 当前 boons 数组,用于叠层上限与职业过滤。
export function drawBoonChoices(rand = Math.random, pity, heroClass, owned = [], minRarity = 'common', n = 3) {
  const rarity = rollBoonRarity(rand, pity, minRarity);
  // aspect 池按稀有档并入(rare/epic 抽取时可附带职业形态)
  const counts = {};
  for (const b of owned) counts[b.id] = (counts[b.id] || 0) + 1;
  const isAvail = (d) => {
    if (d.cls && d.cls !== heroClass) return false;
    const cap = d.rarity === 'aspect' ? 1 : BOON_MAX_STACK;
    if ((counts[d.id] || 0) >= cap) return false;
    return true;
  };
  const pools = [];
  if (rarity !== 'common') pools.push(BOON_POOL.filter(d => d.rarity === 'aspect' && isAvail(d)));
  pools.push(BOON_POOL.filter(d => d.rarity === rarity && isAvail(d)));
  // 主池不足 3 个时,向下兼容补位(稀有→普通)
  if (rarity !== 'common') pools.push(BOON_POOL.filter(d => d.rarity === 'common' && isAvail(d)));
  const picked = [];
  for (const pool of pools) {
    const bag = pool.filter(d => !picked.includes(d));
    while (picked.length < n && bag.length > 0) {
      const i = Math.floor(rand() * bag.length);
      picked.push(bag[i]);
      bag.splice(i, 1);
    }
    if (picked.length >= n) break;
  }
  return { rarity, choices: picked };
}
