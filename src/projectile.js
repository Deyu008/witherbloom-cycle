// projectile.js — 抛射物(玩家回声 / 敌人弹)
export class Projectile {
  constructor(x, y, opts = {}, world = null) {
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
    this.hit = new Set();
    this.dead = false;
    this.tail = [];
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
      this.tail.push({ x: this.x, y: this.y });
      if (this.tail.length > 8) this.tail.shift();
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
    const s = cam.worldToScreen(this.x, this.y);
    for (let i = 0; i < this.tail.length; i++) {
      const p = this.tail[i];
      const ss = cam.worldToScreen(p.x, p.y);
      ctx.globalAlpha = (i / this.tail.length) * 0.6;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(ss.x, ss.y, this.radius * (i / this.tail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.type === 'echo') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, this.radius * 2.2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, this.color);
      grad.addColorStop(1, 'rgba(183,140,224,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, this.radius * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, this.radius, 0, Math.PI * 2); ctx.fill();
    }
  }
}
