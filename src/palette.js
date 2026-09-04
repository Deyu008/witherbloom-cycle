// palette.js — 共享调色板与色彩工具
// 16-bit 风格,每章有专属配色,统一基础色

export const PAL = {
  // 透明
  null: 'rgba(0,0,0,0)',

  // 通用基础色
  black:      '#0c0a14',
  ink:        '#14101e',
  ink2:       '#1c1730',
  ink3:       '#2a2444',
  white:      '#f4ecd0',
  parch:      '#d6c8a4',
  parchDim:   '#8b7f5e',
  gold:       '#e0b76a',
  goldSoft:   '#b8945a',
  shadow:     'rgba(0,0,0,0.55)',
  glow:       'rgba(183,140,224,0.5)',

  // 第一章:春之森 — 青绿+粉
  ch1_sky:    '#3a4a6a',
  ch1_skyH:   '#5a729a',
  ch1_bg:     '#1a3340',
  ch1_grass:  '#3e7a4a',
  ch1_grassH: '#5fa46a',
  ch1_leaf:   '#2e5e3a',
  ch1_bark:   '#4a3528',
  ch1_barkH:  '#6a4d3a',
  ch1_pink:   '#e89cb4',
  ch1_water:  '#4a7a9a',

  // 第二章:夏之墟 — 橙红+黑
  ch2_sky:    '#3a1a1a',
  ch2_bg:     '#2a0e0e',
  ch2_ember:  '#e87a3c',
  ch2_emberH: '#ffb04a',
  ch2_ash:    '#3a2a2a',
  ch2_ashH:   '#5a4040',
  ch2_iron:   '#2a2a30',
  ch2_ironH:  '#5a5a66',
  ch2_gold:   '#e0b76a',

  // 第三章:秋之墓 — 靛紫+枯叶
  ch3_sky:    '#2a1f3a',
  ch3_bg:     '#1a1024',
  ch3_grave:  '#3a3a4a',
  ch3_graveH: '#5a5a70',
  ch3_autumn: '#a8643a',
  ch3_autumnH:'#c08a4a',
  ch3_paper:  '#d6c8a4',
  ch3_ink:    '#3a2a5a',

  // 第四章:冬之渊 — 冰蓝+黑
  ch4_sky:    '#0a1a2a',
  ch4_bg:     '#06121e',
  ch4_ice:    '#8aa9c4',
  ch4_iceH:   '#c4d8e8',
  ch4_iceD:   '#4a6a8a',
  ch4_mirror: '#a8b8d0',
  ch4_void:   '#0a0a14',
  ch4_voidH:  '#1a1a2a',
  ch4_aurora: '#6ac0a8',

  // 角色
  hero_cloak:   '#5a6478',
  hero_cloakD:  '#3a4258',
  hero_skin:    '#e0b89a',
  hero_hair:    '#a8945a',
  hero_glow:    '#b78ce0',
  hero_glowH:   '#e0b0ff',
  hero_boot:    '#2a2018',
  hero_belt:    '#7a4a2a',

  // BOSS 配色
  boss1_green:  '#6fb872',
  boss1_greenD: '#3a5a3a',
  boss1_glow:   '#a8e8b0',
  boss2_fire:   '#e87a3c',
  boss2_fireH:  '#ffc060',
  boss2_fireD:  '#8a3a1a',
  boss2_gold:   '#e0b76a',
  boss3_indigo: '#6a5a9a',
  boss3_indigoD:'#3a2a5a',
  boss3_paper:  '#d6c8a4',
  boss3_ink:    '#2a1a3a',
  boss4_void:   '#3a2a4a',
  boss4_voidD:  '#1a0a2a',
  boss4_violet: '#b78ce0',
  boss4_mirror: '#a8b8d0',

  // 敌人
  enemy: {
    forest_spirit:  { a:'#6fb872', b:'#3a5a3a', c:'#a8e8b0' },
    moss_lurker:    { a:'#5a8a4a', b:'#2a3a2a', c:'#a0c890' },
    vine_wraith:    { a:'#7a5a8a', b:'#3a2a4a', c:'#c0a0d0' },
    ember_imp:      { a:'#e87a3c', b:'#8a3a1a', c:'#ffc060' },
    forge_knight:   { a:'#5a5a66', b:'#2a2a30', c:'#e0b76a' },
    ash_phantom:    { a:'#7a4a4a', b:'#3a1a1a', c:'#d68888' },
    grave_warden:   { a:'#5a5a70', b:'#2a2a3a', c:'#a0a0c0' },
    ink_scholar:    { a:'#4a3a6a', b:'#2a1a3a', c:'#8a7ab0' },
    frost_lurker:   { a:'#8aa9c4', b:'#4a6a8a', c:'#c4d8e8' },
    mirror_knight:  { a:'#a8b8d0', b:'#5a6a8a', c:'#e0e8f0' },
    void_seeker:    { a:'#3a2a4a', b:'#1a0a2a', c:'#b78ce0' },
  },

  // 资源
  loot: {
    dew:    '#8ad0e0',
    ember:  '#e87a3c',
    leaf:   '#a8d860',
    shard:  '#b78ce0',
    gold:   '#e0b76a',
    heart:  '#e85858',
  }
};

// 颜色工具
export function hex2rgb(hex) {
  if (hex.startsWith('rgba')) {
    const m = hex.match(/rgba?\(([^)]+)\)/)[1].split(',').map(s => parseFloat(s));
    return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
  }
  const h = hex.replace('#','');
  return {
    r: parseInt(h.slice(0,2), 16),
    g: parseInt(h.slice(2,4), 16),
    b: parseInt(h.slice(4,6), 16),
    a: 1
  };
}

export function rgba(hex, alpha = 1) {
  const { r, g, b } = hex2rgb(hex);
  return `rgba(${r|0},${g|0},${b|0},${alpha})`;
}

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return `rgb(${(A.r + (B.r - A.r) * t) | 0},${(A.g + (B.g - A.g) * t) | 0},${(A.b + (B.b - A.b) * t) | 0})`;
}

export function shade(hex, amount) {
  // amount: -1..1
  const { r, g, b } = hex2rgb(hex);
  const f = amount < 0 ? 1 + amount : 1;
  const f2 = amount < 0 ? 1 : 1 - amount;
  return `rgb(${(r * (amount<0?f:f2)) | 0},${(g * (amount<0?f:f2)) | 0},${(b * (amount<0?f:f2)) | 0})`;
}
