// boss.js — BOSS(独立 AI,阶段转换,俯视角)
import { Entity } from './entity.js';
import { SPRITE_LIB } from './sprite.js';
import { Projectile, ProjectilePool } from './projectile.js';
import { Enemy } from './enemy.js';
import { state } from './state.js';
import { BOSS_DATA, MINIBOSS_DATA, MINIBOSS_FALLBACK, COMBAT } from './data/balance.js';
import { drawGlow } from './fxCache.js';

// BOSS 台词 → 配音文件映射(mmx TTS 生成;全部为游戏内既有文案)
const VOICE_LINES = {
  '我在等……': 'v_b1_1',
  '你想起了什么?': 'v_b1_2',
  '现在,让我听你说。': 'v_b1_3',
  '火,会带走一切。': 'v_b2_1',
  '哀伤还没有烧尽。': 'v_b2_2',
  '所有事件,都已被记下。': 'v_b3_1',
  '但有些事,该被改写。': 'v_b3_2',
  '……你来了。': 'v_b4_1',
  '我曾有过名字。': 'v_b4_2',
  '现在,让我记住你。': 'v_b4_3',
};
const VOICE_INTRO = { forest_keeper: 'v_b1_1', burning_king: 'v_b2_1', chronomancer: 'v_b3_1', forgotten: 'v_b4_1' };

// 首伐赏金(Hades 泰坦之血的降维版):每个职业首次讨伐每章 BOSS → +3 碎片。
// 3 职业 × 4 章 = 12 个小目标,给二周目"换职业再打一遍"一个自然理由。
function _grantBounty(game, chapter) {
  const key = `bounty_${state.heroClass}_${chapter}`;
  if (state.flags[key]) return;
  state.flags[key] = true;
  state.shards += 3;
  if (game?._banner !== undefined) game._banner = { text: '首伐赏金 · 该回响倾向首次讨伐 +3 碎片', color: '#e0b76a', life: 3 };
}

export class Boss extends Entity {
  constructor(x, y, type, opts = {}) {
    // 迷你 BOSS(悔恨化身)走独立数值表,避免复用 BOSS_DATA['forgotten'] 的 900HP
    let data;
    let minibossKind = null;
    if (opts.isMiniboss === true) {
      minibossKind = opts.id;
      data = MINIBOSS_DATA[opts.id] || MINIBOSS_FALLBACK;
    } else {
      data = BOSS_DATA[type];
    }
    const sprite = SPRITE_LIB.boss[type] || SPRITE_LIB.boss.forest_keeper;
    super(x, y, {
      hp: data.hp, w: 40, h: 40,
      drawW: data.size, drawH: data.size,
      team: 'boss', sprites: { idle: [sprite], walk: [sprite], attack: [sprite], hurt: [sprite] },
      id: opts.id ?? type,
    });
    this.bossType = type;
    this.minibossKind = minibossKind;
    this.data = data;
    this.dmg = data.dmg;
    this.color = data.color;
    this.phaseIdx = 0;
    this.attackCd = 1.5;
    this.target = null;
    this.world = opts.world || null;
    this.windup = 0;
    this.dialogStarted = false;
    this.isMiniboss = opts.isMiniboss ?? false;
    this.specialTimer = 0;
    this.summonCount = 0;
    this.alerted = false;
    // 释怀阈值:HP 占比低于此值时,玩家可按 V 触发和解(走"执念值"双线)
    this.releaseThreshold = opts.releaseThreshold ?? 0.25;
    // 防重入:仅在玩家主动按 V 时置 true,防止持续触发或同帧多次派发
    this._releasePrompted = false;
    // ===== 战斗深度(狂暴/瞬步/接触伤害)=====
    this.enraged = false;
    this.blinkCd = COMBAT.blinkCdMin + Math.random() * (COMBAT.blinkCdMax - COMBAT.blinkCdMin);
    this.blinkWindup = 0;   // 瞬步预警 shimmer
    this.contactPulse = 0;  // 接触伤害圈渲染相位
  }

  // 释怀可用性(供 HUD 显示):不检查 _releasePrompted,可重复显示
  releaseAvailable() {
    return !this.isMiniboss && this.alive && (this.hp / this.maxHp) < this.releaseThreshold;
  }

  // 释怀可触发性(供键位处理):需要未触发过 + 活 + 非迷你 + 低于阈值
  canRelease() {
    return !this.isMiniboss && this.alive
      && (this.hp / this.maxHp) < this.releaseThreshold
      && !this._releasePrompted;
  }

  // 释怀:对活 BOSS 一次性结算 —— 走"和解"分支,小奖励 + 章节通关
  release(game) {
    if (!this.alive) return;
    this.alive = false;
    this._releasePrompted = true;
    const ch = this.data.chapter;
    // 章节通关标志(boss1_completed 等),与击杀路径完全一致 —— 让现有 _renderChapterComplete 流程能识别
    state.flags[`boss${ch}_completed`] = true;
    // 解锁下一章(与 onKilled 路径相同)
    if (ch < 4 && !state.unlockedChapters.includes(ch + 1)) {
      state.unlockedChapters.push(ch + 1);
    }
    // 释怀奖励:仅击杀的 ~30%(100/100/1 → 30/30/1;给碎片让释怀玩家也能解锁技能树)
    state.xp += 30;
    state.gold += 30;
    state.shards += 1;
    _grantBounty(game, this.data.chapter);
    // 不递增 state.stats.bossesDefeated(那是为击杀统计);不设 bossN_defeated
    // 视觉:金粉 + 紫色"已释怀"浮字 + 柔和音效,刻意比击杀轻
    if (game?.spawnLevelUpParticles) game.spawnLevelUpParticles(this.x, this.y);
    if (game?.spawnFloatText) game.spawnFloatText(this.x, this.y - 30, '已释怀', '#b78ce0');
    if (game?.audio?.sfxRelease) game.audio.sfxRelease();
    // 恢复章节 BGM
    if (game?.audio) game.audio.startMusic(0, `ch${Math.min(4, Math.max(1, ch))}`);
    // 第 4 章(寂渊):和解即结局,与击杀共享 ending 场景入口
    if (this.bossType === 'forgotten') {
      if (state.flags.boss4_ending_triggered) return;
      state.flags.boss4_ending_triggered = true;
      // 游戏时钟延时(真实 setTimeout 不受暂停冻结,会在暂停中强切场景)
      this._endingDelay = 0.8;
    }
  }

  startBattle(game) {
    if (this.dialogStarted) return;
    this.dialogStarted = true;
    const id = this.bossType === 'forest_keeper' ? 'forest_keeper_intro'
      : this.bossType === 'burning_king' ? 'burning_king_intro'
      : this.bossType === 'chronomancer' ? 'chronomancer_intro' : 'forgotten_intro';
    game.current._startDialog(id, { onFinish: () => {
      game.audio.sfxRoar();
      game.audio.playVoice?.(VOICE_INTRO[this.bossType]);
      game.camera.shake(10, 0.6);
      this.alerted = true;
      // 开战切 BOSS 战曲(击杀/释怀后由 onKilled/release 恢复章节曲)
      game.audio.startMusic(0, 'boss');
    }});
  }

  // 瞬步落点:玩家周身半径 ~170px 随机角(略偏向玩家背后),螺旋找最近可站立点
  _doBlink(game) {
    const world = this.world;
    const t = this.target;
    if (!world || !t) return;
    const baseAng = Math.atan2(t.y - this.y, t.x - this.x) + Math.PI
      + (Math.random() - 0.5) * 1.6; // 玩家朝向的反方向 ±80° —— 绕到"身后"
    for (let r = 170; r <= 260; r += 30) {
      for (let jitter = -0.7; jitter <= 0.7; jitter += 0.35) {
        const ang = baseAng + jitter;
        const px = t.x + Math.cos(ang) * r, py = t.y + Math.sin(ang) * r;
        if (!world.solidAtPx(px, py)) {
          // 出发点残留粒子 → 落点粒子
          game.particles?.emit && (() => {
            for (let i = 0; i < 12; i++) {
              const a = Math.random() * Math.PI * 2;
              game.particles.emit({ x: this.x, y: this.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 30, life: 0.4, color: this.color, size: 3, type: 'circle', fade: true, additive: true });
            }
          })();
          this.x = px; this.y = py; this.vx = 0; this.vy = 0;
          game.audio.sfxDash();
          game.spawnLevelUpParticles(this.x, this.y);
          // 落地立刻反击一刀,让瞬步有压迫感也有可预期性(windup 依旧给反应窗)
          this.attackCd = Math.min(this.attackCd, 0.5);
          const span = COMBAT.blinkCdMax - COMBAT.blinkCdMin;
          this.blinkCd = (COMBAT.blinkCdMin + Math.random() * span)
            * (this.enraged ? 0.6 : 1);
          return;
        }
      }
    }
    // 周围全是墙 → 放弃本次,冷却后重试
    this.blinkCd = 3;
  }

  update(dt, game) {
    // 第 4 章结局延时(游戏时钟):死亡/释怀后仍倒数,暂停时随场景一起冻结
    if (this._endingDelay != null) {
      this._endingDelay -= dt;
      if (this._endingDelay <= 0) {
        const wantDialog = this._endingDialog;
        this._endingDelay = null;
        this._endingDialog = false;
        if (wantDialog) {
          if (game.current?._startDialog) game.current._startDialog('forgotten_question', { onFinish: () => game.goto('ending') });
        } else {
          game?.goto?.('ending');
        }
      }
    }
    if (!this.alive) return;
    if (!this.alerted) { super.update(dt); return; }
    const world = this.world;
    if ((!this.target || !this.target.alive) && world) this.target = world.player;
    this.contactPulse += dt;
    if (this._phaseFxT > 0) this._phaseFxT -= dt;

    // ===== 狂暴:仅迷你 BOSS(章节 BOSS 在同一阈值进入"力竭放水"释怀态,见下)=====
    const ratio = this.hp / this.maxHp;
    if (!this.enraged && ratio > 0 && ratio < COMBAT.bossEnrageAt && !this.releaseAvailable()) {
      this.enraged = true;
      game.audio.sfxRoar();
      game.camera.shake(12, 0.5);
      game.spawnFloatText(this.x, this.y - this.drawH / 2 - 26, '狂暴!', '#ff5050', { px: 28, vy: 44, life: 1.4 });
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        game.particles?.emit({
          x: this.x, y: this.y,
          vx: Math.cos(a) * 180, vy: Math.sin(a) * 140,
          life: 0.7, color: '#ff6a4a', size: 5, type: 'circle', fade: true, additive: true,
        });
      }
    }

    // ===== 力竭放水(Undertale 仁慈语法):章节 BOSS 低于释怀线后,攻击变慢、
    // 直瞄弹有一半故意打偏 —— "它其实不想杀你"写进弹道,而不只是写进台词
    if (this.releaseAvailable() && !this._wearyShown && !this.isMiniboss) {
      this._wearyShown = true;
      game.camera.shake(4, 0.4);
      // 力竭横幅同样轮换(跨战斗递增,存 flags)
      const wearyPool = this.data.wearyLines || ['它已力竭,放下了刀……'];
      const wkey = `weary_bark_${this.data.chapter}`;
      const wi = (state.flags[wkey] || 0) % wearyPool.length;
      state.flags[wkey] = wi + 1;
      game._banner = { text: wearyPool[wi], color: '#e0b76a', life: 3 };
      game.audio.sfxWhisper?.();
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        game.particles?.emit({
          x: this.x, y: this.y, vx: Math.cos(a) * 60, vy: -20 - Math.random() * 30,
          life: 1.2, color: '#e0b76a', size: 3, type: 'circle', fade: true, additive: true,
        });
      }
    }
    const weary = this.releaseAvailable();
    // ===== 相位 ≥1 的瞬步换位:预警 shimmer 后闪现到玩家侧后方,打破站桩环形走位
    if (this.blinkWindup > 0) {
      this.blinkWindup -= dt;
      if (Math.random() < 0.6 && game.particles) {
        const a = Math.random() * Math.PI * 2;
        game.particles.emit({
          x: this.x + Math.cos(a) * this.drawW * 0.4, y: this.y + Math.sin(a) * this.drawH * 0.3,
          vx: 0, vy: -30, life: 0.4, color: this.color, size: 3, type: 'circle', fade: true, additive: true,
        });
      }
      if (this.blinkWindup <= 0) { this._doBlink(game); }
      super.update(dt); // 蓄能期间静止(无 vx/vy),但保持动画/受击等基础更新
      return;
    }

    if (this.target) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.facingRight = dx >= 0;
      const desired = 150;
      const sp = 55 * (this.enraged ? COMBAT.bossEnrageSpeedMul : 1);
      if (d > desired + 30) { this.vx = (dx / d) * sp; this.vy = (dy / d) * sp; this.animState = 'walk'; }
      else if (d < desired - 30) { this.vx = -(dx / d) * sp; this.vy = -(dy / d) * sp; this.animState = 'walk'; }
      else { this.vx *= 0.8; this.vy *= 0.8; this.animState = 'idle'; }
    }

    // ===== 阶段
    const phase = Math.min(this.data.phases.length - 1, Math.floor((1 - ratio) * this.data.phases.length));
    if (phase > this.phaseIdx) {
      this.phaseIdx = phase;
      this._phaseFxT = 0.5; // 阶段爆闪:体型弹跳一下
      game.bossPhaseFlash = 0.8;       // 全屏闪白(BOSS 主题色)
      game._bossPhaseColor = this.color;
      game.hitstop = Math.max(game.hitstop || 0, 0.09); // 阶段切换顿一下,读档般的一瞬
      game.audio.sfxRoar();
      game.camera.shake(14, 0.6);
      game.spawnLevelUpParticles(this.x, this.y);
      game.showBossPhaseName(this.data.phases[phase].name);
      // 阶段切换 → 台词池轮换(bark:重复挑战同一 Boss 不再复读同一句)
      const pool = this.data.phases[phase].lines || [];
      if (pool.length > 0 && typeof game.showBossLine === 'function') {
        this._barkIdx = this._barkIdx || {};
        const i = (this._barkIdx[phase] || 0) % pool.length;
        this._barkIdx[phase] = i + 1;
        const phaseLine = pool[i];
        game.showBossLine(phaseLine, this.color);
        this._speakLine(game, phaseLine);
      }
      this.blinkCd = Math.min(this.blinkCd, 2.5); // 新阶段很快完成一次换位
    }

    // ===== 瞬步计时(相位 ≥1 且不在攻击前摇时才走)
    if (this.phaseIdx >= 1) {
      this.blinkCd -= dt;
      if (this.blinkCd <= 0 && this.windup <= 0) {
        this.blinkWindup = 0.45; // 预警窗口:玩家看到闪烁可预判其将瞬移
        return;
      }
    }

    // ===== 接触伤害:身体接触圈(渲染层画红圈明示),防止贴身无限连
    if (this.target?.alive) {
      const touchR = this.drawW * 0.36 + 10;
      const ddx = this.target.x - this.x, ddy = this.target.y - this.y;
      if (ddx * ddx + ddy * ddy < touchR * touchR) {
        this.target.takeDamage(Math.max(1, Math.round(this.dmg * COMBAT.bossContactDmgMul)), this.x, this.y);
      }
    }

    this.attackCd -= dt;
    if (this.attackCd <= 0 && this.windup <= 0) {
      this.windup = weary ? 0.55 : 0.4; // 力竭时前摇更长(疲惫感,也更好躲)
    }
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        this._attack(game);
        this.attackCd = this.data.phases[this.phaseIdx].attackRate
          * (this.enraged ? COMBAT.bossEnrageRateMul : 1)
          * (weary ? 1.3 : 1); // 力竭:出手更迟疑
      }
    }
    super.update(dt);
  }

  // 台词配音(查表映射;配音文件缺失时静默降级为仅横幅)
  _speakLine(game, lineText) {
    const key = VOICE_LINES[lineText];
    if (key) game?.audio?.playVoice?.(key);
  }

  _aim() {
    if (!this.target) return 0;
    let a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    // 力竭放水:一半的直瞄刻意偏出近半弧 —— 弹从身侧掠过,不死人,但演出"没瞄准你"
    if (this.releaseAvailable() && Math.random() < 0.5) {
      a += (Math.random() < 0.5 ? -1 : 1) * (0.32 + Math.random() * 0.2);
    }
    return a;
  }
  _shoot(angle, speed, dmgMul, color, radius, type) {
    const p = ProjectilePool.acquire(this.x, this.y, {
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      damage: this.dmg * dmgMul, team: 'enemy', life: 2.0,
      color, radius, type: type || 'enemy',
      side: 'enemy', source: this,
    }, this.world);
    this.world.projectiles.push(p);
  }

  _attack(game) {
    const world = this.world;
    if (!world) return;
    if (this.isMiniboss) { this._minibossAttack(game); return; }
    const aim = this._aim();
    const phase = this.phaseIdx;
    this.attackCount = (this.attackCount || 0) + 1;
    // 招牌技:每第 3 次攻击释放一个 BOSS 专属大招(带更强预警与构成)
    if (this.attackCount % 3 === 0) {
      if (this._signature(game, aim, phase)) return;
    }
    if (this.bossType === 'forest_keeper') {
      if (phase === 0) { for (let i = 0; i < 3; i++) this._shoot((i / 3) * Math.PI * 2, 80, 0.5, this.data.projColor, 7); }
      else if (phase === 1) { for (let i = -1; i <= 1; i++) this._shoot(aim + i * 0.25, 120, 0.5, this.data.projColor, 7); }
      else { const t = performance.now() * 0.002; for (let i = 0; i < 5; i++) this._shoot((i / 5) * Math.PI * 2 + t, 70, 0.4, this.data.projColor, 7); }
    } else if (this.bossType === 'burning_king') {
      if (phase === 0) { for (let i = 0; i < 4; i++) this._shoot(aim + (i - 1.5) * 0.22, 150, 0.5, this.data.projColor, 8, 'fire'); }
      else {
        if (this.summonCount < 3 && Math.random() < 0.5) {
          const e = new Enemy(this.x + (Math.random() - 0.5) * 160, this.y + (Math.random() - 0.5) * 80, 'ember_imp', { world: this.world });
          this.world.entities.push(e); this.summonCount++;
        }
        for (let i = 0; i < 5; i++) this._shoot((i / 5) * Math.PI * 2, 90, 0.4, this.data.projColor, 7);
      }
    } else if (this.bossType === 'chronomancer') {
      if (phase === 0) { for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; this._shoot(a, 70, 0.6, this.data.projColor, 10, 'rune'); } }
      else { const t = performance.now() * 0.003; for (let i = 0; i < 6; i++) this._shoot((i / 6) * Math.PI * 2 + t, 80, 0.4, this.data.projColor, 8); }
    } else { // forgotten
      if (phase === 0) { for (let i = 0; i < 4; i++) this._shoot((i / 4) * Math.PI * 2, 90, 0.5, this.data.projColor, 8); }
      else if (phase === 1) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const p = ProjectilePool.acquire(this.x, this.y, { vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, damage: this.dmg * 0.4, team: 'enemy', life: 2, color: '#a8b8d0', radius: 6, type: 'mirror', side: 'enemy', source: this }, this.world);
          p.pierce = true; this.world.projectiles.push(p);
        }
      } else {
        this.specialTimer += 0.5;
        for (let i = 0; i < 8; i++) this._shoot((i / 8) * Math.PI * 2 + this.specialTimer, 150, 0.4, this.data.projColor, 6, 'void');
      }
    }
  }

  // BOSS 招牌技:每个 BOSS 一记有记忆点的大招(返回 true 表示本次攻击已消费)
  _signature(game, aim, phase) {
    const world = this.world;
    if (this.bossType === 'forest_keeper') {
      // 荆棘绽发:以自身为中心的慢速大环 + 两波加速小环
      game.camera.shake(8, 0.3);
      for (let i = 0; i < 12; i++) this._shoot((i / 12) * Math.PI * 2, 95, 0.5, this.data.projColor, 9);
      for (let i = 0; i < 6; i++) this._shoot((i / 6) * Math.PI * 2 + 0.5, 150, 0.4, this.data.projColor, 6);
      // 终阶段:召唤一只藤蔓之影(上限 2)
      if (phase >= 2 && this.summonCount < 2) {
        const e = new Enemy(this.x + (Math.random() - 0.5) * 140, this.y + (Math.random() - 0.5) * 80, 'vine_wraith', { world });
        world.entities.push(e); this.summonCount++;
        if (game?.spawnFloatText) game.spawnFloatText(e.x, e.y - 30, '藤蔓之影', this.data.projColor);
      }
      return true;
    }
    if (this.bossType === 'burning_king') {
      // 烈日坠雨:朝玩家方向的三连扇形火雨,逐波张开
      game.camera.shake(9, 0.35);
      for (let wave = 0; wave < 3; wave++) {
        for (let i = -2; i <= 2; i++) {
          const p = ProjectilePool.acquire(this.x, this.y, {
            vx: Math.cos(aim + i * 0.18) * (130 + wave * 35),
            vy: Math.sin(aim + i * 0.18) * (130 + wave * 35),
            damage: this.dmg * 0.45, team: 'enemy', life: 1.6,
            color: this.data.projColor, radius: 7, type: 'fire', side: 'enemy', source: this,
          }, world);
          world.projectiles.push(p);
        }
      }
      return true;
    }
    if (this.bossType === 'chronomancer') {
      // 时之涡:双臂螺旋,转速随相位加快 —— 视觉与走位压力都拉满
      game.camera.shake(8, 0.4);
      this.specialTimer += 1.2;
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 9; i++) {
          const a = this.specialTimer + arm * Math.PI + i * 0.28;
          this._shoot(a, 105 + i * 9, 0.42, this.data.projColor, 7, 'rune');
        }
      }
      return true;
    }
    if (this.bossType === 'forgotten') {
      // 镜像洪流:环绕自身的穿刺镜弹环 + 直瞄五连发
      game.camera.shake(10, 0.4);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + this.specialTimer;
        const p = ProjectilePool.acquire(this.x, this.y, {
          vx: Math.cos(a) * 110, vy: Math.sin(a) * 110,
          damage: this.dmg * 0.4, team: 'enemy', life: 2.4,
          color: '#a8b8d0', radius: 6, type: 'mirror', side: 'enemy', source: this,
        }, world);
        p.pierce = true; world.projectiles.push(p);
      }
      for (let i = -2; i <= 2; i++) this._shoot(aim + i * 0.12, 170, 0.4, this.data.projColor, 6, 'void');
      return true;
    }
    return false;
  }

  _minibossAttack(game) {
    const world = this.world;
    if (!world) return;
    const aim = this._aim();
    const color = this.data.projColor;
    const kind = this.minibossKind;
    if (kind === 'regret_childhood') {
      // 童年:1 颗大而慢的弹,直瞄玩家
      this._shoot(aim, 70, 0.5, color, 12);
    } else if (kind === 'regret_doubt') {
      // 怀疑:3 向扇形
      for (let i = -1; i <= 1; i++) this._shoot(aim + i * 0.15, 120, 0.5, color, 7);
    } else if (kind === 'regret_abandon') {
      // 抛弃:2 颗较慢的先导弹
      this._shoot(aim, 85, 0.5, color, 9);
      this._shoot(aim, 85, 0.5, color, 9);
    } else {
      // 未知迷你 BOSS:3 向扇形兜底
      for (let i = -1; i <= 1; i++) this._shoot(aim + i * 0.15, 95, 0.5, color, 8);
    }
  }

  takeDamage(amount, fromX, fromY) {
    if (!this.alive) return 0;
    // 致命伤前记录"是否已可释怀"(死亡瞬间 alive=false 会让 releaseAvailable 永远为假)
    if (this.hp - amount <= 0 && !this._wasReleasable) this._wasReleasable = this.releaseAvailable();
    super.takeDamage(amount, fromX, fromY, 0);
    return amount;
  }

  onKilled(game) {
    game.audio.sfxChapter();
    game.camera.shake(22, 1.0);
    game.bossPhaseFlash = 1.2; // 陨落全屏闪白
    game._bossPhaseColor = this.color;
    game.spawnDeathParticles(this.x, this.y, this.color);
    // BOSS 之魂:更盛大的灵魂上升
    if (game?.particles) {
      for (let i = 0; i < 14; i++) {
        game.particles.emit({
          x: this.x + (Math.random() - 0.5) * 40, y: this.y + (Math.random() - 0.5) * 24,
          vx: (Math.random() - 0.5) * 24, vy: -36 - Math.random() * 30,
          life: 1.6 + Math.random() * 0.8, color: this.color, size: 4,
          type: 'circle', fade: true, additive: true,
        });
      }
    }
    // 恢复章节 BGM(第 4 章直接进结局,不必恢复)
    if (this.data.chapter < 4 && game?.audio) game.audio.startMusic(0, `ch${this.data.chapter}`);
    state.stats.bossesDefeated += 1;
    // 迷你 BOSS(寂渊回廊的悔恨化身):只给奖励,不算通关
    if (this.isMiniboss) {
      state.xp += 40; state.gold += 20;
      game.spawnFloatText(this.x, this.y - 30, '悔恨,已散', this.color);
      _grantBounty(game, this.data.chapter);
      return;
    }
    // 背叛杀(Undertale 语法):它已放下刀(黄名可释怀)时仍下杀手 —— 世界记住这一刀
    if (this._wasReleasable || this.releaseAvailable()) {
      state.flags[`boss${this.data.chapter}_betrayed`] = true;
      state.stats.betrayals = (state.stats.betrayals || 0) + 1;
      game._banner = { text: '它已放下了刀……而你仍旧挥下。', color: '#c14d4d', life: 4 };
      game.camera.shake(14, 0.6);
    }
    state.flags[`boss${this.data.chapter}_defeated`] = true;
    state.flags[`boss${this.data.chapter}_completed`] = true;
    if (this.data.chapter < 4 && !state.unlockedChapters.includes(this.data.chapter + 1)) {
      state.unlockedChapters.push(this.data.chapter + 1);
    }
    state.xp += 100; state.gold += 100; state.shards += 1;
    _grantBounty(game, this.data.chapter);
    // 第 4 章(寂渊)走结局;其余章节由 GameScene 检测 completed flag 弹出通关结算窗
    if (this.bossType === 'forgotten') {
      if (state.flags.boss4_ending_triggered) return;
      state.flags.boss4_ending_triggered = true;
      // 游戏时钟延时:真实 setTimeout 不受暂停冻结,会在暂停中弹对话/强切场景
      this._endingDelay = 0.9;
      this._endingDialog = true;
    }
  }

  render(ctx, cam) {
    if (!this.alive) return;
    // BOSS 警示光环
    const s = cam.worldToScreen(this.x, this.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.4 + 0.25 * Math.sin(this.animTime * 3);
    drawGlow(ctx, this.color, s.x, s.y, this.drawW * 1.8, 0.3 * pulse);
    // 狂暴:红色脉冲外圈叠在原光环上
    if (this.enraged) {
      const rp = 0.5 + 0.35 * Math.sin(this.contactPulse * 6);
      drawGlow(ctx, '#ff503c', s.x, s.y, this.drawW * 2.1, 0.22 * rp);
    }
    ctx.restore();
    // 力竭可释怀:金色呼吸环(Undertale 黄名的空间版),与红圈"危险"语义对立
    if (this.releaseAvailable()) {
      ctx.save();
      const gp = 0.5 + 0.3 * Math.sin(this.animTime * 2.2);
      ctx.globalAlpha = gp;
      ctx.strokeStyle = '#e0b76a'; ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(s.x, s.y, this.drawW * 0.62, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    // 接触伤害圈:细红线明示"贴身会被弹开"(半径与判定一致,读得懂)
    {
      const touchR = this.drawW * 0.36 + 10;
      ctx.save();
      ctx.globalAlpha = 0.32 + 0.14 * Math.sin(this.contactPulse * 4);
      ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(s.x, s.y, touchR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    if (this.windup > 0) {
      // 预警闪烁:快速红色脉冲,提示即将出弹
      const wpulse = Math.sin(this.windup * 40) * 0.5 + 0.5;
      ctx.save();
      ctx.globalAlpha = wpulse * 0.5;
      ctx.fillStyle = '#ff4040';
      ctx.beginPath(); ctx.arc(s.x, s.y, this.drawW * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 瞬步预警:身体加速碎闪(区别于攻击预警的红色)
    if (this.blinkWindup > 0) {
      ctx.save();
      ctx.globalAlpha = (Math.sin(performance.now() * 0.05) > 0 ? 0.7 : 0.15);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x, s.y, this.drawW * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 动作变形:呼吸起伏 + 蓄力下蹲 + 阶段爆闪 + 冲刺向移动倾斜 —— 大体型必须有分量
    const m = { offX: 0, offY: 0, rot: 0, sx: 1, sy: 1 };
    const breatheFreq = this.enraged ? 3.4 : 2.0;
    const breatheAmp = this.enraged ? 0.05 : 0.03;
    m.sy = 1 + breatheAmp * Math.sin(this.animTime * breatheFreq);
    m.sx = 1 - breatheAmp * 0.6 * Math.sin(this.animTime * breatheFreq);
    if (this.windup > 0) {
      // 出手前蹲伏蓄压(windup 0.4s,越接近出手压得越扁)
      const p = Math.max(0, Math.min(1, 1 - this.windup / 0.4));
      m.sy *= 1 - 0.14 * p;
      m.sx *= 1 + 0.12 * p;
      m.offY = 5 * p;
    } else if (this.blinkWindup > 0) {
      // 瞬步蓄能:向上拉伸(要"弹走"了)
      m.sy *= 1.08; m.offY -= 3;
    } else if (Math.abs(this.vx) + Math.abs(this.vy) > 5) {
      // 移动:沉重的摇摆
      m.rot = Math.sin(this.animTime * 6) * 0.035;
      m.offY -= Math.abs(Math.sin(this.animTime * 6)) * 2.5;
    }
    if (this._phaseFxT > 0) {
      // 阶段切换爆闪: scale 弹跳衰减
      const k = this._phaseFxT / 0.5;
      m.sx *= 1 + 0.18 * k; m.sy *= 1 + 0.18 * k;
    }
    this.renderWithMotion(ctx, cam, m);
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
