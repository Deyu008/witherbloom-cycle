// cinematic.js — Boss 入场电影化演出
// 时间轴(总时长 ~2.5s):
//   t=0.0  上下黑边(letterbox)滑入,0.4s 到 60px
//   t=0.0  紫色粒子从屏幕中心爆发
//   t=0.3  白闪 alpha 0.8 → 0,持续 0.3s
//   t=0.8  黑边滑出,0.4s 收回
//   粒子自然消散后(t>=2.5)active 归 false
// 用法: cine.startBossEntrance(boss); 每帧 cine.update(dt); 渲染末层 cine.render(ctx, W, H);

const BAR_H = 60;          // 黑边高度(px)
const BAR_IN_DUR = 0.4;    // 黑边滑入时长
const BAR_OUT_AT = 0.8;    // 黑边开始滑出的时刻
const BAR_OUT_DUR = 0.4;   // 黑边滑出时长
const FLASH_AT = 0.3;      // 白闪开始时刻
const FLASH_DUR = 0.3;     // 白闪时长
const FLASH_PEAK = 0.8;    // 白闪峰值 alpha
const DURATION = 2.5;      // 总时长
const VIOLET = '#b78ce0';  // 粒子主色(与 PAL.hero_glow 一致)
const VIOLET_H = '#e0b0ff';

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

export class CinematicEffect {
  constructor() {
    this.active = false;
    this.t = 0;
    this.boss = null;
    this.particles = [];
  }

  // 触发 Boss 入场演出。boss 可为任意对象(仅用于记录来源,可为 null)。
  startBossEntrance(boss = null) {
    this.active = true;
    this.t = 0;
    this.boss = boss;
    this.particles.length = 0;
    this._burstParticles();
  }

  _burstParticles() {
    // 屏幕中心向四周放射的紫色粒子(归一化坐标存储,适配任意画布尺寸)
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 140 + Math.random() * 320; // px/s(以 720p 为基准)
      const life = 0.9 + Math.random() * 1.2;
      this.particles.push({
        nx: 0.5, ny: 0.5,                   // 起点:屏幕中心
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.35 ? VIOLET_H : VIOLET,
      });
    }
  }

  update(dt) {
    if (!this.active && this.particles.length === 0) return;
    this.t += dt;
    // 粒子运动(写指针原地压缩,和 particles.js 同风格,零分配)
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.nx += (p.vx * dt) / 1280;
      p.ny += (p.vy * dt) / 720;
      p.vx *= 0.96;
      p.vy *= 0.96;
      ps[w++] = p;
    }
    ps.length = w;
    if (this.active && this.t >= DURATION) {
      this.active = false;
      this.t = DURATION;
      this.boss = null;
    }
  }

  render(ctx, W, H) {
    if (!this.active && this.particles.length === 0) return;
    const t = this.t;

    // 1) 紫色粒子爆发(additive)
    if (this.particles.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const a = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.color;
        const s = p.size * (0.5 + a * 0.5);
        ctx.fillRect(p.nx * W - s / 2, p.ny * H - s / 2, s, s);
      }
      ctx.restore();
    }

    if (!this.active) return;

    // 2) 白闪:t=0.3 起 alpha 0.8 → 0,持续 0.3s
    if (t >= FLASH_AT && t < FLASH_AT + FLASH_DUR) {
      const k = (t - FLASH_AT) / FLASH_DUR;
      ctx.save();
      ctx.globalAlpha = FLASH_PEAK * (1 - k);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 3) 上下黑边:0~0.4s 滑入,0.8~1.2s 滑出(带细金边,与现有 Boss 黑边风格一致)
    let bar = 0;
    if (t < BAR_IN_DUR) {
      bar = BAR_H * easeOutCubic(t / BAR_IN_DUR);
    } else if (t < BAR_OUT_AT) {
      bar = BAR_H;
    } else if (t < BAR_OUT_AT + BAR_OUT_DUR) {
      bar = BAR_H * (1 - easeInCubic((t - BAR_OUT_AT) / BAR_OUT_DUR));
    }
    if (bar > 0.5) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
      ctx.fillStyle = 'rgba(224,183,106,0.4)';
      ctx.fillRect(0, bar - 1, W, 1);
      ctx.fillRect(0, H - bar, W, 1);
    }
  }
}
