// projectile.js — 抛射物(玩家回声 / 敌人弹)
// 对象池:BOSS 弹幕战峰值 ~40 活弹,每秒 new 数百个 Projectile + 尾迹 {x,y}
// 是最大的 GC churn 源;池化 + 尾迹点复用后稳态零分配。
import { glowOf } from './fxCache.js';

export class Projectile {
  constructor(x, y, opts = {}, world = null) {
    this.hit = new Set();
    this.tail = [];
    this._tailSpare = []; // 尾迹点复用池
    this._init(x, y, opts, world);
  }

  // 池化复用入口:字段全部重写(与构造等价)
  _init(x, y, opts = {}, world = null) {
    this.x = x; this.y = y;
    this.vx = opts.vx ?? 0;
    this.vy = opts.vy ?? 0;
    this.radius = opts.radius ?? 5;
    this.damage = opts.damage ?? 10;
    this.team = opts.team ?? 'player';
    this.life = opts.life ?? 1.0;
    this.color = opts.color ?? '#fff';
    this.type = opts.type ?? 'default';
    this.pierce = opts.pierce ?? false;
    this.hit.clear();
    this.dead = false;
    while (this.tail.length) this._tailSpare.push(this.tail.pop());
    this.tailT = 0;
    this.world = world;
    this.source = opts.source ?? null; // 发射者(命中时跳过,避免自残)
    this.side = opts.side ?? (opts.team === 'player' ? 'player' : 'enemy');
  }

  update(dt, game) {
    const world = this.world;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.tailT += dt;
    if (this.tailT > 0.02) {
      this.tailT = 0;
      // 尾迹点对象复用:shift 出来的点进备池,下一节直接改写字段
      const pt = this._tailSpare.pop() || { x: 0, y: 0 };
      pt.x = this.x; pt.y = this.y;
      this.tail.push(pt);
      if (this.tail.length > 8) this._tailSpare.push(this.tail.shift());
    }
    if (!world) return;
    // 撞墙消散:弹体色小火花 + 极轻的落点音(BOSS 弹幕战满屏弹无声蒸发太干)
    if (world.solidAtPx(this.x, this.y)) {
      this.dead = true;
      if (game?.particles) {
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * 70;
          game.particles.emit({
            x: this.x, y: this.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.28, color: this.color, size: 3,
            type: 'circle', fade: true, shrink: true, additive: true,
          });
        }
        game.audio?.note?.(180, 0.04, 'sine', 0.03);
      }
      return;
    }
    // 命中(同阵营/中立/发射者本身都跳过 —— 修复 BOSS 被自己弹幕击杀)
    for (const e of world.entities) {
      if (!e.alive) continue;
      if (e === this.source || e.side === this.side || e.side === 'neutral') continue;
      if (this.hit.has(e)) continue;
      const rr = (e.w / 2) + this.radius;
      const dx = e.x - this.x, dy = e.y - this.y;
      if (dx * dx + dy * dy < rr * rr) {
        const dealt = e.takeDamage(this.damage, this.x, this.y, 40);
        if (game?.onDamageDealt) game.onDamageDealt(dealt || 0);
        if (this.side === 'player' && game?.audio) {
          game.audio.sfxHit();
          game.spawnFloatText(e.x, e.y - 34, `${Math.round(this.damage)}`, '#b78ce0');
        }
        this.hit.add(e);
        if (!this.pierce) { this.dead = true; return; }
      }
    }
  }

  render(ctx, cam) {
    // 标量坐标:弹本体 + 每个尾点不再各分配一个 {x,y}
    const ox = -cam.x + cam.shakeX, oy = -cam.y + cam.shakeY;
    const sxB = this.x + ox, syB = this.y + oy;
    for (let i = 0; i < this.tail.length; i++) {
      const p = this.tail[i];
      ctx.globalAlpha = (i / this.tail.length) * 0.6;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, this.radius * (i / this.tail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.type === 'echo') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // 预烘焙发光球(白色热核 + 弹体色),不再逐帧建渐变
      const d = this.radius * 4.4;
      ctx.globalAlpha = 1;
      ctx.drawImage(glowOf(this.color, '#ffffff'), sxB - d / 2, syB - d / 2, d, d);
      ctx.restore();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(sxB, syB, this.radius, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ===== 对象池(发射方用 acquire,场景清理时 release)=====
const _pool = [];
export const ProjectilePool = {
  acquire(x, y, opts = {}, world = null) {
    const p = _pool.pop() || new Projectile();
    p._init(x, y, opts, world);
    return p;
  },
  release(p) {
    if (p && _pool.length < 96) _pool.push(p);
  },
};
