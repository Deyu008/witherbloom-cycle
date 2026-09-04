// index.js — 组装 SPRITES / SPRITE_LIB,保持对外导出签名不变
// import 期执行的装配逻辑(LEFT 镜像 IIFE、makeTileSet() 调用)集中在本文件,
// 各子模块只导出数据/函数,不执行全局装配。
import { makeSprite, flipH, recolor } from './_tools.js';
import { PAL } from '../palette.js';
import { HERO_FRAMES_RECALL, HERO_FRAMES_FORGE, HERO_FRAMES_WEAVE } from './hero.js';
import {
  FOREST_SPIRIT_FRAMES, MOSS_LURKER_FRAMES, VINE_WRAITH_FRAMES,
  EMBER_IMP_FRAMES, FORGE_KNIGHT_FRAMES, ASH_PHANTOM_FRAMES,
  GRAVE_WARDEN_FRAMES, INK_SCHOLAR_FRAMES, FROST_LURKER_FRAMES,
  MIRROR_KNIGHT_FRAMES, VOID_SEEKER_FRAMES,
} from './enemies.js';
import { CHILD_NPC, BLACKSMITH_NPC, SCHOLAR_NPC } from './npc.js';
import { FOREST_BOSS, FIRE_BOSS, CHRONO_BOSS, FORGOTTEN_BOSS } from './boss.js';
import {
  ICON_DEW, ICON_EMBER, ICON_LEAF, ICON_SHARD, ICON_GOLD, ICON_HEART,
  ICON_SKILL,
} from './icons.js';
import { makeTileSet } from './tiles.js';

// 重新导出工具与图标,供 sprite.js 薄壳及下游使用
export { makeSprite, flipH, recolor, ICON_SKILL };

// 缓存所有精灵,统一导出(结构必须与原 sprite.js 保持一致)
export const SPRITES = {
  hero: HERO_FRAMES_RECALL,
  enemies: {
    forest_spirit: FOREST_SPIRIT_FRAMES,
    moss_lurker: MOSS_LURKER_FRAMES,
    vine_wraith: VINE_WRAITH_FRAMES,
    ember_imp: EMBER_IMP_FRAMES,
    forge_knight: FORGE_KNIGHT_FRAMES,
    ash_phantom: ASH_PHANTOM_FRAMES,
    grave_warden: GRAVE_WARDEN_FRAMES,
    ink_scholar: INK_SCHOLAR_FRAMES,
    frost_lurker: FROST_LURKER_FRAMES,
    mirror_knight: MIRROR_KNIGHT_FRAMES,
    void_seeker: VOID_SEEKER_FRAMES,
  },
  npc: {
    child: CHILD_NPC,
    blacksmith: BLACKSMITH_NPC,
    scholar: SCHOLAR_NPC,
  },
  boss: {
    forest_keeper: FOREST_BOSS,
    burning_king: FIRE_BOSS,
    chronomancer: CHRONO_BOSS,
    forgotten: FORGOTTEN_BOSS,
  },
  icons: {
    dew: ICON_DEW, ember: ICON_EMBER, leaf: ICON_LEAF,
    shard: ICON_SHARD, gold: ICON_GOLD, heart: ICON_HEART,
  },
  skills: ICON_SKILL,
  tiles: makeTileSet(),
};

// 预创建所有精灵:补全 hero.left 镜像帧
// IIFE 在 import 期执行一次,行为与原 sprite.js 末尾完全一致
export const SPRITE_LIB = (() => {
  SPRITES.hero.left = {
    idle: HERO_FRAMES_RECALL.idle.map(flipH),
    walk: HERO_FRAMES_RECALL.walk.map(flipH),
    attack: HERO_FRAMES_RECALL.attack.map(flipH),
    hurt: HERO_FRAMES_RECALL.hurt.map(flipH),
  };
  return SPRITES;
})();

// ===== 职业外观(每职业独立武器建模 + 主题色重着色)=====
// 武器剪影在 hero.js 内已按职业区分(法杖/巨剑/星杖),这里再把斗篷与辉光
// 换成高饱和职业主题色。"来源色"直接引用 PAL 常量,与精灵图例永不脱节。
const CLASS_RECOLOR = {
  forge: [ // 锻体者:锻铜橙棕斗篷 + 余烬光
    [PAL.hero_cloak, '#b06030'],   // 斗篷 → 锻铜橙
    [PAL.hero_cloakD, '#703a18'],  // 斗篷暗部 → 暗铜
    [PAL.hero_belt, '#3a3028'],    // 腰带 → 铁灰
    [PAL.hero_glow, '#ff9a3c'],    // 辉光 → 余烬橙
    [PAL.hero_glowH, '#ffd870'],   // 面部辉光 → 焰心
  ],
  weave: [ // 织梦者:深海蓝斗篷 + 织梦青光
    [PAL.hero_cloak, '#3a6ab0'],   // 斗篷 → 深海蓝
    [PAL.hero_cloakD, '#22406e'],  // 斗篷暗部 → 暗蓝
    [PAL.hero_belt, '#8ab0c8'],    // 腰带 → 银蓝
    [PAL.hero_glow, '#4ec8e8'],    // 辉光 → 织梦青
    [PAL.hero_glowH, '#c8f6ff'],   // 面部辉光 → 冰晶亮
  ],
};

function recolorHeroFrames(frames, map) {
  const out = {};
  for (const key of Object.keys(frames)) {
    if (key === 'left') continue;
    out[key] = frames[key].map(f => map.reduce((c, [from, to]) => recolor(c, from, to), f));
  }
  out.left = {
    idle: out.idle.map(flipH),
    walk: out.walk.map(flipH),
    attack: out.attack.map(flipH),
    hurt: out.hurt.map(flipH),
  };
  return out;
}

SPRITES.heroVariants = {
  recall: SPRITES.hero,
  forge: recolorHeroFrames(HERO_FRAMES_FORGE, CLASS_RECOLOR.forge),
  weave: recolorHeroFrames(HERO_FRAMES_WEAVE, CLASS_RECOLOR.weave),
};
