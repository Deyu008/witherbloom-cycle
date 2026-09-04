// test/aim.test.mjs — selectAimTarget 纯函数单测(自动瞄准近身优先规则)
// 无 DOM 依赖:直接 import player.js 会拉起 sprite/canvas 链,因此这里
// 用相同的 mock 策略(smoke.mjs 已验证的最小 stub)再 import。
import assert from 'node:assert/strict';

// ─── DOM mock(最小可工作,与 smoke.mjs 同构) ───
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
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => lsStore.has(k) ? lsStore.get(k) : null,
  setItem: (k, v) => { lsStore.set(k, String(v)); },
  removeItem: (k) => { lsStore.delete(k); },
};
class StubOscillator { connect(){} disconnect(){} start(){} stop(){} frequency = { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; type = ''; }
class StubGain { connect(){} disconnect(){} gain = { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){} }; }
class StubAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
  createOscillator() { return new StubOscillator(); }
  createGain()       { return new StubGain(); }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}
globalThis.AudioContext = StubAudioContext;
globalThis.webkitAudioContext = StubAudioContext;
globalThis.OfflineAudioContext = StubAudioContext;

const { selectAimTarget, PLAYER_BASE } = {
  ...(await import('../src/player.js')),
  ...(await import('../src/data/balance.js')),
};

// 敌人工厂:team boss/enemy 都算 side 'enemy'
const enemy = (id, x, y, alive = true) => ({ id, x, y, alive, team: 'enemy', get side() { return 'enemy'; } });
const friend = (id, x, y) => ({ id, x, y, alive: true, team: 'player', get side() { return 'player'; } });

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.error(`  FAIL  ${name}`); }
}

// 回归用例:贴脸敌人在背后(锥外),远处敌人在锥内 → 必须锁贴脸的
// (旧实现锁远处的,导致朝反方向挥空)
{
  const close = enemy('close', 100, 62, true);    // 玩家(100,100) 正上方 38px,锥外
  const far = enemy('far', 300, 100, true);       // 正右 200px,锥内
  const t = selectAimTarget(100, 100, 0, [close, far], 240, 130);
  check('贴脸锥外敌人优先于锥内远敌(回归)', t === close);
}

// 锥内近敌 vs 锥外更近但仍在 closeR 内:closeR 内最近者胜
{
  const a = enemy('a', 100, 30, true);   // 上方 70px,锥外,但在 closeR 内
  const b = enemy('b', 150, 100, true);  // 右方 50px,锥内
  const t = selectAimTarget(100, 100, 0, [a, b], 240, 130);
  check('closeR 内最近者胜(不挑方向)', t === b);
}

// 超出 closeR:前向锥生效,锥外近敌不锁(保留跑动手感)
{
  const behind = enemy('behind', 100, 240, true); // 下方 140px,锥外
  const front = enemy('front', 240, 100, true);   // 右方 140px,锥内
  const t = selectAimTarget(100, 100, 0, [behind, front], 520, 130);
  check('远距离锥内优先(锥外不锁)', t === front);
}

// 只有锥外敌人且超出 closeR → null(沿用移动方向)
{
  const behind = enemy('behind', 100, 260, true);
  const t = selectAimTarget(100, 100, 0, [behind], 520, 130);
  check('锥内无目标且不贴脸 → null', t === null);
}

// 死敌/友军忽略
{
  const dead = enemy('dead', 140, 100, false);
  const ally = friend('ally', 150, 100);
  const t = selectAimTarget(100, 100, 0, [dead, ally], 520, 130);
  check('忽略死亡敌人与友军', t === null);
}

// maxR 之外的锥内敌人不锁
{
  const far = enemy('far', 600, 100, true);
  const t = selectAimTarget(100, 100, 0, [far], 240, 130);
  check('超出 maxR 不锁', t === null);
}

// 被动法力回复基线存在且为正(player.update 使用)
check('PLAYER_BASE.mpRegen 为正数', typeof PLAYER_BASE.mpRegen === 'number' && PLAYER_BASE.mpRegen > 0);

console.log(`\n=== Aim: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
