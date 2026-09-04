// icons.js — 资源/UI/技能图标(从 sprite.js 拆出,像素数据未改动)
import { makeSprite } from './_tools.js';
import { PAL } from '../palette.js';

// ============================================================
// 资源/UI 精灵
// ============================================================

export const ICON_DEW = makeSprite(`
..kkkk..
.kllllk.
kllllllk
klLLLLlk
klLLLLlk
kllllllk
.kkkkkk.
........
`, { k: PAL.black, l: PAL.loot.dew, L: '#e0f8ff' }, 4);

export const ICON_EMBER = makeSprite(`
..kkkk..
.kEEEEk.
kEllllEk
kElLLlEk
kEllllEk
.kEEEEK.
..kkkk..
........
`, { k: PAL.black, E: PAL.loot.ember, l: '#ffd060', L: '#fff0a0' }, 4);

export const ICON_LEAF = makeSprite(`
.kkkk.
kGGGGk
kGgGGk
kGGGGk
kGGGGk
kGgGGk
kGGGGk
.kkkk.
`, { k: PAL.black, G: PAL.loot.leaf, g: '#5a8a3a' }, 4);

export const ICON_SHARD = makeSprite(`
..kk..
.kllk.
kllllk
kllLk.
kllk..
.kkk..
......
`, { k: PAL.black, l: PAL.loot.shard, L: '#fff' }, 4);

export const ICON_GOLD = makeSprite(`
.kkkk.
kGGGGk
kGgGGk
kGGGGk
.kGGk.
..kk..
......
`, { k: PAL.black, G: PAL.loot.gold, g: '#a87a3a' }, 4);

export const ICON_HEART = makeSprite(`
.k.k.k. 
krrrkrrk
krrrrrrk
krrrrrrk
.krrrrk.
..krrk..
...kk...
`, { k: PAL.black, r: PAL.loot.heart }, 4);

// ============================================================
// 技能图标
// ============================================================
export const ICON_SKILL = {
  recall: makeSprite(`
..kkkk..
.kllllk.
kllLllk.
klLLLllk
kllLllk.
klllllk.
.kkkkkk.
`, { k: PAL.black, l: '#6a8aff', L: PAL.hero_glowH }, 4),
  slash: makeSprite(`
..kkk...
..kllk..
..kllk..
.kkllkk.
kllLkllk
kllLllk.
.kkkkk..
`, { k: PAL.black, l: '#c0c0c0', L: PAL.white }, 4),
  shield: makeSprite(`
..kkkk..
.kllllk.
kllLllk.
klLlllk.
kllLllk.
klllllk.
.kkkkkk.
`, { k: PAL.black, l: '#8a8aaa', L: '#c0c0d0' }, 4),
  dash: makeSprite(`
.kkkk.k. 
kllLkkk. 
klllLkk. 
.kLllkk. 
..kllkkk.
..kLLkk..
..kkkkk..
`, { k: PAL.black, l: '#8aa9c4', L: '#e0f0ff' }, 4),
  echo: makeSprite(`
..kkkk..
.kllllk.
kllLllk.
klLLLllk
kllLllk.
kllllllk
.kkkkkk.
`, { k: PAL.black, l: PAL.hero_glow, L: PAL.hero_glowH }, 4),
  heal: makeSprite(`
..kkkk..
.kllllk.
klLLLllk
klLlllLk
kllLLllk
klllllLk
.kkkkkk.
`, { k: PAL.black, l: '#8ad0a0', L: '#e0ffe8' }, 4),
};
