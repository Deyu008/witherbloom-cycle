// input.js — 输入管理(键鼠 + 手柄 + 触摸)

// 动作映射表:调用方读动作名,键码集中在一处(手柄/触屏注入的键码走同一通道)
export const ACTION_KEYS = {
  navUp: ['ArrowUp', 'KeyW'],
  navDown: ['ArrowDown', 'KeyS'],
  navLeft: ['ArrowLeft', 'KeyA'],
  navRight: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  cancel: ['Escape'],
  back: ['Backspace'],
  attack: ['KeyJ'],
  dash: ['Space'],
  skillQ: ['KeyQ'],
  skillE: ['KeyE'],
  skillR: ['KeyR'],
  useDew: ['KeyF'],
  interact: ['KeyT'],
  release: ['KeyV'],
  mute: ['KeyM'],
  help: ['Slash', 'KeyH'],
  next: ['KeyN'],
};

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

  // ===== 动作层:按动作名读取(映射见 ACTION_KEYS) =====
  justPressed(action) {
    const ks = ACTION_KEYS[action];
    if (!ks) return false;
    for (const c of ks) if (this.keysJustPressed.has(c)) return true;
    return false;
  }
  held(action) {
    const ks = ACTION_KEYS[action];
    if (!ks) return false;
    for (const c of ks) if (this.keys.has(c)) return true;
    return false;
  }

  // ===== 手柄:每帧轮询,注入与键盘同构的键码(菜单/玩法即刻可用) =====
  // 按钮映射:A=确认+攻击 B=暂停/取消 X=交互 Y=闪避 LB/LT=Q/F RB=RT=E/R Start=暂停
  // 摇杆/十字键 → 方向键(getMoveAxis 读 this.keys,天然兼容)
  pollGamepads() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let gp = null;
    for (const p of pads) { if (p && p.connected) { gp = p; break; } }
    if (!gp) { this._gpPrev = null; return; }
    const st = this._gpPrev || (this._gpPrev = {});
    const BTN_MAP = {
      0: ['Enter', 'KeyJ'], 1: ['Escape'], 2: ['KeyT'], 3: ['Space'],
      4: ['KeyQ'], 5: ['KeyE'], 6: ['KeyF'], 7: ['KeyR'], 9: ['Escape'],
    };
    for (const idx in BTN_MAP) {
      const down = !!(gp.buttons[idx] && gp.buttons[idx].pressed);
      const was = !!st['b' + idx];
      if (down && !was) {
        for (const c of BTN_MAP[idx]) {
          if (!this.keys.has(c)) this.keysJustPressed.add(c);
          this.keys.add(c);
        }
      } else if (!down && was) {
        for (const c of BTN_MAP[idx]) this.keys.delete(c);
      }
      st['b' + idx] = down;
    }
    // 摇杆(带死区)+ 十字键 → 方向键(边沿触发,避免菜单连跳)
    const DZ = 0.38;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const dirs = {
      ArrowLeft: !!(gp.buttons[14] && gp.buttons[14].pressed) || ax < -DZ,
      ArrowRight: !!(gp.buttons[15] && gp.buttons[15].pressed) || ax > DZ,
      ArrowUp: !!(gp.buttons[12] && gp.buttons[12].pressed) || ay < -DZ,
      ArrowDown: !!(gp.buttons[13] && gp.buttons[13].pressed) || ay > DZ,
    };
    for (const code in dirs) {
      const down = !!dirs[code];
      const was = !!st[code];
      if (down && !was) {
        if (!this.keys.has(code)) this.keysJustPressed.add(code);
        this.keys.add(code);
      } else if (!down && was) {
        this.keys.delete(code);
      }
      st[code] = down;
    }
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
