// main.js — 游戏入口与启动器
import { boot } from './boot.js';
import { Game } from './game.js';

// 引导流程
const canvas = document.getElementById('game');
const bootEl = document.getElementById('boot');
const bootBar = document.getElementById('bootBar');
const bootMsg = document.getElementById('bootMsg');

function setBoot(pct, msg) {
  bootBar.style.width = (pct * 100).toFixed(0) + '%';
  if (msg) bootMsg.textContent = msg;
}

// 自适应缩放:canvas 逻辑分辨率固定 1280×720,按视口等比 contain 缩放(仅改 CSS 尺寸),
// 配合 image-rendering: pixelated 保持像素清晰。
// 像素稳定:≥1 时取整数倍(避免最近邻采样造成像素宽窄交替/移动闪烁);
// 小窗(手机)允许 0.5 步进,保证不至于太小。可用区从 #stage-inner 读(扣掉 safe-area 内边距)。
function resizeCanvas() {
  const box = document.getElementById('stage-inner');
  const vw = (box ? box.clientWidth : window.innerWidth) || window.innerWidth;
  const vh = (box ? box.clientHeight : window.innerHeight) || window.innerHeight;
  let scale = Math.min(vw / canvas.width, vh / canvas.height);
  if (scale >= 1) scale = Math.max(1, Math.floor(scale));
  else scale = Math.max(0.25, Math.floor(scale * 2) / 2);
  canvas.style.width = (canvas.width * scale) + 'px';
  canvas.style.height = (canvas.height * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// 异步加载资源与启动
(async () => {
  try {
    setBoot(0.05, '正在唤醒王树…');
    await new Promise(r => setTimeout(r, 120));

    setBoot(0.15, '编织四时循环…');
    const game = new Game(canvas);
    window.game = game; // 暴露给开发/调试
    await game.init((p, msg) => setBoot(0.15 + p * 0.8, msg));

    setBoot(1.0, '完成。');
    await new Promise(r => setTimeout(r, 220));

    // 淡出启动屏
    bootEl.style.opacity = '0';
    setTimeout(() => {
      bootEl.style.display = 'none';
      game.start();
    }, 600);

  } catch (err) {
    console.error('启动失败:', err);
    bootMsg.textContent = '启动失败: ' + err.message;
    bootMsg.style.color = '#e85858';
  }
})();
