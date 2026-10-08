// menuNav.js — 统一菜单导航(键盘/手柄/鼠标/触屏指针)
// 消除各场景手写导航的语义漂移:回绕、灰显跳过、hover 音、Backspace 返回、指针命中。
// 用法:
//   this.nav = new MenuNav(game, { onConfirm: (i) => ... });
//   update: this.nav.update();                 // 键盘步进 + 指针 hover/点击(点击即确认)
//   render: this.nav.hit(i, x, y, w, h, enabled); // 布局阶段登记命中矩形(渲染每帧刷新)
export class MenuNav {
  constructor(game, opts = {}) {
    this.game = game;
    this.index = 0;
    this.items = [];                        // 命中矩形(渲染阶段登记,update 消费上一帧的)
    this.wrap = opts.wrap !== false;        // 统一回绕(chapterSelect 曾用 clamp,属漂移)
    this.horizontal = !!opts.horizontal;    // 横排菜单(←→ 步进)
    this.both = !!opts.both;                // 四方向都步进(职业选择卡片)
    this.onHover = opts.onHover ?? (() => game.audio.sfxHover());
    this.onConfirm = opts.onConfirm ?? null;
  }

  // 渲染阶段登记第 index 项的命中矩形(enabled=false 的项导航跳过、不可点击)
  hit(index, x, y, w, h, enabled = true) {
    this.items[index] = { x, y, w, h, enabled };
  }

  _enabled(i) { return this.items[i] ? this.items[i].enabled !== false : true; }

  _step(dir) {
    const n = this.items.length;
    if (n === 0) return;
    for (let s = 1; s <= n; s++) {
      let i = this.index + dir * s;
      if (this.wrap) i = ((i % n) + n) % n;
      else i = Math.max(0, Math.min(n - 1, i));
      if (this._enabled(i)) {
        if (i !== this.index) { this.index = i; this.onHover?.(this.index); }
        return;
      }
    }
  }

  _hitTest(x, y) {
    for (let i = 0; i < this.items.length; i++) {
      const r = this.items[i];
      if (!r || r.enabled === false) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  // 当前指针(触屏轻点优先,其次已见鼠标);无则 null
  _pointer() {
    const k = this.game.input;
    if (k.touchTap) return { x: k.touchTap.x, y: k.touchTap.y, click: true };
    if (k._mouseSeen) return { x: k.mouseX, y: k.mouseY, click: !!k.mouseJustClicked };
    return null;
  }

  update() {
    const k = this.game.input;
    if (this.horizontal || this.both) {
      if (k.justPressed('navLeft')) this._step(-1);
      if (k.justPressed('navRight')) this._step(1);
    }
    if (!this.horizontal || this.both) {
      if (k.justPressed('navUp')) this._step(-1);
      if (k.justPressed('navDown')) this._step(1);
    }
    const p = this._pointer();
    if (p) {
      const i = this._hitTest(p.x, p.y);
      if (i >= 0 && i !== this.index) { this.index = i; this.onHover?.(this.index); }
      if (p.click && i >= 0) { this.index = i; this.onConfirm?.(this.index); }
    }
    if (k.justPressed('confirm')) this.onConfirm?.(this.index);
  }
}
