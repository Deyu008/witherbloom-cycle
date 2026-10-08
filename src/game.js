// game.js — 游戏主类,持有全局状态、循环、渲染、场景调度
import { Input } from './input.js';
import { Camera } from './camera.js';
import { Audio } from './audio.js';
import { ParticleSystem } from './particles.js';
import { AmbientLayer } from './ambiance.js';
import { SaveSystem } from './save.js';
import { AssetLoader } from './assets.js';
import { TitleScene } from './scenes/title.js';
import { ChapterSelectScene } from './scenes/chapterSelect.js';
import { ClassSelectScene } from './scenes/classSelect.js';
import { GameScene } from './scenes/game.js';
import { DialogScene } from './scenes/dialog.js';
import { ChapterIntroScene } from './scenes/chapterIntro.js';
import { EndingScene } from './scenes/ending.js';
import { ShopScene } from './scenes/shop.js';
import { PAL } from './palette.js';
import { state, freshState } from './state.js';
import { text } from './pixelfont.js';
import { COMBAT, comboMultiplier } from './data/balance.js';
import { CinematicEffect } from './cinematic.js';
import { TransitionEffect } from './transitions.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.input.onFirstGesture = () => this.audio.resume();
    this.camera = new Camera(canvas.width, canvas.height);
    this.particles = new ParticleSystem();
    this.ambient = new AmbientLayer();
    this.save = new SaveSystem();
    this.assets = new AssetLoader();
    this.running = false;
    this.lastT = 0;
    this.frameCount = 0;
    this.state = state;
    Object.assign(this.state, freshState());
    this.scenes = {};
    this.current = null;
    this.transition = null; // { from, to, t, dur, callback }
    this.globalFade = 0; // 0 = 无, 1 = 全黑
    this.fadeTarget = 0;
    this.hitstop = 0; // 命中停顿:全局短暂冻结(秒),由玩家命中触发
    this.hurtFlash = 0; // 受击红屏强度(衰减)
    this.bossPhaseFlash = 0; // BOSS 阶段切换/陨落全屏闪白(强度,衰减)
    this._bossPhaseColor = '#fff';
    this.tint = null;   // 章节色温(overlay 色),由 GameScene 设置
    this._bloodVignette = null; // 缓存的红色暗角(低血/受击共用)
    // 慢动作(完美闪避触发):timeScale 向 0.3 缓动,slowmoT 结束后恢复
    this.timeScale = 1;
    this.slowmoT = 0;
    // 连击(战斗节奏核心):命中累计,窗口超时清零;由 GameScene.update 驱动倒计时
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboFxT = 0; // 连击跳字的脉冲计时(HUD 用)
    // 电影化演出:Boss 入场(letterbox+白闪+粒子) 与 章节过场(Ken Burns 标题卡)
    this.cinematic = new CinematicEffect();
    this.chapterFx = new TransitionEffect();
  }

  async init(onProgress) {
    onProgress?.(0.05, '准备音频…');
    this.audio.init();
    onProgress?.(0.1, '编译剧本…');
    await this.assets.preload(this, (p, m) => onProgress?.(0.1 + p * 0.6, m));
    onProgress?.(0.75, '编织世界…');
    // 注册场景
    this.scenes.title = new TitleScene(this);
    this.scenes.chapterSelect = new ChapterSelectScene(this);
    this.scenes.classSelect = new ClassSelectScene(this);
    this.scenes.game = new GameScene(this);
    this.scenes.dialog = new DialogScene(this);
    this.scenes.chapterIntro = new ChapterIntroScene(this);
    this.scenes.ending = new EndingScene(this);
    this.scenes.shop = new ShopScene(this);

    onProgress?.(0.95, '准备就绪…');
    // 检查是否有存档
    const lastSave = this.save.getLast();
    if (lastSave) {
      this.state.fromSave = lastSave;
    }
    // 默认进入标题(直接设置,不通过 transition)
    this.current = this.scenes.title;
    this.current?.enter?.();
  }

  start() {
    this.running = true;
    this.lastT = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    try {
      this._update(dt);
      this._render();
    } catch (e) {
      // 场景异常不再断掉 rAF 链(否则永久黑屏冻结);打日志并停在一个可诊断的状态
      console.error('[loop] update/render 异常', e);
      this.running = false;
      throw e;
    }
    // hitstop 期间场景未消费输入,endFrame 推迟到解冻帧,
    // 否则顿帧里按下的闪避/技能会被静默丢弃(keydown 有防重,不会双触发)
    if (this.hitstop <= 0) this.input.endFrame();
    this.frameCount++;
    requestAnimationFrame((tt) => this._loop(tt));
  }

  _update(dt) {
    // 命中停顿:命中瞬间全局冻结一切更新(玩家+敌人+场景),强化打击感
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    // 慢动作(完美闪避):timeScale 快速滑向慢速档,窗口结束后快速恢复
    this.slowmoT = Math.max(0, this.slowmoT - dt);
    const targetTs = this.slowmoT > 0 ? COMBAT.perfectDodgeSlowmo.scale : 1;
    const easeK = Math.min(1, dt * (this.slowmoT > 0 ? 14 : 5));
    this.timeScale += (targetTs - this.timeScale) * easeK;
    const sdt = dt * this.timeScale;
    // 全局淡入淡出
    if (this.globalFade !== this.fadeTarget) {
      const speed = 1.5; // 1/秒
      if (this.globalFade < this.fadeTarget) this.globalFade = Math.min(this.fadeTarget, this.globalFade + speed * dt);
      else this.globalFade = Math.max(this.fadeTarget, this.globalFade - speed * dt);
    }
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.2);
    if (this.bossPhaseFlash > 0) this.bossPhaseFlash = Math.max(0, this.bossPhaseFlash - dt * 2.0);
    // banner / bossLine / floatText 计时(从 _render 迁移,改 dt 驱动)
    if (this._banner) { this._banner.life -= dt; if (this._banner.life <= 0) this._banner = null; }
    if (this._bossLineBanner) {
      if (this._bossLineBanner.delay > 0) this._bossLineBanner.delay -= dt;
      else { this._bossLineBanner.life -= dt; if (this._bossLineBanner.life <= 0) this._bossLineBanner._done = true; }
    }
    if (this._floatTexts) {
      for (const ft of this._floatTexts) { ft.y -= (ft.vy ?? 30) * sdt; ft.life -= dt; }
      this._floatTexts = this._floatTexts.filter(ft => ft.life > 0);
    }
    this.updateSlashes(sdt);
    // 过渡(场景切换)
    if (this.transition) {
      this.transition.t += dt;
      const halfT = this.transition.dur / 2;
      if (this.transition.t < halfT) {
        this.globalFade = this.transition.t / halfT;
      } else if (this.transition.t < this.transition.dur) {
        this.globalFade = 1 - (this.transition.t - halfT) / halfT;
        if (this.transition.t >= halfT && !this.transition.midCallbackCalled) {
          this.transition.midCallbackCalled = true;
          this.transition.midCallback?.();
        }
      } else {
        this.globalFade = 0;
        this.fadeTarget = 0;
        this.transition = null;
        // 过渡期间排队的下一次切换(如结局对话 onFinish 撞上过渡尾部)
        if (this._pendingGoto) {
          const [n, o] = this._pendingGoto;
          this._pendingGoto = null;
          this.goto(n, o);
        }
      }
      return; // 过渡中不更新场景
    }
    this.input.pollGamepads(); // 手柄 → 键码注入(菜单/玩法即刻可用)
    this.current?.update(sdt);
    this.particles.update(sdt);
    this.ambient.update(dt);
    this.cinematic.update(dt);
    this.chapterFx.update(dt);
  }

  _render() {
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    // 底色
    c.fillStyle = PAL.ink;
    c.fillRect(0, 0, W, H);
    this.current?.render(c);
    // 粒子在场景之上
    this.particles.render(c, this.camera);
    // Banner(y 254:避开 Boss 血条面板底部 222px 与顶部罗盘)
    if (this._banner) {
      const a = Math.min(1, this._banner.life * 0.6);
      c.globalAlpha = a;
      const y = 254;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect(W / 2 - 200, y - 12, 400, 36);
      c.strokeStyle = this._banner.color;
      c.lineWidth = 2;
      c.strokeRect(W / 2 - 199, y - 11, 398, 34);
      text(c, this._banner.text, W / 2, y, 'medium', this._banner.color, { align: 'center' });
      c.globalAlpha = 1;
    }
    // BOSS 台词横幅(独立 slot,延后 0.8s 出现,在阶段名下方)
    if (this._bossLineBanner) {
      if (this._bossLineBanner._done) { this._bossLineBanner = null; }
      else if (this._bossLineBanner.delay <= 0) {
        const a2 = Math.min(1, this._bossLineBanner.life * 0.6);
        c.globalAlpha = a2;
        const y2 = 300;
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.fillRect(W / 2 - 220, y2 - 11, 440, 30);
        c.strokeStyle = this._bossLineBanner.color;
        c.lineWidth = 1.5;
        c.strokeRect(W / 2 - 219, y2 - 10, 438, 28);
        text(c, this._bossLineBanner.text, W / 2, y2, 'small', this._bossLineBanner.color, { align: 'center' });
        c.globalAlpha = 1;
      }
    }
    // 全局暗角(canvas 尺寸不变,gradient 只创建一次并缓存)
    // 暂停期间跳过:0.78 黑幕再叠边缘 0.82 暗角,四周会压成近纯黑的"隧道框",
    // 中心反而透亮,像渲染残留;祝福/结算覆盖层自身已近全暗,叠加不可见,无需跳过
    if (!this.current?.paused) {
      if (!this._vignette) {
        const vg = c.createRadialGradient(W/2, H/2, Math.min(W,H)*0.22, W/2, H/2, Math.max(W,H)*0.72);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.7, 'rgba(0,0,0,0.28)');
        vg.addColorStop(1, 'rgba(0,0,0,0.82)');
        this._vignette = vg;
      }
      c.fillStyle = this._vignette;
      c.fillRect(0, 0, W, H);
    }
    // 战斗反馈/色温后处理
    this._renderPostFX(c);
    // 黑色淡入淡出
    if (this.globalFade > 0.001) {
      c.fillStyle = `rgba(0,0,0,${this.globalFade})`;
      c.fillRect(0, 0, W, H);
    }
    // 电影层(最顶):章节过场标题卡 与 Boss 入场演出
    this.chapterFx.render(c, W, H);
    this.cinematic.render(c, W, H);
  }

  // 战斗反馈与色温后处理:章节色温分级 + 低血心跳红边 + 受击红屏
  _renderPostFX(c) {
    const W = this.canvas.width, H = this.canvas.height;
    // 章节色温分级(极淡 overlay,统一每章色调氛围)
    if (this.tint) {
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = 0.16;
      c.fillStyle = this.tint;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    // BOSS 阶段切换/陨落:全屏闪白(BOSS 主题色,additive)
    if (this.bossPhaseFlash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(0.55, this.bossPhaseFlash * 0.45);
      c.fillStyle = this._bossPhaseColor || '#fff';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    // 低血心跳红边 + 受击红屏(共用预缓存的红色暗角,强度由 globalAlpha 控制)
    let redA = 0;
    const p = this.current?.player;
    if (p && p.alive && p.maxHp > 0) {
      const ratio = p.hp / p.maxHp;
      if (ratio < 0.3) redA = Math.max(redA, (0.3 - ratio) / 0.3 * 0.55 * (0.55 + 0.45 * Math.sin(this.frameCount * 0.18)));
    }
    if (this.hurtFlash > 0) redA = Math.max(redA, this.hurtFlash * 0.6);
    if (redA > 0.001) {
      if (!this._bloodVignette) {
        const g = c.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.max(W,H)*0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(193,77,77,1)');
        this._bloodVignette = g;
      }
      c.globalAlpha = Math.min(1, redA);
      c.fillStyle = this._bloodVignette;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  goto(name, opts = {}) {
    // 过渡进行中重入:新过渡会硬拉 globalFade 回 0 造成画面跳变,且旧过渡的
    // midCallback 被覆盖丢失。旧过渡已完成中段切换的,排队下一场;否则忽略(防抖)
    if (this.transition) {
      if (this.transition.midCallbackCalled) this._pendingGoto = [name, opts];
      return;
    }
    // 触发场景切换过渡;清掉残留横幅(否则会穿透叠印到新场景/菜单上)
    this._banner = null;
    this._bossLineBanner = null;
    this.transition = {
      from: this.current,
      to: this.scenes[name],
      t: 0,
      dur: opts.fadeDur ?? 0.6,
      midCallback: () => {
        this.tint = null; // 清章节色温(由 GameScene.enter 重新设置)
        this.current = this.scenes[name];
        this.current?.enter?.(opts);
      },
    };
  }

  // 立即切换(无淡入淡出,用于同场景内子状态)
  setScene(name, opts = {}) {
    this.tint = null; // 清章节色温(由 GameScene.enter 重新设置)
    this._banner = null;
    this._bossLineBanner = null;
    this.current = this.scenes[name];
    this.current?.enter?.(opts);
  }

  // ===== 游戏辅助方法(供场景调用) =====
  // Boss 入场电影化(letterbox 黑边 + 白闪 + 紫色粒子爆发)
  startBossCinematic(boss = null) {
    this.cinematic.startBossEntrance(boss);
  }
  // 章节过场标题卡(Ken Burns 缓推 + 章节名淡入);img 缺省时仅黑场+标题
  playChapterTransition(chapter) {
    const img = this.assets.cutscenes['ch' + chapter + '_trans'] || null;
    this.chapterFx.startChapterTransition(chapter, img);
  }
  // 命中粒子:angle 传入时沿"挥击/弹道方向"锥形喷射(打击有指向性),否则四周炸开
  spawnHitParticles(x, y, color = '#fff', angle = null) {
    for (let i = 0; i < 18; i++) {
      let a, sp;
      if (angle != null) {
        a = angle + (Math.random() - 0.5) * 1.3;      // ±65° 锥形
        sp = 180 + Math.random() * 200;
      } else {
        a = Math.random() * Math.PI * 2;
        sp = 160 + Math.random() * 140;
      }
      this.particles.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.45, color, size: 4,
        type: 'square', fade: true, gravity: 320, shrink: true,
      });
    }
  }
  spawnDeathParticles(x, y, color = '#fff') {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 200;
      this.particles.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        life: 0.8, color, size: 4,
        type: 'square', fade: true, gravity: 200, shrink: true,
      });
    }
  }
  spawnLevelUpParticles(x, y) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.emit({
        x, y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
        life: 0.8, color: '#e0b76a', size: 5,
        type: 'circle', fade: true, additive: true,
      });
    }
  }
  // 浮字:opts = { px:字号, vy:上升速度, life:寿命, shake:随机横移幅度 }
  spawnFloatText(x, y, text, color = '#fff', opts = {}) {
    this._floatTexts = this._floatTexts || [];
    this._floatTexts.push({
      x: x + (Math.random() - 0.5) * (opts.shake ?? 12),
      y,
      text,
      color,
      life: opts.life ?? 1.0,
      px: opts.px,
      vy: opts.vy,
    });
  }

  // ===== 战斗手感中枢 =====
  // 玩家命中一次敌人:推进连击窗口;返回当前连击伤害乘子(先 +1 再取档)
  registerHit() {
    const first = this.comboCount === 0;
    this.comboCount += 1;
    this.comboTimer = COMBAT.comboWindow;
    if (!first && this.comboCount % 10 === 0) this.comboFxT = 0.6; // 每 10 连跳一次特效窗
    return comboMultiplier(this.comboCount);
  }

  resetCombo(reason = '') {
    const count = this.comboCount;
    const hadStreak = count >= 5;
    this.comboCount = 0;
    this.comboTimer = 0;
    if (hadStreak && reason === 'hurt' && this.current?._breakComboFx) {
      this.current._breakComboFx(count); // 高连击被打断给负反馈提示
    }
  }

  // 由 GameScene.update 每帧驱动(暂停/对话时不调用 → 连击自然冻结)
  updateCombo(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.comboCount = 0; }
    }
    if (this.comboFxT > 0) this.comboFxT -= dt;
  }

  triggerSlowmo(duration = COMBAT.perfectDodgeSlowmo.time) {
    this.slowmoT = Math.max(this.slowmoT, duration);
  }
  // 挥砍弧光:记录一次挥砍的世界坐标/角度/范围,由 GameScene 在实体之上渲染
  spawnSlashArc(x, y, angle, range, stage, sign = 1, color = null) {
    this._slashes = this._slashes || [];
    // 同屏最多 8 道,避免连点刷屏
    if (this._slashes.length >= 8) this._slashes.shift();
    this._slashes.push({ x, y, angle, range, stage, sign, color, t: 0 });
  }
  updateSlashes(dt) {
    if (!this._slashes) return;
    for (const s of this._slashes) s.t += dt;
    this._slashes = this._slashes.filter(s => s.t < 0.15);
  }
  renderSlashes(ctx, cam) {
    if (!this._slashes || this._slashes.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this._slashes) {
      const p = s.t / 0.15; // 0→1 进度
      const sx = cam.screenX(s.x), sy = cam.screenY(s.y);
      const alpha = (1 - p) * 0.95;
      // 弧随进度扫过:起始角随进度推进,形成"挥出"的动感;方向跟随角色交替摆向
      const spread = s.stage === 0 ? 1.9 : s.stage === 2 ? 1.3 : 1.6;
      const sgn = s.sign || 1;
      const start = s.angle - (spread / 2) * sgn + spread * p * 0.6 * sgn;
      const r = s.range * (0.72 + p * 0.28);
      ctx.globalAlpha = alpha;
      // 弧光颜色随职业主题(未传色时按连击段回退旧配色)
      ctx.strokeStyle = s.color || (s.stage === 0 ? '#ffd070' : s.stage === 2 ? '#c8e8ff' : '#fff0c0');
      ctx.lineWidth = 7 * (1 - p * 0.6);
      ctx.beginPath();
      ctx.arc(sx, sy, r, start, start + spread * 0.55);
      ctx.stroke();
      // 内层细弧提亮
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.86, start + 0.08, start + spread * 0.5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  renderFloatTexts(ctx, cam) {
    if (!this._floatTexts) return;
    for (const ft of this._floatTexts) {
      const s = cam.worldToScreen(ft.x, ft.y);
      const a = Math.min(1, ft.life);
      // 弹跳出:出生前 0.18s 用放大一号字,随生命衰减回落
      let px = typeof ft.px === 'number' ? ft.px : null;
      if (px !== null) {
        const age = 1 - Math.max(0, Math.min(1, ft.life));
        px += age < 0.18 ? 8 : 0; // 出生瞬间大一号,再缩回
      }
      ctx.globalAlpha = a;
      text(ctx, ft.text, s.x, s.y, px ?? 'medium', ft.color, { align: 'center', shadowColor: '#000', shadowOffset: { x: 1, y: 1 } });
      ctx.globalAlpha = 1;
    }
  }
  onDamageDealt(amount) {
    state.stats.totalDamage += amount;
  }
  onBossDefeated(bossData) {
    // 弹出 UI 横幅
    this._banner = { text: `${bossData.name} 已被释怀`, color: bossData.color, life: 4 };
  }
  showBossPhaseName(name) {
    this._banner = { text: `【${name}】`, color: '#e0b76a', life: 2.5 };
  }
  // 阶段切换时的 BOSS 台词(非阻塞横幅;延后 0.8s 出现,让阶段名先入眼)
  showBossLine(text, color = '#d6c8a4') {
    this._bossLineBanner = { text, color, life: 3, delay: 0.8 };
  }
  startDialog(id, opts = {}) {
    if (this.current && this.current._startDialog) {
      this.current._startDialog(id, opts);
    }
  }
}
