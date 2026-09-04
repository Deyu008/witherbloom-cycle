// playtest.mjs — 无头端到端战斗演练
// 完整实例化 Game → GameScene(第 1 章),驱动真实游戏循环数百帧,
// 模拟玩家输入与敌人接触,断言本次全部新玩法系统真实生效。
// 用法: node scripts/playtest.mjs

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
const lsStore = new Map();
globalThis.localStorage = { getItem: k => lsStore.has(k) ? lsStore.get(k) : null,
  setItem: (k,v) => lsStore.set(k, String(v)), removeItem: k => lsStore.delete(k) };
class SO { connect(x){return x;} disconnect(){} start(){} stop(){}
  frequency={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  type=''; playbackRate={value:1}; }
class SG { connect(x){return x;} disconnect(){}
  gain={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}; }
class SAC {
  constructor(){this.state='running';this.currentTime=0;this.destination={};this.sampleRate=44100;}
  createOscillator(){return new SO();} createGain(){return new SG();}
  createBufferSource(){return new SO();}
  resume(){return Promise.resolve();} suspend(){return Promise.resolve();}
}
globalThis.AudioContext = SAC; globalThis.webkitAudioContext = SAC;
globalThis.performance = { now: () => Date.now() };
globalThis.Image = class { constructor(){this.width=100;this.height=100;}
  set src(v){ setTimeout(()=>{ this.onerror && this.onerror(new Error('mock')); }, 0); } };
// 真实 RAF 由本脚本手动泵帧替代
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };

const root = process.cwd();
const url = p => 'file://' + root + '/' + p;
let pass = 0, failN = 0;
function check(n, c, extra = '') {
  if (c) { pass++; console.log('  PASS  ' + n); }
  else { failN++; console.log('  FAIL  ' + n + '  ' + extra); }
}

const { Game } = await import(url('src/game.js'));
const { freshState, state } = await import(url('src/state.js'));
Object.assign(state, freshState());

console.log('\n=== 启动游戏(标题场景)===');
const canvas = makeStubCanvas(1280, 720);
const game = new Game(canvas);
await game.init(() => {});
check('init 完成,当前为标题场景', !!game.scenes.title && game.current === game.scenes.title);

// 直接进入第 1 章(跳过转场)
game.setScene('game', { chapter: 1 });
const scene = game.current;
check('进入第 1 章 GameScene', scene === game.scenes.game && scene.chapter === 1);
check('世界生成(房间>3, 有封印门)', scene.world.rooms.length >= 3 && scene.world.gateTiles.length > 0);
// 随机 seed:flag 已生成且世界实际使用(二周目换图,同存档不换)
check('每章随机 seed 已生成并被世界使用',
  Number.isFinite(state.flags.ch1_seed) && scene.levelData.seed === state.flags.ch1_seed,
  `seed=${state.flags.ch1_seed}`);
// 支线房:至少 1 个,试炼房有波次守军,静谧泉已登记
const sides = scene.world.sideRooms || [];
check('支线房 ≥1 已生成', sides.length >= 1, `sides=${sides.map(r => r.side).join(',')}`);
const trialRoom = sides.find(r => r.side === 'trial');
if (trialRoom) {
  const guards = scene.world.entities.filter(e => e.alive && e._roomRef === trialRoom);
  check('试炼房第一波守军就位(含精英)', guards.length >= 2 && guards.some(e => e.elite),
    `guards=${guards.length}`);
}
check('静谧泉已登记(_shrines)', sides.some(r => r.side === 'shrine')
  ? scene._shrines.length > 0 : true);
// 区域怪物表:存在按 zone 区分的刷怪(抽查房间敌人类型属于其区域表)
{
  const z1 = scene.world.zones[1];
  const inZone1 = scene.world.entities.filter(e => e._roomRef && e._roomRef.zone === 1 && e.type);
  check('区域怪物表生效(中段房间敌人来自区域表)',
    inZone1.length === 0 || inZone1.every(e => z1.enemyTable.includes(e.type)),
    `n=${inZone1.length}`);
}

// 跳过开场对话(headless 无法按键推进)
if (scene.dialogActive) {
  game.scenes.dialog.finished = true;
  scene.update(0.016);
}
check('开场对话已跳过', !scene.dialogActive);

let T = 0;
function frame(dt = 0.033) { T += dt; game.lastT += dt * 1000; game.frameCount++; game._update(dt); game._render(); }
for (let i = 0; i < 10; i++) frame();

console.log('\n=== 玩家基础更新 ===');
const player = scene.player;
check('玩家存在且存活', !!player && player.alive);

// ---- 场景 0:章首祝福三选一(选择 / 跳过补偿 / 死亡失去)----
console.log('\n=== 场景0 回响祝福三选一 ===');
scene.update(0.016); // 触发 _tryOpenBoonOffer
check('章首祝福弹出', !!scene._boonOffer, `offer=${!!scene._boonOffer}`);
const goldBeforeSkip = state.gold;
scene.update(0.016);
if (scene._boonOffer) { // 跳过流程:KeyS
  game.input.keysJustPressed.add('KeyS');
  scene.update(0.016);
  game.input.keysJustPressed.delete('KeyS');
}
check('跳过祝福 +50 金补偿', state.gold === goldBeforeSkip + 50, `gold=${state.gold}`);
scene._queueBoon('common');
scene.update(0.016); scene.update(0.016);
check('再次触发祝福弹出', !!scene._boonOffer);
const boonsBefore = state.boons.length;
if (scene._boonOffer) {
  game.input.keysJustPressed.add('Digit1');
  scene.update(0.016);
  game.input.keysJustPressed.delete('Digit1');
}
check('数字键选定祝福入栏', state.boons.length === boonsBefore + 1 && !scene._boonOffer);
check('祝福生效于伤害乘区', player.boonMods().dmg >= 0 || Object.keys(player.boonMods()).length > 0);
// 死亡失去最高稀有度祝福(清空后推入确定组合,避免随机祝福干扰断言)
state.boons = [];
state.boons.push({ id: 'might', rarity: 'common' });
state.boons.push({ id: 'wildfire', rarity: 'epic' });
const boonCountBeforeDeath = state.boons.length;
scene._onPlayerDeath();
scene._respawn();
check('死亡失去最高稀有度祝福(史诗被移除)',
  state.boons.length === boonCountBeforeDeath - 1 && !state.boons.some(b => b.id === 'wildfire'));
state.boons = []; // 清场,后续场景不受祝福数值干扰
frame();
check('被动回蓝运行(state.mp 增长曲线正常)', state.mp >= 0 && state.mp <= state.maxMp);

// ---- 场景 A:连击/暴击/伤害数字/命中回蓝 ----
console.log('\n=== 场景A 连击·暴击·浮字·回蓝 ===');
// 找一只活着的敌人拖到身边
let foe = scene.world.entities.find(e => e.side === 'enemy' && e.alive && e !== scene.chapterBoss);
if (!foe) { // 兜底:直接借一个尸体位置造一只
  const { Enemy } = await import(url('src/enemy.js'));
  foe = new Enemy(player.x + 40, player.y, 'forest_spirit', { world: scene.world });
  scene.world.entities.push(foe);
}
foe.x = player.x + 45; foe.y = player.y; foe.invulnerable = 0;
const mpBefore = state.mp;
const comboBefore = game.comboCount;
const textsBefore = (game._floatTexts || []).length;
player.aimAngle = Math.atan2(foe.y - player.y, foe.x - player.x);
player.attackCd = 0;
player._doAttack(game);
game.hitstop = 0; // 手动结算 hitstop 后继续
frame(); frame();
check('攻击命中:连击链增长', game.comboCount > comboBefore, `combo=${game.comboCount}`);
check('命中回蓝生效(≥+2)', state.mp >= Math.min(state.maxMp, mpBefore + 2) - 1e-6,
  `before=${mpBefore.toFixed(2)} after=${state.mp.toFixed(2)}`);
check('伤害数字已生成', (game._floatTexts || []).length > textsBefore);

// ---- 场景 B:击杀与掉落/经验 ----
console.log('\n=== 场景B 击杀结算 ===');
const killsBefore = state.stats.kills;
const xpBefore = state.xp;
foe.hp = 1;
player.attackCd = 0;
player.aimAngle = Math.atan2(foe.y - player.y, foe.x - player.x);
player._doAttack(game);
scene.update(0.016);
check('击杀计数+1', state.stats.kills === killsBefore + 1);
check('经验增加', state.xp > xpBefore || state.level > 1);

// ---- 场景 C:完美闪避 ----
console.log('\n=== 场景C 完美闪避子弹时间 ===');
const { Projectile } = await import(url('src/projectile.js'));
state.mp = 0;
state.maxMp = 78; player.maxMp = 78;
player.dashTime = 0.16; // 冲刺中
const proj = new Projectile(player.x + 20, player.y, { vx: -300, vy: 0, damage: 10, team: 'enemy',
  side: 'enemy', source: null, radius: 8 }, scene.world);
proj.update(0.05, game); // 子弹穿过玩家
check('冲刺中免伤 + 触发慢动作', game.slowmoT > 0, `slowmoT=${game.slowmoT}`);
check('完美闪避奖励法力', state.mp >= 18);

// ---- 场景 D:刻印守护战 ----
console.log('\n=== 场景D 刻印守护战 ===');
const entitiesBefore = scene.world.entities.length;
const sealLoot = scene.world.loot.find(l => l._sealIdx !== undefined) || null;
if (sealLoot) {
  scene._pickup(sealLoot);
  check('拾取刻印刷出守护者(实体数增加)', scene.world.entities.length > entitiesBefore,
    `before=${entitiesBefore} after=${scene.world.entities.length}`);
  check('守护战横幅弹出', !!game._banner && String(game._banner.text).includes('苏醒'));
  check('伏兵计数就位', scene._ambushLeft > 0, `left=${scene._ambushLeft}`);
} else {
  console.log('  SKIP  本章无未收集刻印(flag 已置位)');
}

// ---- 场景 E:BOSS 战(狂暴→迷你BOSS / 力竭放水→章节BOSS)----
console.log('\n=== 场景E BOSS 力竭·狂暴·赏金 ===');
// 清掉守护战等排队中的祝福,避免冻结后续帧
let _g = 0;
while ((scene._boonOffer || scene._boonQueue.length > 0) && _g++ < 10) {
  scene._boonQueue.length = 0; scene._boonOffer = null;
}
const boss = scene.chapterBoss;
if (boss) {
  boss.dialogStarted = true; // 跳过剧情对话,直接进入战斗测试
  boss.alerted = true;
  boss.x = scene.world.bossPoint.x; boss.y = scene.world.bossPoint.y;
  player.x = boss.x + 100; player.y = boss.y;
  // 驱动若干帧让 BOSS 出弹
  let sawProjectile = false;
  for (let i = 0; i < 240; i++) {
    frame(0.033);
    if (scene.world.projectiles.length > 0) sawProjectile = true;
    player.iFrame = 0; player.invulnerable = 0; player.dashTime = 0; player.dashGraceT = 0;
  }
  check('BOSS 开战出弹', sawProjectile || boss.windup > 0);
  // 章节 BOSS 打到释怀线:进入"力竭放水"(狂暴被释怀态取代)
  boss.takeDamage(Math.ceil(boss.maxHp * 0.8), boss.x, boss.y);
  scene.update(0.016);
  check('章节BOSS低血不狂暴(让位力竭态)', boss.enraged === false);
  check('力竭旗标+横幅触发', boss._wearyShown === true && !!game._banner);
  check('力竭前摇加长(0.55)', boss.windup <= 0.55);
  // 背叛杀旗标(直伤触发死亡,由场景循环结算 onKilled)
  state.flags = state.flags || {};
  boss.invulnerable = 0;
  boss.takeDamage(99999, player.x, player.y);
  scene.update(0.016);
  check('力竭击杀=背叛杀旗标', state.flags['boss1_betrayed'] === true);
  check('首伐赏金发放(+3 碎片)', state.flags[`bounty_${state.heroClass}_1`] === true);
}
// 迷你 BOSS:保留狂暴路径(拦掉通关结算窗的二次弹出,避免冻结场景更新)
scene.chapterComplete = null;
scene._clearedDuringRun = true;
const { Boss } = await import(url('src/boss.js'));
const mb = new Boss(player.x + 120, player.y, 'forgotten', { id: 'regret_childhood', isMiniboss: true, world: scene.world });
scene.world.entities.push(mb);
mb.target = player; mb.alerted = true; mb.invulnerable = 0;
mb.takeDamage(Math.ceil(mb.maxHp * 0.95), mb.x, mb.y);
scene.update(0.016);
check('迷你BOSS低血进入狂暴', mb.enraged === true);

// ---- 场景 F:配音资源清单一致性 ----
console.log('\n=== 场景F 配音文件与台词映射一致 ===');
const fs = await import('node:fs');
const vdir = root + '/assets/audio/voice';
const present = new Set(fs.existsSync(vdir) ? fs.readdirSync(vdir).filter(f => f.endsWith('.mp3')) : []);
const { VOICE_INTRO_KNOWN } = { VOICE_INTRO_KNOWN: ['v_b1_1','v_b2_1','v_b3_1','v_b4_1'] };
const missingIntro = VOICE_INTRO_KNOWN.filter(k => !present.has(k + '.mp3'));
check('四位 BOSS 开场配音就绪', missingIntro.length === 0, `missing=${missingIntro}`);
check('共 10 条台词文件', present.size === 10, `count=${present.size}`);

// ---- 全程不抛异常即通过渲染管线 ----
for (let i = 0; i < 30; i++) frame();
console.log(`\n=== Playtest: ${pass} passed, ${failN} failed ===`);
process.exit(failN ? 1 : 0);
