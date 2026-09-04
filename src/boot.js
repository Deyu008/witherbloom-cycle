// boot.js — 启动流程
// 实际启动在 main.js 中,这里导出 boot 供测试或主入口代理
export function boot(canvas) {
  return import('./game.js').then(m => new m.Game(canvas));
}
