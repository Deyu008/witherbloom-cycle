// input.js — 输入管理(键鼠 + 手柄 + 触摸)
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.keysJustPressed = new Set();
    this.keysJustReleased = new Set();
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.mouseJustClicked = false;
    this.mouseRightDown = false;
    this.mouseRightJust = false;
    this.onFirstGesture = null;
    this._firstGestureDone = false;

    this._setupKey();
    this._setupMouse();
    this._setupTouch();
  }

  _signalFirstGesture() {
    if (this._firstGestureDone) return;
    this._firstGestureDone = true;
    this.onFirstGesture?.();
  }

  _setupKey() {
    // 用 document 接收 keydown,这样即使 canvas 失焦也能收到
    document.addEventListener('keydown', e => {
      this._signalFirstGesture();
      if (!this.keys.has(e.code)) this.keysJustPressed.add(e.code);
      this.keys.add(e.code);
      // 防止方向键滚动页面
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      this.keysJustReleased.add(e.code);
    });
    // 失焦时清空,避免卡键
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.mouseRightDown = false;
    });
  }

  _setupMouse() {
    const c = this.canvas;
    c.addEventListener('mousemove', e => {
      const rect = c.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) * (c.width / rect.width);
      this.mouseY = (e.clientY - rect.top) * (c.height / rect.height);
    });
    c.addEventListener('mousedown', e => {
      this._signalFirstGesture();
      if (e.button === 0) { this.mouseDown = true; this.mouseJustClicked = true; }
      if (e.button === 2) { this.mouseRightDown = true; this.mouseRightJust = true; }
      e.preventDefault();
    });
    c.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  _setupTouch() {
    // 触摸: 左侧半屏 = 摇杆,右侧 = 攻击/冲刺
    const c = this.canvas;
    c.addEventListener('touchstart', e => {
      this._signalFirstGesture();
      e.preventDefault();
      for (const t of e.changedTouches) {
        const rect = c.getBoundingClientRect();
        const x = (t.clientX - rect.left) * (c.width / rect.width);
        const y = (t.clientY - rect.top) * (c.height / rect.height);
        if (x < c.width / 2) {
          // 移动虚拟摇杆
          this._touchMove = { x, y, id: t.identifier, sx: x, sy: y };
        } else {
          if (y < c.height / 2) this.keysJustPressed.add('Space'); // 跳跃
          else this.mouseJustClicked = true; // 攻击
        }
      }
    }, { passive: false });
    c.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._touchMove && this._touchMove.id === t.identifier) {
          const rect = c.getBoundingClientRect();
          this._touchMove.x = (t.clientX - rect.left) * (c.width / rect.width);
          this._touchMove.y = (t.clientY - rect.top) * (c.height / rect.height);
        }
      }
    }, { passive: false });
    c.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (this._touchMove && this._touchMove.id === t.identifier) {
          this._touchMove = null;
        }
      }
    });
  }

  getMoveAxis() {
    // 优先键盘,否则触摸
    let dx = 0, dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy += 1;
    if (this._touchMove) {
      const t = this._touchMove;
      const ddx = t.x - t.sx, ddy = t.y - t.sy;
      const d = Math.hypot(ddx, ddy);
      if (d > 8) {
        dx = ddx / d;
        dy = ddy / d;
      } else { dx = 0; dy = 0; }
    }
    return { x: dx, y: dy };
  }

  // 在每帧结尾清空"just pressed"标记
  endFrame() {
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
    this.mouseJustClicked = false;
    this.mouseRightJust = false;
  }
}
