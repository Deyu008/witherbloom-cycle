// camera.js — 摄像机(死区跟随 + 平滑 + trauma 屏震 + 世界边界钳制)
export class Camera {
  constructor(viewW, viewH) {
    this.x = 0; this.y = 0;
    this.viewW = viewW; this.viewH = viewH;
    this.targetX = 0; this.targetY = 0;
    this.shakeX = 0; this.shakeY = 0;
    // 手感参数集中(可逐章微调)
    this.smoothRate = 6.9;        // 跟随平滑速率(1/s,指数平滑)
    this.deadzone = { w: 48, h: 32 }; // 死区盒:溢出量才转移锚点,微移不带动画面
    this.lookAhead = 30;          // 朝移动方向前探(像素;由 GameScene 消费)
    this.shakeMaxPx = 22;         // trauma=1 时的最大震幅
    this.traumaDecay = 1.5;       // trauma 每秒衰减
    this.shakeScale = 1;          // 无障碍:0 = 关闭屏震
    // trauma 屏震状态
    this.trauma = 0;
    this._st = 0;
    this._ph1 = Math.random() * 10;
    this._ph2 = Math.random() * 10;
    // 死区锚点(世界坐标)
    this._ax = null; this._ay = null;
    this.bounds = null; // { w, h } 世界像素尺寸
  }

  setBounds(w, h) { this.bounds = { w, h }; }

  // 死区跟随:目标点只有溢出死区盒的部分才推动锚点 → 俯视角下
  // 玩家小幅走位/受击微移不会让画面跟着抖,大幅移动仍然顺滑跟上
  follow(targetX, targetY) {
    if (this._ax === null) { this._ax = targetX; this._ay = targetY; }
    const dx = targetX - this._ax, dy = targetY - this._ay;
    const hw = this.deadzone.w / 2, hh = this.deadzone.h / 2;
    if (dx > hw) this._ax += dx - hw;
    else if (dx < -hw) this._ax += dx + hw;
    if (dy > hh) this._ay += dy - hh;
    else if (dy < -hh) this._ay += dy + hh;
    this.targetX = this._ax - this.viewW / 2;
    this.targetY = this._ay - this.viewH / 2;
  }

  snap(x, y) {
    this._ax = x; this._ay = y;
    this.targetX = x - this.viewW / 2;
    this.targetY = y - this.viewH / 2;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  // 事件 → trauma 累加(旧 API 保留:intensity 2-22 线性映射到 0.1-1.0)。
  // 累加而非覆盖:大震衰减途中来一次小震不再重置整个衰减进度(旧实现的拖尾问题);
  // 实际震幅 = trauma²,小震更收敛、大震更猛烈
  shake(intensity = 8, _duration = 0.3) {
    this.trauma = Math.min(1, this.trauma + Math.max(0.08, intensity / 22));
  }

  update(dt) {
    const k = 1 - Math.exp(-this.smoothRate * dt); // 帧率无关的指数平滑
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    // 钳制在世界内(世界比视口大时)
    if (this.bounds) {
      const maxX = Math.max(0, this.bounds.w - this.viewW);
      this.x = Math.max(0, Math.min(maxX, this.x));
      const maxY = Math.max(0, this.bounds.h - this.viewH);
      this.y = Math.max(0, Math.min(maxY, this.y));
    }
    // trauma 屏震:平滑正弦采样(两轴不同频率避免锁步),按平方映射衰减
    if (this.trauma > 0) {
      this._st += dt;
      this.trauma = Math.max(0, this.trauma - dt * this.traumaDecay);
      if (this.trauma === 0) {
        this.shakeX = 0; this.shakeY = 0;
      } else {
        const amp = this.trauma * this.trauma * this.shakeMaxPx * (this.shakeScale ?? 1);
        this.shakeX = Math.sin(this._st * 57 + this._ph1) * amp;
        this.shakeY = Math.sin(this._st * 49 + this._ph2) * amp;
      }
    } else if (this.shakeX !== 0 || this.shakeY !== 0) {
      this.shakeX = 0; this.shakeY = 0;
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
