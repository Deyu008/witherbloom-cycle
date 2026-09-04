// screenshot.mjs — 无头视觉验收:用 @napi-rs/canvas 真实渲染游戏各 UI 场面 → PNG
// 产出 /tmp/shots/*.png,供视觉评审。用法: node scripts/screenshot.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

// ── DOM/环境 mock(在 import 游戏模块之前)──
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
const napi = await import('@napi-rs/canvas');
const { createCanvas, Image: NapiImage } = napi;

function makeCtxProxy() { return null; } // 真实 ctx,无需 proxy

globalThis.document = {
  addEventListener: () => {},
  getElementById: () => null,
  createElement: (tag) => {
    if (tag === 'canvas') return domCanvas(300, 150);
    return { style: {}, addEventListener: () => {} };
  },
  body: { appendChild: () => {} },
};
// napi Canvas 不是 DOM 节点:补事件/尺寸方法
function domCanvas(w, h) {
  const c = createCanvas(w, h);
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: c.width, height: c.height });
  c.style = {};
  return c;
}
const lsStore = new Map();
globalThis.localStorage = {
  getItem: k => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: k => lsStore.delete(k),
  clear: () => lsStore.clear(),
};
class SO { connect(x){return x;} disconnect(){} start(){} stop(){}
  frequency={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  type=''; playbackRate={value:1}; }
class SG { connect(x){return x;} disconnect(){}
  gain={value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}; }
class SAC {
  constructor(){this.state='running';this.currentTime=0;this.destination={};this.sampleRate=44100;}
  createOscillator(){return new SO();} createGain(){return new SG();}
  createBufferSource(){return new SO();}
  createBuffer(ch,len,rate){return {getChannelData:()=>new Float32Array(len)};}
  resume(){return Promise.resolve();} suspend(){return Promise.resolve();}
}
globalThis.AudioContext = SAC; globalThis.webkitAudioContext = SAC;
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 1;

// Image shim:支持 src=路径,委托 napi Image(可被 drawImage 接受)
globalThis.Image = class extends NapiImage {
  set src(v) {
    super.src = v; // @napi-rs/canvas Image 支持 png/jpeg 路径与 buffer
  }
};

// ── 启动游戏 ──
const root = process.cwd().replace(/\/$/, '') + '/';
const url = p => 'file://' + root + p;
const { Game } = await import(url('src/game.js'));
const { state, freshState } = await import(url('src/state.js'));
Object.assign(state, freshState());

mkdirSync('/tmp/shots', { recursive: true });
const canvas = domCanvas(1280, 720);
const game = new Game(canvas);
await game.init(() => {});
// 等过场图异步 onload 完成尽头
for (let i = 0; i < 40 && Object.keys(game.assets.cutscenes).length < 5; i++) {
  await new Promise(r => setTimeout(r, 50));
}
console.log('cutscenes loaded:', Object.keys(game.assets.cutscenes).length);

function shot(name) {
  game._render();
  writeFileSync(`/tmp/shots/${name}.png`, canvas.toBuffer('image/png'));
  console.log('📸', name);
}
function frames(n, dt = 0.016) { for (let i = 0; i < n; i++) { game._update(dt); game._render(); } }

// 1. 标题(等 2.5s:标题文字淡入 + 落叶飘落)
frames(160, 0.016);
shot('01_title');

// 2. 职业选择
game.setScene('classSelect');
frames(20);
shot('02_classSelect');

// 3. 章节过场(直接置于 quote 相位中段:标题完全淡入,文字+暗幕确定性可见)
game.setScene('chapterIntro', { chapter: 1 });
game.current.phase = 'quote';
game.current.phaseT = 0.8;
game.current.t = 3;
frames(6, 0.016);
shot('03_chapterIntro');

// 4. 游戏主 HUD(先跳过对话与祝福,拿干净 HUD;祝福覆盖层单独截)
game.setScene('game', { chapter: 1 });
const scene = game.scenes.game;
frames(5);
if (scene.dialogActive) { game.scenes.dialog.finished = true; scene.update(0.016); }
if (scene._boonOffer) { scene._boonOffer = null; scene._boonQueue.length = 0; } // 暂存后面再截
frames(40);
shot('05_game_hud');

// 5b. 回响祝福三选一
scene._queueBoon('common');
scene.update(0.016);
if (scene._boonOffer) shot('06_boon');
if (scene._boonOffer) { scene._boonOffer = null; scene._boonQueue.length = 0; }

// 7. 战斗中(连击/伤害数字/弧光/动作变形)
const player = scene.player;
let foe = scene.world.entities.find(e => e.side === 'enemy' && e.alive);
if (!foe) {
  const { Enemy } = await import(url('src/enemy.js'));
  foe = new Enemy(player.x + 70, player.y, 'forest_spirit', { world: scene.world });
  scene.world.entities.push(foe);
}
foe.x = player.x + 70; foe.y = player.y; foe.alerted = true; foe.target = player;
for (let i = 0; i < 6; i++) game.registerHit(); // 连击 HUD
player.aimAngle = 0; player.attackCd = 0;
player._doAttack(game);
game.hitstop = 0;
frames(1, 0.008);
shot('07_combat');
game.comboCount = 0;

// 8. BOSS 战(力竭态:金环+黄名+电影黑边)
const boss = scene.chapterBoss;
if (boss) {
  boss.dialogStarted = true;
  boss.alerted = true;
  boss.x = player.x + 260; boss.y = player.y;
  player.x = boss.x - 180;
  boss.takeDamage(Math.ceil(boss.maxHp * 0.8), boss.x, boss.y);
  scene._cineT = 1; scene._cineTarget = 1;
  frames(50);
  shot('08_boss_weary');
  scene._cineT = 0; scene._cineTarget = 0;
} else console.log('skip boss shot');

// 9. 静谧泉(随机图可能没生成;没有就在玩家旁放一个,保证确定性截图)
//    场景设定:玩家已远离 BOSS(把 BOSS 挪到远处)——验证血条"仅近距离显示"规则
let shrine = (scene._shrines || [])[0];
if (!shrine) {
  shrine = { x: player.x + 80, y: player.y, key: 'shot_shrine', room: null };
  scene._shrines.push(shrine);
}
if (scene.chapterBoss) { scene.chapterBoss.x = player.x + 2600; scene.chapterBoss.y = player.y; }
player.x = shrine.x + 30; player.y = shrine.y;
frames(30);
shot('09_shrine');

// 10. 技能图鉴
if (!game.scenes.skillInfo) game.scenes.skillInfo = new (await import(url('src/scenes/skillInfo.js'))).SkillInfoScene(game);
game.setScene('skillInfo');
game.scenes.skillInfo.t = 1.0; // 回声斩挥击相位
shot('10_skillinfo');
game.scenes.skillInfo.idx = 3; // 护盾
game.scenes.skillInfo.t = 1.2;
shot('11_skillinfo_shield');

// 12. 暂停菜单
game.setScene('game', { _fromSkillInfo: true });
frames(2);
shot('12_pause');

console.log('DONE → /tmp/shots/');
