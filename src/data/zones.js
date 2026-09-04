// zones.js — 每章三区域主题 + 支线房定义(地图深度核心数据)
// 区域划分按宏观网格列:z0 = 起点侧(居住感) / z1 = 中段(主题深处) / z2 = BOSS 侧(仪式感)
// 每区域:专属怪物组(可跨章借调,强度递进)、房名词池、装饰风格、名称横幅
export const ZONES = {
  1: [ // 春之森
    { id: 'nursery', label: '王树苗圃', props: 'village',
      roomNames: ['苔藓村落', '萤火小径', '育苗温房', '守林人小屋'],
      enemyTable: ['forest_spirit'] },
    { id: 'glade', label: '萤光林地', props: 'wild',
      roomNames: ['露珠池', '藤蔓回廊', '落叶谷', '青苔洞窟'],
      enemyTable: ['forest_spirit', 'vine_wraith', 'moss_lurker'] },
    { id: 'sanctum', label: '回声圣域', props: 'ritual',
      roomNames: ['王树根坛', '低语林', '刻印石环'],
      enemyTable: ['moss_lurker', 'vine_wraith', 'ember_imp'] },
  ],
  2: [ // 夏之墟
    { id: 'ash_homes', label: '灰烬民宅', props: 'village',
      roomNames: ['灰烬民宅', '鼓风炉心', '冷却塔', '铁匠街区'],
      enemyTable: ['ember_imp'] },
    { id: 'slag_works', label: '熔渣工坊', props: 'wild',
      roomNames: ['熔渣巷', '余烬广场', '锻炉城门', '输焦管廊'],
      enemyTable: ['ember_imp', 'ash_phantom', 'forge_knight'] },
    { id: 'pyre', label: '祭火广场', props: 'ritual',
      roomNames: ['祭火环坛', '黄昏斗技场', '焚祷高台'],
      enemyTable: ['forge_knight', 'ash_phantom', 'frost_lurker'] },
  ],
  3: [ // 秋之墓
    { id: 'grave', label: '无名墓园', props: 'village',
      roomNames: ['无名墓园', '守墓人小屋', '碑林小径'],
      enemyTable: ['grave_warden'] },
    { id: 'academy', label: '倒悬学院', props: 'wild',
      roomNames: ['倒悬学院', '墨水书库', '纸页回廊', '哭墙'],
      enemyTable: ['ink_scholar', 'grave_warden', 'vine_wraith'] },
    { id: 'bone_altar', label: '白骨祭坛', props: 'ritual',
      roomNames: ['白骨祭坛', '七像冥堂', '安魂地宫'],
      enemyTable: ['ink_scholar', 'grave_warden', 'void_seeker'] },
  ],
  4: [ // 冬之渊
    { id: 'waystation', label: '冻风驿站', props: 'village',
      roomNames: ['冻风驿站', '篝火地窖', '碎冰穹顶'],
      enemyTable: ['frost_lurker'] },
    { id: 'remorse', label: '悔恨回廊', props: 'wild',
      roomNames: ['悔恨回廊', '镜湖', '低语厅', '寒铁桥尾'],
      enemyTable: ['frost_lurker', 'mirror_knight', 'void_seeker'] },
    { id: 'silent', label: '静默圣所', props: 'ritual',
      roomNames: ['静默圣所', '无名殿', '深渊祭环'],
      enemyTable: ['mirror_knight', 'void_seeker', 'ink_scholar'] },
  ],
};

// 支线房:生成在主路之外的空置网格格,或(兜底)由远端普通房升级
export const SIDE_ROOMS = {
  trial: {
    label: '试炼房', color: '#c86a5a',
    names: ['试炼之厅', '断念之厅', '淬炼之厅'],
    weight: 0.45,
    desc: '重兵把守,清空获稀有祝福',
  },
  treasure: {
    label: '宝藏房', color: '#e0b76a',
    names: ['遗落宝库', '沉睡宝库'],
    weight: 0.35,
    desc: '少量守卫,清空开启宝库',
  },
  shrine: {
    label: '静谧房', color: '#8ad0e0',
    names: ['静谧之泉', '安息之泉'],
    weight: 0.20,
    desc: '无战斗,泉水回复生命',
  },
};

// 列 → 区域索引(5 列:0-1→z0,2-3→z1,4→z2)
export function zoneOfCol(col, cols = 5) {
  if (col <= 1) return 0;
  if (col >= cols - 1) return 2;
  return 1;
}
