// input.js — 输入管理(键鼠 + 手柄 + 触摸)
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.keysJustPressed = new Set();
    this.keysJustReleased = new Set();
    this.mouseX = -1e9; this.mouseY = -1e9; // 未动过鼠标时不激活鼠标瞄准
    this._mouseSeen = false;                // 首次 mousemove 才开始精瞄(初始 0,0 会让开局朝世界左上角挥空)
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
      this._mouseSeen = true;
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
    // 触摸: 左侧半屏 = 摇杆,右侧 = 攻击/冲刺,底排 = 技能/交互按钮(首次触摸后显示)
    const c = this.canvas;
    this.touchMode = false;   // 首次触摸后 true(桌面玩家永不显示按钮)
    this.touchTap = null;     // 本帧轻点(canvas 坐标;对话/选项用),endFrame 清空
    c.addEventListener('touchstart', e => {
      this._signalFirstGesture();
      this.touchMode = true;
      e.preventDefault();
      for (const t of e.changedTouches) {
        const rect = c.getBoundingClientRect();
        const x = (t.clientX - rect.left) * (c.width / rect.width);
        const y = (t.clientY - rect.top) * (c.height / rect.height);
        // 1) 动作按钮优先(T 交互 / Q R E F 技能)
        const btn = this.getTouchButtons().find(b => Math.hypot(x - b.x, y - b.y) < b.r + 10);
        if (btn) { this.keysJustPressed.add(btn.code); continue; }
        // 2) 摇杆 / 冲刺 / 攻击分区
        if (x < c.width / 2) {
          // 移动虚拟摇杆
          this._touchMove = { x, y, id: t.identifier, sx: x, sy: y };
        } else {
          if (y < c.height / 2) this.keysJustPressed.add('Space'); // 冲刺
          else this.mouseJustClicked = true; // 攻击
        }
        // 轻点事件(对话推进/选项选择;与按钮/摇杆分区并存)
        this.touchTap = { x, y };
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

  // 底排动作按钮布局(canvas 坐标):交互 + 三技能 + 露珠饮用
  // y 定位在技能栏面板(≈H-90)上方,不遮冷却图标
  getTouchButtons() {
    const c = this.canvas;
    const codes = ['KeyT', 'KeyQ', 'KeyE', 'KeyR', 'KeyF'];
    const labels = ['T', 'Q', 'E', 'R', 'F'];
    const r = Math.max(30, Math.round(c.height * 0.052));
    const gap = r * 2 + 14;
    const x0 = c.width / 2 - gap * 2;
    const y = c.height - r - 100;
    return codes.map((code, i) => ({ code, label: labels[i], x: x0 + i * gap, y, r }));
  }

  // 在每帧结尾清空"just pressed"标记
  endFrame() {
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
    this.mouseJustClicked = false;
    this.mouseRightJust = false;
    this.touchTap = null;
  }
}
