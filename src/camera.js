// camera.js — 摄像机(平滑跟随 + 抖动 + 世界边界钳制)
export class Camera {
  constructor(viewW, viewH) {
    this.x = 0; this.y = 0;
    this.viewW = viewW; this.viewH = viewH;
    this.targetX = 0; this.targetY = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.shakeIntensity = 0;
    this.shakeTime = 0;
    this.shakeMax = 0;
    this.bounds = null; // { w, h } 世界像素尺寸
    this.regionClamp = null; // { minX, maxX } 像素,仅钳制 X
  }

  setBounds(w, h) { this.bounds = { w, h }; }

  setRegionClamp(minPxX, maxPxX) { this.regionClamp = { minX: minPxX, maxX: maxPxX }; }

  clearRegionClamp() { this.regionClamp = null; }

  follow(targetX, targetY) {
    this.targetX = targetX - this.viewW / 2;
    this.targetY = targetY - this.viewH / 2;
  }

  snap(x, y) {
    this.targetX = x - this.viewW / 2;
    this.targetY = y - this.viewH / 2;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  shake(intensity = 8, duration = 0.3) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeMax = Math.max(this.shakeMax, duration);
    this.shakeTime = 0;
  }

  update(dt) {
    const k = 1 - Math.pow(0.001, dt);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    // 钳制在世界内(世界比视口大时)
    if (this.regionClamp) {
      const minX = this.regionClamp.minX;
      const maxX = Math.max(minX, this.regionClamp.maxX - this.viewW);
      this.x = Math.max(minX, Math.min(maxX, this.x));
    } else if (this.bounds) {
      const maxX = Math.max(0, this.bounds.w - this.viewW);
      this.x = Math.max(0, Math.min(maxX, this.x));
    }
    if (this.bounds) {
      const maxY = Math.max(0, this.bounds.h - this.viewH);
      this.y = Math.max(0, Math.min(maxY, this.y));
    }
    if (this.shakeMax > 0) {
      this.shakeTime += dt;
      if (this.shakeTime >= this.shakeMax) {
        this.shakeIntensity = 0; this.shakeMax = 0;
        this.shakeX = 0; this.shakeY = 0;
      } else {
        const t = 1 - (this.shakeTime / this.shakeMax);
        const r = this.shakeIntensity * t;
        this.shakeX = (Math.random() - 0.5) * 2 * r;
        this.shakeY = (Math.random() - 0.5) * 2 * r;
      }
    }
  }

  worldToScreen(wx, wy) {
    return { x: wx - this.x + this.shakeX, y: wy - this.y + this.shakeY };
  }
  // 标量版本(避免热点路径每次分配 {x,y} 对象)
  screenX(wx) { return wx - this.x + this.shakeX; }
  screenY(wy) { return wy - this.y + this.shakeY; }
  // 点是否在可见视口内(含 margin,供粒子/拾取物视口剔除)
  inView(wx, wy, margin = 0) {
    return wx - this.x > -margin && wx - this.x < this.viewW + margin &&
           wy - this.y > -margin && wy - this.y < this.viewH + margin;
  }
}
