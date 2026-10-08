// player.js — 玩家角色(俯视角,中心坐标)
import { Entity } from './entity.js';
import { state } from './state.js';
import { SPRITE_LIB } from './sprite.js';
import { Projectile } from './projectile.js';
import { PLAYER_BASE, CLASS_MODS, COMBAT, CLASS_THEME } from './data/balance.js';
import { computeBoonMods } from './data/boons.js';

// 纯函数:自动瞄准选目标。规则(修复"贴脸敌人朝反方向挥空"):
//  - 近身威胁(≤ closeR,约等于普攻判定盒前伸距离):最近者优先,不受朝向锥限制
//  - 远距离:只在面朝方向 ±60° 锥内选最近者,保留"跑动不甩枪"的手感
// 导出供 test/aim.test.mjs 直接单测(无 DOM 依赖)。
export function selectAimTarget(px, py, faceAngle, entities, maxR = 520, closeR = 130) {
  let bestClose = null, bestCloseD = closeR * closeR;
  let bestCone = null, bestConeD = maxR * maxR;
  for (const e of entities) {
    if (!e.alive || e.side !== 'enemy') continue;
    const dx = e.x - px, dy = e.y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestCloseD) { bestCloseD = d2; bestClose = e; }
    if (d2 < bestConeD) {
      let diff = Math.atan2(dy, dx) - faceAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= 1.047) { bestConeD = d2; bestCone = e; }
    }
  }
  return bestClose || bestCone;
}

export class Player extends Entity {
  constructor(x, y, opts = {}) {
    // 职业外观:recall/forge/weave 各自的 recolor 变体(sprites/index.js 装配)
    const heroSprites = SPRITE_LIB.heroVariants?.[state.heroClass] || SPRITE_LIB.hero;
    super(x, y, {
      hp: state.maxHp, w: 16, h: 16,
      drawW: 48, drawH: 60,
      team: 'player', sprites: heroSprites, ...opts,
    });
    this.game = opts.game || null;
    this.world = opts.world || null;
    this.speed = PLAYER_BASE.speed;
    this.attackRange = PLAYER_BASE.attackRange;
    this.attackDamage = PLAYER_BASE.attackDamage;
    this.attackCd = 0;
    this.attackTime = 0;
    this.dashCd = 0;
    this.dashTime = 0;
    this.dashVx = 0; this.dashVy = 0;
    this.shieldTime = 0;
    this.skillRecallCd = 0;
    this.skillShieldCd = 0;
    this.skillEchoCd = 0;
    this.animFps = 8;
    this.iFrame = 0;
    this.iFrameNear = 0; // 地表伤害小无敌
    this.aimAngle = 0; // 朝向(弧度),用于攻击方向
    this.comboIndex = 0; // 连击段:0=未段后归零,1=横扫,2=上挑,3后回到0=劈砸
    this.comboTimer = 0; // 连击窗口剩余(0.4s 内按下一段)
    this.lungeTime = 0;  // 普攻前冲(步进拉近风筝型敌人)
    this.lungeVx = 0; this.lungeVy = 0;
    // 完美闪避:冲刺结束后的"完美窗口"宽限;期间被击中 → 子弹时间+回蓝
    this.dashGraceT = 0;
    this._prevDashTime = 0;
    this._perfectDodgeCd = 0; // 防止同一次冲刺多次触发
    // 攻击动作:总时长 / 挥摆方向(逐击交替)/ 当前连击段对应的姿态帧(0蓄力 1横扫 2上挑 3劈砸)
    this.atkDur = 0.22;
    this._swingSign = 1;
    this._attackPose = 1;
    this._hurtT = 0;   // 受击踉跄姿态计时
    this._stepT = 0;   // 脚步扬尘节拍
    this.theme = CLASS_THEME[state.heroClass] || CLASS_THEME.recall; // 职业主题色(贯穿全部 VFX)

    // 职业(回响倾向)数值应用 — 必须在 super() 之后,确保覆盖基线
    // READ-ONLY: state.maxHp/maxMp 由 classSelect 写入职业基线、enemy.js 的 level-up
    // 在此基础上 +=。构造函数绝不回写,否则每次章节/存档/死亡-return 都会抹除等级加成。
    const heroClass = state.heroClass || 'recall';
    const cls = CLASS_MODS[heroClass] || CLASS_MODS.recall;
    this.maxHp = state.maxHp || cls.hp;
    this.maxMp = state.maxMp || cls.mp;
    this.attackDamage = cls.attackDamage;
    this.hp = state.hp || this.maxHp;
    // weave ×0.75 改为 READ-time 应用(见 effCd),绝不回写 state.skills,否则每次
    // 构造都会再乘一次,冷却趋近于 0。
    this.classCdMul = cls.cooldownMul;
    this.mpRegenMul = cls.mpRegenMul; // 被动法力回复乘子(forge 0.8)
  }

  // 有效冷却 = state.skills[key].cooldown × 职业乘子 × 祝福乘区。纯读,无副作用。
  effCd(key) {
    const sk = state.skills[key];
    return sk ? sk.cooldown * this.classCdMul * (1 + this.boonMods().cdMul) : 999;
  }

  // 祝福聚合(缓存:boons 数组长度变化才重算;死亡移除后同样触发)
  boonMods() {
    if (this._boonVer !== state.boons.length) {
      this._boonVer = state.boons.length;
      this._boonAgg = computeBoonMods(state.boons);
    }
    return this._boonAgg;
  }

  update(dt, game) {
    if (!this.alive) return;
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.attackTime = Math.max(0, this.attackTime - dt);
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.skillRecallCd > 0) this.skillRecallCd -= dt;
    if (this.skillShieldCd > 0) this.skillShieldCd -= dt;
    if (this.skillEchoCd > 0) this.skillEchoCd -= dt;
    if (this.iFrame > 0) this.iFrame -= dt;
    if (this.iFrameNear > 0) this.iFrameNear -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboIndex = 0;
    }
    this.lungeTime = Math.max(0, this.lungeTime - dt);
    this._hurtT = Math.max(0, this._hurtT - dt);
    this._deniedT = Math.max(0, (this._deniedT || 0) - dt);
    // 完美闪避宽限:冲刺刚结束的短暂窗口内被击中仍算"完美"( Late dodge 奖励 )
    if (this._prevDashTime > 0 && this.dashTime <= 0) this.dashGraceT = COMBAT.perfectDodgeGrace;
    this._prevDashTime = this.dashTime;
    this.dashGraceT = Math.max(0, this.dashGraceT - dt);
    this._perfectDodgeCd = Math.max(0, this._perfectDodgeCd - dt);
    // 被动法力回复:基线 1.6/s × 职业乘子 × 祝福乘区。
    state.mp = Math.min(state.maxMp, state.mp + PLAYER_BASE.mpRegen * (this.mpRegenMul || 1) * (1 + this.boonMods().mpRegen) * dt);
    if (this.shieldTime > 0) this.invulnerable = Math.max(this.invulnerable, 0.05);

    const k = game.input;
    // 自动瞄准:鼠标最近动过→朝鼠标;否则锁最近敌人;都没有→朝移动方向
    // (这样只用 WASD + J 就能玩,鼠标是可选的精瞄)
    if (k._mouseSeen && (k.mouseX !== this._lmx || k.mouseY !== this._lmy)) {
      this._lmx = k.mouseX; this._lmy = k.mouseY;
      this._mouseActiveT = 0.4;
    }
    this._mouseActiveT = Math.max(0, (this._mouseActiveT || 0) - dt);
    let aim;
    if (this._mouseActiveT > 0) {
      const mwx = k.mouseX + game.camera.x, mwy = k.mouseY + game.camera.y;
      aim = Math.atan2(mwy - this.y, mwx - this.x);
    } else {
      const ne = this._nearestEnemy(240);
      aim = ne ? Math.atan2(ne.y - this.y, ne.x - this.x) : (this._faceAngle ?? 0);
    }
    this.aimAngle = aim;
    this.facingRight = Math.cos(aim) >= 0;

    // 冲刺中:直接给位移(仍由 world.physics 做碰撞,不会穿墙)
    if (this.dashTime > 0) {
      this.dx += this.dashVx * dt;
      this.dy += this.dashVy * dt;
      this.invulnerable = Math.max(this.invulnerable, 0.1);
      this.animState = 'attack';
      this.animFrame = 1; // 冲刺沿用"横扫前倾"姿态,配合渲染层轴向拉伸
      this._tickAnim(dt);
      return;
    }

    const axis = k.getMoveAxis();
    const mods = this.boonMods();
    this.vx = axis.x * this.speed * (1 + mods.speed);
    this.vy = axis.y * this.speed * (1 + mods.speed);
    if (Math.abs(axis.x) > 0.1 || Math.abs(axis.y) > 0.1) this._faceAngle = Math.atan2(axis.y, axis.x);
    this.animState = (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1)
      ? (this.attackTime > 0 ? 'attack' : 'walk')
      : (this.attackTime > 0 ? 'attack' : 'idle');
    // 脚步扬尘:移动时脚下每 0.24s 冒一撮小尘(活物感)
    this._stepT -= dt;
    if ((Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) && this.dashTime <= 0 && this._stepT <= 0) {
      this._stepT = 0.24;
      game.particles.emit({
        x: this.x + (Math.random() - 0.5) * 10, y: this.sortY - 2,
        vx: (Math.random() - 0.5) * 26, vy: -10 - Math.random() * 12,
        life: 0.35, color: 'rgba(196,186,164,0.5)', size: 3,
        type: 'circle', fade: true, shrink: true,
      });
    }

    // 操作(资源/冷却不足时给明确的拒绝反馈,不再默默无响应)
    // 攻击/闪避带预输入缓冲:冷却尾段(≤0.12s)的按下不丢弃,就绪一瞬自动触发
    if (k.mouseJustClicked || k.justPressed('attack')) {
      if (this.attackCd <= 0) this._doAttack(game);
      else this._atkBuf = 0.12;
    }
    if (k.justPressed('dash')) {
      if (this.dashCd <= 0) this._doDash(game);
      else this._dashBuf = 0.12;
    }
    if (k.justPressed('skillQ')) {
      if (this.skillRecallCd <= 0 && state.mp >= 12) this._doRecall(game);
      else this._deny(game, state.mp < 12 ? 'mp' : 'cd');
    }
    if (k.justPressed('skillE')) {
      if (this.skillShieldCd <= 0 && state.mp >= 20) this._doShield(game);
      else this._deny(game, state.mp < 20 ? 'mp' : 'cd');
    }
    if (k.justPressed('skillR')) {
      if (this.skillEchoCd <= 0 && state.mp >= 30) this._doEcho(game);
      else this._deny(game, state.mp < 30 ? 'mp' : 'cd');
    }
    if (k.justPressed('useDew')) {
      if (state.dew > 0 && this.hp < this.maxHp) this._useDew(game);
      else this._deny(game, state.dew <= 0 ? 'dew' : 'full');
    }
    // 预输入缓冲结算(直接触发在上面优先消费,这里兜冷却转好的一瞬)
    this._atkBuf = Math.max(0, (this._atkBuf || 0) - dt);
    this._dashBuf = Math.max(0, (this._dashBuf || 0) - dt);
    if (this._atkBuf > 0 && this.attackCd <= 0) { this._atkBuf = 0; this._doAttack(game); }
    if (this._dashBuf > 0 && this.dashCd <= 0) { this._dashBuf = 0; this._doDash(game); }

    // 普攻前冲位移(与移动叠加;经 world.physics 碰撞,不会穿墙)
    if (this.lungeTime > 0) {
      this.dx += this.lungeVx * dt;
      this.dy += this.lungeVy * dt;
    }

    super.update(dt); // vx,vy → dx,dy
    // 动作姿态钉帧:攻击(蓄力→挥击)优先,其次受击踉跄
    if (this.attackTime > 0) {
      const p = 1 - this.attackTime / this.atkDur;
      this.animState = 'attack';
      this.animFrame = p < 0.3 ? 0 : this._attackPose;
    } else if (this._hurtT > 0) {
      this.animState = 'hurt';
      this.animFrame = 0;
    }
    state.hp = this.hp;
    state.mp = Math.max(0, state.mp);
  }

  _tickAnim(dt) {
    this.animTime += dt;
  }

  _nearestEnemy(maxR = 520) {
    // 选目标逻辑见 selectAimTarget(近身优先,远距离限前向锥)
    const faceAng = this._faceAngle ?? this.aimAngle ?? 0;
    return selectAimTarget(this.x, this.y, faceAng, this.world.entities, maxR);
  }

  _doAttack(game) {
    this.attackCd = this.effCd('slash');
    this.attackTime = this.atkDur;
    this.animState = 'attack';
    const world = this.world;
    // 连击递进:每次按键进入下一段;0.4s 内不按则归零(见 update)
    // comboIndex 1=横扫, 2=上挑(knockback×2), 0=劈砸(dmg×1.2/range×1.3+震屏)
    this.comboTimer = 0.4;
    this.comboIndex = (this.comboIndex + 1) % 3;
    const stage = this.comboIndex;
    // 动作:挥摆方向逐击交替(连击不再"左右同形"),姿态帧对应连击段
    this._swingSign = -this._swingSign;
    this._attackPose = stage === 0 ? 3 : stage === 2 ? 2 : 1;
    game.audio.sfxSlash(stage);
    // 攻击判定盒:在朝向前方(劈砸 +30% 范围;祝福再乘范围乘区)
    const mods = this.boonMods();
    let range = this.attackRange * (1 + mods.atkRange);
    if (stage === 0) range *= 1.3; // 劈砸范围 +30%
    const hx = this.x + Math.cos(this.aimAngle) * range * 0.5;
    const hy = this.y + Math.sin(this.aimAngle) * range * 0.5;
    const hitBox = { left: hx - range * 0.5, top: hy - 22, w: range, h: 44 };
    hitBox.right = hitBox.left + hitBox.w; hitBox.bottom = hitBox.top + hitBox.h;
    const knockback = stage === 2 ? 160 : 80; // 上挑击退加倍
    const dmgMul = (stage === 0 ? 1.2 : 1.0) * (1 + mods.dmg);
    // 前冲(lunge):目标在判定盒够不到的位置时,挥砍自带一小段步进,
    // 拉近与风筝型 BOSS(保持 ~150px)的距离;贴脸(<70px)则不冲,避免穿模。
    const lungeTarget = selectAimTarget(this.x, this.y, this.aimAngle, world.entities, this.attackRange + 90, 70);
    if (!lungeTarget) {
      const dist = stage === 0 ? 66 : 46; // 劈砸步进更远
      this.lungeTime = 0.13;
      this.lungeVx = Math.cos(this.aimAngle) * (dist / 0.13);
      this.lungeVy = Math.sin(this.aimAngle) * (dist / 0.13);
    }
    let hits = 0, kills = 0;
    // 挥砍弧光 VFX(在实体上方渲染,0.15s 淡出;三段连击形状不同,方向随摆向交替,颜色随职业)
    if (game.spawnSlashArc) game.spawnSlashArc(this.x, this.y, this.aimAngle, range, stage, this._swingSign, this.theme.color);
    for (const e of world.entities) {
      if (e === this || !e.alive || e.team === 'player' || e.team === 'npc') continue;
      const el = e.x - e.w / 2, et = e.y - e.h / 2, er = el + e.w, eb = et + e.h;
      if (!(hitBox.right <= el || er <= hitBox.left || hitBox.bottom <= et || eb <= hitBox.top)) {
        // 连击链:先注册本次命中拿伤害乘子;5/12/22 连给 1.1/1.2/1.32 倍
        const comboMul = game.registerHit?.() ?? 1;
        // 暴击:基础率 + 高连击奖励 + 祝福加成
        const critChance = COMBAT.critChance
          + (game.comboCount >= 5 ? COMBAT.critComboBonus : 0) + mods.critChance;
        const crit = Math.random() < critChance;
        let dmg = (this.attackDamage + state.level * 2) * dmgMul * comboMul;
        if (crit) dmg *= COMBAT.critMul + mods.critMul;
        dmg = Math.max(1, Math.round(dmg));
        const wasAlive = e.alive;
        const dealt = e.takeDamage(dmg, this.x, this.y, knockback);
        game.onDamageDealt(dealt || 0); // 无敌目标返回 0,统计口径按实际生效值
        game.audio.sfxHit(crit);
        // 命中粒子沿挥击方向喷射(不再无脑向四周炸开)
        game.spawnHitParticles(e.x, e.y, crit ? '#ffd700' : '#ffe090', this.aimAngle);
        // 命中回蓝:贴身输出 → 技能循环的引擎(基线 2 点 + 祝福加成)
        state.mp = Math.min(state.maxMp, state.mp + COMBAT.comboMpPerHit + mods.hitMp);
        // 吸血祝福:伤害按比例转化为生命
        if (mods.lifesteal > 0) {
          this.heal(Math.max(1, Math.round(dmg * mods.lifesteal)));
        }
        // 伤害数字:普通白 / 劈砸金 / 暴击金色大字弹跳 / 击杀更大
        const kill = wasAlive && !e.alive;
        if (kill) kills++;
        game.spawnFloatText(e.x, e.y - 34, `${dmg}`,
          crit ? '#ffcf4d' : (stage === 0 ? '#e0b76a' : '#f4ecd0'),
          { px: crit ? 30 : (stage === 0 ? 20 : 18), vy: kill ? 54 : 40, life: crit ? 1.2 : 0.9 });
        if (crit) game.spawnFloatText(e.x, e.y - 52, '会心!', '#ffe9a8', { px: 16, vy: 46, life: 0.7 });
        // 命中停顿(hitstop):随伤害分量递进 —— 普通轻顿 / 暴击深顿 / 击杀最深
        const stopScale = game.comboCount >= 12 ? 1.4 : 1;
        const stop = (crit ? 0.085 : 0.04) * stopScale * (e.side === 'enemy' && (e.maxHp ?? 0) > 200 ? 1.6 : 1);
        game.hitstop = Math.max(game.hitstop || 0, Math.min(0.16, stop));
        // 非暴击命中不额外震屏:基础节奏交给下面的统一 shake,避免高频连击把画面摇散
        hits++;
      }
    }
    // 劈砸(段3)震屏 / 命中强化震屏
    if (stage === 0) game.camera.shake(hits > 0 ? 8 : 5, 0.22);
    else if (hits > 0) game.camera.shake(3 + Math.min(4, hits), 0.12);
    // 击杀反馈:闷响 + 短促放大粒子
    if (kills > 0) {
      game.audio.sfxKill();
      game.camera.shake(kills > 1 ? 6 : 3, 0.18);
    }
    // 挥砍粒子
    for (let i = 0; i < 6 + hits * 3; i++) {
      const a = this.aimAngle + (Math.random() - 0.5) * 0.8;
      const sp = 120 + Math.random() * 180;
      game.particles.emit({
        x: this.x + Math.cos(this.aimAngle) * 20, y: this.y + Math.sin(this.aimAngle) * 20,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25, color: '#ffe090', size: 3, type: 'square', shrink: true,
      });
    }
  }

  _doDash(game) {
    this.dashCd = this.effCd('dash');
    this.dashTime = 0.16;
    // 攻击取消(Hades dash-cancel):冲刺立即打断攻击后摇,并把连击窗口续满 —— 闪避不再是断连
    this.attackTime = 0;
    game.comboTimer = Math.max(game.comboTimer, COMBAT.comboWindow);
    // 方向复用 getMoveAxis(键盘/触屏摇杆/手柄注入的方向键三合一;静止时朝瞄准方向)
    const axis = game.input.getMoveAxis();
    let dx = axis.x, dy = axis.y;
    if (dx === 0 && dy === 0) { dx = Math.cos(this.aimAngle); dy = Math.sin(this.aimAngle); }
    const d = Math.hypot(dx, dy) || 1;
    this.dashVx = (dx / d) * 520;
    this.dashVy = (dy / d) * 520;
    this.invulnerable = Math.max(this.invulnerable, 0.16);
    game.audio.sfxDash();
    for (let i = 0; i < 8; i++) {
      game.particles.emit({
        x: this.x, y: this.y,
        vx: -(dx / d) * 40 + (Math.random() - 0.5) * 40,
        vy: -(dy / d) * 40 + (Math.random() - 0.5) * 40,
        life: 0.4, color: 'rgba(183,140,224,0.6)', size: 14, type: 'circle', fade: true, shrink: true,
      });
    }
  }

  // 技能拒绝反馈:节流 0.5s,低音闷响 + 浮字提示原因
  _deny(game, kind) {
    if (this._deniedT > 0) return;
    this._deniedT = 0.5;
    const msg = kind === 'mp' ? '法力不足' : kind === 'cd' ? '冷却中…' : kind === 'dew' ? '没有露珠' : '生命已满';
    game.spawnFloatText(this.x, this.y - 40, msg,
      kind === 'mp' ? '#6c8ee0' : '#a9a07e', { px: 16, vy: 34, life: 0.7 });
    game.audio.note?.(140, 0.08, 'square', 0.07);
  }

  _doRecall(game) {
    state.mp -= 12;
    this.skillRecallCd = this.effCd('recall');
    game.audio.sfxSkill();
    const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
    const proj = new Projectile(this.x + dx * 18, this.y + dy * 18, {
      vx: dx * 320, vy: dy * 320,
      damage: 24 + state.level * 4, team: 'player', life: 1.1,
      color: this.theme.color, radius: 11, type: 'echo',
      pierce: this.boonMods().recallPierce > 0, // 形态祝福:回响穿透
      side: 'player', source: this,
    }, this.world);
    this.world.projectiles.push(proj);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      game.particles.emit({ x: this.x, y: this.y, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, life: 0.5, color: this.theme.color, size: 4, type: 'circle', fade: true, additive: true });
    }
  }

  _doShield(game) {
    state.mp -= 20;
    this.skillShieldCd = this.effCd('shield');
    this.shieldTime = 1.4;
    game.audio.sfxSkill();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      game.particles.emit({ x: this.x + Math.cos(a) * 28, y: this.y + Math.sin(a) * 28, vx: 0, vy: 0, life: 1, color: '#8aa9c4', size: 4, type: 'circle', fade: true, additive: true });
    }
  }

  _doEcho(game) {
    state.mp -= 30;
    this.skillEchoCd = this.effCd('echo');
    this.heal(40);
    game.audio.sfxHeal();
    for (const e of this.world.entities) {
      if (e.team === 'enemy' && e.alive) { e.target = null; e.alerted = false; }
    }
    for (let i = 0; i < 32; i++) {
      const a = Math.random() * Math.PI * 2;
      game.particles.emit({ x: this.x, y: this.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80 - 40, life: 1, color: '#a8e8b0', size: 5, type: 'circle', fade: true, additive: true, gravity: 120 });
    }
  }

  _useDew(game) {
    if (state.dew <= 0 && state.hp >= state.maxHp) return;
    if (state.dew > 0) {
      state.dew -= 1;
      // 晨露等级真实生效(Lv0 基线 30,每级 +12;技能树升级不再是无读数的安慰剂)
      const lv = state.skills?.heal?.level ?? 0;
      const amount = 30 + lv * 12;
      this.heal(amount);
      game.audio.sfxPickup(880);
      game.spawnFloatText(this.x, this.y - 30, `+${amount}`, '#8ad0e0');
      // 回血露珠:淡蓝露滴从脚下升起
      for (let i = 0; i < 10; i++) {
        game.particles.emit({
          x: this.x + (Math.random() - 0.5) * 20, y: this.y + 8,
          vx: 0, vy: -40 - Math.random() * 30,
          life: 0.7, color: '#8ad0e0', size: 3,
          type: 'circle', fade: true, additive: true,
        });
      }
    }
  }

  takeDamage(amount, fromX, fromY) {
    // 完美闪避:冲刺中(或刚结束的宽限内)"本应被击中" → 子弹时间 + 回蓝奖励
    const dodging = this.dashTime > 0 || this.dashGraceT > 0;
    if (this.invulnerable > 0 || dodging || this.iFrame > 0 || this.shieldTime > 0) {
      if (dodging && this._perfectDodgeCd <= 0) this._perfectDodge();
      return 0;
    }
    this.iFrame = 0.6;
    this._hurtT = 0.28; // 受击踉跄姿态
    // 磐石祝福:减伤乘区(负值 = 减伤)
    const finalAmt = Math.max(1, Math.round(amount * (1 + this.boonMods().dmgTaken)));
    super.takeDamage(finalAmt, fromX, fromY, 40);
    if (this.game) {
      const game = this.game;
      game.hurtFlash = 0.45; // 受击红屏
      game.resetCombo('hurt'); // 受击清空连击链(高连击有打断提示)
      // 玩家受击也吃顿帧+微震(挨打要有分量,不能只闪一下)
      game.hitstop = Math.max(game.hitstop || 0, 0.045);
      game.camera.shake(4, 0.18);
    }
    return finalAmt; // 与 Entity/Enemy/Boss 对齐:返回实际生效的伤害
  }

  _perfectDodge() {
    const game = this.game;
    if (!game) return;
    this._perfectDodgeCd = 1.2; // 同一次窗口只结算一次
    const gain = COMBAT.perfectDodgeMp + this.boonMods().dodgeMp;
    state.mp = Math.min(state.maxMp, state.mp + gain);
    game.triggerSlowmo();
    game.audio.sfxPerfect?.();
    game.spawnFloatText(this.x, this.y - 44, '完美闪避!', '#bfefff', { px: 24, vy: 48, life: 1.1 });
    game.spawnFloatText(this.x, this.y - 22, `+${gain} MP`, '#6c8ee0', { px: 16, vy: 40, life: 0.9 });
    // 残影环:以玩家为中心的扩散光环粒子(职业色)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      game.particles.emit({
        x: this.x + Math.cos(a) * 26, y: this.y + Math.sin(a) * 26,
        vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 - 20,
        life: 0.55, color: this.theme.color, size: 4, type: 'circle', fade: true, additive: true,
      });
    }
  }

  render(ctx, cam) {
    if (!this.alive) return;
    const t = this.theme;
    // 主角光环(职业色,永远能找到自己)
    const s = cam.worldToScreen(this.x, this.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.5 + 0.2 * Math.sin(this.animTime * 4);
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 34);
    grad.addColorStop(0, `rgba(${t.rgb},${0.35 * pulse})`);
    grad.addColorStop(1, `rgba(${t.rgb},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(s.x, s.y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // i-Frame 闪烁
    if (this.iFrame > 0 && Math.floor(this.iFrame * 18) % 2 === 0) ctx.globalAlpha = 0.4;
    this.renderWithMotion(ctx, cam, this._motion());
    ctx.globalAlpha = 1;
    // 护盾(职业色)
    if (this.shieldTime > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = t.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  // 计算当前动作变形参数(攻击/冲刺/行走/待机),交给通用变形层绘制
  _motion() {
    const m = { offX: 0, offY: 0, rot: 0, sx: 1, sy: 1 };
    if (this.attackTime > 0) {
      const p = 1 - this.attackTime / this.atkDur;
      const sign = this._swingSign || 1;
      const stage = this._attackPose;
      if (p < 0.3) {
        // 蓄力:向瞄准反方向收 3px,身体反向微倾
        const w = p / 0.3;
        const ax = Math.cos(this.aimAngle), ay = Math.sin(this.aimAngle);
        m.offX = ax * -3 * w; m.offY = ay * -3 * w;
        m.rot = -0.12 * w * sign;
        m.sx = 1 - 0.03 * w; m.sy = 1 - 0.03 * w;
      } else {
        // 挥击:前冲 7px + 沿挥击轴拉伸;上挑带向上位移,劈砸带下压
        const strike = Math.min(1, (p - 0.3) / 0.22);
        const rec = p < 0.62 ? 0 : Math.min(1, (p - 0.62) / 0.38);
        const amp = stage === 2 ? 1.5 : stage === 0 ? 1.25 : 1;
        const f = 7 * strike * (1 - rec);
        const ax = Math.cos(this.aimAngle), ay = Math.sin(this.aimAngle);
        m.offX = ax * f;
        m.offY = ay * f
          - (stage === 2 ? 3 * strike * (1 - rec) : 0)
          + (stage === 0 ? 3 * strike * (1 - rec) : 0);
        m.rot = 0.17 * amp * sign * strike * (1 - rec * 0.9);
        const stretch = 1 + 0.13 * strike * (1 - rec);
        const horiz = Math.abs(ax) >= Math.abs(ay);
        m.sx = horiz ? stretch : 1 + (stretch - 1) * 0.5;
        m.sy = horiz ? 1 + (stretch - 1) * 0.5 : stretch;
        if (stage === 0) m.sy *= 1 - 0.05 * strike; // 劈砸下压扁
      }
    } else if (this.dashTime > 0) {
      // 冲刺:沿冲刺轴拉长成箭矢
      const horiz = Math.abs(this.dashVx) >= Math.abs(this.dashVy);
      m.sx = horiz ? 1.16 : 0.9;
      m.sy = horiz ? 0.9 : 1.16;
      m.rot = 0.06 * (this.dashVx >= 0 ? 1 : -1);
    } else if (this._hurtT > 0) {
      // 受击踉跄:后仰 + 缩一下
      m.rot = -0.1;
      m.sx = 0.95; m.sy = 0.92;
    } else {
      const moving = Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1;
      if (moving) {
        m.offY -= Math.abs(Math.sin(this.animTime * 9)) * 2.2; // 步伐弹跳
      } else {
        m.sy = 1 + 0.012 * Math.sin(this.animTime * 2.6);      // 待机呼吸
      }
    }
    return m;
  }
}
