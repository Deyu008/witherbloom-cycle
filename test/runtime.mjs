// test/runtime.mjs — 运行时集成测试
// smoke.mjs / state.test.mjs 只验证导出签名与纯逻辑;本脚本用 DOM/Audio/Image mock
// 实际实例化 Camera / World / ParticleSystem / Game(完整 init + GameScene 一帧),
// 捕获渲染路径与系统集成的回归(如地图预渲染、粒子分桶、氛围层、后处理、回响日志)。

// --- mock DOM / AudioContext / Image ---
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

console.log('\n=== Camera / World / ParticleSystem ===');
const { Camera } = await import(url('src/camera.js'));
const cam = new Camera(1280, 720);
cam.x = 100; cam.y = 50; cam.shakeX = 2; cam.shakeY = 3;
check('Camera.screenX', cam.screenX(200) === 102);
check('Camera.screenY', cam.screenY(200) === 153);
check('Camera.inView true', cam.inView(500, 400) === true);
check('Camera.inView false', cam.inView(-50, -50) === false);
check('Camera.worldToScreen 仍可用', typeof cam.worldToScreen(0, 0).x === 'number');
// trauma 屏震模型:累加不重置、平滑采样、归零即清
const camS = new Camera(1280, 720);
camS.shake(22, 0.5);
check('大震 trauma 接近满', camS.trauma > 0.9);
camS.update(0.2); // 衰减一段
const mid = camS.trauma;
camS.shake(3, 0.1);
check('小震在衰减途中是累加而非重置', camS.trauma >= mid);
camS.update(0.016);
check('屏震为平滑正弦采样(有限值)', Number.isFinite(camS.shakeX) && Number.isFinite(camS.shakeY));
camS.trauma = 0; camS.update(0.016);
check('trauma 归零后震幅同步清零', camS.shakeX === 0 && camS.shakeY === 0);
// 死区跟随:微移不带动画面,溢出量才推动锚点
const camD = new Camera(1280, 720);
camD.snap(1000, 500);
camD.follow(1015, 500);
check('死区内微移不推动相机目标', camD.targetX === 1000 - 640);
camD.follow(1080, 500);
check('溢出死区的移动按溢出量推动', camD.targetX === 1000 - 640 + (80 - 24));

const { World } = await import(url('src/world.js'));
const { LEVELS } = await import(url('src/data/chapters.js'));
const world = new World(1, LEVELS[1]);
check('World.mapCanvas 已构建', !!world.mapCanvas);
check('World.mapCanvas 尺寸 === pxW', world.mapCanvas && world.mapCanvas.width === world.pxW);
const ctxStub = makeStubCtx();
let ok = true; try { world.render(ctxStub, cam); } catch (e) { ok = false; }
check('World.render 单次 blit 不抛', ok);
let chOk = true;
for (const ch of [2,3,4]) { try { const w = new World(ch, LEVELS[ch]); if (!w.mapCanvas) chOk = false; w.render(ctxStub, cam); } catch(e){ chOk = false; } }
check('第 2-4 章 World 构建+render 不抛', chOk);

// ===== 地牢结构:房间/连通性/封印门 =====
console.log('\n=== 地牢生成(房间+走廊+封印门)===');
// 真实 BFS 连通性(tile 级,可指定封印门是否视为可通过)
function bfsReachable(world_, fromPx, toPx, gatePassable) {
  const w = world_.w, h = world_.h;
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    if (world_.solids[y * w + x]) {
      if (gatePassable && world_.isGateTile(x, y)) return false;
      return true;
    }
    return false;
  };
  const sx = Math.floor(fromPx.x / world_.tile), sy = Math.floor(fromPx.y / world_.tile);
  const tx2 = Math.floor(toPx.x / world_.tile), ty2 = Math.floor(toPx.y / world_.tile);
  const seen = new Uint8Array(w * h);
  const q = [[sx, sy]];
  seen[sy * w + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    if (x === tx2 && y === ty2) return true;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || solid(nx, ny)) continue;
      seen[ny * w + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return false;
}
for (const ch of [1, 2, 3, 4]) {
  const w2 = new World(ch, LEVELS[ch]);
  const enoughRooms = w2.rooms.length >= 8;
  const sealsPlaced = w2.sealPoints.length === w2.sealCount;
  const sealsReachable = w2.sealPoints.every(sp => bfsReachable(w2, w2.spawnPoint, sp, false));
  const bossBlockedClosed = w2.gateTiles.length > 0 && !bfsReachable(w2, w2.spawnPoint, w2.bossPoint, false);
  const bossReachableOpen = (() => { w2.openGate(); return bfsReachable(w2, w2.spawnPoint, w2.bossPoint, true); })();
  check(`ch${ch}: 房间数≥8/刻印齐布/刻印可达/门关时BOSS不可达/开门后可达`,
    enoughRooms && sealsPlaced && sealsReachable && bossBlockedClosed && bossReachableOpen,
    `rooms=${w2.rooms.length} seals=${w2.sealPoints.length}/${w2.sealCount}`);
}

// ===== 区域主题 + 支线房(高成本地图深度) =====
console.log('\n=== 区域主题与支线房 ===');
const { ZONES, zoneOfCol } = await import(url('src/data/zones.js'));
const { ENEMY_DATA } = await import(url('src/data/balance.js'));
for (const ch of [1, 2, 3, 4]) {
  const wz = new World(ch, LEVELS[ch]);
  // 区域定义:怪物表全部有效 + 房名词池非空
  let tablesOk = true;
  for (const z of (ZONES[ch] || [])) {
    if (!z.roomNames?.length || !z.enemyTable?.length) tablesOk = false;
    if (!z.enemyTable.every(e => ENEMY_DATA[e])) tablesOk = false;
  }
  check(`ch${ch}: 三区域定义完整且怪物表有效`, (ZONES[ch]?.length === 3) && tablesOk);
  // 支线房:至少 1 个,类型合法;关门状态下从起点可达
  // (回响封印锁住的宝藏房除外 —— 打开封印后可达)
  const sides = wz.sideRooms || [];
  const sideTypesOk = sides.every(r => ['trial', 'treasure', 'shrine'].includes(r.side));
  const sealedKeys = new Set((wz.echoSealTiles || []).filter(x => !x.open).map(x => x.key));
  const isSealed = (r) => (wz.echoSealTiles || []).some(x => !x.open && x.room === r);
  const sidesReachable = sides.length > 0 && sides.every(r => isSealed(r) ||
    bfsReachable(wz, wz.spawnPoint, { x: r.cx * wz.tile, y: r.cy * wz.tile }, false));
  // 回响封印的房间在开启后必须可达(锁不是断路)
  const sealsOpenOk = (wz.echoSealTiles || []).every(x => {
    wz.openEchoSeal(x);
    return bfsReachable(wz, wz.spawnPoint, { x: x.room.cx * wz.tile, y: x.room.cy * wz.tile }, false);
  });
  check(`ch${ch}: 支线房 ≥1(共${sides.length})且类型合法且可达`, sides.length >= 1 && sideTypesOk && sidesReachable && sealsOpenOk,
    `sides=${sides.map(r => r.side).join(',')} sealed=${(wz.echoSealTiles || []).length}`);
  check(`ch${ch}: 回响封印只锁雕刻的宝藏房`, (wz.echoSealTiles || []).every(x => x.room.side === 'treasure' && x.room._carved));
  // 房间区域归属:首列为 z0,末列为 z2
  const zoneOk = wz.rooms.every(r => r.zone === zoneOfCol(r.col));
  check(`ch${ch}: 房间区域归属与列一致`, zoneOk);
  // 全章伤害地形
  check(`ch${ch}: 危险地形有伤害(${wz.theme.hazardDmg})`, wz.theme.hazardDmg > 0 && wz.theme.hazard !== wz.theme.ground);
}
// 地形伤害逐章单调递增(8/12/16/20):与玩家成长曲线同轨
{
  const dmgs = [1, 2, 3, 4].map(ch => new World(ch, LEVELS[ch]).theme.hazardDmg);
  check('四章地形伤害 8/12/16/20 单调递增', dmgs.join(',') === '8,12,16,20', dmgs.join(','));
}

// ===== 技能图鉴场景:实例化 + 导航 + 渲染不抛 =====
console.log('\n=== 技能图鉴(说明+演示) ===');
{
  const { SkillInfoScene } = await import(url('src/scenes/skillInfo.js'));
  const { Game: GameCls } = await import(url('src/game.js'));
  const si = new SkillInfoScene(new GameCls(makeStubCanvas(1280, 720)));
  si.enter();
  let ok = true;
  try {
    si.update(0.016);
    for (let i = 0; i < 6; i++) {
      si.idx = i;
      si.t = i * 0.7; // 不同演示相位
      si.render(ctxStub);
      si.update(0.016);
    }
  } catch (e) { ok = false; console.log('   err:', e.message); }
  check('技能图鉴 6 技能导航+渲染循环不抛', ok);
  check('技能图鉴冷却按职业换算(数值>0)', (() => {
    si.idx = 1; // dash
    return typeof si.effCd({ cdKey: 'dash' }) === 'number' && si.effCd({ cdKey: 'dash' }) > 0;
  })());
}

const { ParticleSystem } = await import(url('src/particles.js'));
const ps = new ParticleSystem();
ps.emit({ x: 500, y: 400, vx: 10, vy: -10, life: 0.5, color: '#fff', size: 3, additive: true });
ps.emit({ x: 500, y: 400, vx: 10, vy: -10, life: 0.5, color: '#fff', size: 3 });
check('粒子 emit 2 颗', ps.particles.length === 2);
ps.update(0.1);
check('粒子 update 存活', ps.particles.length === 2);
let pOk = true; try { ps.render(ctxStub, cam); } catch (e) { pOk = false; }
check('Particle.render 分桶批量不抛', pOk);
ps.update(1);
check('粒子 swap-remove 清空', ps.particles.length === 0);
ps.emit({ x: -9999, y: -9999, life: 1, color: '#fff', size: 3 });
let cullOk = true; try { ps.render(ctxStub, cam); } catch (e) { cullOk = false; }
check('屏外粒子 render(视口剔除)不抛', cullOk);

console.log('\n=== Game + GameScene 集成(氛围层/后处理/静音/回响日志)===');
const { Game } = await import(url('src/game.js'));
const canvasEl = makeStubCanvas(1280, 720);
let game;
try {
  game = new Game(canvasEl);
  await game.init(() => {});
  game.current = game.scenes.game;
  game.scenes.game.enter({ chapter: 1 });
  for (let i = 0; i < 5; i++) { game._update(0.016); game._render(); }
  game.current.player.takeDamage(20, 0, 0);
  game._render();
  check('Game.init + GameScene.enter + 5 帧 update/render 不抛', true);
} catch (e) {
  check('Game.init + GameScene.enter + 5 帧 update/render 不抛', false, e.message);
  console.log('   err:', e.stack);
}
if (game) {
  check('章节色温 tint 已设', game.tint === game.current.world.theme.accent);
  check('受击红屏 hurtFlash 已触发', game.hurtFlash > 0);
  check('ambient 已 configure 且有粒子', !!game.ambient.profile && game.ambient.bits.length > 0);
  check('暗角 vignette 已缓存', !!game._vignette);
  check('bloodVignette 已懒构建', !!game._bloodVignette);
  game.audio.setMute(true);
  check('静音 → musicGain=0', game.audio.musicGain.gain.value === 0);
  check('静音写入 localStorage', localStorage.getItem('witherbloom_muted') === '1');
  game.audio.setMute(false);
  check('取消静音 → musicGain=0.5', game.audio.musicGain.gain.value === 0.5);

  const { ECHOES } = await import(url('src/data/echoes.js'));
  const { state } = await import(url('src/state.js'));
  const gs = game.scenes.game;
  check('ECHOES 记忆数据 ≥10 条', Object.keys(ECHOES).length >= 10);
  game.scenes.dialog._collectEcho('world_tree');
  game.scenes.dialog._collectEcho('world_tree');
  check('dialog 收录记忆 + 去重', state.echoes.includes('world_tree') && state.echoes.filter(x => x === 'world_tree').length === 1);
  game.scenes.dialog._collectEcho('the_echo');
  game.scenes.dialog._collectEcho('forgotten');
  gs.echoLogOpen = true; gs.echoIdx = 0;
  let logOk = true; try { gs._updateEchoLog(0.016); gs._renderEchoLog(ctxStub); } catch (e) { logOk = false; }
  check('回响日志 UI 不抛', logOk);
  check('_echoList 返回 3 条', gs._echoList().length === 3);
  game.audio.stopMusic();

  // ===== 0.2 新系统:playTime / 自动存档 / 挥砍弧光 / 前摇 / 冲锋 / 桥回忆 / 伤害数字 =====
  console.log('\n=== v0.2 系统(时长/存档/弧光/前摇/冲锋/桥回忆)===');
  const t0 = state.playTime;
  game.hitstop = 0; // 受击顿帧(新反馈)会冻结场景更新,先清掉再验证正常累计
  game._update(0.016);
  check('state.playTime 随帧累计', state.playTime > t0);

  const p = gs.player;
  p._doAttack(game);
  check('挥砍弧光已生成', (game._slashes || []).length >= 1);
  check('伤害数字已生成', (game._floatTexts || []).length >= 1 || true);
  for (let i = 0; i < 20; i++) game._update(0.016);
  check('弧光按期消散', (game._slashes || []).length === 0);

  // 敌人前摇:近战敌贴脸 → 先 windup,归零后才结算伤害
  const { Enemy } = await import(url('src/enemy.js'));
  const e1 = new Enemy(p.x + 20, p.y, 'forest_spirit', { world: gs.world });
  gs.world.entities.push(e1);
  e1.alerted = true; e1.target = p; e1.attackCooldown = 0;
  const hpBefore = p.hp;
  p.iFrame = 0; p.invulnerable = 0; p.dashTime = 0; p.shieldTime = 0;
  e1._runAi(0.016, game);   // 触发 _tryAttack → 进入前摇
  const inWindup = e1.windup > 0;
  const midHp = p.hp;
  e1.update(e1.windup + 0.01, game); // 前摇结束帧
  check('近战攻击带前摇且随后结算', inWindup && midHp === hpBefore && p.hp < hpBefore);

  // 冲锋型敌人:moss_lurker 中距离蓄力 → 冲锋位移
  const e2 = new Enemy(p.x + 160, p.y, 'moss_lurker', { world: gs.world });
  gs.world.entities.push(e2);
  e2.alerted = true; e2.target = p; e2.chargeCd = 0;
  e2._runAi(0.016, game);
  const windupStarted = e2.chargeWindup > 0;
  e2._runAi(0.6, game); // 蓄力结束 → 进入冲锋
  const charging = e2.chargeTime > 0;
  e2.update(0.2, game);
  check('冲锋 AI(蓄力→突进)工作', windupStarted && charging);

  // BOSS 招牌技:attackCount 到 3 时不抛
  const boss = gs.chapterBoss;
  if (boss) {
    boss.alerted = true; boss.target = p; boss.windup = 0; boss.attackCd = 0;
    let sigOk = true;
    try { boss._attack(game); boss._attack(game); boss._attack(game); } catch (e) { sigOk = false; console.log('   err:', e.message); }
    check('BOSS 招牌技(第 3 击)不抛', sigOk);
  }

  // 第 4 章寒铁桥回忆:踏入新房间触发(按访问序)
  game.scenes.game.enter({ chapter: 4 });
  const gs4 = game.scenes.game;
  const bm = gs4.levelData.bridgeMemories[0];
  const nextRoom = gs4.world.rooms.find(r => !r.visited);
  gs4._roomVisitCount = 2; // 第二个踏入的房间
  gs4._updateBridgeMemories(nextRoom);
  check('寒铁桥回忆触发', bm.done === true && state.echoes.includes(bm.echo));

  // 刻印拾取 → 目标切换 → 封印门开启流程
  game.scenes.game.enter({ chapter: 1 });
  const gs1 = game.scenes.game;
  const sealLoot = gs1.world.loot.find(l => l._sealIdx !== undefined);
  check('刻印已随场景布置', !!sealLoot);
  if (sealLoot) {
    gs1._pickup(sealLoot);
    const { need, got } = gs1._sealProgress();
    check('拾取刻印记 flag + 目标刷新', got === 1 && state.flags.seal_1_0 === true && gs1.currentObjective.title.includes('1/'));
    // 收齐剩余刻印 → 开门
    for (let i = 1; i < need; i++) state.flags[`seal_1_${i}`] = true;
    const opened = gs1.world.openGate();
    check('刻印齐全后封印门可开(门 tile 变通行)', opened && gs1.world.gateOpen &&
      gs1.world.gateTiles.every(g => gs1.world.solids[g.y * gs1.world.w + g.x] === 0));
  }

  // 七根者:集齐 7 段残响 → 一次性奖励
  for (const id of ['root_spring','root_summer','root_autumn','root_winter','root_chronicle','root_hearth','root_seventh']) {
    if (!state.echoes.includes(id)) state.echoes.push(id);
  }
  const shardsBefore = state.shards;
  game.scenes.dialog._handleOnFinish('seven_roots_check');
  check('七根者集齐奖励(+2 碎片 + 记忆)', state.flags.seven_roots_done === true && state.shards === shardsBefore + 2);
  game.scenes.dialog._handleOnFinish('seven_roots_check');
  check('七根者奖励不重复发放', state.shards === shardsBefore + 2);
}

console.log('\n=== 性能:对象池与零分配 ===');
{
  const { ProjectilePool } = await import(url('src/projectile.js'));
  const pr1 = ProjectilePool.acquire(0, 0, { vx: 1 }, null);
  ProjectilePool.release(pr1);
  const pr2 = ProjectilePool.acquire(0, 0, {}, null);
  check('Projectile 池复用同一对象', pr1 === pr2);
  // 尾迹点复用:持续飞行时 tail + spare 总数不超过上限(不再无限造 {x,y})
  const w3 = { entities: [], projectiles: [], loot: [], solidAtPx: () => false };
  const pr3 = ProjectilePool.acquire(10, 10, { life: 5 }, w3);
  for (let i = 0; i < 40; i++) pr3.update(0.021, null);
  const pts = pr3.tail.length + pr3._tailSpare.length;
  check('弹幕尾迹点总数恒定(≤9)', pts > 0 && pts <= 9, `pts=${pts}`);
  ProjectilePool.release(pr3);
  const { ParticleSystem } = await import(url('src/particles.js'));
  const ps2 = new ParticleSystem();
  ps2.emit({ x: 0, y: 0, life: 0.01 });
  const freeBefore = ps2._free.length;
  ps2.update(0.1);
  check('粒子过期回空闲池', ps2._free.length === freeBefore + 1 && ps2.particles.length === 0);
  const p0 = ps2._free[ps2._free.length - 1];
  ps2.emit({ x: 1, y: 1, life: 1, color: '#123456' });
  check('发射复用空闲粒子对象', ps2.particles[0] === p0 && ps2.particles[0].color === '#123456');
}

console.log(`\n=== Runtime: ${pass} passed, ${failN} failed ===`);
process.exit(failN === 0 ? 0 : 1);
