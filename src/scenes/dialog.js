// scenes/dialog.js — 对话场景(可被嵌入或独立使用)
// BOSS 对话 → 立绘映射(素材已由 assets.js 预加载,按节点 id 前缀命中)
const DIALOG_PORTRAITS = {
  forest_keeper: 'boss1',
  burning_king: 'boss2',
  chronomancer: 'boss3',
  forgotten: 'boss4',
  // NPC 立绘(mmx 生成):按对话节点 id 前缀命中
  child_: 'npc_child',
  elder: 'npc_elder',
  blacksmith: 'npc_blacksmith',
  gladiator: 'npc_blacksmith',
  burning_daughter: 'npc_ash_daughter',
  gravedigger: 'npc_gravedigger',
  scholar_: 'npc_scholar',
  root_: 'npc_scholar',
  echo_first: 'npc_first_echo',
  intro_: null, // 王树旁白无立绘
};
// 对话背景 → 资源 key(仅个别叙事场景挂背景)
const DIALOG_BGS = {
  scholar_1: 'ch3_library',
  scholar_2: 'ch3_library',
  root_1: 'ch3_library', root_2: 'ch3_library', root_3: 'ch3_library',
  root_4: 'ch3_library', root_5: 'ch3_library', root_6: 'ch3_library',
  root_7: 'ch3_library',
};

import { text } from '../pixelfont.js';
import { state } from '../state.js';
import { DIALOGS } from '../data/dialog.js';
import { dialogBox } from '../uiKit.js';

export class DialogScene {
  constructor(game) { this.game = game; this.t = 0; this.node = null; this.lineIdx = 0; this.lineT = 0; this.finished = false; this.choices = null; this.callback = null; this.speakerPortrait = null; this.bg = null; }
  enter(opts) {
    this.t = 0;
    this.lineT = 0;
    this.finished = false;
    this.callback = opts.onFinish || null;
    this.speakerPortrait = opts.portrait || null;
    this.bg = opts.bg || null;
    // 解析节点
    const nodeId = opts.id;
    // BOSS/NPC 对话自动挂立绘(按 id 前缀命中;含链式节点如 burning_daughter_lullaby)
    if (!this.speakerPortrait) {
      const key = Object.keys(DIALOG_PORTRAITS).find(p => nodeId.startsWith(p));
      if (key && DIALOG_PORTRAITS[key]) {
        this.speakerPortrait = this.game.assets?.cutscenes?.[DIALOG_PORTRAITS[key]] || null;
      }
    }
    // 叙事场景背景(如倒悬学院)
    if (!this.bg && DIALOG_BGS[nodeId]) {
      this.bg = this.game.assets?.cutscenes?.[DIALOG_BGS[nodeId]] || null;
    }
    this.node = DIALOGS[nodeId] || null;
    if (!this.node) {
      console.warn('对话节点不存在:', nodeId);
      this.finished = true;
      this.callback?.();
      return;
    }
    // 条件过滤
    if (this.node.condition && !this.node.condition(state)) {
      // 尝试回退
      const alt = nodeId + '_no';
      if (DIALOGS[alt]) this.node = DIALOGS[alt];
    }
    this.lineIdx = 0;
    this.choices = this.node.choices || null;
    this.game.audio.sfxClick();
  }

  update(dt) {
    this.t += dt;
    this.lineT += dt;
    const k = this.game.input;
    // 触屏轻点:有选项时按命中行选择,否则推进
    if (k.touchTap) {
      if (this.choices && this.lineIdx >= this.node.lines.length - 1) {
        const boxY = this.game.canvas.height - 200;
        const tap = k.touchTap;
        for (let i = 0; i < this.choices.length; i++) {
          const rowY = boxY + 96 + i * 27 + 11; // 与 render 的选项行布局一致(顶部基准+半行高)
          if (Math.abs(tap.y - rowY) < 18) {
            this.game.audio.sfxClick();
            this._choose(i);
            return;
          }
        }
      }
      this.game.audio.sfxClick();
      this._next();
      return;
    }
    if (k.keysJustPressed.has('Space') || k.keysJustPressed.has('Enter') || k.mouseJustClicked) {
      this.game.audio.sfxClick();
      this._next();
    }
    // 数字键选选项
    if (this.choices && this.lineIdx >= this.node.lines.length - 1) {
      for (let i = 0; i < this.choices.length; i++) {
        if (k.keysJustPressed.has('Digit' + (i + 1))) {
          this.game.audio.sfxClick();
          this._choose(i);
        }
      }
    }
  }

  _next() {
    if (!this.node) return;
    if (this.node.echo) this._collectEcho(this.node.echo);
    if (this.lineIdx < this.node.lines.length - 1) {
      this.lineIdx++;
      this.lineT = 0;
    } else {
      // 当前节点结束
      if (this.choices) return; // 等选择
      if (this.node.next) {
        const next = DIALOGS[this.node.next];
        if (next) {
          this.node = next;
          this.lineIdx = 0;
          this.lineT = 0;
          this.choices = next.choices || null;
          return;
        }
      }
      if (this.node.onFinish) {
        // 处理剧情触发
        this._handleOnFinish(this.node.onFinish);
      }
      this.finished = true;
      this.callback?.();
    }
  }

  _collectEcho(id) {
    if (!state.echoes) state.echoes = [];
    if (state.echoes.includes(id)) return;
    state.echoes.push(id);
    const p = this.game.current?.player;
    if (p) this.game.spawnFloatText(p.x, p.y - 40, '◆ 记忆已收录', '#b78ce0');
  }

  _choose(idx) {
    if (!this.choices) return;
    const ch = this.choices[idx];
    if (ch.next) {
      const next = DIALOGS[ch.next];
      if (next) {
        this.node = next;
        this.lineIdx = 0;
        this.lineT = 0;
        this.choices = next.choices || null;
        return;
      }
    }
    if (ch.onFinish) this._handleOnFinish(ch.onFinish);
    this.finished = true;
    this.callback?.();
  }

  _handleOnFinish(handler) {
    // 解析剧情指令
    if (handler.startsWith('flag:')) {
      const flag = handler.slice(5);
      state.flags[flag] = true;
    } else if (handler === 'ending_choice') {
      // 寂渊终问之后进入结局(数据侧入口;boss.js 传函数 onFinish 时走那条路)
      this.game.goto('ending');
    } else if (handler.startsWith('collected:')) {
      const k = handler.slice(10);
      state.collected[k] = true;
    } else if (handler === 'goto_village') {
      // 子指令
    } else if (handler === 'forest_keeper_released') {
      // "释怀"只作为叙事标记;不等于通关。通关只在 BOSS 被击败时(boss.onKilled)。
      state.flags.boss1_released = true;
    } else if (handler === 'burning_king_released') {
      state.flags.boss2_released = true;
    } else if (handler === 'chronomancer_released') {
      // 编年者"释怀"标志 —— 与 boss1/boss2 对称,只为共忆结局留路
      state.flags.boss3_released = true;
    } else if (handler === 'seven_roots_check') {
      // 倒悬学院支线:集齐 7 段根者残响 → 一次性奖励(碎片 + 专属记忆)
      const ROOT_ECHOES = ['root_spring', 'root_summer', 'root_autumn', 'root_winter', 'root_chronicle', 'root_hearth', 'root_seventh'];
      const all = ROOT_ECHOES.every(id => (state.echoes || []).includes(id));
      if (all && !state.flags.seven_roots_done) {
        state.flags.seven_roots_done = true;
        state.shards += 2;
        if (!(state.echoes || []).includes('seven_roots')) state.echoes.push('seven_roots');
        const p = this.game.current?.player;
        if (p) {
          this.game.spawnFloatText(p.x, p.y - 40, '七根者 · 回响齐全(+2 碎片)', '#e0b76a');
          this.game.spawnLevelUpParticles(p.x, p.y);
        }
        if (this.game.audio?.sfxSecret) this.game.audio.sfxSecret();
      }
    }
    // 注意:章节通关与结局一律由 boss.onKilled 触发,不再由对话直接完成
  }

  render(ctx) {
    if (!this.node) return;
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景(可在 game 场景之上叠加)
    if (this.bg) {
      ctx.globalAlpha = 0.3;
      const scale = Math.max(W / this.bg.width, H / this.bg.height);
      const w = this.bg.width * scale, h = this.bg.height * scale;
      ctx.drawImage(this.bg, (W - w) / 2, (H - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
    // 半透明黑底
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, W, H);

    // 对话框
    const boxY = H - 200;
    const boxH = 180;
    // 内部半透明深色底(保证文字可读)
    ctx.fillStyle = 'rgba(12, 10, 20, 0.95)';
    ctx.fillRect(40, boxY, W - 80, boxH);
    dialogBox(ctx, 40, boxY, W - 80, boxH);

    // BOSS 立绘(若有):完整收进对话框内部左侧,不留半悬空(艺术图留白大,骑框会像没对齐)
    if (this.speakerPortrait) {
      const pSize = 150;
      const px = 56, py = boxY + 15;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.t * 3);
      // 底框
      ctx.fillStyle = 'rgba(12, 10, 20, 0.95)';
      ctx.fillRect(px - 5, py - 5, pSize + 10, pSize + 10);
      ctx.strokeStyle = '#6a4a9a';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 4, py - 4, pSize + 8, pSize + 8);
      ctx.drawImage(this.speakerPortrait, px, py, pSize, pSize);
      ctx.restore();
    }
    // 文本(有立绘时右移避让)
    const textX = this.speakerPortrait ? 240 : 170;
    const line = this.node.lines[this.lineIdx];
    if (line) {
      text(ctx, line.speaker, textX, boxY + 24, 'medium', '#e0b76a');
      const reveal = Math.min(1, this.lineT * 1.5);
      const visible = line.text.substring(0, Math.floor(line.text.length * reveal));
      text(ctx, visible, textX, boxY + 60, 'medium', '#f4ecd0');
    }
    // 选项(收在框内:3 条时最后一条不越出底边)
    if (this.choices && this.lineIdx === this.node.lines.length - 1) {
      for (let i = 0; i < this.choices.length; i++) {
        const c = this.choices[i];
        text(ctx, `[${i + 1}] ${c.text}`, W / 2, boxY + 96 + i * 27, 'medium', '#b78ce0', { align: 'center' });
      }
    }
    // 推进提示
    const blink = (Math.sin(this.t * 4) + 1) * 0.5;
    ctx.globalAlpha = blink * 0.7;
    text(ctx, '▶', W - 70, boxY + boxH - 30, 'medium', '#b78ce0');
    ctx.globalAlpha = 1;
  }
}
