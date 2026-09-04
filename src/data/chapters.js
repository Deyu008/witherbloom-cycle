// data/chapters.js — 章节元数据
export const CHAPTERS = [
  {
    id: 1,
    name: '春之森',
    subtitle: '"醒来"',
    color: '#6fb872',
    colorDim: '#3a5a3a',
    bgScene: 'ch1',
    description: '你从王树的落叶中醒来。苔藓村庄的孩子在唱歌,守林人在湖边等你。',
    bossScene: 'boss1',
    bossName: '守林人',
  },
  {
    id: 2,
    name: '夏之墟',
    subtitle: '"燃烧"',
    color: '#e87a3c',
    colorDim: '#8a3a1a',
    bgScene: 'ch2',
    description: '锻炉城燃烧了三百年的火焰,只为熔化悲伤。焚身王独自坐在王座上。',
    bossScene: 'boss2',
    bossName: '焚身王',
  },
  {
    id: 3,
    name: '秋之墓',
    subtitle: '"埋葬"',
    color: '#a8643a',
    colorDim: '#5a3a1a',
    bgScene: 'ch3',
    description: '墓园里没有哭声,只有刻着名字的石碑。倒悬学院的七张画像开始转动。',
    bossScene: 'boss3',
    bossName: '编年者',
  },
  {
    id: 4,
    name: '冬之渊',
    subtitle: '"和解"',
    color: '#8aa9c4',
    colorDim: '#4a6a8a',
    bgScene: 'ch4',
    description: '寒铁桥的尽头,镜之王座上,坐着等了你很久的人。',
    bossScene: 'boss4',
    bossName: '寂渊',
  },
];

// 每章的关卡布局(简化:用程序生成的 2D 数组)
// ' ' = 空, '#' = 墙, '~' = 水, 'g' = 草, 's' = 石头, 'P' = 玩家起点, 'E' = 出口
// 'A' 'B' 'C' 'D' = 敌人出生点, '?' = 道具, 'N' = NPC
// tile_size 32 像素

// 第一章: 森林
export const LEVELS = {
  1: {
    chapter: 1,
    name: '苔藓村庄',
    width: 80, height: 24,
    tile: 32,
    // 程序化种子(用于程序化生成地图)
    seed: 42,
    playerStart: { x: 3, y: 12 },
    exits: [{ x: 78, y: 12, to: 'lake' }],
    regions: [
      // 每个 region 描述一段剧情/事件;xStart/xEnd = tile 单位的 x 区间
      { id: 'intro',  name: '王树苗圃', xStart: 0,  xEnd: 15 },
      { id: 'village',name: '苔藓村庄', xStart: 15, xEnd: 55 },
      { id: 'lake',   name: '回声湖',   xStart: 55, xEnd: 80 },
    ],
    npcs: [
      { id: 'child_a', x: 18, y: 11, sprite: 'child', dialog: 'child_a' },
      { id: 'child_b', x: 22, y: 12, sprite: 'child', dialog: 'child_b' },
      { id: 'elder',   x: 25, y: 11, sprite: 'child', dialog: 'elder' },
    ],
    pickups: [
      { id: 'lullaby', x: 12, y: 8, sprite: 'echo', label: '旧摇篮曲' },
    ],
    bosses: [
      { id: 'forest_keeper', x: 76, y: 12, sprite: 'forest_keeper', region: 'lake' },
    ],
  },
  2: {
    chapter: 2,
    name: '锻炉城',
    width: 90, height: 26,
    tile: 32,
    seed: 137,
    playerStart: { x: 3, y: 13 },
    exits: [{ x: 88, y: 13, to: 'sun_throne' }],
    regions: [
      { id: 'forge_entry', name: '锻炉城入口',       xStart: 0,  xEnd: 28 },
      { id: 'forge_city',  name: '锻炉城中央',       xStart: 28, xEnd: 70 },
      { id: 'arena',       name: '黄昏斗技场(支线)', xStart: 40, xEnd: 60 },
      { id: 'sun_throne',  name: '太阳王座',         xStart: 70, xEnd: 90 },
    ],
    npcs: [
      { id: 'blacksmith',  x: 14, y: 13, sprite: 'blacksmith', dialog: 'blacksmith' },
      { id: 'gladiator',   x: 50, y: 13, sprite: 'blacksmith', dialog: 'gladiator' },
      { id: 'burning_king_daughter', x: 80, y: 12, sprite: 'child', dialog: 'burning_daughter' },
    ],
    pickups: [
      { id: 'mirrorEye', x: 52, y: 10, sprite: 'shield', label: '镜瞳' },
    ],
    bosses: [
      { id: 'burning_king', x: 86, y: 13, sprite: 'burning_king', region: 'sun_throne' },
    ],
  },
  3: {
    chapter: 3,
    name: '秋之墓',
    width: 90, height: 26,
    tile: 32,
    seed: 271,
    playerStart: { x: 3, y: 13 },
    exits: [{ x: 88, y: 13, to: 'stair_top' }],
    regions: [
      { id: 'graveyard',         name: '无名墓园',       xStart: 0,  xEnd: 30 },
      { id: 'inverted_academy',  name: '倒悬学院(支线)', xStart: 30, xEnd: 60 },
      { id: 'eternal_stair',     name: '永恒阶梯',       xStart: 60, xEnd: 90 },
    ],
    npcs: [
      { id: 'scholar_1', x: 30, y: 13, sprite: 'scholar', dialog: 'scholar_1' },
      { id: 'scholar_2', x: 35, y: 12, sprite: 'scholar', dialog: 'scholar_2' },
      { id: 'gravedigger', x: 14, y: 13, sprite: 'scholar', dialog: 'gravedigger' },
      // 倒悬学院 · 七位根者的残响(支线):集齐 7 段对话触发「七根者」奖励
      { id: 'root_1', x: 33, y: 9,  sprite: 'scholar', dialog: 'root_1' },
      { id: 'root_2', x: 37, y: 17, sprite: 'scholar', dialog: 'root_2' },
      { id: 'root_3', x: 41, y: 8,  sprite: 'scholar', dialog: 'root_3' },
      { id: 'root_4', x: 45, y: 16, sprite: 'scholar', dialog: 'root_4' },
      { id: 'root_5', x: 49, y: 9,  sprite: 'scholar', dialog: 'root_5' },
      { id: 'root_6', x: 53, y: 17, sprite: 'scholar', dialog: 'root_6' },
      { id: 'root_7', x: 57, y: 12, sprite: 'scholar', dialog: 'root_7' },
    ],
    pickups: [
      { id: 'seventhCrest', x: 70, y: 9, sprite: 'recall', label: '第七纹章' },
    ],
    bosses: [
      { id: 'chronomancer', x: 86, y: 13, sprite: 'chronomancer', region: 'eternal_stair' },
    ],
  },
  4: {
    chapter: 4,
    name: '冬之渊',
    width: 100, height: 28,
    tile: 32,
    seed: 314,
    playerStart: { x: 3, y: 14 },
    exits: [{ x: 98, y: 14, to: 'throne' }],
    regions: [
      { id: 'cold_iron_bridge', name: '寒铁桥(无战斗)', xStart: 0,  xEnd: 30 },
      { id: 'abyss_corridor',   name: '寂渊回廊',       xStart: 30, xEnd: 85 },
      { id: 'throne',           name: '寂渊之心',       xStart: 85, xEnd: 100 },
    ],
    // 寒铁桥叙事:走到对应 tile 刻度时,桥面刻着的寂渊记忆浮现(非阻塞横幅)
    bridgeMemories: [
      { tx: 8,  echo: 'bridge_childhood', text: '「今天风很大,我把名字写在桥上,风就带不走它了。」' },
      { tx: 18, echo: 'bridge_doubt',     text: '「他们六个人围着王树唱歌。我站在桥上,数自己的影子。」' },
      { tx: 27, echo: 'bridge_end',       text: '「如果有一天,有人走完这座桥——请替我看看,桥那头的天亮。」' },
    ],
    npcs: [
      { id: 'echo_first', x: 25, y: 14, sprite: 'blacksmith', dialog: 'echo_first' },
    ],
    bosses: [
      { id: 'forgotten', x: 96, y: 14, sprite: 'forgotten', region: 'throne' },
      // 3 个迷你 BOSS(悔恨)
      { id: 'regret_childhood', x: 40, y: 14, sprite: 'forgotten', region: 'abyss_corridor', miniboss: true },
      { id: 'regret_doubt',     x: 60, y: 14, sprite: 'forgotten', region: 'abyss_corridor', miniboss: true },
      { id: 'regret_abandon',   x: 80, y: 14, sprite: 'forgotten', region: 'abyss_corridor', miniboss: true },
    ],
  },
};
