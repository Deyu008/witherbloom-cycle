// test/state.test.mjs — 纯逻辑测试(todo 22)
// 测 freshState / applySave / persistState 的非 DOM 部分。
// persistState 走 localStorage,所以给 localStorage 一个最小 mock。

import assert from 'node:assert/strict';

// ─── localStorage mock ───
const lsStore = new Map();
globalThis.localStorage = {
  getItem: (k) => lsStore.has(k) ? lsStore.get(k) : null,
  setItem: (k, v) => { lsStore.set(k, String(v)); },
  removeItem: (k) => { lsStore.delete(k); },
};

// 走 file URL 让 node 把它当 ES module 解析
const STATE_URL = 'file://' + process.cwd() + '/src/state.js';
const st = await import(STATE_URL);

// ─── Test harness ───
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

function resetStore() { lsStore.clear(); }

console.log('\n=== Test 1: freshState() 默认值 ===');
{
  const s = st.freshState();
  check('hp === 100', s.hp === 100, `got ${s.hp}`);
  check('maxHp === 100', s.maxHp === 100, `got ${s.maxHp}`);
  check('skills is object', s.skills && typeof s.skills === 'object');
  check('skills has 6 keys', Object.keys(s.skills).length === 6, `got ${Object.keys(s.skills).length}: ${Object.keys(s.skills).join(',')}`);
  check('skills.slash present', typeof s.skills.slash === 'object');
  check('collected.lullaby is false', s.collected.lullaby === false);
  check('collected.seventhCrest is false', s.collected.seventhCrest === false);
  check('collected.mirrorEye is false', s.collected.mirrorEye === false);
  check('unlockedChapters starts with [1]', Array.isArray(s.unlockedChapters) && s.unlockedChapters[0] === 1);
}

console.log('\n=== Test 2: applySave({hp:50}) 合并语义 ===');
{
  // 先把 state 改成非默认值,确认 applySave 会重置
  st.state.hp = 7;
  st.state.gold = 9999;
  st.applySave({ hp: 50 });
  check('state.hp from save === 50', st.state.hp === 50, `got ${st.state.hp}`);
  check('state.maxHp === 100 (fresh default, not from save)', st.state.maxHp === 100, `got ${st.state.maxHp}`);
  check('state.gold === 0 (fresh default, save did not specify)', st.state.gold === 0, `got ${st.state.gold}`);
  check('state.skills has all 6 keys', Object.keys(st.state.skills).length === 6);
  check('state.skills.heal present', typeof st.state.skills.heal === 'object');
  check('state.fromSave cleared', st.state.fromSave === null);
}

console.log('\n=== Test 3: applySave({}) 完全 fresh ===');
{
  st.state.hp = 42;
  st.state.gold = 7777;
  st.state.flags = { boss1_defeated: true };
  st.applySave({});
  check('empty save resets hp to 100', st.state.hp === 100);
  check('empty save resets gold to 0', st.state.gold === 0);
  check('empty save resets flags to {}', Object.keys(st.state.flags).length === 0);
  check('empty save keeps skills intact (6 keys)', Object.keys(st.state.skills).length === 6);
}

console.log('\n=== Test 4: SaveSystem.save 只写槽位 key(不再有无槽位后缀的死 key) ===');
{
  resetStore();
  const SAVE_URL = 'file://' + process.cwd() + '/src/save.js';
  const { SaveSystem } = await import(SAVE_URL);
  st.applySave({});
  st.state.hp = 77;
  const sys = new SaveSystem();
  sys.save(0);
  const slot0 = lsStore.get('witherbloom_save_0');
  check('localStorage has witherbloom_save_0 key', slot0 !== null && typeof slot0 === 'string');
  check('bare witherbloom_save key NOT written', lsStore.get('witherbloom_save') == null);
  const parsed = JSON.parse(slot0);
  check('saved JSON has hp field === 77', parsed.hp === 77, `got ${parsed.hp}`);
  check('saved JSON has maxHp field === 100', parsed.maxHp === 100, `got ${parsed.maxHp}`);
  check('saved JSON has _timestamp', typeof parsed._timestamp === 'number');
  check('saved JSON has skills object', parsed.skills && Object.keys(parsed.skills).length === 6);
  check('saved JSON has schemaVersion', parsed.schemaVersion === 1);
}

console.log('\n=== Test 5: 重复 save 覆盖同槽位并刷新 timestamp ===');
{
  resetStore();
  const SAVE_URL = 'file://' + process.cwd() + '/src/save.js';
  const { SaveSystem } = await import(SAVE_URL);
  st.applySave({});
  const sys = new SaveSystem();
  st.state.hp = 11;
  sys.save(0);
  const first = JSON.parse(lsStore.get('witherbloom_save_0'));
  // 至少等 2ms 确保 timestamp 数值不同
  await new Promise(r => setTimeout(r, 5));
  st.state.hp = 22;
  sys.save(0);
  const second = JSON.parse(lsStore.get('witherbloom_save_0'));
  check('second persist overwrites hp to 22', second.hp === 22);
  check('second persist has later or equal _timestamp', second._timestamp >= first._timestamp);
}

console.log('\n=== Test 6: node:assert 兜底断言(todo 要求 ≥5) ===');
{
  assert.ok(typeof st.freshState === 'function', 'freshState must be function');
  assert.ok(typeof st.applySave === 'function', 'applySave must be function');
  assert.ok(typeof st.state === 'object' && st.state !== null, 'state must be object');
  // 直接调 freshState 兜底
  const fresh = st.freshState();
  assert.ok(fresh.hp === 100, 'fresh hp');
  assert.ok(Object.keys(fresh.skills).length === 6, 'fresh skills count');
  assert.ok(fresh.collected && 'lullaby' in fresh.collected, 'collected.lullaby present');
  assert.ok(fresh.collected && 'seventhCrest' in fresh.collected, 'collected.seventhCrest present');
  assert.ok(fresh.collected && 'mirrorEye' in fresh.collected, 'collected.mirrorEye present');
}

console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);