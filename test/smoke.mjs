// test/smoke.mjs — 最小冒烟测试(todo 22)
// Mock DOM/AudioContext/performance,再 dynamic import 所有关键模块,断言导出符号存在。
// Mock 模式参考 .omo/evidence/test-todo-3-release.mjs(同仓库已验证可工作的最小 stub)。
// 不测试 canvas 渲染(那属于手动 QA)。

import assert from 'node:assert/strict';

// ─── DOM mock(最小可工作) ───
globalThis.window = globalThis;

function makeStubCtx() {
  return new Proxy({}, {
    get: (t, p) => {
      if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h });
      if (p === 'getImageData')    return (x, y, w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4), width: w, height: h });
      if (p === 'addColorStop')    return () => {};
      if (p === 'measureText')     return () => ({ width: 0 });
      if (typeof p === 'string' && p[0] !== '_') return () => {};
      return undefined;
    },
    set: () => true,
  });
}
function makeStubCanvas() {
  return {
    width: 32, height: 32,
    getContext: (kind) => kind === '2d' ? makeStubCtx() : null,
    toDataURL: () => 'data:image/png;base64,',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
globalThis.document = {
  addEventListener: () => {},
  getElementById: () => null,
  createElement: (tag) => tag === 'canvas' ? makeStubCanvas() : { style: {}, addEventListener: () => {} },
  body: { appendChild: () => {} },
};

// ─── localStorage mock(防止 import 期报错) ───
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => lsStore.has(k) ? lsStore.get(k) : null,
  setItem: (k, v) => { lsStore.set(k, String(v)); },
  removeItem: (k) => { lsStore.delete(k); },
};

// ─── AudioContext mock(避免 import 失败) ───
class StubOscillator { connect(){} disconnect(){} start(){} stop(){} frequency = { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; type = ''; }
class StubGain { connect(){} disconnect(){} gain = { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; }
class StubAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() { return new StubOscillator(); }
  createGain()       { return new StubGain(); }
  resume()           { return Promise.resolve(); }
  suspend()          { return Promise.resolve(); }
}
globalThis.AudioContext = StubAudioContext;
globalThis.webkitAudioContext = StubAudioContext;
globalThis.OfflineAudioContext = StubAudioContext;

// ─── performance mock(boss.js / game.js 调 performance.now) ───
globalThis.performance = { now: () => Date.now() };

// ─── Test harness ───
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

// 走 file URL 让 node 把它们当 ES module 解析
const root = process.cwd();
const url = (p) => 'file://' + root + '/' + p;

console.log('\n=== Module imports ===');

// 1. data/balance.js
const balance = await import(url('src/data/balance.js'));
check('balance.js imports', typeof balance === 'object' && balance !== null);
check('balance.ENEMY_DATA present',   typeof balance.ENEMY_DATA === 'object' && Object.keys(balance.ENEMY_DATA).length >= 10);
check('balance.BOSS_DATA present',    typeof balance.BOSS_DATA === 'object' && balance.BOSS_DATA.forest_keeper?.hp === 300);
check('balance.MINIBOSS_DATA present',typeof balance.MINIBOSS_DATA === 'object' && balance.MINIBOSS_DATA.regret_childhood?.hp === 140);
check('balance.CLASS_MODS present',   typeof balance.CLASS_MODS === 'object' && balance.CLASS_MODS.recall?.mp === 78);
check('balance.PLAYER_BASE present',  typeof balance.PLAYER_BASE === 'object' && balance.PLAYER_BASE.hp === 100);
check('balance.SKILL_BASE present',   typeof balance.SKILL_BASE === 'object' && Object.keys(balance.SKILL_BASE).length === 6);
check('balance.DROP_RATES present',   Array.isArray(balance.DROP_RATES) && balance.DROP_RATES.length === 4);

// 2. data/chapters.js
const chapters = await import(url('src/data/chapters.js'));
check('chapters.js imports', typeof chapters === 'object' && chapters !== null);
check('chapters.CHAPTERS is array of length 4', Array.isArray(chapters.CHAPTERS) && chapters.CHAPTERS.length === 4);
check('chapters.LEVELS keys 1..4 present', typeof chapters.LEVELS === 'object' && [1,2,3,4].every(k => chapters.LEVELS[k]));

// 3. data/dialog.js
const dialog = await import(url('src/data/dialog.js'));
check('dialog.js imports', typeof dialog === 'object' && dialog !== null);
check('dialog.DIALOGS.intro_opening present',   typeof dialog.DIALOGS?.intro_opening === 'object');
check('dialog.DIALOGS.forest_keeper_question',  typeof dialog.DIALOGS?.forest_keeper_question === 'object');
check('dialog.DIALOGS.chronomancer_question',   typeof dialog.DIALOGS?.chronomancer_question === 'object');

// 4. state.js
const st = await import(url('src/state.js'));
check('state.js imports', typeof st === 'object' && st !== null);
check('state.freshState is function', typeof st.freshState === 'function');
check('state.applySave is function',  typeof st.applySave === 'function');
check('state.persistState is function',typeof st.persistState === 'function');
check('state.state is object',        typeof st.state === 'object' && st.state !== null);

// 5. sprite.js(薄壳,re-export)
const spr = await import(url('src/sprite.js'));
check('sprite.js imports', typeof spr === 'object' && spr !== null);
check('sprite.SPRITE_LIB present', typeof spr.SPRITE_LIB === 'object');
check('sprite.SPRITE_LIB.hero',   spr.SPRITE_LIB.hero && (spr.SPRITE_LIB.hero.idle || spr.SPRITE_LIB.hero.left));
check('sprite.SPRITE_LIB.enemies',spr.SPRITE_LIB.enemies && spr.SPRITE_LIB.enemies.forest_spirit);
check('sprite.SPRITE_LIB.npc',    spr.SPRITE_LIB.npc && spr.SPRITE_LIB.npc.child);
check('sprite.SPRITE_LIB.boss',   spr.SPRITE_LIB.boss && spr.SPRITE_LIB.boss.forest_keeper);
check('sprite.SPRITE_LIB.icons',  spr.SPRITE_LIB.icons && spr.SPRITE_LIB.icons.dew);
check('sprite.SPRITE_LIB.skills', spr.SPRITE_LIB.skills);
check('sprite.SPRITE_LIB.tiles',  spr.SPRITE_LIB.tiles);
check('sprite.SPRITES present',   typeof spr.SPRITES === 'object');
check('sprite.makeSprite fn',     typeof spr.makeSprite === 'function');
check('sprite.flipH fn',          typeof spr.flipH === 'function');
check('sprite.recolor fn',        typeof spr.recolor === 'function');

// 6. scenes/classSelect.js
const cs = await import(url('src/scenes/classSelect.js'));
check('classSelect.js imports', typeof cs === 'object' && cs !== null);
check('classSelect.ClassSelectScene is class', typeof cs.ClassSelectScene === 'function');

// 7. scenes/skillTree.js
const sk = await import(url('src/scenes/skillTree.js'));
check('skillTree.js imports', typeof sk === 'object' && sk !== null);
check('skillTree.SkillTreeScene is class', typeof sk.SkillTreeScene === 'function');

// 8. scenes/conversion.js
const cv = await import(url('src/scenes/conversion.js'));
check('conversion.js imports', typeof cv === 'object' && cv !== null);
check('conversion.ConversionScene is class', typeof cv.ConversionScene === 'function');

// ─── 节点 assert.ok 兜底断言(todo 要求 ≥5) ───
assert.ok(balance.ENEMY_DATA, 'ENEMY_DATA must exist');
assert.ok(balance.SKILL_BASE, 'SKILL_BASE must exist');
assert.ok(st.freshState,      'freshState must exist');
assert.ok(spr.SPRITE_LIB,     'SPRITE_LIB must exist');
assert.ok(cs.ClassSelectScene, 'ClassSelectScene must exist');
assert.ok(sk.SkillTreeScene,  'SkillTreeScene must exist');
assert.ok(cv.ConversionScene, 'ConversionScene must exist');

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);