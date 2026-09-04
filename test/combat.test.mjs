// test/combat.test.mjs — 战斗手感新机制单测
// 连击乘子 / 精英敌人数值 / 完美闪避 / 连击窗口清理 / 常量健全性
// Mock DOM 模式与 runtime.mjs 一致。

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
function makeStubCtx() {
  return new Proxy({}, {
    get: (t, p) => {
      if (p === 'createImageData') return (w,h)=>({data:new Uint8ClampedArray((w||1)*(h||1)*4),width:w,height:h});
      if (p === 'getImageData') return (x,y,w,h)=>({data:new Uint8ClampedArray((w||1)*(h||1)*4),width:w,height:h});
      if (p === 'addColorStop') return ()=>{};
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (p === 'measureText') return ()=>({width:0});
      if (p === 'canvas') return { width: 1280, height: 720 };
      if (typeof p === 'string' && p[0] !== '_') return () => {};
      return undefined;
    },
    set: () => true,
  });
}
function makeStubCanvas(w, h) {
  return { width: w, height: h, getContext: () => makeStubCtx(), toDataURL: () => '',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    style: {}, addEventListener: () => {}, removeEventListener: () => {} };
}
globalThis.document = { addEventListener: () => {}, getElementById: () => null,
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas(1280, 720) : { style: {}, addEventListener: () => {} },
  body: { appendChild: () => {} } };
const ls = new Map();
globalThis.localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k,v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
class SO { connect(x){return x;} disconnect(){} start(){} stop(){} frequency={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}; type=''; }
class SG { connect(x){return x;} disconnect(){} gain={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}; }
class SAC { constructor(){this.state='running';this.currentTime=0;this.destination={};} createOscillator(){return new SO();} createGain(){return new SG();} resume(){return Promise.resolve();} suspend(){return Promise.resolve();} }
globalThis.AudioContext = SAC; globalThis.webkitAudioContext = SAC;
globalThis.performance = { now: () => Date.now() };
globalThis.Image = class { constructor(){this.width=100;this.height=100;} set src(v){ setTimeout(()=>{ if(this.onerror) this.onerror(new Error('mock')); }, 0); } };

const root = process.cwd();
const url = p => 'file://' + root + '/' + p;
let pass = 0, failN = 0;
function check(n, c, extra = '') { if (c) { pass++; console.log('  PASS  ' + n); } else { failN++; console.log('  FAIL  ' + n + '  ' + extra); } }

console.log('\n=== balance:COMBAT 常量与连击乘子 ===');
const { COMBAT, comboMultiplier, ENEMY_DATA } = await import(url('src/data/balance.js'));
check('连击窗口为正', COMBAT.comboWindow > 0);
check('慢动作缩放 <1', COMBAT.perfectDodgeSlowmo.scale < 1 && COMBAT.perfectDodgeSlowmo.time > 0);
check('精英倍率合理(Hp>1,Dmg>1,Reward>1)',
  COMBAT.eliteHpMul > 1 && COMBAT.eliteDmgMul > 1 && COMBAT.eliteRewardMul > 1);
check('暴击倍率 >1 且概率 ∈ (0,0.5)', COMBAT.critMul > 1 && COMBAT.critChance > 0 && COMBAT.critChance < 0.5);
check('命中回蓝为正整数步进', Number.isInteger(COMBAT.comboMpPerHit) && COMBAT.comboMpPerHit > 0);
check('连击乘子:低连击不放大', comboMultiplier(0) === 1 && comboMultiplier(4) === 1);
check('连击乘子:达到档位生效', comboMultiplier(5) > 1 && comboMultiplier(12) >= comboMultiplier(5));
check('连击乘子:最高档单调不减', comboMultiplier(22) >= comboMultiplier(12) && comboMultiplier(99) <= comboMultiplier(22) * 2);

console.log('\n=== 精英敌人数值 ===');
const { Enemy } = await import(url('src/enemy.js'));
const fakeWorld = { entities: [], projectiles: [], loot: [], solidAtPx: () => false, spawnGrace: 0,
  spawnLoot() {}, player: null };
const eN = new Enemy(10, 10, 'forest_spirit', { world: fakeWorld });
const eE = new Enemy(10, 10, 'forest_spirit', { world: fakeWorld, elite: true });
const base = ENEMY_DATA.forest_spirit;
check('普通敌人数值不变', eN.hp === base.hp && eN.dmg === base.dmg);
check('精英 HP × eliteHpMul', eE.hp === Math.round(base.hp * COMBAT.eliteHpMul));
check('精英 DMG × eliteDmgMul', eE.dmg === Math.round(base.dmg * COMBAT.eliteDmgMul));
check('精英体型更大', eE.drawW > eN.drawW);
check('精英掉落标记(_roomRef/_ambush 初始空)', eE._ambush === false);
const eA = new Enemy(10, 10, 'forest_spirit', { world: fakeWorld, ambush: true });
check('伏兵标记生效', eA._ambush === true);

console.log('\n=== 完美闪避与连击中枢(Game/Player) ===');
const { Game } = await import(url('src/game.js'));
const { Player } = await import(url('src/player.js'));
const { state, freshState } = await import(url('src/state.js'));
Object.assign(state, freshState());

const fakeParticles = { emit() {} };
const game = new Game(makeStubCanvas(1280, 720));
game.particles = fakeParticles;

// 连击计数中枢
const m1 = game.registerHit();
check('首击乘子为 1(不偷跑加成)', m1 === 1 && game.comboCount === 1);
for (let i = 0; i < 9; i++) game.registerHit();
check('累计 10 击后进入加成档', comboMultiplier(game.comboCount) > 1);
game.updateCombo(0.1);
check('窗口未到不清零', game.comboCount === 10);
game.updateCombo(COMBAT.comboWindow + 0.01);
check('超窗清零', game.comboCount === 0);

// 完美闪避:dashTime>0 时被打 → 回蓝 + 慢动作
game.audio = { sfxPerfect() {}, sfxHit() {}, sfxKill() {} }; // 截断真实合成路径
const player = new Player(100, 100, { game, world: { entities: [], projectiles: [], loot: [] } });
player.game = game;
state.maxMp = 78; state.mp = 0;
player.maxMp = 78; player.mp = 0; // 构造已同步 state
state.hp = 999999; player.hp = 999999; player.maxHp = 999999; // 排除死亡干扰
player.dashTime = 0.16; // 冲刺中
const dealt = player.takeDamage(10, 90, 100);
check('冲刺中免伤(return 0)', dealt === 0);
check('完美闪避回蓝', state.mp === COMBAT.perfectDodgeMp);
check('触发子弹时间', game.slowmoT > 0);
player.iFrame = 0;
player.dashTime = 0;
const beforeMp = state.mp;
player.takeDamage(5, 90, 100);
check('非冲刺状态正常受击', player.hp < 999999 - 3);
check('受击不再给完美闪避回蓝', state.mp < beforeMp + COMBAT.perfectDodgeMp);

// 受击清零连击
for (let i = 0; i < 8; i++) game.registerHit();
player.invulnerable = 0; player.iFrame = 0; player.shieldTime = 0;
player.dashTime = 0; player.dashGraceT = 0;
player.hp = 50; player._perfectDodgeCd = 99; // 屏蔽完美闪避干扰
player.takeDamage(3, 0, 0);
check('受击清空连击链', game.comboCount === 0);

console.log('\n=== 职业外观:三种建模必须不同 ===');
const { heroGridFor } = await import(url('src/sprites/hero.js'));
const { SPRITE_LIB } = await import(url('src/sprite.js'));
const FRAMES = ['idle', 'walk1', 'walk2', 'wind', 'slash', 'upper', 'slam'];
let widthOk = true;
for (const cls of ['recall', 'forge', 'weave']) {
  for (const f of FRAMES) {
    const rows = heroGridFor(cls, f).split('\n').filter(l => l.length > 0);
    if (rows.some(r => r.length !== 18) || rows.length !== 21) widthOk = false;
  }
}
check('三职业 × 7 帧网格全部 18×21(无错位)', widthOk);
const gRecall = heroGridFor('recall', 'idle'), gForge = heroGridFor('forge', 'idle'), gWeave = heroGridFor('weave', 'idle');
check('追忆者 = 紫光法杖(含球 l,无剑刃 w)', gRecall.includes('l') && !gRecall.includes('w'));
check('锻体者 = 宽刃巨剑(含剑刃 w + 缠柄 S,无法杖球)', gForge.includes('w') && gForge.includes('S') && !gForge.includes('l'));
check('织梦者 = 星辉法杖(星芒 w + 辉光 l 共存)', gWeave.includes('w') && gWeave.includes('l'));
check('三职业 idle 剪影两两不同', gRecall !== gForge && gForge !== gWeave && gRecall !== gWeave);
check('攻击姿态组为 4 帧(蓄力+三段挥击)',
  SPRITE_LIB.hero.attack.length === 4
  && SPRITE_LIB.heroVariants.forge.attack.length === 4
  && SPRITE_LIB.heroVariants.weave.attack.length === 4);
check('职业变体装配齐全(heroVariants.recall/forge/weave)',
  !!SPRITE_LIB.heroVariants.recall && !!SPRITE_LIB.heroVariants.forge && !!SPRITE_LIB.heroVariants.weave);
check('左向镜像帧与攻击帧同步', SPRITE_LIB.hero.left.attack.length === 4);
check('受击踉跄帧存在(闭眼歪头,非待机体复用)', SPRITE_LIB.hero.hurt.length === 1);
const gHurt = heroGridFor('recall', 'hurt');
const hurtCap = gHurt.split('\n').filter(l => l.length)[0];
check('受击帧:闭眼(无 LLL 辉光)+ 帽顶左歪 1px',
  !gHurt.includes('LLL') && hurtCap === '.....kkkk.........' && gHurt !== gRecall);

console.log('\n=== 职业主题色(VFX 贯通)===');
const { CLASS_THEME } = await import(url('src/data/balance.js'));
for (const cls of ['recall', 'forge', 'weave']) {
  const t = CLASS_THEME[cls];
  if (!t || typeof t.color !== 'string' || !/^[0-9]{1,3},[0-9]{1,3},[0-9]{1,3}$/.test(t.rgb)) {
    check(`CLASS_THEME.${cls} 结构完整`, false, JSON.stringify(t));
  }
}
check('CLASS_THEME 三职业齐全且互不相同',
  CLASS_THEME.recall.color !== CLASS_THEME.forge.color
  && CLASS_THEME.forge.color !== CLASS_THEME.weave.color
  && CLASS_THEME.recall.color !== CLASS_THEME.weave.color);

console.log('\n=== 封印门开启反馈 ===');
const { World } = await import(url('src/world.js'));
const { LEVELS } = await import(url('src/data/chapters.js'));
const wGate = new World(1, LEVELS[1]);
check('开门前 gateOpenFx 为 0', wGate.gateOpenFx === 0);
const openedFx = wGate.openGate();
check('openGate 成功并启动屏障碎裂残影', openedFx === true && wGate.gateOpenFx > 0);

console.log('\n=== 回响祝福(局内三选一)===');
const { rollBoonRarity, computeBoonMods, drawBoonChoices, BOON_POOL, BOON_SKIP_GOLD } = await import(url('src/data/boons.js'));
check('顺序 roll:rand=0 必出最高档(epic)', rollBoonRarity(() => 0, 0) === 'epic');
check('顺序 roll:rand=1 落普通', rollBoonRarity(() => 1, 0) === 'common');
check('minRarity=rare 兜底不低于稀有', rollBoonRarity(() => 1, 0, 'rare') === 'rare');
check('minRarity=epic 兜底必史诗', rollBoonRarity(() => 1, 0, 'epic') === 'epic');
// 保底:pity 拉满时 rare 区间应显著扩大(rand≈0.20 在无保底时落普通)
check('pity 提升稀有概率(0.20 → rare+)',
  rollBoonRarity((() => { let i = -1; return () => { i += 1; return i === 0 ? 1 : 0.20; }; })(), 0.40) === 'rare');
check('祝福池 ≥ 18 且含三职业形态', BOON_POOL.length >= 18 && BOON_POOL.filter(b => b.rarity === 'aspect').length === 3);
// 聚合
const agg = computeBoonMods([{ id: 'might' }, { id: 'fury' }, { id: 'pierce_asp' }]);
check('computeBoonMods 数值聚合', agg.dmg === 0.10 + 0.22 && agg.recallPierce === 1);
check('computeBoonMods 未知 id 安全跳过', computeBoonMods([{ id: 'nope' }]).dmg === 0);
// 抽取:职业过滤 + 叠层上限
const seq = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s & 0xffff) / 0x10000; }; };
const draw1 = drawBoonChoices(seq(), 0, 'forge', [{ id: 'might' }, { id: 'might' }]);
check('抽满 3 个不重复候选', draw1.choices.length === 3 && new Set(draw1.choices).size === 3);
check('叠层上限:满层 might 不再出现', !draw1.choices.some(c => c.id === 'might'));
const drawWeave = drawBoonChoices(seq(), 0, 'weave', []);
check('职业过滤:weave 不会抽到 forge 专属形态', !drawWeave.choices.some(c => c.cls === 'forge'));
check('跳过补偿为正数', BOON_SKIP_GOLD > 0);
// 玩家侧:祝福伤害乘区与冷却乘区
const { PLAYER_BASE } = await import(url('src/data/balance.js'));
state.boons = [{ id: 'fury' }];
player._boonVer = -1; // 失效缓存
const m = player.boonMods();
check('玩家读取祝福聚合(dmg=0.22)', m.dmg === 0.22);
const cdNoBoon = (() => { state.boons = []; player._boonVer = -1; return player.effCd('dash'); })();
const cdWithBoon = (() => { state.boons = [{ id: 'shadow' }]; player._boonVer = -1; const r = player.effCd('dash'); state.boons = []; player._boonVer = -1; return r; })();
check('影步祝福缩短冲刺冷却', cdWithBoon < cdNoBoon, `${cdWithBoon} vs ${cdNoBoon}`);

console.log(`\n=== Combat: ${pass} passed, ${failN} failed ===`);
process.exit(failN ? 1 : 0);
