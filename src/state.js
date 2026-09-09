// state.js — 全局玩家/游戏状态(跨场景持久)
import { PAL } from './palette.js';
import { SKILL_BASE } from './data/balance.js';

function makeSkills() {
  const out = {};
  for (const k of Object.keys(SKILL_BASE)) {
    const b = SKILL_BASE[k];
    out[k] = { name: b.name, level: b.level, cooldown: b.cooldown, currentCd: 0, desc: b.desc };
  }
  return out;
}

export function freshState() {
  return {
    // 玩家基础
    playerName: '回响者',
    heroClass: 'recall', // recall / forge / weave
    // 资源
    hp: 100, maxHp: 100,
    mp: 60, maxMp: 60,
    // 三种资源
    dew: 0,    // 回血
    ember: 0,  // 回蓝
    leaf: 0,   // 技能充能
    gold: 0,
    shards: 0, // 根者碎片
    // 经验/等级(本作用碎片代替)
    level: 1,
    xp: 0, xpToNext: 50,
    // 技能
    skills: makeSkills(),
    // 已解锁技能位
    skillBar: ['slash', 'dash', 'recall', 'shield'],
    // 解锁章节
    unlockedChapters: [1], // 默认 1 已解锁
    currentChapter: 1,
    // 剧情进度
    flags: {}, // { boss1_defeated: true, ... }
    inventory: [], // 物品
    // 装备
    equipment: {
      weapon: 'rusted_blade',
      charm: null,
    },
    // 已收集的乐谱/纹章
    collected: {
      lullaby: false,
      seventhCrest: false,
      mirrorEye: false,
    },
    // 回响日志:已收录的记忆条目 id(碎片化叙事,dialog 节点 echo 字段解锁)
    echoes: [],
    // 局内"回响祝福"(每章重置;死亡失去最高稀有度一枚 —— 失去刚赚的,保留已投入的)
    boons: [],
    boonPity: 0,
    // 战斗统计
    stats: {
      kills: 0, deaths: 0, bossesDefeated: 0, secretsFound: 0, totalDamage: 0,
    },
    // 时间
    playTime: 0,
    // 存档标识
    fromSave: null,
    // 存档槽位(save() 写入;0 = 自动存档)
    currentSlot: 0,
    // 存档结构版本(未来字段迁移用)
    schemaVersion: 1,
  };
}

export const state = freshState();

// 应用存档
export function applySave(save) {
  const fresh = freshState();
  // 深拷贝:存档槽对象是共享引用,浅合并会让游玩过程写穿内存里的存档
  // (退出不存档想回滚时拿到的却是污染后的数据)
  const copy = save ? JSON.parse(JSON.stringify(save)) : {};
  Object.assign(state, fresh, copy);
  // 嵌套结构整体替换会让旧档丢掉新增键:以新 schema 为底、存档值覆盖
  if (copy && copy.skills) state.skills = Object.assign(makeSkills(), copy.skills);
  state.fromSave = null;
}
