// preview_ui.mjs — UI 套件 mock 预览
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { panel, bar, slot, dialogBox, bossFrame, minimapFrame } from '../src/uiKit.js';
const W = 1280, H = 720;
const c = createCanvas(W, H);
const ctx = c.getContext('2d');
// 背景(模拟游戏画面)
const g = ctx.createLinearGradient(0, 0, 0, H);
g.addColorStop(0, '#1a3340'); g.addColorStop(1, '#0c0a14');
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
for (let i = 0; i < 200; i++) { ctx.fillStyle = 'rgba(111,184,114,' + (Math.random()*0.15) + ')'; ctx.fillRect(Math.random()*W, Math.random()*H, 24, 24); }

// 左上 HP/MP/XP 面板
panel(ctx, 12, 14, 292, 92, { accent: 'rgba(183,140,224,0.35)' });
bar(ctx, 18, 32, 280, 14, 0.72, '#d65858', { ticks: 4 });
bar(ctx, 18, 62, 280, 14, 0.55, '#6c8ee0', { ticks: 4 });
bar(ctx, 18, 84, 280, 6, 0.4, '#d8b04a');

// 目标面板
panel(ctx, 18, 122, 300, 70, { accent: 'rgba(224,183,106,0.5)' });

// 技能栏
panel(ctx, W/2 - 148, H - 26 - 48 - 14, 296, 60, { accent: 'rgba(183,140,224,0.3)', cornerLen: 4 });
for (let i = 0; i < 5; i++) slot(ctx, W/2 - 142 + i * 58, H - 26 - 48 - 8, 48, { ready: i === 0 });

// 小地图
minimapFrame(ctx, W - 152, H - 122, 140, 90);
ctx.fillStyle = 'rgba(183,140,224,0.8)'; ctx.beginPath(); ctx.arc(W - 82, H - 77, 3, 0, 7); ctx.fill();

// Boss 血条
bossFrame(ctx, W/2 - 318, 104, 636, 62, '#e87a3c');
bar(ctx, W/2 - 310, 130, 620, 16, 0.66, '#e87a3c');

// 对话框
dialogBox(ctx, 40, H - 200, W - 80, 180);

writeFileSync('/root/projects/html-game/assets/ui_preview.png', c.toBuffer('image/png'));
console.log('ui preview saved');
