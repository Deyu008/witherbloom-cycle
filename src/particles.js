// particles.js — 粒子系统
// 优化:update 用写指针原地压缩(无 splice);render 按 additive/普通分两 pass 批量
// 绘制(最多切一次 globalCompositeOperation)+ 视口剔除 + 内联坐标(零对象分配);
// emit 从空闲池复用粒子结构体 —— 战斗中每秒数百次发射也不再产生新对象。
// 空气阻尼按秒而非按帧(60fps 基准 0.96/帧)。
const AIR_K = -Math.log(0.96) * 60;

export class ParticleSystem {
  constructor() { this.particles = []; this._free = []; }

  emit(opts) {
    // opts: { x, y, vx, vy, life, color, size, gravity?, fade?, type? }
    const n = opts.count || 1;
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 600) break; // 性能上限
      const a = (opts.angle ?? Math.random() * Math.PI * 2) + (opts.spread ? (Math.random() - 0.5) * opts.spread : 0);
      const sp = (opts.speed ?? 100) * (0.5 + Math.random() * 0.5);
      const p = this._free.pop() || {};
      p.x = opts.x; p.y = opts.y;
      p.vx = Math.cos(a) * sp + (opts.vx ?? 0);
      p.vy = Math.sin(a) * sp + (opts.vy ?? 0);
      p.life = opts.life ?? 0.6;
      p.maxLife = opts.life ?? 0.6;
      p.color = opts.color ?? '#fff';
      p.size = opts.size ?? 3;
      p.gravity = opts.gravity ?? 0;
      p.fade = opts.fade !== false;
      p.type = opts.type ?? 'square'; // 'square' | 'circle' | 'spark'
      p.rot = opts.rot ?? 0;
      p.rotV = opts.rotV ?? 0;
      p.shrink = opts.shrink ?? false;
      p.additive = opts.additive ?? false;
      this.particles.push(p);
    }
  }

  update(dt) {
    const ps = this.particles;
    const air = Math.exp(-AIR_K * dt);
    let w = 0; // 写指针:存活粒子原地压缩,避免 splice 的 O(n) 移位
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { this._free.push(p); continue; } // 回空闲池,写指针不推进
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= air;
      p.vy *= air;
      p.rot += p.rotV * dt;
      ps[w++] = p;
    }
    ps.length = w;
  }

  render(ctx, cam) {
    const ps = this.particles;
    if (ps.length === 0) return;
    const ox = -cam.x + cam.shakeX, oy = -cam.y + cam.shakeY;
    const VW = cam.viewW, VH = cam.viewH;
    ctx.globalCompositeOperation = 'source-over';
    // 两 pass:先普通(source-over),再 additive(lighter),减少合成模式切换
    for (let pass = 0; pass < 2; pass++) {
      const wantAdd = pass === 1;
      let switched = false;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        if ((p.additive === true) !== wantAdd) continue;
        // 视口剔除
        const px = p.x + ox, py = p.y + oy;
        if (px < -16 || px > VW + 16 || py < -16 || py > VH + 16) continue;
        if (wantAdd && !switched) { ctx.globalCompositeOperation = 'lighter'; switched = true; }
        const a = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
        const sz = p.shrink ? p.size * (0.3 + a * 0.7) : p.size;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        if (p.type === 'square') {
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        } else if (p.type === 'circle') {
          ctx.beginPath();
          ctx.arc(px, py, sz / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'spark') {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot);
          ctx.fillRect(-sz, -sz / 4, sz * 2, sz / 2);
          ctx.restore();
        }
      }
      if (switched) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    for (const p of this.particles) this._free.push(p);
    this.particles.length = 0;
  }
}
