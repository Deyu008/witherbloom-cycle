// ambiance.js — 章节主题环境氛围层(屏幕空间近景粒子)
// 春孢子(上浮微光)/ 夏灰烬(上升火星)/ 秋落叶(旋转下落)/ 冬雪花(飘落)
// 屏幕坐标,跟随屏幕(视差近景),轻量;渲染在场景内容之上、HUD/对话之下。
const PROFILES = {
  1: { count: 62, kind: 'spore',  colors: ['#a8e8b0', '#e89cb4', '#b78ce0'], size: [2, 4],    alpha: 0.72, additive: true },
  2: { count: 66, kind: 'ember',  colors: ['#ffc060', '#ff8040', '#e87a3c'], size: [1.5, 3.5], alpha: 0.82, additive: true },
  3: { count: 54, kind: 'leaf',   colors: ['#d6a85a', '#c08a4a', '#e0c890'], size: [2.5, 5],   alpha: 0.85, additive: false },
  4: { count: 82, kind: 'snow',   colors: ['#ffffff', '#e8f0ff', '#c4d8e8'], size: [2, 4],     alpha: 0.85, additive: true },
};

export class AmbientLayer {
  constructor() { this.bits = []; this.profile = null; this.t = 0; this.viewW = 1280; this.viewH = 720; }

  configure(chapter, viewW, viewH) {
    this.profile = PROFILES[chapter] || PROFILES[1];
    this.viewW = viewW; this.viewH = viewH;
    this.bits.length = 0;
    for (let i = 0; i < this.profile.count; i++) this.bits.push(this._spawn(true));
  }

  _spawn(initial) {
    const p = this.profile;
    return {
      x: Math.random() * this.viewW,
      y: initial ? Math.random() * this.viewH : -10,
      size: p.size[0] + Math.random() * (p.size[1] - p.size[0]),
      color: p.colors[(Math.random() * p.colors.length) | 0],
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 4,
    };
  }

  update(dt) {
    if (!this.profile) return;
    this.t += dt;
    const k = this.profile.kind;
    const wind = Math.sin(this.t * 0.3) * 8; // 全局微风
    for (const b of this.bits) {
      if (k === 'spore') { b.vy = -12 + Math.sin(this.t + b.phase) * 4; b.vx = wind * 0.5 + Math.sin(this.t * 0.7 + b.phase) * 6; }
      else if (k === 'ember') { b.vy = -22 - (b.phase % 5); b.vx = wind + Math.sin(this.t * 2 + b.phase) * 12; }
      else if (k === 'leaf') { b.vy = 26 + Math.sin(b.phase) * 6; b.vx = wind + Math.sin(this.t * 1.5 + b.phase) * 20; b.rot += b.rotV * dt; }
      else { b.vy = 24 + Math.sin(b.phase) * 4; b.vx = wind * 0.6 + Math.sin(this.t + b.phase) * 9; } // snow
      b.x += b.vx * dt; b.y += b.vy * dt;
      // 出屏重生
      if (b.y < -20) { b.y = this.viewH + 10; b.x = Math.random() * this.viewW; }
      else if (b.y > this.viewH + 20) { b.y = -10; b.x = Math.random() * this.viewW; }
      if (b.x < -20) b.x = this.viewW + 10;
      else if (b.x > this.viewW + 20) b.x = -10;
    }
  }

  render(ctx) {
    if (!this.profile) return;
    const k = this.profile.kind;
    const a = this.profile.alpha;
    const add = this.profile.additive !== false;
    if (add) ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bits) {
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(this.t * 2 + b.phase));
      ctx.fillStyle = b.color;
      if (k === 'leaf') {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillRect(-b.size, -b.size * 0.5, b.size * 2, b.size); ctx.restore();
      } else {
        // spore / ember / snow:发光圆点(additive 叠加更醒目)
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (add) ctx.globalCompositeOperation = 'source-over';
  }
}
