// spriteImages.js — 把 mmx 生成的像素立绘(透明 PNG)装配进 SPRITES 结构
// 保持现有 SPRITES API 不变(idle/walk/attack/hurt/left + 敌人帧数组 + boss/npc 单 canvas),
// 渲染代码零改动。用 pad 透明边匹配各实体 drawW/drawH 比例避免拉伸;
// 动画帧由程序化变体(bob/倾斜/挤压)合成,单立绘也有动态感。

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  return c;
}

// 垫透明边到目标宽高比(aspect = w/h),使 drawImage 到 drawW x drawH 不变形
function padToAspect(c, aspect) {
  const w = c.width, h = c.height;
  const cur = w / h;
  let tw = w, th = h;
  if (cur < aspect) { tw = Math.round(h * aspect); }   // 太窄 → 加宽
  else { th = Math.round(w / aspect); }                 // 太矮 → 加高
  if (tw === w && th === h) return c;
  const out = document.createElement('canvas');
  out.width = tw; out.height = th;
  const cx = out.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(c, Math.round((tw - w) / 2), Math.round((th - h) / 2));
  return out;
}

// 程序化变体:{ dy 上下位移, rot 旋转(弧度,脚底为轴), sx/sy 缩放 }
function variant(c, o = {}) {
  const { dy = 0, rot = 0, sx = 1, sy = 1 } = o;
  if (!dy && !rot && sx === 1 && sy === 1) return c;
  const out = document.createElement('canvas');
  out.width = c.width; out.height = c.height;
  const cx = out.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.translate(out.width / 2, out.height); // 脚底轴心
  cx.rotate(rot); cx.scale(sx, sy);
  cx.translate(-out.width / 2, -out.height);
  cx.drawImage(c, 0, dy);
  return out;
}

function flipH(c) {
  const out = document.createElement('canvas');
  out.width = c.width; out.height = c.height;
  const cx = out.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.translate(out.width, 0); cx.scale(-1, 1);
  cx.drawImage(c, 0, 0);
  return out;
}

// 主角帧组:单立绘合成 idle/walk/attack/hurt + left 镜像
function buildHero(c) {
  const idle = [c];
  const walk = [c, variant(c, { dy: 2 }), variant(c, { dy: -1 })];
  const attack = [
    variant(c, { rot: -0.10 }),  // 蓄力后仰
    variant(c, { rot: 0.12, sx: 1.05 }), // 横扫前倾
    variant(c, { rot: -0.16, sy: 1.04 }), // 上挑
    variant(c, { rot: 0.06, sy: 0.94, sx: 1.06 }), // 劈砸挤压
  ];
  const hurt = [variant(c, { rot: 0.14, dy: 1 })];
  const mk = (arr) => arr.map(flipH);
  return {
    idle, walk, attack, hurt,
    left: { idle: mk(idle), walk: mk(walk), attack: mk(attack), hurt: mk(hurt) },
  };
}

// imgs: { hero_recall, hero_forge, hero_weave, enemy_<name>, boss_<name>, npc_<name> } -> Image
export function applyImageSprites(SPRITES, imgs) {
  if (!imgs) return;
  const get = (k) => imgs[k] || null;

  // 主角三职业(aspect 48/60 = 0.8)
  const heroKeys = { recall: 'hero_recall', forge: 'hero_forge', weave: 'hero_weave' };
  for (const cls of Object.keys(heroKeys)) {
    const img = get(heroKeys[cls]);
    if (!img) continue;
    const c = padToAspect(toCanvas(img), 0.8);
    const frames = buildHero(c);
    if (cls === 'recall') SPRITES.hero = frames;
    SPRITES.heroVariants = SPRITES.heroVariants || {};
    SPRITES.heroVariants[cls] = frames;
  }

  // 敌人(帧数组, aspect 1 正方形, 2 帧 bob)
  const enemyNames = ['forest_spirit','moss_lurker','vine_wraith','ember_imp','forge_knight',
    'ash_phantom','grave_warden','ink_scholar','frost_lurker','mirror_knight','void_seeker'];
  for (const n of enemyNames) {
    const img = get('enemy_' + n);
    if (!img) continue;
    const c = padToAspect(toCanvas(img), 1);
    SPRITES.enemies[n] = [c, variant(c, { dy: 2 })];
  }

  // Boss(单 canvas, aspect 1)
  const bossKeys = { forest_keeper: 'boss_forest_keeper', burning_king: 'boss_burning_king',
    chronomancer: 'boss_chronomancer', forgotten: 'boss_forgotten' };
  for (const b of Object.keys(bossKeys)) {
    const img = get(bossKeys[b]);
    if (!img) continue;
    SPRITES.boss[b] = padToAspect(toCanvas(img), 1);
  }

  // NPC(单 canvas, 自然尺寸即游戏尺寸)
  const npcKeys = { child: 'npc_child', blacksmith: 'npc_blacksmith', scholar: 'npc_scholar' };
  for (const n of Object.keys(npcKeys)) {
    const img = get(npcKeys[n]);
    if (!img) continue;
    SPRITES.npc[n] = toCanvas(img);
  }
}
