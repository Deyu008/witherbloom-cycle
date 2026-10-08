// entity.js — 实体基类(俯视角,中心坐标模型)
// 摩擦系数(1/s):60fps 下的 0.86/帧 等价于 exp(-k·dt),k = -ln(0.86)×60
const ENTITY_FRICTION_K = -Math.log(0.86) * 60;
// 约定:
//   x, y = 实体中心(逻辑位置)
//   w, h = 碰撞框尺寸(以 x,y 为中心),应 ≤ 1 个地砖以便穿过单格缝隙
//   drawW, drawH = 精灵显示尺寸(独立于碰撞框,通常 > w,h)
//   dx, dy = 本帧意图位移(由 update 设置,由 world.physics 应用并做碰撞)
//   渲染:精灵底部对齐 (x, y + h/2),水平居中于 x;按 sortY 做深度排序
export class Entity {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.dx = 0; this.dy = 0; // 本帧位移意图(world.physics 消费)
    this.w = opts.w ?? 18; this.h = opts.h ?? 18;
    this.drawW = opts.drawW ?? 34;
    this.drawH = opts.drawH ?? 34;
    this.alive = true;
    this.hp = opts.hp ?? 50;
    this.maxHp = opts.hp ?? 50;
    this.team = opts.team ?? 'neutral'; // 'player' | 'enemy' | 'npc' | 'boss'
    this.invulnerable = 0;
    this.animTime = 0;
    this.animState = 'idle';
    this.animFrame = 0;
    this.animFps = 8;
    this.sprites = opts.sprites ?? null;
    this.id = opts.id ?? '';
    this.facingRight = true;
    this.stunTime = 0;
    this.knockbackTime = 0;
    this.knockbackX = 0; this.knockbackY = 0;
    this.hurtFlash = 0;
    this.attackCooldown = 0;
    this._dead = false; // 死亡是否已被场景处理
  }

  get centerX() { return this.x; }
  get centerY() { return this.y; }
  get sortY() { return this.y + this.h / 2; } // 用于深度排序(脚底)
  get left() { return this.x - this.w / 2; }
  get top() { return this.y - this.h / 2; }
  get rect() { return { x: this.left, y: this.top, w: this.w, h: this.h }; }
  // 阵营: player=玩家方, enemy=敌方(含普通敌人和 BOSS), neutral=中立(NPC,不可被攻击)
  get side() {
    if (this.team === 'player') return 'player';
    if (this.team === 'npc') return 'neutral';
    return 'enemy';
  }

  intersects(other) {
    return !(this.left + this.w <= other.left || other.left + other.w <= this.left ||
             this.top + this.h <= other.top || other.top + other.h <= this.top);
  }
  distance(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  takeDamage(amount, fromX, fromY, knockback = 0) {
    if (this.invulnerable > 0 || !this.alive) return 0;
    this.hp -= amount;
    this.hurtFlash = 0.18;
    // 受击硬直分层:伤害越高,硬直越久(敌人 AI 在 stunTime>0 时跳过 _runAi)
    if (amount > 15) this.stunTime = 0.3;
    else if (amount > 8) this.stunTime = 0.15;
    else this.stunTime = 0.08;
    if (knockback > 0) {
      const dx = this.x - fromX, dy = this.y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      this.knockbackTime = 0.16;
      this.knockbackX = (dx / d) * knockback;
      this.knockbackY = (dy / d) * knockback;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return amount;
  }
  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  // 子类重写:决定 vx,vy 与 dx,dy
  update(dt) {
    if (this.invulnerable > 0) this.invulnerable -= dt;
    if (this.stunTime > 0) this.stunTime -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.knockbackTime > 0) {
      this.knockbackTime -= dt;
      this.dx += this.knockbackX * dt * 6;
      this.dy += this.knockbackY * dt * 6;
    }
    // 默认把速度转成位移(子类可覆盖)
    this.dx += this.vx * dt;
    this.dy += this.vy * dt;
    // 摩擦按秒而非按帧(60fps 基准 0.86/帧;30fps 设备上原写法阻尼近乎翻倍)
    const fr = Math.exp(-ENTITY_FRICTION_K * dt);
    this.vx *= fr;
    this.vy *= fr;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    this.animTime += dt;
    if (this.sprites) {
      const set = this.sprites[this.animState] || this.sprites.idle;
      if (set && set.length > 0) {
        this.animFrame = Math.floor(this.animTime * this.animFps) % set.length;
      }
    }
  }

  // 选当前精灵(考虑左右翻转)
  currentSprite() {
    const set = this.sprites?.[this.animState] || this.sprites?.idle;
    if (!set || set.length === 0) return null;
    if (!this.facingRight && this.sprites.left) {
      const lset = this.sprites.left[this.animState] || this.sprites.left.idle;
      if (lset && lset.length) return lset[this.animFrame] || lset[0];
    }
    return set[this.animFrame] || set[0];
  }

  // 地面阴影(所有实体共用)
  drawShadow(ctx, cam) {
    const sx = cam.screenX(this.x), sy = cam.screenY(this.sortY);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(sx, sy, this.drawW * 0.42, this.drawW * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 受损血条(敌人用)
  drawHpBar(ctx, cam) {
    if (this.hp >= this.maxHp || this.team !== 'enemy') return;
    const sx = cam.screenX(this.x), sy = cam.screenY(this.sortY);
    const bw = Math.max(28, this.drawW * 0.8), bh = 4;
    const bx = sx - bw / 2, by = sy - this.drawH - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = '#d65858';
    ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), bh);
  }

  render(ctx, cam) {
    if (!this.alive) return;
    this.renderWithMotion(ctx, cam);
  }

  // ===== 通用动作变形绘制:m = { offX, offY, rot, sx, sy } =====
  // 阴影与血条不参与变形(贴地/贴 UI);子类算好动作参数传入即可。
  renderWithMotion(ctx, cam, m = {}) {
    const sx0 = cam.screenX(this.x), sy0 = cam.screenY(this.sortY);
    const offX = m.offX || 0, offY = m.offY || 0;
    const rot = m.rot || 0, sx = m.sx ?? 1, sy = m.sy ?? 1;
    this.drawShadow(ctx, cam);
    const need = offX !== 0 || offY !== 0 || rot !== 0 || sx !== 1 || sy !== 1;
    if (need) {
      ctx.save();
      ctx.translate(sx0 + offX, sy0 + offY); // 以脚底为轴心
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.translate(-sx0, -sy0);
      this.drawSpriteBody(ctx, cam);
      ctx.restore();
    } else {
      this.drawSpriteBody(ctx, cam);
    }
    this.drawHpBar(ctx, cam);
  }

  // 精灵本体(受击闪白;不含阴影/血条)
  drawSpriteBody(ctx, cam) {
    const sprite = this.currentSprite();
    if (!sprite) return;
    const sx = cam.screenX(this.x), sy = cam.screenY(this.sortY);
    const dx = sx - this.drawW / 2;
    const dy = sy - this.drawH;
    const flash = this.hurtFlash > 0;
    if (flash) ctx.globalAlpha = 0.85;
    ctx.drawImage(sprite, dx, dy, this.drawW, this.drawH);
    if (flash) {
      // 主画布 alpha:false 且已被不透明地图填满,直接 source-atop 等于 source-over;
      // 需在离屏画布上把精灵白化后整体贴回
      ctx.globalAlpha = 0.6;
      ctx.drawImage(whiteSprite(sprite, this.drawW, this.drawH), dx, dy, this.drawW, this.drawH);
      ctx.globalAlpha = 1;
    }
  }
}

// 受击闪白用离屏画布(模块级复用,不逐帧新建)
let _flashCv = null;
function whiteSprite(sprite, dw, dh) {
  const w = Math.max(1, Math.ceil(dw)), h = Math.max(1, Math.ceil(dh));
  if (!_flashCv) _flashCv = document.createElement('canvas');
  if (_flashCv.width !== w || _flashCv.height !== h) { _flashCv.width = w; _flashCv.height = h; }
  const c = _flashCv.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(sprite, 0, 0, w, h);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
  return _flashCv;
}
