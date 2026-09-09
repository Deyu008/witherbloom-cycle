// data/shop.js — 旅商货架(金币消耗出口)
// 纯数据+纯函数,UI 在 scenes/shop.js;测试直接覆盖本模块。
//
// 设计:敌人掉金/Boss+100/跳过祝福+50 有了去处;价格按"约 30 只小怪的金币
// 换一件消耗品"校准,碎片偏贵(保底型资源,不鼓励囤)。

export const SHOP_ITEMS = [
  {
    id: 'dew', name: '露珠', icon: 'dew', price: 30, color: '#8ad0e0',
    desc: '随身携带,F 键饮用回复生命',
  },
  {
    id: 'ember', name: '余烬', icon: 'ember', price: 25, color: '#e87a3c',
    desc: '回蓝余烬;拾取即回 15 法力,也可 2:1 转换',
  },
  {
    id: 'leaf', name: '枯叶', icon: 'leaf', price: 60, color: '#a8d860',
    desc: '技能就绪;立即重置全部技能冷却',
  },
  {
    id: 'shard', name: '根者碎片', icon: 'shard', price: 150, color: '#b78ce0',
    desc: '回响树的钥匙;升级技能所需的碎片',
  },
];

// 购买结算:返回 { ok, msg } —— 纯函数,副作用由调用方落地
export function buyItem(item, gold) {
  if (!item) return { ok: false, msg: '没有这件货' };
  if (gold < item.price) return { ok: false, msg: `金币不足 · 需要 ${item.price}` };
  return { ok: true, msg: `买了 ${item.name} · -${item.price} 金` };
}

// 应用到 state/player(leaf 顺带重置冷却,与地图拾取行为一致)
export function applyPurchase(item, state, player) {
  if (item.id === 'dew') state.dew = (state.dew || 0) + 1;
  else if (item.id === 'ember') { state.ember = (state.ember || 0) + 1; state.mp = Math.min(state.maxMp, state.mp + 15); }
  else if (item.id === 'leaf') {
    state.leaf = (state.leaf || 0) + 1;
    for (const k of Object.keys(state.skills)) state.skills[k].currentCd = 0;
    if (player) { player.skillRecallCd = 0; player.skillShieldCd = 0; player.skillEchoCd = 0; }
  } else if (item.id === 'shard') state.shards = (state.shards || 0) + 1;
}
