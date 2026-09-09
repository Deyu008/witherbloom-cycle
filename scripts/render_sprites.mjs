// render_sprites.mjs
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';

globalThis.document = { createElement: (tag) => { if (tag === 'canvas') return createCanvas(1,1); } };

const { PAL } = await import('../src/palette.js');
const { makeSprite, flipH, recolor, L } = await import('../src/sprites/_tools.js');
const { HERO_FRAMES_RECALL, HERO_FRAMES_FORGE, HERO_FRAMES_WEAVE } = await import('../src/sprites/hero.js');
const {
  FOREST_SPIRIT_FRAMES, MOSS_LURKER_FRAMES, VINE_WRAITH_FRAMES,
  EMBER_IMP_FRAMES, FORGE_KNIGHT_FRAMES, ASH_PHANTOM_FRAMES,
  GRAVE_WARDEN_FRAMES, INK_SCHOLAR_FRAMES, FROST_LURKER_FRAMES,
  MIRROR_KNIGHT_FRAMES, VOID_SEEKER_FRAMES,
} = await import('../src/sprites/enemies.js');
const { FOREST_BOSS, FIRE_BOSS, CHRONO_BOSS, FORGOTTEN_BOSS } = await import('../src/sprites/boss.js');
const { CHILD_NPC, BLACKSMITH_NPC, SCHOLAR_NPC } = await import('../src/sprites/npc.js');

const SCALE = 6;
const PADDING = 20;
const LABEL_H = 24;

const sections = [
  { title: 'Hero Recall', frames: [
    { label: 'idle', img: HERO_FRAMES_RECALL.idle[0] },
    { label: 'walk1', img: HERO_FRAMES_RECALL.walk[0] },
    { label: 'walk2', img: HERO_FRAMES_RECALL.walk[1] },
    { label: 'atk1', img: HERO_FRAMES_RECALL.attack[0] },
    { label: 'atk2', img: HERO_FRAMES_RECALL.attack[1] },
    { label: 'atk3', img: HERO_FRAMES_RECALL.attack[2] },
    { label: 'atk4', img: HERO_FRAMES_RECALL.attack[3] },
    { label: 'hurt', img: HERO_FRAMES_RECALL.hurt[0] },
  ]},
  { title: 'Hero Forge', frames: [
    { label: 'idle', img: HERO_FRAMES_FORGE.idle[0] },
    { label: 'walk1', img: HERO_FRAMES_FORGE.walk[0] },
    { label: 'atk2', img: HERO_FRAMES_FORGE.attack[1] },
  ]},
  { title: 'Hero Weave', frames: [
    { label: 'idle', img: HERO_FRAMES_WEAVE.idle[0] },
    { label: 'walk1', img: HERO_FRAMES_WEAVE.walk[0] },
    { label: 'atk2', img: HERO_FRAMES_WEAVE.attack[1] },
  ]},
  { title: 'Enemies Ch1', frames: [
    { label: 'forest_spirit', img: FOREST_SPIRIT_FRAMES[0] },
    { label: 'moss_lurker', img: MOSS_LURKER_FRAMES[0] },
    { label: 'vine_wraith', img: VINE_WRAITH_FRAMES[0] },
  ]},
  { title: 'Enemies Ch2', frames: [
    { label: 'ember_imp', img: EMBER_IMP_FRAMES[0] },
    { label: 'forge_knight', img: FORGE_KNIGHT_FRAMES[0] },
    { label: 'ash_phantom', img: ASH_PHANTOM_FRAMES[0] },
  ]},
  { title: 'Enemies Ch3', frames: [
    { label: 'grave_warden', img: GRAVE_WARDEN_FRAMES[0] },
    { label: 'ink_scholar', img: INK_SCHOLAR_FRAMES[0] },
  ]},
  { title: 'Enemies Ch4', frames: [
    { label: 'frost_lurker', img: FROST_LURKER_FRAMES[0] },
    { label: 'mirror_knight', img: MIRROR_KNIGHT_FRAMES[0] },
    { label: 'void_seeker', img: VOID_SEEKER_FRAMES[0] },
  ]},
  { title: 'BOSS', frames: [
    { label: 'forest_keeper', img: FOREST_BOSS },
    { label: 'burning_king', img: FIRE_BOSS },
    { label: 'chronomancer', img: CHRONO_BOSS },
    { label: 'forgotten', img: FORGOTTEN_BOSS },
  ]},
  { title: 'NPC', frames: [
    { label: 'child', img: CHILD_NPC[0] },
    { label: 'blacksmith', img: BLACKSMITH_NPC[0] },
    { label: 'scholar', img: SCHOLAR_NPC[0] },
  ]},
];

let totalH = PADDING;
for (const sec of sections) {
  totalH += LABEL_H + 10;
  let maxFrameH = 0;
  for (const f of sec.frames) {
    const img = f.img;
    if (img && img.height) maxFrameH = Math.max(maxFrameH, img.height * SCALE);
  }
  totalH += maxFrameH + LABEL_H + PADDING + 16;
}
const canvasW = 1400;
const canvas = createCanvas(canvasW, totalH);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a1428';
ctx.fillRect(0, 0, canvasW, totalH);

let y = PADDING;
for (const sec of sections) {
  ctx.fillStyle = '#e0b76a';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(sec.title, PADDING, y + 16);
  y += LABEL_H + 10;
  let x = PADDING;
  let maxH = 0;
  for (const f of sec.frames) {
    const img = f.img;
    if (!img || !img.width) { x += 80; continue; }
    const w = img.width * SCALE;
    const h = img.height * SCALE;
    maxH = Math.max(maxH, h);
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.strokeStyle = '#3a2a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    const imgCtx = img.getContext('2d');
    const imgData = imgCtx.getImageData(0, 0, img.width, img.height);
    for (let py = 0; py < img.height; py++) {
      for (let px = 0; px < img.width; px++) {
        const i = (py * img.width + px) * 4;
        const a = imgData.data[i + 3];
        if (a === 0) continue;
        const r = imgData.data[i], g2 = imgData.data[i+1], b = imgData.data[i+2];
        ctx.fillStyle = 'rgba(' + r + ',' + g2 + ',' + b + ',' + (a/255) + ')';
        ctx.fillRect(x + px * SCALE, y + py * SCALE, SCALE, SCALE);
      }
    }
    ctx.fillStyle = '#8b7f5e';
    ctx.font = '12px monospace';
    ctx.fillText(f.label, x, y + h + 14);
    x += w + PADDING;
  }
  y += maxH + LABEL_H + 16;
}
const buf = canvas.toBuffer('image/png');
writeFileSync('/root/projects/html-game/docs/sprite_preview.png', buf);
console.log('Done! ' + buf.length + ' bytes');
