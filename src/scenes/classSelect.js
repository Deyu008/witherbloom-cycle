// scenes/classSelect.js — 三职业(回响倾向)选择
import { text } from '../pixelfont.js';
import { state, freshState } from '../state.js';
import { SPRITE_LIB } from '../sprite.js';
import { MenuNav } from '../menuNav.js';

// 基础数值(必须与 state.freshState() 默认对齐)
const BASE_HP = 100;
const BASE_MP = 60;
const BASE_ATK = 14;

// 各职业说明与预览文本
const CLASSES = [
  {
    id: 'recall',
    name: '追忆者',
    tagline: '记忆的引路人',
    desc: '魔法倾向。以回声为刃、以追忆为盾。',
    stats: [
      { label: '生命', delta: 0, text: '100' },
      { label: '法力', delta: +30, text: '78 (+30%)' },
      { label: '攻击', delta: -15, text: '12 (-15%)' },
      { label: '冷却', delta: 0, text: '标准' },
    ],
    color: '#b78ce0', // 紫 — 追忆
  },
  {
    id: 'forge',
    name: '锻体者',
    tagline: '铁与火的行者',
    desc: '近战倾向。以肉身承伤、以执念冲锋。',
    stats: [
      { label: '生命', delta: +30, text: '130 (+30%)' },
      { label: '法力', delta: -20, text: '48 (-20%)' },
      { label: '攻击', delta: 0, text: '14' },
      { label: '冷却', delta: 0, text: '标准' },
    ],
    color: '#e07a4a', // 橙 — 锻炉
  },
  {
    id: 'weave',
    name: '织梦者',
    tagline: '丝线的编织者',
    desc: '辅助倾向。冷却更短、节奏更快。',
    stats: [
      { label: '生命', delta: -10, text: '90 (-10%)' },
      { label: '法力', delta: 0, text: '60' },
      { label: '攻击', delta: 0, text: '14' },
      { label: '冷却', delta: -25, text: '×0.75' },
    ],
    color: '#6ab0e0', // 蓝 — 织梦
  },
];

// 把 class 写入 state 并应用数值
function applyClassToState(id) {
  state.heroClass = id;
  if (id === 'recall') {
    state.maxMp = Math.round(BASE_MP * 1.3);   // 78
    state.maxHp = BASE_HP;                       // 100
    // 攻击减 15% — 取 Math.round(14 * 0.85) = 12(更贴近 -15% 的"略微弱势"幅度)
    // (职业攻击差异由 player.js 读 CLASS_MODS.attackDamage,_classAtk 双轨已删)
  } else if (id === 'forge') {
    state.maxHp = Math.round(BASE_HP * 1.3);    // 130
    state.maxMp = Math.round(BASE_MP * 0.8);    // 48
    // (职业攻击差异由 player.js 读 CLASS_MODS.attackDamage,_classAtk 双轨已删)
  } else if (id === 'weave') {
    state.maxHp = Math.round(BASE_HP * 0.9);    // 90
    state.maxMp = BASE_MP;                       // 60
    // (职业攻击差异由 player.js 读 CLASS_MODS.attackDamage,_classAtk 双轨已删)
  } else {
    state.maxHp = BASE_HP;
    state.maxMp = BASE_MP;
    // (职业攻击差异由 player.js 读 CLASS_MODS.attackDamage,_classAtk 双轨已删)
  }
  // 同步当前血/蓝到新的上限
  state.hp = state.maxHp;
  state.mp = state.maxMp;
}

export class ClassSelectScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.menuIndex = 0;
    this.menuItems = CLASSES;
    // 卡片式三选一:四方向都步进(模 3 环绕);指针点击卡片即选中并确认
    this.nav = new MenuNav(game, { both: true, onConfirm: () => this._confirm() });
  }

  enter(opts) {
    this.t = 0;
    this.menuIndex = 0;
    this.nav.index = 0;
    this._opts = opts || {};
  }

  update(dt) {
    this.t += dt;
    const k = this.game.input;
    // 卡片布局参数与 render 一致
    const cardW = 240, cardH = 440, gap = 30;
    const totalW = this.menuItems.length * cardW + (this.menuItems.length - 1) * gap;
    const startX = (this.game.canvas.width - totalW) / 2;
    for (let i = 0; i < this.menuItems.length; i++) {
      this.nav.hit(i, startX + i * (cardW + gap), 140, cardW, cardH);
    }
    this.nav.update();
    this.menuIndex = this.nav.index;
    if (k.justPressed('cancel') || k.justPressed('back')) {
      this.game.audio.sfxClick();
      this.game.goto('title');
    }
  }

  _confirm() {
    // nav.onConfirm 在 update 内触发,此时 menuIndex 尚未回写 —— 读 nav.index
    const item = this.menuItems[this.nav.index] || this.menuItems[this.menuIndex];
    if (!item) return;
    this.game.audio.sfxClick();
    if (this._opts.isNewGame) {
      // 新游戏重置在此刻才执行:职业选择界面按 ESC 返回标题时,旧存档毫发无损
      if (this.game.save) this.game.save.clear();
      Object.assign(state, freshState());
    }
    applyClassToState(item.id);
    this.game.goto('chapterIntro', { chapter: 1, isNewGame: true, heroClass: item.id });
  }

  render(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 背景渐变(与 title/chapterSelect 一致)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1428');
    g.addColorStop(1, '#0a0a14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 紫色光晕
    const cx = W * 0.5, cy = H * 0.28;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 280);
    grad.addColorStop(0, 'rgba(183, 140, 224, 0.32)');
    grad.addColorStop(1, 'rgba(183, 140, 224, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 标题
    text(ctx, '选  择  回  响  倾  向', W / 2, 70, 'large', '#f4ecd0', {
      align: 'center', shadowColor: '#3a2a5a', shadowOffset: { x: 2, y: 2 },
    });
    text(ctx, '— 你的回声,倾向何方 —', W / 2, 116, 'small', '#a8945a', { align: 'center' });

    // 三张卡片
    const cardW = 240, cardH = 440, gap = 30;
    const totalW = this.menuItems.length * cardW + (this.menuItems.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY = 140;
    for (let i = 0; i < this.menuItems.length; i++) {
      const item = this.menuItems[i];
      const x = startX + i * (cardW + gap);
      const selected = i === this.menuIndex;
      this._drawCard(ctx, x, cardY, cardW, cardH, item, selected);
    }

    // 提示
    if (this.t > 0.4) {
      const blink = (Math.sin(this.t * 4) + 1) * 0.5;
      ctx.globalAlpha = blink * 0.75;
      text(ctx, '← → 切换    ENTER 选择    ESC 返回', W / 2, H - 40, 'small', '#a8945a', { align: 'center' });
      ctx.globalAlpha = 1;
    }
    text(ctx, '技能全职业通用,数值随倾向变化 · 入局后 ESC → 技能图鉴 看说明与演示', W / 2, H - 66, 'small', '#8b7f5e', { align: 'center' });
  }

  _drawCard(ctx, x, y, w, h, item, selected) {
    // 卡片底(未选中压暗,与背景拉开至少两档亮度差,轮廓不再"融"进背景)
    ctx.fillStyle = selected ? '#2a1a4a' : '#1c1533';
    ctx.fillRect(x, y, w, h);
    // 顶色带
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y, w, 6);
    // 边框(未选中用职业色 35% 透明度,任何背景上都可辨)
    ctx.strokeStyle = selected ? item.color : '#6a5488';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    // 选中:职业色外圈光晕描边 + 四角光点
    if (selected) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.restore();
      ctx.fillStyle = item.color;
      ctx.fillRect(x - 4, y - 4, 8, 8);
      ctx.fillRect(x + w - 4, y - 4, 8, 8);
      ctx.fillRect(x - 4, y + h - 4, 8, 8);
      ctx.fillRect(x + w - 4, y + h - 4, 8, 8);
    }
    // 职业名
    text(ctx, item.name, x + w / 2, y + 30, 'large', selected ? item.color : '#f4ecd0', {
      align: 'center', shadowColor: '#1a0a2a', shadowOffset: { x: 2, y: 2 },
    });
    text(ctx, item.tagline, x + w / 2, y + 64, 'small', '#8b7f5e', { align: 'center' });
    // 职业立绘(mmx 生成大图)+ 像素精灵双预览:立绘给质感,精灵示外观
    const portrait = this.game.assets?.cutscenes?.[`hero_${item.id}`];
    if (portrait) {
      const ph = 150, pw = Math.round(portrait.width * (ph / portrait.height));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 2, y + 80, w - 4, ph + 6);
      ctx.clip();
      ctx.globalAlpha = selected ? 1 : 0.55;
      ctx.drawImage(portrait, x + (w - pw) / 2, y + 82, pw, ph);
      ctx.restore();
      // 立绘底部渐隐,与卡片融为一体
      const fade = ctx.createLinearGradient(0, y + 82 + ph - 30, 0, y + 82 + ph + 6);
      fade.addColorStop(0, 'rgba(22,16,42,0)');
      fade.addColorStop(1, selected ? 'rgba(42,26,74,1)' : 'rgba(22,16,42,1)');
      ctx.fillStyle = fade;
      ctx.fillRect(x + 2, y + 82 + ph - 30, w - 4, 36);
    } else {
      const preview = SPRITE_LIB.heroVariants?.[item.id]?.idle?.[0];
      if (preview) {
        const ph = 56, pw = Math.round(preview.width * (ph / preview.height));
        ctx.drawImage(preview, x + (w - pw) / 2, y + 84, pw, ph);
      }
    }
    // 描述(拆两行,避免超出卡片宽度;约 10 字/行)
    const descLines = this._wrapText(item.desc, 10);
    for (let li = 0; li < descLines.length; li++) {
      text(ctx, descLines[li], x + w / 2, y + 250 + li * 26, 'small', '#a89474', { align: 'center' });
    }
    // 分隔
    ctx.fillStyle = selected ? item.color : '#3a2a5a';
    ctx.fillRect(x + 30, y + 250 + descLines.length * 26 + 8, w - 60, 1);
    // 数值预览
    const statY = y + 250 + descLines.length * 26 + 32;
    for (let i = 0; i < item.stats.length; i++) {
      const s = item.stats[i];
      const color = s.delta > 0 ? '#8ad0e0' : s.delta < 0 ? '#e0a07a' : '#a89474';
      text(ctx, s.label, x + 24, statY + i * 27, 'small', '#d6c8a4');
      text(ctx, s.text, x + w - 24, statY + i * 27, 'small', color, { align: 'right' });
    }
    // 选中态由边框/角标/色带表达;卡内不再叠加文字指示器(曾与第 4 行数值重叠)
  }

  // 中文按字符数换行(卡片内宽度有限,不依赖 canvas 测量);标点不悬挂行首:
  // 满行时把紧随的标点一并收入当前行(、。!?等)
  _wrapText(str, charsPerLine) {
    const noLineStart = new Set(['、', '。', '!', '?', ',', ';', ':', ')', '」', '』', '》', '%']);
    const chars = Array.from(str);
    const out = [];
    let line = '';
    for (let i = 0; i < chars.length; i++) {
      line += chars[i];
      if (line.length >= charsPerLine) {
        while (i + 1 < chars.length && noLineStart.has(chars[i + 1]) && line.length < charsPerLine + 2) {
          line += chars[++i];
        }
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
    return out.length > 0 ? out : [''];
  }
}

export { applyClassToState, CLASSES };
