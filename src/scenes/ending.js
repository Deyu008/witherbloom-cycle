// scenes/ending.js — 结局画面
import { text } from '../pixelfont.js';
import { state } from '../state.js';

export class EndingScene {
  constructor(game) { this.game = game; this.t = 0; this.ending = 'shared'; this.lines = []; this.lineIdx = 0; this.lineT = 0; this.bg = null; this.fadeT = 0; }

  enter() {
    this.t = 0;
    this.fadeT = 0;
    // 根据状态选择结局
    const f = state.flags;
    // 背叛杀:Boss 力竭放下刀后仍被击杀(bossN_betrayed)——寂灭结局的"处决"变体
    this.betrayed = !!(f.boss1_betrayed || f.boss2_betrayed || f.boss3_betrayed || f.boss4_betrayed);
    if (f.boss1_released && f.boss2_released && f.boss3_released && state.collected.seventhCrest) {
      this.ending = 'shared'; // 共忆
    } else if (f.boss1_defeated && f.boss2_defeated && f.boss3_defeated) {
      this.ending = 'extinct'; // 寂灭
    } else {
      this.ending = 'amnesia'; // 失忆
    }
    this.bg = this.game.assets.cutscenes.ending || this.game.assets.cutscenes.ch4 || null;
    this.lines = this._getLines();
    this.lineIdx = 0;
    this.lineT = 0;
    this.game.audio.sfxChapter();
  }

  _getLines() {
    if (this.ending === 'shared') return [
      { speaker: '旁白', text: '寂渊放下了执念。' },
      { speaker: '寂渊', text: '你问了我的名字。' },
      { speaker: '寂渊', text: '一千二百年了——终于,有人问。' },
      { speaker: '寂渊', text: '我愿化作风,化水,化叶脉里的一行字。' },
      { speaker: '寂渊', text: '我把「回声」献给王树,作为新种。' },
      { speaker: '旁白', text: '他与你一同,回到了王树下。' },
      { speaker: '旁白', text: '循环没有结束。' },
      { speaker: '旁白', text: '但从此,循环里多了一个被记得的名字。' },
      { speaker: '旁白', text: '世界,多了一种颜色——' },
      { speaker: '旁白', text: '紫。寂渊的颜色。' },
      { speaker: '王树', text: '谢谢你们,替我记住了他。' },
    ];
    if (this.ending === 'extinct') {
      const lines = [
        { speaker: '旁白', text: '寂渊消散了。' },
        { speaker: '旁白', text: '没有风,没有叶脉,没有歌。' },
        { speaker: '寂渊', text: '……这样,也好。' },
        { speaker: '寂渊', text: '不必再被忘记了。' },
        { speaker: '寂渊', text: '因为——再也没有人,记得任何事。' },
        { speaker: '旁白', text: '世界归于纯白。' },
        { speaker: '旁白', text: '没有循环,没有记忆,没有名字。' },
        { speaker: '旁白', text: '只有一片空白,在曾经是王树的地方,轻轻哼着——' },
        { speaker: '旁白', text: '一首,从未存在过的摇篮曲。' },
      ];
      // 处决变体:曾在他们力竭放下刀时挥下 —— 寂灭线里多一记道德回声
      if (this.betrayed) {
        lines.splice(4, 0,
          { speaker: '寂渊', text: '你打败的那些人里——' },
          { speaker: '寂渊', text: '有几个,曾经放下了刀。' });
        lines.push({ speaker: '旁白', text: '而空白,不记得你曾有机会停手。' });
      }
      return lines;
    }
    return [
      { speaker: '旁白', text: '你打败了寂渊。' },
      { speaker: '旁白', text: '世界,回到了循环。' },
      { speaker: '寂渊', text: '……你,也没问。' },
      { speaker: '寂渊', text: '没关系。下一个回响者,或许会问。' },
      { speaker: '旁白', text: '回声果在你掌心成熟,然后碎开。' },
      { speaker: '旁白', text: '你忘记了一切——你的名字,你的旅程。' },
      { speaker: '旁白', text: '那些你释怀的人,那些你击败的人。' },
      { speaker: '旁白', text: '都成了风里,模糊的残影。' },
      { speaker: '旁白', text: '但落叶,仍在脚下唱歌。' },
      { speaker: '旁白', text: '仿佛在等,下一个能听见的人。' },
    ];
  }

  update(dt) {
    this.t += dt;
    this.fadeT += dt;
    this.lineT += dt;
    const k = this.game.input;
    const confirm = k.keysJustPressed.has('Space') || k.keysJustPressed.has('Enter') || k.mouseJustClicked;
    if (this.lineIdx < this.lines.length) {
      // 台词阶段:推进/加速
      if (confirm) {
        this.lineT = 0;
        this.lineIdx++;
        this.game.audio.sfxClick();
      }
    } else if (this.t > 4 && confirm) {
      // 结算阶段:回到标题(输入统一在 update 处理,不在 render 里读)
      this.game.audio.sfxChapter();
      this.game.save?.save(state.currentSlot || 0); // 结局写入当前游玩槽位
      this.game.goto('title');
    }
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (this.bg) {
      const alpha = Math.min(0.5, this.fadeT * 0.3);
      ctx.globalAlpha = alpha;
      const scale = Math.max(W / this.bg.width, H / this.bg.height);
      const w = this.bg.width * scale, h = this.bg.height * scale;
      ctx.drawImage(this.bg, (W - w) / 2, (H - h) / 2, w, h);
      ctx.globalAlpha = 1;
    }
    // 标题
    if (this.fadeT < 2) {
      const a = Math.min(1, this.fadeT * 0.5);
      ctx.globalAlpha = a;
      const titleMap = {
        shared: '共 忆 结 局',
        extinct: '寂 灭 结 局',
        amnesia: '失 忆 结 局',
      };
      const colorMap = {
        shared: '#b78ce0',
        extinct: '#c0c0c0',
        amnesia: '#a8945a',
      };
      text(ctx, titleMap[this.ending], W / 2, 200, 'hero', colorMap[this.ending], { align: 'center' });
      ctx.globalAlpha = 1;
    }
    // 文本
    if (this.lineIdx < this.lines.length) {
      const line = this.lines[this.lineIdx];
      const lt = this.lineT;
      const reveal = Math.min(1, lt * 1.5);
      const visible = line.text.substring(0, Math.floor(line.text.length * reveal));
      text(ctx, line.speaker, W / 2, H - 250, 'medium', '#e0b76a', { align: 'center' });
      text(ctx, visible, W / 2, H - 200, 'medium', '#f4ecd0', { align: 'center' });
    } else {
      // 总结
      const stats = state.stats;
      const minutes = Math.floor(state.playTime / 60);
      const seconds = Math.floor(state.playTime % 60);
      text(ctx, '游戏结束', W / 2, H - 280, 'large', '#e0b76a', { align: 'center' });
      text(ctx, `游玩时间  ${minutes} 分 ${seconds} 秒`, W / 2, H - 220, 'medium', '#d6c8a4', { align: 'center' });
      text(ctx, `击杀  ${stats.kills}`, W / 2, H - 180, 'small', '#a8945a', { align: 'center' });
      text(ctx, `击败 BOSS  ${stats.bossesDefeated}`, W / 2, H - 150, 'small', '#a8945a', { align: 'center' });
      text(ctx, `发现秘密  ${stats.secretsFound}`, W / 2, H - 120, 'small', '#a8945a', { align: 'center' });
      text(ctx, '感谢你陪寂渊走完这段旅程', W / 2, H - 60, 'medium', '#b78ce0', { align: 'center' });
      const blink = (Math.sin(this.t * 3) + 1) * 0.5;
      ctx.globalAlpha = blink * 0.7;
      text(ctx, '按 SPACE / 点击 回到标题', W / 2, H - 20, 'small', '#a8945a', { align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
}
