// enemy.js — 普通敌人 AI(俯视角,中心坐标)
import { Entity } from './entity.js';
import { SPRITE_LIB } from './sprite.js';
import { Projectile } from './projectile.js';
import { state } from './state.js';
import { ENEMY_DATA, DROP_RATES, COMBAT } from './data/balance.js';

export class Enemy extends Entity {
  constructor(x, y, type, opts = {}) {
    const data = ENEMY_DATA[type] || ENEMY_DATA.forest_spirit;
    const spriteSet = SPRITE_LIB.enemies[type] || SPRITE_LIB.enemies.forest_spirit;
    // 精英:体型更大、血更厚、伤害更高、掉落翻倍(金紫色光环标示)
    const elite = !!opts.elite;
    super(x, y, {
      hp: Math.round((opts.hp ?? data.hp) * (elite ? COMBAT.eliteHpMul : 1)),
      w: 18, h: 18,
      drawW: data.size * (elite ? COMBAT.eliteSizeMul : 1),
      drawH: data.size * (elite ? COMBAT.eliteSizeMul : 1),
      team: 'enemy',
      sprites: { idle: spriteSet, walk: spriteSet, attack: spriteSet, hurt: spriteSet },
    });
    this.type = type;
    this.data = data;
    this.elite = elite;
    this.dmg = Math.round(data.dmg * (elite ? COMBAT.eliteDmgMul : 1));
    this.speed = data.speed;
    this.aiType = data.ai;
    this.attackRange = data.range ?? 34;
    this.alertRange = 260;
    this.world = opts.world || null;
    this.target = null;
    this.alerted = false;
    this.alertFade = 0; // 警觉标记可见时间
    this.patrolDir = Math.random() * Math.PI * 2;
    this.patrolT = 0;
    this.attackCooldown = 0.6 + Math.random() * 0.8;
    // 攻击前摇:出手前蓄力闪烁,给玩家留出反应窗口(近战 0.35s / 远程 0.25s)
    this.windup = 0;
    this.windupDur = this.aiType === 'ranged' ? 0.25 : 0.35;
    // 冲锋型(charge):中距离蓄力 0.5s 后直线突进
    this.canCharge = !!data.charge;
    this.chargeCd = 0;
    this.chargeWindup = 0;
    this.chargeTime = 0;
    this.chargeVx = 0; this.chargeVy = 0;
    // 绕行相位:追击时叠加垂直正弦摆动,避免多只挤成一列"贪吃蛇"
    this.strafePhase = Math.random() * Math.PI * 2;
    this.strafeSpeed = COMBAT.strafeFreq * (0.8 + Math.random() * 0.5);
    this.facingRight = true;
    this.id = opts.id ?? `e_${Math.floor(Math.random() * 1e6)}`;
    this._roomRef = null;   // 所属房间(场景做房间肃清结算)
    this._ambush = !!opts.ambush; // 刻印守护战刷出的伏兵(全灭有额外奖励)
    // 精英词缀:狂热(攻速移速)/爆裂(死亡延时爆炸)/守御(周期护盾)——精英从数值棒变成"一种谜题"
    this.affix = null;
    this._wardCd = 0;
    if (this.elite) {
      this.affix = ['frenzy', 'volatile', 'ward'][Math.floor(Math.random() * 3)];
      if (this.affix === 'frenzy') {
        this.speed = Math.round(this.speed * 1.3);
        this.windupDur *= 0.72;   // 前摇更短(仍 ≥0.18s,可反应)
        this._atkMul = 0.55;      // 攻击间隔缩短
      }
      if (this.affix === 'ward') this._wardCd = 4 + Math.random() * 2;
    }
  }

  update(dt, game) {
    if (!this.alive) return;
    const world = this.world || game?.current?.world;
    if (world && (!this.target || !this.target.alive)) this.target = world.player;
    if (this.alertFade > 0) this.alertFade -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        // 前摇结束:命中判定在此刻结算(前摇期间玩家拉开距离可完全闪避)
        this._resolvePendingAttack(game);
        const base = this._pendingShot ? 1.3 + Math.random() * 0.6 : 0.9 + Math.random() * 0.5;
        this.attackCooldown = base * (this._atkMul || 1);
      }
    }
    // 守御词缀:周期性获得 1.4s 无敌微光(有明显的青色护罩读条感)
    if (this.affix === 'ward') {
      this._wardCd -= dt;
      if (this._wardCd <= 0) {
        this._wardCd = 6.5;
        this.invulnerable = Math.max(this.invulnerable, 1.4);
        if (game?.particles) {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            game.particles.emit({ x: this.x + Math.cos(a) * 20, y: this.y + Math.sin(a) * 14, vx: 0, vy: -18, life: 0.6, color: '#7ac8e8', size: 3, type: 'circle', fade: true, additive: true });
          }
        }
      }
    }
    if (this.chargeCd > 0) this.chargeCd -= dt;
    // 入场/复活宽限内不主动仇恨(world.spawnGrace 由 GameScene 倒计时);
    // 已被攻击激怒(takeDamage)的敌人不受影响,保证还手仍会引来围攻。
    if (this.target?.alive && this.distance(this.target) < this.alertRange && !(world?.spawnGrace > 0)) {
      if (!this.alerted) this.alertFade = 2;
      this.alerted = true;
    }
    if (this.stunTime > 0 || this.knockbackTime > 0) { super.update(dt); return; }
    // 冲锋位移(独立于 AI 走位;仍由 world.physics 做墙碰撞)
    if (this.chargeTime > 0) {
      this.chargeTime -= dt;
      this.dx += this.chargeVx * dt;
      this.dy += this.chargeVy * dt;
      this.animState = 'attack';
      if (game?.particles && Math.random() < 0.5) {
        game.particles.emit({
          x: this.x, y: this.y + 8, vx: -this.chargeVx * 0.15, vy: -this.chargeVy * 0.15,
          life: 0.3, color: this.data.color, size: 3, type: 'square', fade: true, shrink: true,
        });
      }
      // 冲锋路径上撞到玩家 → 伤害并结束冲锋
      if (this.target?.alive && this.distance(this.target) < 30) {
        this.target.takeDamage(this.dmg, this.x, this.y);
        if (game?.audio) game.audio.sfxHurt();
        this.chargeTime = 0;
      }
      super.update(dt);
      return;
    }
    this._runAi(dt, game);
    super.update(dt);
  }

  _runAi(dt, game) {
    if (this.alerted && this.target?.alive) {
      const d = this.distance(this.target);
      const dxr = this.target.x - this.x, dyr = this.target.y - this.y;
      this.facingRight = dxr >= 0;
      this.strafePhase += dt * this.strafeSpeed;
      // 冲锋型:距离 90-220 且冷却好了 → 蓄力 0.5s(闪烁)后直线突进
      if (this.canCharge && this.chargeCd <= 0 && this.chargeWindup <= 0 && d > 90 && d < 220) {
        this.chargeWindup = 0.5;
      }
      if (this.chargeWindup > 0) {
        this.chargeWindup -= dt;
        this.vx = 0; this.vy = 0;
        this.animState = 'attack'; // 蓄力姿态(渲染层配合闪烁)
        if (this.chargeWindup <= 0) {
          const dd = Math.hypot(dxr, dyr) || 1;
          this.chargeVx = (dxr / dd) * 380;
          this.chargeVy = (dyr / dd) * 380;
          this.chargeTime = 0.42;
          this.chargeCd = 3.2 + Math.random() * 1.2;
          if (game?.audio) game.audio.sfxDash();
        }
        return;
      }
      if (this.aiType === 'ranged') {
        if (d > this.attackRange) this._steer(dxr, dyr, d, 1);
        else if (d < this.attackRange * 0.45) this._steer(dxr, dyr, d, -0.6);
        else { this.vx = 0; this.vy = 0; this.animState = 'idle'; }
        this._tryAttack(game);
      } else { // melee / tank
        if (d > 26) this._steer(dxr, dyr, d, 1);
        else { this.vx = 0; this.vy = 0; this.animState = 'attack'; }
        this._tryAttack(game);
      }
    } else {
      // 巡逻(缓慢随机游走)
      this.patrolT -= dt;
      if (this.patrolT <= 0) {
        this.patrolDir = Math.random() * Math.PI * 2;
        this.patrolT = 1.5 + Math.random() * 2.5;
      }
      this.vx = Math.cos(this.patrolDir) * this.speed * 0.25;
      this.vy = Math.sin(this.patrolDir) * this.speed * 0.25;
      this.facingRight = this.vx >= 0;
      this.animState = 'walk';
    }
  }

  _steer(dxr, dyr, d, mul) {
    const nx = dxr / (d || 1), ny = dyr / (d || 1);
    // 垂直正弦绕行:群体包抄不叠影;贴近(≤50px)摆幅归零,保证照样咬人
    const w = Math.sin(this.strafePhase) * COMBAT.strafeAmp
      * Math.max(0, Math.min(1, (d - 50) / 140));
    this.vx = (nx + -ny * w) * this.speed * mul;
    this.vy = (ny + nx * w) * this.speed * mul;
    this.animState = 'walk';
  }

  _tryAttack(game) {
    if (this.attackCooldown > 0 || this.windup > 0) return;
    const world = this.world;
    if (!this.target?.alive) return;
    const d = this.distance(this.target);
    if (this.aiType === 'ranged') {
      if (d > this.attackRange) return;
      // 前摇:先蓄力闪烁,窗口结束后才出弹(期间玩家可打断/闪避)
      this.windup = this.windupDur;
      this._pendingShot = true;
    } else {
      if (d > 30) return;
      this.windup = this.windupDur;
      this._pendingShot = false;
    }
  }

  // 前摇结束帧由 update 统一结算(见 update 内 windup 归零分支)
  _resolvePendingAttack(game) {
    if (!this.target?.alive) return;
    const d = this.distance(this.target);
    const world = this.world;
    if (this._pendingShot) {
      if (d <= this.attackRange * 1.15) { // 前摇期间玩家逃出射程则落空
        const dxr = this.target.x - this.x, dyr = this.target.y - this.y;
        const dd = Math.hypot(dxr, dyr) || 1;
        const proj = new Projectile(this.x, this.y, {
          vx: (dxr / dd) * 200, vy: (dyr / dd) * 200,
          damage: this.dmg, team: 'enemy', life: 1.6,
          color: this.data.color, radius: 6, type: 'enemy',
          side: 'enemy', source: this,
        }, world);
        world.projectiles.push(proj);
      }
    } else if (d <= 40) {
      this.target.takeDamage(this.dmg, this.x, this.y);
      game.audio.sfxHurt();
    }
  }

  takeDamage(amount, fromX, fromY, knockback = 0) {
    super.takeDamage(amount, fromX, fromY, knockback);
    this.alerted = true; this.alertFade = 2;
    return amount;
  }

  // 由场景在死亡时调用
  onKilled(game) {
    game.spawnDeathParticles(this.x, this.y, this.data.color);
    // 灵魂飘散:缓慢上升的微光,给死亡一个"回声离去"的余韵
    if (game?.particles) {
      for (let i = 0; i < 5; i++) {
        game.particles.emit({
          x: this.x + (Math.random() - 0.5) * 14, y: this.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 16, vy: -30 - Math.random() * 26,
          life: 1.1 + Math.random() * 0.5, color: '#e8e0ff', size: 3,
          type: 'circle', fade: true, additive: true,
        });
      }
      // 死亡冲击环:高血量/精英敌人倒地时向外扩散一圈光尘
      const boomWorthy = this.elite || this.maxHp >= COMBAT.killShakeMinHp;
      if (boomWorthy) {
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2;
          game.particles.emit({
            x: this.x, y: this.y,
            vx: Math.cos(a) * 240, vy: Math.sin(a) * 120,
            life: 0.5, color: this.data.color, size: 4,
            type: 'circle', fade: true, additive: true, shrink: true,
          });
        }
        game.camera.shake(this.elite ? 7 : 5, 0.28);
      }
    }
    // 掉落(精英:收益×3 并保底一枚枯叶)
    const rewardMul = this.elite ? COMBAT.eliteRewardMul : 1;
    for (const drop of DROP_RATES) {
      if (Math.random() < drop.chance) this.world.spawnLoot(this.x, this.y, drop.type);
    }
    if (this.elite) {
      this.world.spawnLoot(this.x, this.y, 'leaf');
      this.world.spawnLoot(this.x, this.y, 'gold');
      game.spawnFloatText(this.x, this.y - 44, '精英已灭!', '#ffcf4d', { px: 20, vy: 46, life: 1.2 });
    }
    state.xp += this.data.xp * rewardMul;
    state.gold += this.data.gold * rewardMul;
    state.stats.kills += 1;
    if (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level += 1;
      state.xpToNext = Math.floor(state.xpToNext * 1.5);
      state.maxHp += 10; state.maxMp += 5;
      state.hp = state.maxHp;
      if (game.current?.player) { game.current.player.maxHp = state.maxHp; game.current.player.hp = state.maxHp; }
      game.audio.sfxChapter();
      // 升级庆典围绕玩家绽放(原版在敌人尸体上金光,出戏)
      const p = game.current?.player;
      const px = p ? p.x : this.x, py = p ? p.y : this.y;
      game.spawnLevelUpParticles(px, py);
      game.spawnFloatText(px, py - 46, `升级! Lv ${state.level}`, '#e0b76a', { px: 24, vy: 46, life: 1.4 });
      game._banner = { text: `◆ 等级提升 · Lv ${state.level} ◆`, color: '#e0b76a', life: 2 };
    }
  }

  // 程序化动作:让单帧贴图"活"起来(颠步/蓄力下蹲/冲锋拉伸/受击后仰/呼吸)
  _motion() {
    const m = { offX: 0, offY: 0, rot: 0, sx: 1, sy: 1 };
    const moving = Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1;
    if (this.windup > 0 || this.chargeWindup > 0) {
      // 蓄力:随进度下蹲压缩(身体本身在预告攻击,不只是白闪)
      const dur = this.windup > 0 ? this.windupDur : 0.5;
      const elapsed = this.windup > 0 ? dur - this.windup : 0.5 - this.chargeWindup;
      const p = Math.max(0, Math.min(1, elapsed / dur));
      m.sy = 1 - 0.18 * p;
      m.sx = 1 + 0.12 * p;
      m.offY = 2 * p;
    } else if (this.chargeTime > 0) {
      // 冲锋:沿冲锋轴拉长成箭矢 + 前倾
      const horiz = Math.abs(this.chargeVx) >= Math.abs(this.chargeVy);
      m.sx = horiz ? 1.2 : 0.86;
      m.sy = horiz ? 0.86 : 1.2;
      m.rot = 0.08 * (this.chargeVx >= 0 ? 1 : -1);
    } else if (this.knockbackTime > 0) {
      // 受击后仰:朝击退方向倾 + 缩一下
      m.rot = 0.12 * (this.knockbackX >= 0 ? 1 : -1) * (this.facingRight ? -1 : 1);
      m.sx = 0.94; m.sy = 0.94;
    } else if (moving) {
      // 移动:颠步(上下弹跳 + 左右摇摆)
      const w = this.animTime * 11;
      m.offY -= Math.abs(Math.sin(w)) * 2.0;
      m.rot = Math.sin(w) * 0.05;
    } else {
      // 待机呼吸
      m.sy = 1 + 0.025 * Math.sin(this.animTime * 2.4);
    }
    return m;
  }

  render(ctx, cam) {
    // 精英光环:脚下金紫脉冲椭圆(远远就能认出"这只不一样")
    if (this.elite) {
      const s0 = cam.worldToScreen(this.x, this.sortY);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.5 + 0.22 * Math.sin(performance.now() * 0.005);
      const r = this.drawW * 0.62;
      const grad = ctx.createRadialGradient(s0.x, s0.y, 0, s0.x, s0.y, r);
      grad.addColorStop(0, `rgba(255,207,77,${0.3 * pulse})`);
      grad.addColorStop(1, 'rgba(183,140,224,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(s0.x, s0.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (!this.alive) return;
    this.renderWithMotion(ctx, cam, this._motion());
    // 精英头顶菱形 + 词缀色点(狂热红/爆裂橙/守御青),在小地图上也会以金色显示
    if (this.elite) {
      const hs = cam.worldToScreen(this.x, this.sortY - this.drawH - 6);
      ctx.save();
      ctx.fillStyle = '#ffcf4d';
      ctx.beginPath();
      ctx.moveTo(hs.x, hs.y - 5); ctx.lineTo(hs.x + 4, hs.y);
      ctx.lineTo(hs.x, hs.y + 5); ctx.lineTo(hs.x - 4, hs.y);
      ctx.closePath(); ctx.fill();
      if (this.affix) {
        const affixCol = this.affix === 'frenzy' ? '#ff5050' : this.affix === 'volatile' ? '#ff9a4d' : '#7ac8e8';
        ctx.fillStyle = affixCol;
        ctx.beginPath(); ctx.arc(hs.x + 9, hs.y, 3, 0, Math.PI * 2); ctx.fill();
      }
      // 守御无敌:青色护罩弧
      if (this.affix === 'ward' && this.invulnerable > 0) {
        ctx.strokeStyle = 'rgba(122,200,232,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cam.worldToScreen(this.x, this.y).x, cam.worldToScreen(this.x, this.y).y, this.drawW * 0.6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    // 蓄力/前摇预警:白色快闪 + 身形抖动,提示即将出手
    if (this.windup > 0 || this.chargeWindup > 0) {
      const t = performance.now() * 0.02;
      const flash = Math.sin(t) > 0 ? 0.55 : 0.15;
      const s = cam.worldToScreen(this.x, this.y);
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, this.drawW * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 冲锋拖影提示:朝冲锋方向画一道警示线
    if (this.chargeWindup > 0 && this.target) {
      const s = cam.worldToScreen(this.x, this.y);
      const dxr = this.target.x - this.x, dyr = this.target.y - this.y;
      const dd = Math.hypot(dxr, dyr) || 1;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(performance.now() * 0.03);
      ctx.strokeStyle = this.data.color; ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + (dxr / dd) * 200, s.y + (dyr / dd) * 200);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // 警觉标记「!」
    if (this.alertFade > 0 && this.alive) {
      const s = cam.worldToScreen(this.x, this.sortY - this.drawH - 16);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.alertFade);
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 20px "Noto Sans CJK SC", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', s.x, s.y);
      ctx.restore();
    }
  }
}
