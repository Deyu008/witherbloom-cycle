// scenes/game.js — 主游戏场景(俯视角)
import { text, textWidth } from '../pixelfont.js';
import { panel as uiPanel, bar as uiBar, slot as uiSlot, bossFrame as uiBossFrame, minimapFrame as uiMinimap } from '../uiKit.js';
import { ECHOES } from '../data/echoes.js';
import { World, Loot } from '../world.js';
import { Player } from '../player.js';
import { Enemy } from '../enemy.js';
import { Boss } from '../boss.js';
import { state } from '../state.js';
import { CHAPTERS, LEVELS } from '../data/chapters.js';
import { SPRITE_LIB } from '../sprite.js';
import { COMBAT, SEAL_AMBUSH_COUNTS, SEAL_AMBUSH_REWARD, comboMultiplier } from '../data/balance.js';
import { BOON_POOL, BOON_RARITY_INFO } from '../data/boons.js';
import { BoonPicker } from './boonPicker.js';
import { SIDE_ROOMS } from '../data/zones.js';
import { SkillTreeScene } from './skillTree.js';
import { ConversionScene } from './conversion.js';
import { SkillInfoScene } from './skillInfo.js';

const ENEMY_PRESETS = {
  1: ['forest_spirit', 'moss_lurker', 'vine_wraith'],
  2: ['ember_imp', 'forge_knight', 'ash_phantom'],
  3: ['grave_warden', 'ink_scholar'],
  4: ['frost_lurker', 'mirror_knight', 'void_seeker'],
};

export class GameScene {
  constructor(game) {
    this.game = game;
    this.world = null;
    this.player = null;
    this.dialogActive = false;
    this.paused = false;
    this.chapter = 1;
    this.levelData = null;
    this.chapterBoss = null;
    this.battleStarted = false;
    this.helpOpen = false;
    this.npcs = [];
  }

  enter(opts) {
    if (opts && opts._fromSkillTree) {
      this._togglePause();
      return;
    }
    if (opts && opts._fromConversion) {
      this._togglePause();
      return;
    }
    if (opts && opts._fromSkillInfo) {
      this._togglePause();
      return;
    }
    if (opts && opts._fromShop) {
      return; // 从旅商店面回来:场景单例未销毁,原位继续
    }
    this.chapter = opts.chapter || state.currentChapter || 1;
    state.currentChapter = this.chapter;
    // 每章随机 seed(存档持久):同一存档重进同图,新开一局换新图 —— 探索不贬值
    const seedKey = `ch${this.chapter}_seed`;
    if (!state.flags[seedKey]) {
      state.flags[seedKey] = ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) || 1;
    }
    this.levelData = { ...LEVELS[this.chapter], seed: state.flags[seedKey] };
    this.world = new World(this.chapter, this.levelData);
    // 玩家出生在世界锚点(房间地牢的起点房中心)
    this.player = new Player(this.world.spawnPoint.x, this.world.spawnPoint.y, { game: this.game, world: this.world });
    this.player.hp = state.hp || state.maxHp;
    this.player.maxHp = state.maxHp;
    this.world.player = this.player;
    this.world.entities.push(this.player);
    this.game.camera.setBounds(this.world.pxW, this.world.pxH);
    this.game.camera.clearRegionClamp();
    this.game.camera.snap(this.player.x, this.player.y);
    this._spawnNpcs();
    this._spawnPickups();
    this._spawnSeals();
    this._spawnEnemies();
    this._spawnBoss();
    this.world.spawnGrace = 3.5; // 入场保护:开场对话/观察期间敌人不主动仇恨
    if (this.chapter === 1 && !state.flags.intro_done) {
      state.flags.intro_done = true;
      this._startDialog('intro_opening');
    }
    this.game.ambient.configure(this.chapter, this.game.canvas.width, this.game.canvas.height);
    this.game.tint = this.world.theme.accent; // 章节色温后处理
    this.game.audio.startMusic(0, `ch${Math.min(4, Math.max(1, this.chapter))}`);
    this.t = 0;
    this._saveTimer = 0;
    this._autoSaveCd = 20; // 首次自动存档在入场 20s 后
    this.dialogActive = false;
    this.battleStarted = false;
    this.helpOpen = false;
    this.echoLogOpen = false;
    this.echoIdx = 0;
    this.echoDetail = false;
    this.paused = false;
    this.chapterComplete = null;   // 通关结算窗
    this._clearedDuringRun = false;
    this._entryCleared = !!state.flags[`boss${this.chapter}_completed`];
    this.currentObjective = this._getCurrentObjective();
    this.objectiveT = 0;
    this.currentRoom = this.world.spawnRoom;
    this.currentRoom.visited = true;
    this._roomVisitCount = 1;
    this._gateHintCd = 0;
    this._roomBanner = null;
    // 细节打磨状态:尸体淡出 / 心跳节拍 / Boss 开战电影黑边
    this._corpses = [];
    this._hbT = 0;
    this._cineT = 0;
    this._cineTarget = 0;
    // 拾取连收音阶 / 技能就绪闪金
    this._pickupStreak = 0;
    this._pickupStreakT = 0;
    this._skillFlash = { Q: 0, E: 0, R: 0, SPC: 0 };
    this._skillPrev = {};
    // 回响祝福:每章重置;队列与当前三选一
    state.boons = [];
    state.boonPity = 0;
    this.boonPicker = new BoonPicker(this.game, this);
    // 增援波 / 连杀 / 爆裂词缀危险区
    this._roomsCleared = 0;
    this._killTimes = [];
    this._hazards = [];
    // 静谧泉(支线房):T 交互回血,一次性
    this._shrines = (this.world.sideRooms || [])
      .filter(r => r.side === 'shrine')
      .map(r => ({
        x: r.cx * this.levelData.tile + this.levelData.tile / 2,
        y: r.cy * this.levelData.tile + this.levelData.tile / 2,
        key: `shrine_${this.chapter}_${r.cx}_${r.cy}`,
        room: r,
      }));
    // 支线房专属布置(试炼波次/宝藏守卫;静谧房无怪)
    this._spawnSideRooms();
    // 章首发一枚祝福(开场对话结束后由 _tryOpenBoonOffer 弹出)
    this._queueBoon('common');
  }

  // 房间探索序:离起点由近及远(供 NPC/秘密/敌人布置)
  _roomsByDistance() {
    const s = this.world.spawnRoom;
    return [...this.world.rooms].sort((a, b) =>
      Math.hypot(a.cx - s.cx, a.cy - s.cy) - Math.hypot(b.cx - s.cx, b.cy - s.cy));
  }

  _getCurrentObjective() {
    const ch = this.chapter;
    if (state.flags[`boss${ch}_completed`]) {
      return ch >= 4
        ? { title: '寂渊已归', desc: '循环,已圆满' }
        : { title: '本章已通关', desc: '按 N 前往下一章' };
    }
    // 未集齐刻印:指引探索;集齐后:指引 BOSS 封印门
    const { need, got } = this._sealProgress();
    if (got < need) {
      return { title: `寻找回响刻印(${got}/${need})`, desc: '循罗盘探索深处房间' };
    }
    const map = {
      1: ['前往回声湖畔', '封印已开,守林人在湖边等你'],
      2: ['前往太阳王座', '封印已开,焚身王在王座上等你'],
      3: ['前往永恒阶梯', '封印已开,编年者在阶梯尽头等你'],
      4: ['前往寂渊之心', '封印已开,寂渊在王座上等你'],
    };
    const [title, desc] = map[ch] || ['探索', '继续前进'];
    return { title, desc };
  }

  // 本章刻印进度(按 flags 计算,跨存档一致)
  _sealProgress() {
    const need = this.world?.sealCount ?? 2;
    let got = 0;
    for (let i = 0; i < need; i++) {
      if (state.flags[`seal_${this.chapter}_${i}`]) got++;
    }
    return { need, got };
  }

  showChapterComplete() {
    if (this.chapter >= 4) return;
    this.chapterComplete = { idx: 0, t: 0 };
    this.game.audio.sfxChapter();
    this._autosave(); // 通关节点必存档
  }

  _spawnNpcs() {
    this.npcs = [];
    const rooms = this._roomsByDistance();
    // NPC 放在离起点最近的几个房间(村落感);起点房留白给玩家喘息
    for (let i = 0; i < this.levelData.npcs.length; i++) {
      const npc = this.levelData.npcs[i];
      const room = rooms[1 + (i % Math.max(1, rooms.length - 1))] || rooms[0];
      const jitter = (k) => (k % 2 === 0 ? 1 : -1) * (1 + (k >> 1) % Math.max(1, Math.min(room.w, room.h) - 3));
      const c = {
        x: (room.cx + jitter(i * 2 + 1)) * this.levelData.tile + this.levelData.tile / 2,
        y: (room.cy + jitter(i * 2 + 2)) * this.levelData.tile + this.levelData.tile / 2,
      };
      const sprite = SPRITE_LIB.npc[npc.sprite] || SPRITE_LIB.npc.child;
      this.npcs.push({ x: c.x, y: c.y, sprite, dialog: npc.dialog, name: npc.id, shop: !!npc.shop, bob: Math.random() * 6 });
    }
  }

  _spawnPickups() {
    const list = this.levelData.pickups || [];
    const rooms = this._roomsByDistance();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (state.collected[p.id]) continue;
      // 秘密放在离起点最远的房间(奖励深度探索)
      const room = rooms[rooms.length - 1 - i] || rooms[rooms.length - 1];
      const c = {
        x: room.cx * this.levelData.tile + this.levelData.tile / 2,
        y: (room.cy + 1) * this.levelData.tile + this.levelData.tile / 2,
      };
      const l = new Loot(c.x, c.y, p.id);
      l.world = this.world;
      const iconLib = SPRITE_LIB.icons || {};
      const skillLib = SPRITE_LIB.skills || {};
      l.sprite = iconLib[p.sprite] || skillLib[p.sprite] || iconLib.gold;
      l._secret = true;
      l._secretLabel = p.label || p.id;
      l.life = 999;
      l._settled = true;
      l.render = function(ctx, cam) {
        const s = cam.worldToScreen(this.x, this.y + Math.sin(this.bobT) * 3);
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#e0b76a';
        ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.drawImage(this.sprite, s.x - this.sprite.width / 2, s.y - this.sprite.height / 2);
      };
      this.world.loot.push(l);
    }
  }

  // 回响刻印:开启 BOSS 封印门的钥匙,散布在远端房间(已收集的按 flags 跳过)
  _spawnSeals() {
    this.world.sealPoints.forEach((sp, i) => {
      if (state.flags[`seal_${this.chapter}_${i}`]) return; // 跨存档去重
      const l = new Loot(sp.x, sp.y, `seal_${this.chapter}_${i}`);
      l.world = this.world;
      const icon = SPRITE_LIB.icons.shard || SPRITE_LIB.icons.gold;
      l.sprite = icon;
      l._sealIdx = i;
      l.life = 999;
      l._settled = true;
      l.render = function(ctx, cam) {
        const s = cam.worldToScreen(this.x, this.y + Math.sin(this.bobT) * 3);
        // 金紫双色光柱,比普通拾取物醒目得多
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r = 16 + Math.sin(this.bobT * 2) * 3;
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
        grad.addColorStop(0, 'rgba(230,200,255,0.9)');
        grad.addColorStop(0.5, 'rgba(183,140,224,0.5)');
        grad.addColorStop(1, 'rgba(183,140,224,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        if (this.sprite) ctx.drawImage(this.sprite, s.x - this.sprite.width / 2, s.y - this.sprite.height / 2);
      };
      this.world.loot.push(l);
    });
  }

  _spawnEnemies() {
    const rngState = { s: (this.levelData.seed || 1) * 2 };
    const rand = () => { rngState.s = (rngState.s * 1664525 + 1013904223) >>> 0; return (rngState.s & 0xffffff) / 0xffffff; };
    let idx = 0;
    const MIN_SEP = 60;
    const SPAWN_RANGE = 300;
    // 区域怪物表:每个房间按所在区域(zone)取专属怪物组 —— 越深入,怪物组成越不同
    const tableOf = (room) => (this.world.zones?.[room.zone]?.enemyTable) || ENEMY_PRESETS[this.chapter];
    const makeEnemy = (cx, cy, room, table,forceElite = false) => {
      const list = table || tableOf(room);
      const type = list[Math.floor(rand() * list.length)];
      const elite = forceElite || rand() < COMBAT.eliteChance;
      const en = new Enemy(cx, cy, type, { id: `e_${idx}_${type}`, world: this.world, elite });
      en._roomRef = room;
      this.world.entities.push(en);
      idx++;
      return en;
    };
    // 按房间刷怪:起点房/BOSS房安全,支线房由 _spawnSideRooms 专属布置;
    // ≥4 只的房间分两波(Hades 45s 遭遇节奏:分层加压)
    for (const room of this.world.rooms) {
      if (room === this.world.spawnRoom || room === this.world.bossRoom || room.side) continue;
      room._enemyLeft = 0;
      room._cleared = false;
      room._wave2 = null;
      const want = 1 + this.chapter; // 2-5 只/房,随章节微涨
      const placed = [];
      let attempts = 0;
      while (placed.length < want && attempts < want * 15) {
        attempts++;
        const tx = room.x + Math.floor(rand() * room.w);
        const ty = room.y + Math.floor(rand() * room.h);
        const cx = tx * this.levelData.tile + this.levelData.tile / 2;
        const cy = ty * this.levelData.tile + this.levelData.tile / 2;
        if (this.world.solidAtPx(cx, cy)) continue;
        if (Math.hypot(cx - this.player.x, cy - this.player.y) < SPAWN_RANGE) continue;
        if (placed.some(p => Math.hypot(cx - p.x, cy - p.y) < MIN_SEP)) continue;
        placed.push({ x: cx, y: cy });
      }
      if (placed.length === 0) continue;
      const split = want >= 4 ? Math.ceil(placed.length / 2) : placed.length;
      for (let i = 0; i < split; i++) { makeEnemy(placed[i].x, placed[i].y, room); room._enemyLeft++; }
      if (split < placed.length) {
        // 第二波:第一波清空后从房间深处"增援"
        room._wave2 = placed.slice(split);
      }
    }
    // 刻印守护战伏兵状态
    this._ambushLeft = 0;
  }

  // ===== 支线房专属布置 =====
  // 试炼房:两波重兵(每波必含精英),清空给保底稀有祝福 —— 高风险高回报的真岔路
  // 宝藏房:少量守卫,清空开启宝库(额外掉落)
  // 静谧房:无敌人(泉水在 enter() 的 _shrines 里,T 交互回血)
  _spawnSideRooms() {
    const t = this.levelData.tile;
    const rand = Math.random;
    for (const room of this.world.sideRooms || []) {
      room._enemyLeft = 0;
      room._cleared = false;
      room._wave2 = null;
      if (room.side === 'shrine') continue;
      const spots = [];
      const table = (this.world.zones?.[room.zone]?.enemyTable) || ENEMY_PRESETS[this.chapter];
      for (let attempts = 0; attempts < 30 && spots.length < 5; attempts++) {
        const cx = (room.x + Math.floor(rand() * room.w)) * t + t / 2;
        const cy = (room.y + Math.floor(rand() * room.h)) * t + t / 2;
        if (this.world.solidAtPx(cx, cy)) continue;
        if (spots.some(p => Math.hypot(cx - p.x, cy - p.y) < 60)) continue;
        spots.push({ x: cx, y: cy });
      }
      if (room.side === 'trial') {
        // 第一波 3 只(含 1 精英),第二波 2+⌈chapter/2⌉ 只(高章节再含 1 精英)
        const w1 = spots.slice(0, 3);
        const w2 = spots.slice(3);
        const pushAt = (p, elite, i) => {
          const type = table[Math.floor(rand() * table.length)];
          const en = new Enemy(p.x, p.y, type, { id: `trial_${this.chapter}_${room.cx}_${i}`, world: this.world, elite });
          en._roomRef = room;
          this.world.entities.push(en);
          room._enemyLeft++;
        };
        w1.forEach((p, i) => pushAt(p, i === 0, i));
        if (w2.length > 0) {
          room._wave2 = w2.map((p, i) => ({ ...p, elite: this.chapter >= 2 && i === 0, i }));
        }
      } else if (room.side === 'treasure') {
        // 2-3 只守卫(第 2 只起小概率精英)
        const n = Math.min(spots.length, 2 + (this.chapter >= 3 ? 1 : 0));
        for (let i = 0; i < n; i++) {
          const type = table[Math.floor(rand() * table.length)];
          const en = new Enemy(spots[i].x, spots[i].y, type, { id: `treasure_${room.cx}_${i}`, world: this.world, elite: i === 1 && rand() < 0.35 });
          en._roomRef = room;
          this.world.entities.push(en);
          room._enemyLeft++;
        }
      }
    }
  }

  // ===== 敌人死亡结算:尸体淡出 / 增援波 / 连杀 / 房间肃清 / 守护战 / 祝福触发 =====
  _onEnemyDeath(e) {
    // 尸体:倒地摊平 + 0.55s 淡出(敌人不再"原地蒸发")
    const sp = e.currentSprite?.();
    if (sp) {
      this._corpses.push({ sprite: sp, x: e.x, y: e.sortY, w: e.drawW, h: e.drawH, t: 0 });
      if (this._corpses.length > 24) this._corpses.shift();
    }
    // 连杀:4 秒内 3 杀 → 奖励(参考调研"连杀奖励"高频多巴胺)
    this._killTimes.push(this.t);
    this._killTimes = this._killTimes.filter(t => this.t - t < 4);
    if (this._killTimes.length >= 3) {
      const n = this._killTimes.length;
      state.xp += 15;
      this.world.spawnLoot(this.player.x + 24, this.player.y, 'gold');
      this.game.audio.sfxPickup(990);
      this.game.spawnFloatText(this.player.x, this.player.y - 54, `『${n} 连杀!』`, '#ffcf4d', { px: 22, vy: 46, life: 1.2 });
      this._killTimes = [];
    }
    // 精英击杀:必触发一次祝福三选一(精英从"数值放大"变成"看到就兴奋的事件")
    if (e.elite && e._roomRef !== undefined) this._queueBoon('common');
    // 迷你 BOSS(第 4 章悔恨化身):保底稀有的祝福三选一(STS 的 Boss 必稀有)
    if (e.isMiniboss) this._queueBoon('rare');
    // 爆裂词缀:死亡留下延时爆炸危险区
    if (e.affix === 'volatile' && e.elite) this._addHazard(e.x, e.y, Math.round(e.dmg * 1.1), 86);
    // 守护战伏兵
    if (e._ambush) {
      this._ambushLeft--;
      if (this._ambushLeft <= 0) {
        const r = SEAL_AMBUSH_REWARD;
        state.xp += r.xp;
        this.player.heal(r.heal);
        state.hp = Math.min(state.maxHp, this.player.hp);
        this.game.audio.sfxSecret();
        this.game.spawnLevelUpParticles(this.player.x, this.player.y);
        this.game._banner = { text: '守护已散 · 回响安宁', color: '#a8e8b0', life: 2.6 };
        this.game.spawnFloatText(this.player.x, this.player.y - 48,
          `+${r.xp} 经验  +${r.heal} 生命`, '#a8e8b0', { px: 20, vy: 42, life: 1.4 });
        this._queueBoon('common'); // 守护战通关奖励:一次祝福
      }
      return;
    }
    // 普通房间结算(BOSS 房/起点房无计数)
    const room = e._roomRef;
    if (!room || !(e instanceof Enemy)) return;
    room._enemyLeft--;
    if (room._enemyLeft > 0) return;
    // 还有第二波 → 增援入场,暂不结算肃清
    if (room._wave2 && room._wave2.length > 0) {
      const wave = room._wave2;
      room._wave2 = null;
      const table = (this.world.zones?.[room.zone]?.enemyTable) || ENEMY_PRESETS[this.chapter];
      for (const p of wave) {
        const en = new Enemy(p.x, p.y, table[Math.floor(Math.random() * table.length)],
          { id: `wave_${this.t.toFixed(1)}_${room.cx}_${p.x | 0}`, world: this.world,
            elite: p.elite ?? (Math.random() < COMBAT.eliteChance) });
        en._roomRef = room;
        this.world.entities.push(en);
        room._enemyLeft++;
        // 入场烟尘
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          this.game.particles.emit({ x: p.x, y: p.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 40, life: 0.5, color: '#a89878', size: 4, type: 'circle', fade: true });
        }
      }
      this.game._banner = { text: `增援出现 · ${room.name}`, color: '#c86a5a', life: 2 };
      this.game.audio.sfxRoar();
      this.game.camera.shake(5, 0.3);
      return;
    }
    if (room._cleared) return;
    room._cleared = true;
    // 支线房专属结算
    if (room.side === 'trial') {
      this.game._banner = { text: `试炼通过 · ${room.name}`, color: '#e0a04a', life: 3 };
      this.game.audio.sfxSecret();
      this.game.camera.shake(8, 0.4);
      this.game.spawnLevelUpParticles(this.player.x, this.player.y);
      this._queueBoon('rare'); // 试炼奖励:保底稀有的祝福三选一
      return;
    }
    if (room.side === 'treasure') {
      this.game._banner = { text: `宝库开启 · ${room.name}`, color: '#e0b76a', life: 3 };
      this.game.audio.sfxSecret();
      this.game.spawnLevelUpParticles(e.x, e.y);
      for (const [dx, type] of [[-26, 'gold'], [0, 'gold'], [26, 'shard'], [52, 'leaf']]) {
        this.world.spawnLoot(e.x + dx, e.y + (Math.random() - 0.5) * 30, type);
      }
      return;
    }
    // 普通房间肃清
    this.game._banner = { text: `房间肃清 · ${room.name}`, color: '#8ad0e0', life: 2.2 };
    this.game.audio.sfxPickup(880);
    // 肃清奖励:在原地撒一小片资源
    for (let i = 0; i < 3; i++) {
      this.world.spawnLoot(e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60,
        ['gold', 'ember', 'dew'][i % 3]);
    }
    this.player.heal(8);
    state.hp = Math.min(state.maxHp, this.player.hp);
    this.game.spawnFloatText(this.player.x, this.player.y - 46, '+8 生命', '#8ad0e0', { px: 18, vy: 40, life: 1.1 });
    // 每 3 个房间肃清 → 祝福三选一
    this._roomsCleared++;
    if (this._roomsCleared % 3 === 0) this._queueBoon('common');
  }

  // ===== 爆裂词缀危险区:0.85s 预警圈 → 到期对圈内玩家结算 =====
  _addHazard(x, y, dmg, r) {
    this._hazards.push({ x, y, dmg, r, t: 0, dur: 0.85 });
    this.game.audio.sfxDash();
  }
  _updateHazards(dt) {
    for (const h of this._hazards) h.t += dt;
    const expired = this._hazards.filter(h => h.t >= h.dur);
    this._hazards = this._hazards.filter(h => h.t < h.dur);
    for (const h of expired) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        this.game.particles.emit({ x: h.x, y: h.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 160, life: 0.45, color: '#ff9a4d', size: 5, type: 'circle', fade: true, additive: true });
      }
      this.game.camera.shake(6, 0.25);
      if (this.player.alive) {
        const d = Math.hypot(this.player.x - h.x, this.player.y - h.y);
        if (d < h.r) this.player.takeDamage(h.dmg, h.x, h.y);
      }
    }
  }

  // ===== 回响祝福三选一(实现在 BoonPicker;以下为兼容委托) =====
  get _boonOffer() { return this.boonPicker.offer; }
  set _boonOffer(v) { this.boonPicker.offer = v; }
  get _boonQueue() { return this.boonPicker.queue; }
  _queueBoon(minRarity = 'common') { this.boonPicker.enqueue(minRarity); }
  _tryOpenBoonOffer() { this.boonPicker.tryOpen(); }

  // ===== 刻印守护战:拾取刻印的瞬间,守护者从周身苏醒 =====
  _startSealAmbush() {
    const want = SEAL_AMBUSH_COUNTS[this.chapter] || 3;
    const presets = ENEMY_PRESETS[this.chapter];
    let n = 0;
    for (let i = 0; i < want * 12 && n < want; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 130 + Math.random() * 70;
      const px = this.player.x + Math.cos(a) * r, py = this.player.y + Math.sin(a) * r;
      if (this.world.solidAtPx(px, py)) continue;
      const en = new Enemy(px, py, presets[Math.floor(Math.random() * presets.length)],
        { id: `ambush_${this.t.toFixed(2)}_${i}`, world: this.world, ambush: true });
      en.alerted = true; en.alertFade = 2.5;
      this._ambushLeft++;
      this.world.entities.push(en);
      n++;
    }
    if (n > 0) {
      this.game._banner = { text: '刻印守护者苏醒!', color: '#c14d4d', life: 2.4 };
      this.game.camera.shake(7, 0.4);
      this.game.audio.sfxWhisper();
      this.game.spawnFloatText(this.player.x, this.player.y - 50, '准备战斗…', '#f4ecd0', { px: 20, life: 1.4 });
    }
  }

  _spawnBoss() {
    // 章节 BOSS 在世界锚点(末列 BOSS 房中心);迷你 BOSS 分布在中段房间
    const bd = this.levelData.bosses.find(b => !b.miniboss);
    if (bd) {
      const b = new Boss(this.world.bossPoint.x, this.world.bossPoint.y, bd.sprite, { id: bd.id, world: this.world });
      this.world.entities.push(b);
      this.chapterBoss = b;
    }
    const minis = this.levelData.bosses.filter(b => b.miniboss);
    if (minis.length > 0) {
      const rooms = this._roomsByDistance();
      const mid = rooms.filter(r => r !== this.world.spawnRoom && r !== this.world.bossRoom);
      minis.forEach((mb, i) => {
        const room = mid[Math.floor((i + 0.5) / minis.length * mid.length)] || mid[0];
        if (!room) return;
        const x = room.cx * this.levelData.tile + this.levelData.tile / 2;
        const y = room.cy * this.levelData.tile + this.levelData.tile / 2;
        this.world.entities.push(new Boss(x, y, mb.sprite, { id: mb.id, isMiniboss: true, world: this.world }));
      });
    }
  }

  _autosave() {
    try {
      this.game.save.save(0);
      // 轻提示:底部左侧淡入淡出的小字,不弹窗不打断
      this._saveToast = 2;
    } catch (e) { /* localStorage 不可用时静默 */ }
  }

  // ===== 寒铁桥回忆(第 4 章无战斗叙事段)=====
  // 走进前三个新房间时,桥面"刻着的记忆"浮现 —— 非阻塞横幅 + 收录回响日志
  _updateBridgeMemories(room) {
    if (this.chapter !== 4 || !this.levelData.bridgeMemories) return;
    // 按访问序而非房间序:第 2/3/4 个踏入的房间触发三段回忆
    const visitIdx = this._roomVisitCount - 2; // 0,1,2 对应三段
    if (visitIdx < 0 || visitIdx >= this.levelData.bridgeMemories.length) return;
    const m = this.levelData.bridgeMemories[visitIdx];
    if (m.done) return;
    m.done = true;
    this.game._bossLineBanner = { text: m.text, color: '#8aa9c4', life: 4.5, delay: 0 };
    this.game.audio.sfxWhisper();
    if (m.echo && !(state.echoes || []).includes(m.echo)) {
      state.echoes.push(m.echo);
      this.game.spawnFloatText(this.player.x, this.player.y - 46, '◆ 记忆已收录', '#b78ce0');
    }
  }

  // ===== 第一章新手引导(按进度逐条弹出的操作提示)=====
  _updateTutorial(dt) {
    if (this.chapter !== 1 || this._tutorialDone) return;
    this._tutorialT = (this._tutorialT || 0) + dt;
    const p = this.player;
    const stage = this._tutorialStage || 0;
    const hint = (text) => {
      this.game.spawnFloatText(p.x, p.y - 52, text, '#a8e8b0');
      this._tutorialStage = stage + 1;
    };
    if (stage === 0 && this._tutorialT > 1.2) hint('WASD 移动');
    else if (stage === 1 && (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1)) hint('J 攻击 · 连续命中提升伤害!');
    else if (stage === 2 && this.game.input.keysJustPressed.has('KeyJ')) hint('SPACE 闪避 · 穿过攻击触发完美闪避!');
    else if (stage === 3 && this.game.input.keysJustPressed.has('Space')) hint('T 交谈 · ESC 暂停里有技能图鉴与演示');
    else if (stage === 4 && this.game.input.keysJustPressed.has('KeyT')) hint('收集金光刻印,唤醒BOSS前先变强');
    else if (stage >= 5) this._tutorialDone = true;
  }

  _startDialog(id, opts = {}) {
    this.dialogActive = true;
    this.dialogOpts = opts;
    this.game.scenes.dialog.enter({ id, ...opts });
  }

  update(dt) {
    this.t += dt;
    this.objectiveT = (this.objectiveT || 0) + dt;
    this._saveTimer += dt;
    state.playTime += dt; // 游玩时长统计(结局/结算画面展示)
    // 自动存档:每 20s 静默保存一次(不弹出干扰 UI)
    this._autoSaveCd -= dt;
    if (this._autoSaveCd <= 0) {
      this._autoSaveCd = 20;
      this._autosave();
    }
    if (this._saveToast > 0) this._saveToast -= dt;
    if (this.game.input.keysJustPressed.has('KeyM')) {
      const m = !this.game.audio.muted;
      this.game.audio.setMute(m);
      this.game.spawnFloatText(this.player?.x || 0, (this.player?.y || 0) - 30, m ? '已静音' : '声音已开', '#d6c8a4');
    }

    // 电影黑边缓动(对话期间也要动,放在 dialog early-return 之前)
    this._cineT += (this._cineTarget - this._cineT) * Math.min(1, dt * 6);

    if (this.dialogActive) {
      this.game.scenes.dialog.update(dt);
      if (this.game.scenes.dialog.finished) {
        this.dialogActive = false;
        this._cineTarget = 0; // 对话结束收黑边
        this.dialogOpts?.onFinish?.();
      }
      return;
    }
    if (this.game.input.keysJustPressed.has('Slash') || this.game.input.keysJustPressed.has('KeyH')) {
      this.helpOpen = !this.helpOpen; this.game.audio.sfxClick(); return;
    }
    if (this.helpOpen) return;
    if (this.echoLogOpen) { this._updateEchoLog(dt); return; }

    // 通关结算窗(打完 BOSS 或"释怀"后自动弹出;N 键可重开)
    const cleared = !!state.flags[`boss${this.chapter}_completed`];
    if (cleared && !this._clearedDuringRun && !this._entryCleared && this.chapter < 4) {
      this._clearedDuringRun = true;
      this.showChapterComplete();
    }
    if (this.chapterComplete) { this._updateChapterComplete(dt); return; }
    if (cleared && this.chapter < 4 && this.game.input.keysJustPressed.has('KeyN')) {
      this.showChapterComplete();
    }

    if (this.game.input.keysJustPressed.has('Escape')) { this._togglePause(); return; }
    if (this.paused) { this._updatePauseMenu(dt); return; }

    // 回响祝福三选一:冻结世界,等玩家决策(所有菜单关闭后才弹出)
    this._tryOpenBoonOffer();
    if (this.boonPicker.offer) { this.boonPicker.update(dt); return; }
    // 爆裂词缀危险区
    this._updateHazards(dt);


    // 入场/复活保护倒计时:在对话/暂停/帮助之后才走,保证宽限不被冻结场景吃掉
    if (this.world.spawnGrace > 0) this.world.spawnGrace = Math.max(0, this.world.spawnGrace - dt);
    // 连击窗口倒计时(对话/暂停期间被上面的 early-return 冻结,不下线)
    this.game.updateCombo(dt);
    // 低血量心跳音(<30% 时越来越急促)
    if (this.player.alive && this.player.maxHp > 0) {
      const hr = this.player.hp / this.player.maxHp;
      if (hr < 0.3) {
        this._hbT -= dt;
        if (this._hbT <= 0) {
          this._hbT = 0.5 + hr * 1.8;
          this.game.audio.sfxHeartbeat?.();
        }
      }
    }
    // 尸体淡出计时
    for (const c of this._corpses) c.t += dt;
    this._corpses = this._corpses.filter(c => c.t < 0.55);
    // 拾取连收窗口 / 技能就绪闪光 / 开门残影
    if (this._pickupStreakT > 0) {
      this._pickupStreakT -= dt;
      if (this._pickupStreakT <= 0) this._pickupStreak = 0;
    }
    for (const k of Object.keys(this._skillFlash)) {
      if (this._skillFlash[k] > 0) this._skillFlash[k] -= dt;
    }
    if (this.world.gateOpenFx > 0) this.world.gateOpenFx -= dt;
    // BOSS 接近 → 开战(首次走近播对白;死亡复活 BOSS 复位后再走近,直接复战不重播)
    if (this.chapterBoss && this.chapterBoss.alive && !this.chapterBoss.alerted
        && this.player.distance(this.chapterBoss) < 200) {
      this.battleStarted = true;
      if (!this.chapterBoss.dialogStarted) {
        this._cineTarget = 1; // Boss 开战:电影黑边升起
        this.game.startBossCinematic(this.chapterBoss); // 入场演出:白闪+紫色粒子爆发
        this.chapterBoss.startBattle(this.game);
      } else this.chapterBoss.alerted = true;
    }

    // 释怀提示 + 按 V 触发对话(双线通关)。需要:章节 BOSS 存活 + canRelease() + 无 dialog。
    // 用 _renderReleasePrompt 控制 HUD 闪烁提示。
    if (this.chapterBoss && this.chapterBoss.alive && this.chapterBoss.canRelease()) {
      this._renderReleasePrompt = true;
      if (this.game.input.keysJustPressed.has('KeyV')) {
        this.chapterBoss._releasePrompted = true; // 锁住,防止同帧重复派发
        const dialogId = (this.chapter === 1) ? 'forest_keeper_question'
          : (this.chapter === 2) ? 'burning_daughter_lullaby'
          : (this.chapter === 3) ? 'chronomancer_question'
          : (this.chapter === 4) ? 'forgotten_question' : null;
        if (dialogId) {
          this._startDialog(dialogId, { onFinish: () => {
            // 对话结束后,如果 BOSS 仍存活(玩家没在中途杀掉),走释怀结算
            if (this.chapterBoss && this.chapterBoss.alive) {
              this.chapterBoss.release(this.game);
            }
          }});
        }
      }
    } else {
      this._renderReleasePrompt = false;
    }

    // 死亡复活:游戏内倒计时(暂停/对话/结算时自动冻结,取代原 setTimeout)
    if (this._respawnTimer > 0) {
      this._respawnTimer -= dt;
      if (this._respawnTimer <= 0) this._respawn();
    }

    // 玩家
    this.player.update(dt, this.game);
    this.world.physics(this.player);

    // 房间进入检测:首次进入弹横幅(地牢房间名),并驱动寒铁桥回忆
    const room = this.world.roomAt(this.player.x, this.player.y);
    if (room && room !== this.currentRoom) {
      const firstVisit = !room.visited;
      room.visited = true;
      this.currentRoom = room;
      this._roomVisitCount = (this._roomVisitCount || 0) + 1;
      if (firstVisit) {
        // 区域前缀横幅:从"一个房间"变成"走进了某个区域"
        const zoneDef = this.world.zones?.[room.zone];
        const sideDef = room.side ? SIDE_ROOMS[room.side] : null;
        this.game._banner = {
          text: sideDef ? `${sideDef.label} · ${room.name}` : `${zoneDef?.label ? zoneDef.label + ' · ' : ''}${room.name}`,
          color: sideDef ? sideDef.color : '#e0b76a',
          life: 2.2,
        };
        this.game.audio.sfxClick();
      }
      this._updateBridgeMemories(room);
    }
    // BOSS 封印门:靠近时按刻印数开启或提示缺口
    if (!this.world.gateOpen && this.world.gateTiles.length > 0) {
      const t = this.world.tile;
      const nearGate = this.world.gateTiles.some(g =>
        Math.abs((g.x + 0.5) * t - this.player.x) < 70 && Math.abs((g.y + 0.5) * t - this.player.y) < 70);
      if (nearGate && this._gateHintCd <= 0) {
        const { need, got } = this._sealProgress();
        if (got >= need) {
          this.world.openGate();
          this.game.audio.sfxSecret();
          this.game.camera.shake(10, 0.5);
          this.game.spawnLevelUpParticles(this.player.x, this.player.y);
          this.game._banner = { text: '封印已开', color: this.world.gateColor, life: 2.5 };
          this.currentObjective = this._getCurrentObjective();
          // 封印碎裂:每块门 tile 的光尘向门中心内吸
          const t2 = this.world.tile;
          for (const g of this.world.gateTiles) {
            const gx = (g.x + 0.5) * t2, gy = (g.y + 0.5) * t2;
            for (let i = 0; i < 6; i++) {
              const a = Math.random() * Math.PI * 2;
              const d = 18 + Math.random() * 26;
              this.game.particles.emit({
                x: gx + Math.cos(a) * d, y: gy + Math.sin(a) * d,
                vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90,
                life: 0.45, color: this.world.gateColor, size: 3,
                type: 'circle', fade: true, additive: true,
              });
            }
          }
        } else {
          this._gateHintCd = 2.5;
          this.game.spawnFloatText(this.player.x, this.player.y - 44, `封印未开 · 刻印 ${got}/${need}`, '#c86a5a');
        }
      }
      if (this._gateHintCd > 0) this._gateHintCd -= dt;
    }
    this._updateTutorial(dt);

    // 实体
    for (const e of this.world.entities) {
      if (e === this.player) continue;
      e.update?.(dt, this.game);
      this.world.physics(e);
      if (!e.alive && !e._dead) {
        e._dead = true;
        e.onKilled?.(this.game);
        this._onEnemyDeath(e); // 房间肃清 / 守护战结算
      }
    }
    // 清理尸体(onKilled 已在同帧调用)
    this.world.entities = this.world.entities.filter(e => e === this.player || e.alive);
    if (this.chapterBoss && !this.chapterBoss.alive) {
      this.chapterBoss = null;
      this.currentObjective = this._getCurrentObjective();
    }

    // 抛射物
    for (const p of this.world.projectiles) p.update(dt, this.game);
    this.world.projectiles = this.world.projectiles.filter(p => !p.dead);

    // 拾取物
    for (const l of this.world.loot) {
      l.update(dt);
      const ddx = this.player.x - l.x, ddy = this.player.y - l.y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < 400) { this._pickup(l); l.alive = false; continue; } // 20²:拾取
      if (d2 < 19600) { // 140²:磁吸(战斗节奏里顺手收掉落,不跑断腿)
        const d = Math.sqrt(d2);
        const pull = 280 * dt * Math.max(0.4, 1 - d / 160);
        l.x += (ddx / d) * pull; l.y += (ddy / d) * pull;
      }
    }
    this.world.loot = this.world.loot.filter(l => l.alive);

    // NPC 交互
    this._nearbyNpc = null;
    let bestD = 48;
    for (const n of this.npcs) {
      n.bob += dt;
      const d = Math.hypot(this.player.x - n.x, this.player.y - n.y);
      if (d < bestD) { bestD = d; this._nearbyNpc = n; }
    }
    if (this._nearbyNpc && this.game.input.keysJustPressed.has('KeyT')) {
      if (this._nearbyNpc.shop) {
        // 游商:不进对话树,直接开货架
        this.game.audio.sfxClick();
        this.game.setScene('shop');
      } else {
        this._startDialog(this._nearbyNpc.dialog);
      }
    }
    // 静谧泉(支线房):靠近按 T 回 40 血,一次性(跨存档记忆)
    this._nearbyShrine = null;
    for (const sh of this._shrines) {
      if (state.flags[sh.key]) continue;
      const d = Math.hypot(this.player.x - sh.x, this.player.y - sh.y);
      if (d < 46) { this._nearbyShrine = sh; break; }
    }
    if (this._nearbyShrine && this.game.input.keysJustPressed.has('KeyT')) {
      const sh = this._nearbyShrine;
      state.flags[sh.key] = true;
      this.player.heal(40);
      state.hp = Math.min(state.maxHp, this.player.hp);
      this.game.audio.sfxHeal();
      this.game._banner = { text: '静谧之泉 · 伤痕愈合', color: '#8ad0e0', life: 2.4 };
      this.game.spawnFloatText(this.player.x, this.player.y - 40, '+40 生命', '#8ad0e0', { px: 20, vy: 42, life: 1.3 });
      for (let i = 0; i < 14; i++) {
        this.game.particles.emit({
          x: sh.x + (Math.random() - 0.5) * 30, y: sh.y,
          vx: 0, vy: -30 - Math.random() * 40,
          life: 1.0, color: '#8ad0e0', size: 3, type: 'circle', fade: true, additive: true,
        });
      }
    }

    // 摄像机(朝移动方向轻微前探,画面先"看向"你要去的方向)
    const lsp = this.player.speed || 1;
    this.game.camera.follow(
      this.player.x + (this.player.vx / lsp) * 30,
      this.player.y + (this.player.vy / lsp) * 30,
    );
    this.game.camera.update(dt);

    if (!this.player.alive) this._onPlayerDeath();
  }

  _pickup(l) {
    if (l._sealIdx !== undefined) {
      // 回响刻印:记 flag(跨存档),刷新任务目标与罗盘
      state.flags[`seal_${this.chapter}_${l._sealIdx}`] = true;
      this.game.audio.sfxSecret();
      const { need, got } = this._sealProgress();
      this.game.spawnFloatText(this.player.x, this.player.y - 34, `回响刻印 ${got}/${need}`, '#e0b76a');
      this.currentObjective = this._getCurrentObjective();
      if (got >= need) {
        this.game._banner = { text: '刻印齐全 · 封印门可开', color: '#e0b76a', life: 3 };
      }
      // 刻印守护战:每一枚刻印都会唤醒守卫 —— 探索即战斗高潮
      this._startSealAmbush();
      return;
    }
    if (l._secret) {
      this.game.audio.sfxSecret();
      state.collected[l.type] = true;
      state.stats.secretsFound = (state.stats.secretsFound || 0) + 1;
      this.game.spawnFloatText(this.player.x, this.player.y - 30, `发现 · ${l._secretLabel}`, '#e0b76a');
      // 镜瞳彩蛋文案:拿到镜瞳本身时提示其能力
      if (l.type === 'mirrorEye') {
        this.game.spawnFloatText(this.player.x, this.player.y - 58, '小地图将揭示未发现的宝物', '#8aa9c4');
      }
      return;
    }
    // 拾取音:连收音阶递升(半音阶,1.5s 内连续拾取越捡越高,扫货的"哗啦"爽感)
    const streak = this._pickupStreakT > 0 ? this._pickupStreak + 1 : 1;
    this._pickupStreak = streak;
    this._pickupStreakT = 1.5;
    this.game.audio.sfxPickup(660 * Math.pow(1.0595, Math.min(12, streak - 1)));
    if (l.type === 'dew') { state.dew = (state.dew || 0) + 1; this.game.spawnFloatText(this.player.x, this.player.y - 30, '+1 露珠', '#8ad0e0'); }
    else if (l.type === 'ember') { state.mp = Math.min(state.maxMp, state.mp + 15); state.ember = (state.ember || 0) + 1; this.game.spawnFloatText(this.player.x, this.player.y - 30, '+15 MP', '#e87a3c'); }
    else if (l.type === 'leaf') { for (const k of Object.keys(state.skills)) state.skills[k].currentCd = 0; this.player.skillRecallCd = 0; this.player.skillShieldCd = 0; this.player.skillEchoCd = 0; state.leaf = (state.leaf || 0) + 1; this.game.spawnFloatText(this.player.x, this.player.y - 30, '技能就绪', '#a8d860'); }
    else if (l.type === 'gold') { state.gold += 10; this.game.spawnFloatText(this.player.x, this.player.y - 30, '+10 金', '#e0b76a'); }
    else if (l.type === 'shard') { state.shards += 1; this.game.spawnFloatText(this.player.x, this.player.y - 30, '+1 碎片', '#b78ce0'); }
  }

  _onPlayerDeath() {
    if (this._dying) return;
    this._dying = true;
    this._respawnTimer = 2.2; // 由 update 倒计时,暂停/对话时自动冻结(加长:给死亡节拍留时间)
    this.game.resetCombo();   // 死亡清空连击链(无打断特效,静默)
    state.stats.deaths += 1;
    this.game.audio.sfxDeath();
    this.game.camera.shake(16, 0.7);
    // 死亡节拍:时间减速 + 短顿,让"失去"有一瞬的重量
    this.game.hitstop = Math.max(this.game.hitstop || 0, 0.12);
    this.game.triggerSlowmo(1.0);
    this.game.spawnDeathParticles(this.player.x, this.player.y, '#b78ce0');
  }
  _respawn() {
    const sp = this.world.spawnPoint;
    this.player.x = sp.x; this.player.y = sp.y;
    this.player.vx = 0; this.player.vy = 0;
    this.player.hp = this.player.maxHp;
    this.player.alive = true;
    this.player.iFrame = 1.5;
    state.hp = this.player.hp;
    // 重生瞬间:暖白闪 + 归环粒子,与消散的冷紫形成呼应
    this.game.bossPhaseFlash = 0.6;
    this.game._bossPhaseColor = '#f4ecd0';
    this.game.spawnLevelUpParticles(sp.x, sp.y);
    // 死亡的代价:失去最高稀有度的一枚祝福(局外资产全保留 —— "失去刚赚的,保留已投入的")
    if (state.boons.length > 0) {
      const order = { common: 0, rare: 1, epic: 2, aspect: 1 };
      let best = 0;
      for (let i = 1; i < state.boons.length; i++) {
        if ((order[state.boons[i].rarity] ?? 0) > (order[state.boons[best].rarity] ?? 0)) best = i;
      }
      const lost = state.boons.splice(best, 1)[0];
      const def = BOON_POOL.find(b => b.id === lost.id);
      // 上限类祝福失去时回退
      if (def?.mods.maxHp) {
        state.maxHp = Math.max(1, state.maxHp - def.mods.maxHp);
        this.player.maxHp = state.maxHp;
        this.player.hp = Math.min(this.player.hp, state.maxHp);
      }
      if (def?.mods.maxMp) {
        state.maxMp = Math.max(1, state.maxMp - def.mods.maxMp);
        state.mp = Math.min(state.mp, state.maxMp);
      }
      this.game._banner = { text: `一枚祝福消散了 · ${def?.name || '回响'}`, color: '#8b7f5e', life: 2.4 };
      this.game.spawnFloatText(sp.x, sp.y - 40, '局外资产已保留', '#a9a07e', { px: 15, life: 1.4 });
    }
    // 复活保护:清空小怪仇恨(它们可能追到半路),并重置入场宽限
    for (const e of this.world.entities) {
      if (e.team === 'enemy' && e.alive) { e.target = null; e.alerted = false; }
    }
    // BOSS 复位:拉回王座、清仇恨与在场弹幕。否则它会带着仇恨横穿全图,
    // 到出生点蹲守 —— 复活保护的真正漏洞(team 'boss' 不在上面的小怪循环里)。
    if (this.chapterBoss && this.chapterBoss.alive) {
      const bp = this.world.bossPoint;
      this.chapterBoss.x = bp.x; this.chapterBoss.y = bp.y;
      this.chapterBoss.alerted = false; this.chapterBoss.target = null;
      this.chapterBoss.windup = 0; this.chapterBoss.attackCd = 1.5;
      this.world.projectiles.length = 0;
    }
    this.world.spawnGrace = 3.5;
    this._dying = false;
    this._respawnTimer = 0;
  }
  _updateChapterComplete(dt) {
    this.chapterComplete.t = (this.chapterComplete.t || 0) + dt;
    const k = this.game.input;
    const items = this._chapterCompleteItems();
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) {
      this.chapterComplete.idx = (this.chapterComplete.idx - 1 + items.length) % items.length; this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) {
      this.chapterComplete.idx = (this.chapterComplete.idx + 1) % items.length; this.game.audio.sfxHover();
    }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) {
      this.game.audio.sfxClick();
      const action = items[this.chapterComplete.idx].action;
      this.chapterComplete = null;
      action();
    }
    if (k.keysJustPressed.has('Escape')) { this.chapterComplete = null; }
  }

  _chapterCompleteItems() {
    const next = Math.min(4, this.chapter + 1);
    const chName = CHAPTERS.find(c => c.id === next)?.name || '下一章';
    return [
      { text: `进入下一章 · 第 ${next} 章 ${chName}`, action: () => {
        state.currentChapter = next;
        this.game.goto('chapterIntro', { chapter: next });
      }},
      { text: '继续探索本章', action: () => { /* 关闭弹窗,留下 */ } },
      { text: '返回标题', action: () => { this.game.audio.stopMusic(); this.game.goto('title'); } },
    ];
  }

  _togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.pauseIndex = 0;
      this.pauseItems = [
        { text: '继续游戏', action: () => { this.paused = false; } },
        { text: '技能图鉴 · 说明与演示', action: () => {
          this.paused = false;
          if (!this.game.scenes.skillInfo) this.game.scenes.skillInfo = new SkillInfoScene(this.game);
          this.game.goto('skillInfo');
        }},
        { text: '回响树 · 技能升级', action: () => {
          this.paused = false;
          if (!this.game.scenes.skillTree) this.game.scenes.skillTree = new SkillTreeScene(this.game);
          this.game.goto('skillTree');
        }},
        { text: '回响日志(记忆)', action: () => { this.paused = false; this.echoLogOpen = true; this.echoIdx = 0; this.echoDetail = false; } },
        { text: '资源转换 (2:1 损耗)', action: () => {
          this.paused = false;
          if (!this.game.scenes.conversion) this.game.scenes.conversion = new ConversionScene(this.game);
          this.game.goto('conversion');
        }},
        { text: '打开帮助', action: () => { this.paused = false; this.helpOpen = true; } },
        { text: '声音: ' + (this.game.audio.muted ? '关' : '开') + '  (切换)', action: () => { this.game.audio.setMute(!this.game.audio.muted); } },
        { text: '保存进度', action: () => { this.game.save.save(0); this.game.spawnFloatText(this.player.x, this.player.y - 30, '已保存', '#a8d860'); } },
        { text: '返回标题', action: () => { this.game.goto('title'); this.game.audio.stopMusic(); } },
      ];
    }
  }
  _updatePauseMenu(dt) {
    const k = this.game.input;
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) { this.pauseIndex = (this.pauseIndex - 1 + this.pauseItems.length) % this.pauseItems.length; this.game.audio.sfxHover(); }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) { this.pauseIndex = (this.pauseIndex + 1) % this.pauseItems.length; this.game.audio.sfxHover(); }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) { this.game.audio.sfxClick(); this.pauseItems[this.pauseIndex].action(); }
  }

  // ===== 渲染 =====
  render(ctx) {
    const cam = this.game.camera;
    this.world.render(ctx, cam);
    // 爆裂词缀危险区(地面预警圈,收缩至爆)
    for (const h of this._hazards) {
      const s = cam.worldToScreen(h.x, h.y);
      const p = h.t / h.dur;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.4 * p;
      ctx.strokeStyle = '#ff6a4a'; ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.arc(s.x, s.y, h.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.16 + 0.2 * p;
      ctx.fillStyle = '#ff6a4a';
      ctx.beginPath(); ctx.arc(s.x, s.y, h.r * p, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 拾取物(在实体下方)
    for (const l of this.world.loot) l.render(ctx, cam);
    // 静谧泉(支线房):青色呼吸光池;未用时冒泡,用后转暗
    for (const sh of this._shrines) {
      const s = cam.worldToScreen(sh.x, sh.y);
      if (!cam.inView(sh.x, sh.y, 80)) continue;
      const used = !!state.flags[sh.key];
      const t = performance.now() * 0.003;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const r = used ? 14 : 20 + Math.sin(t + sh.x) * 3;
      const a = used ? 0.12 : 0.3 + 0.12 * Math.sin(t * 2);
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 1.6);
      grad.addColorStop(0, `rgba(138,208,224,${a})`);
      grad.addColorStop(1, 'rgba(138,208,224,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, r * 1.6, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = used ? 'rgba(60,90,110,0.8)' : 'rgba(160,224,236,0.9)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (!used && Math.random() < 0.06) {
        this.game.particles.emit({ x: sh.x + (Math.random() - 0.5) * 16, y: sh.y, vx: 0, vy: -26, life: 0.8, color: '#bceaf4', size: 2, type: 'circle', fade: true, additive: true });
      }
    }
    // 尸体(倒地摊平淡出,在所有活体之下)
    for (const c of this._corpses) {
      if (!cam.inView(c.x, c.y, 60)) continue;
      const s = cam.worldToScreen(c.x, c.y);
      const k = c.t / 0.55;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.translate(s.x, s.y + k * 6);
      ctx.scale(1 + k * 0.12, 1 - k * 0.35);
      ctx.drawImage(c.sprite, -c.w / 2, -c.h, c.w, c.h);
      ctx.restore();
    }
    // NPC
    for (const n of this.npcs) this._renderNpc(ctx, cam, n);
    // 实体(深度排序;复用数组减少每帧分配)
    const drawables = this._drawables || (this._drawables = []);
    drawables.length = 0;
    for (const e of this.world.entities) {
      if (e !== this.player && e.alive) drawables.push(e);
    }
    drawables.push(this.player);
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const e of drawables) {
      // 视口剔除:屏外实体跳过绘制(碰撞/更新不受影响)
      if (e !== this.player && !cam.inView(e.x, e.y, 80)) continue;
      e.render?.(ctx, cam);
    }
    // 挥砍弧光(实体之上)
    this.game.renderSlashes(ctx, cam);
    // 抛射物(最上层)
    for (const p of this.world.projectiles) p.render(ctx, cam);
    // 环境氛围层(章节主题:孢子/灰烬/落叶/雪花)
    this.game.ambient.render(ctx);
    // 浮动文字
    this.game.renderFloatTexts(ctx, cam);
    // 静谧泉交互提示(画在实体之上,不被角色遮挡;带底板,压在亮草地也可读)
    if (this._nearbyShrine && !state.flags[this._nearbyShrine.key]) {
      const s = cam.worldToScreen(this._nearbyShrine.x, this._nearbyShrine.y);
      const pl = '按 T 饮泉 · 回复生命';
      const pw = textWidth(ctx, pl, 'small');
      ctx.fillStyle = 'rgba(8,6,14,0.72)';
      ctx.fillRect(s.x - pw / 2 - 7, s.y - 47, pw + 14, 21);
      text(ctx, pl, s.x, s.y - 42, 'small', '#bceaf4', { align: 'center' });
    }
    // 对话
    if (this.dialogActive) this.game.scenes.dialog.render(ctx);
    // Boss 开战电影黑边(上下压屏 + 细金边)
    if (this._cineT > 0.01) {
      const W = this.game.canvas.width, H = this.game.canvas.height;
      const barH = 56 * Math.min(1, this._cineT);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
      ctx.fillStyle = 'rgba(224,183,106,0.4)';
      ctx.fillRect(0, barH - 1, W, 1);
      ctx.fillRect(0, H - barH, W, 1);
    }
    // 暂停时场景本身带全屏暗层与面板,HUD/Boss 条只会添乱 —— 直接不画
    if (!this.paused) this._renderHud(ctx);
    // BOSS 血条:仅开战且玩家在 Boss 附近时显示(远离战斗现场不悬挂 UI)
    if (!this.paused && this.chapterBoss && this.chapterBoss.alerted && this.chapterBoss.alive
        && this.player.distance(this.chapterBoss) < 560) this._renderBossHud(ctx, this.chapterBoss);
    if (this.chapterComplete) this._renderChapterComplete(ctx);
    if (this.paused) this._renderPause(ctx);
    // 死亡仪式:黑幕渐入 + "回声消散"(盖住 HUD,给死亡一拍留白)
    if (this._dying) this._renderDeathOverlay(ctx);
    // 触屏动作按钮(仅触屏设备显示;对话/暂停/祝福覆盖层出现时隐藏,避免误触)
    if (this.game.input.touchMode && !this.dialogActive && !this.paused
        && !this.chapterComplete && !this._boonOffer && !this._dying) {
      this._renderTouchButtons(ctx);
    }
    // 回响祝福三选一(最上层)
    if (this.boonPicker.offer) this.boonPicker.render(ctx);
  }

  _renderTouchButtons(ctx) {
    for (const b of this.game.input.getTouchButtons()) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#0c0a14';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#b78ce0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.95;
      text(ctx, b.label, b.x, b.y - 11, 'small', '#f4ecd0', { align: 'center' });
      ctx.restore();
    }
  }

  _renderDeathOverlay(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const t = 2.2 - this._respawnTimer; // 已进行的时间
    const a = Math.min(0.85, Math.max(0, t) * 1.4);
    ctx.fillStyle = `rgba(4, 2, 10, ${a})`;
    ctx.fillRect(0, 0, W, H);
    if (t > 0.35) {
      ctx.globalAlpha = Math.min(1, (t - 0.35) * 1.6);
      text(ctx, '回声,正在消散……', W / 2, H / 2 - 20, 'title', '#b78ce0', { align: 'center' });
      ctx.globalAlpha = Math.min(1, (t - 0.6) * 1.4) * 0.85;
      text(ctx, '但枯荣之环,会把你重新想起', W / 2, H / 2 + 44, 'small', '#8b7f5e', { align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  _renderChapterComplete(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const ch = CHAPTERS.find(c => c.id === this.chapter);
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    // 框
    const bx = W / 2 - 280, by = H / 2 - 200, bw = 560, bh = 400;
    ctx.fillStyle = 'rgba(20,16,30,0.95)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = ch?.color || '#e0b76a'; ctx.lineWidth = 3;
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    text(ctx, '◆ 章节通关 ◆', W / 2, by + 30, 'title', ch?.color || '#e0b76a', { align: 'center' });
    text(ctx, `第 ${this.chapter} 章 · ${ch?.name || ''}`, W / 2, by + 92, 'large', '#f4ecd0', { align: 'center' });
    text(ctx, ch?.subtitle || '', W / 2, by + 132, 'medium', '#d6c8a4', { align: 'center' });
    text(ctx, `击杀 ${state.stats.kills}  ·  金币 ${state.gold}  ·  碎片 ${state.shards}  ·  游玩 ${Math.floor(state.playTime / 60)} 分钟`, W / 2, by + 172, 'small', '#a9a07e', { align: 'center' });
    // 选项
    const items = this._chapterCompleteItems();
    for (let i = 0; i < items.length; i++) {
      const sel = i === this.chapterComplete.idx;
      const y = by + 230 + i * 50;
      if (sel) { ctx.fillStyle = 'rgba(183,140,224,0.18)'; ctx.fillRect(bx + 30, y - 6, bw - 60, 42); }
      text(ctx, (sel ? '▶ ' : '  ') + items[i].text, W / 2, y, sel ? 'medium' : 'small', sel ? '#f4ecd0' : '#a9a07e', { align: 'center' });
    }
    text(ctx, '↑↓ 选择 · ENTER 确认 · ESC 继续探索', W / 2, by + bh - 28, 'small', '#a9a07e', { align: 'center' });
  }

  _renderNpc(ctx, cam, n) {
    const s = cam.worldToScreen(n.x, n.y);
    // 阴影
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 16, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const bob = Math.sin(n.bob * 2) * 2;
    // 面向玩家(玩家在左侧时镜像)
    const flip = this.player && this.player.x < n.x;
    ctx.save();
    if (flip) { ctx.translate(s.x, 0); ctx.scale(-1, 1); ctx.translate(-s.x, 0); }
    ctx.drawImage(n.sprite, s.x - n.sprite.width / 2, s.y - n.sprite.height + bob);
    ctx.restore();
    // 头顶「!」
    const y = s.y - n.sprite.height - 14 + Math.sin(n.bob * 3) * 2;
    ctx.fillStyle = '#e0b76a';
    ctx.font = 'bold 22px "Noto Sans CJK SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText('!', s.x, y); ctx.fillText('!', s.x, y);
    if (this._nearbyNpc === n) {
      const tp = n.shop ? '按 T 买卖 · 游商尘' : '按 T 交谈';
      const tw = textWidth(ctx, tp, 'small');
      ctx.fillStyle = 'rgba(8,6,14,0.72)';
      ctx.fillRect(s.x - tw / 2 - 7, y + 17, tw + 14, 21);
      text(ctx, tp, s.x, y + 22, 'small', '#f4ecd0', { align: 'center' });
    }
  }

  _renderHud(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    // 左上: HP/MP/资源(整体下移,标签不再贴屏幕顶边)
    const barW = 280, barH = 14, barX = 18, barY = 32;
    uiPanel(ctx, barX - 6, barY - 18, barW + 12, 92, { accent: 'rgba(183,140,224,0.35)' });
    text(ctx, '生命', barX, barY - 16, 'small', '#d65858');
    uiBar(ctx, barX, barY, barW, barH, this.player.hp / this.player.maxHp, '#d65858', { ticks: 4 });
    text(ctx, `${Math.ceil(this.player.hp)}/${this.player.maxHp}`, barX + barW, barY, 'small', '#fff', { align: 'right' });
    text(ctx, '法力', barX, barY + barH + 4, 'small', '#6c8ee0');
    uiBar(ctx, barX, barY + barH + 16, barW, barH, state.mp / state.maxMp, '#6c8ee0', { ticks: 4 });
    text(ctx, `${Math.ceil(state.mp)}/${state.maxMp}`, barX + barW, barY + barH + 16, 'small', '#fff', { align: 'right' });
    // 经验条(细金条,升级进度一目了然)
    const xpY = barY + barH * 2 + 20;
    uiBar(ctx, barX, xpY, barW, 6, Math.min(1, state.xp / state.xpToNext), '#d8b04a');
    // 自动存档轻提示(淡出;时长在 update 里递减)
    if (this._saveToast > 0) {
      ctx.globalAlpha = Math.min(1, this._saveToast);
      text(ctx, '✦ 已自动保存', barX + barW + 10, xpY + 3, 'small', '#8b7f5e');
      ctx.globalAlpha = 1;
    }
    // 资源条
    const res = [
      { icon: SPRITE_LIB.icons.dew, n: state.dew || 0, label: '露' },
      { icon: SPRITE_LIB.icons.ember, n: state.ember || 0, label: '烬' },
      { icon: SPRITE_LIB.icons.leaf, n: state.leaf || 0, label: '叶' },
      { icon: SPRITE_LIB.icons.gold, n: state.gold, label: '金' },
      { icon: SPRITE_LIB.icons.shard, n: state.shards, label: '碎片' },
    ];
    let rx = barX;
    const resY = barY + barH * 2 + 24;
    for (const r of res) {
      if (r.icon) ctx.drawImage(r.icon, rx, resY, 18, 18);
      text(ctx, `${r.n}`, rx + 22, resY + 4, 'small', '#d6c8a4');
      rx += 56;
    }
    text(ctx, `Lv ${state.level}`, rx, resY + 4, 'small', '#e0b76a');
    // 祝福图标条:已持有祝福按稀有度着色(小方块+首字),一眼看清当前构筑
    let bx0 = rx + 52;
    for (const b of state.boons) {
      const def = BOON_POOL.find(x => x.id === b.id);
      if (!def) continue;
      const col = BOON_RARITY_INFO[b.rarity]?.color || '#d6c8a4';
      ctx.fillStyle = 'rgba(8,6,14,0.7)';
      ctx.fillRect(bx0, resY - 2, 22, 22);
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.strokeRect(bx0 + 0.5, resY - 1.5, 21, 21);
      text(ctx, def.name[def.name.indexOf('·') >= 0 ? def.name.indexOf('·') + 1 : 0] || '祝',
        bx0 + 11, resY + 2, 14, col, { align: 'center' });
      bx0 += 26;
    }

    // 连击链(HUD):≥2 连显示于屏幕上方中央;窗口将尽时收缩提示
    this._renderComboHud(ctx);

    // 右上: 章节名 + 当前房间名
    const ch = CHAPTERS.find(c => c.id === this.chapter);
    // 右上角柔和渐变背板:章节名/引语/房间名不再被世界精灵穿透
    const g2 = ctx.createRadialGradient(W, 0, 40, W, 0, 400);
    g2.addColorStop(0, 'rgba(8,6,14,0.72)');
    g2.addColorStop(1, 'rgba(8,6,14,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(W - 400, 0, 400, 400);
    text(ctx, `第 ${ch.id} 章 · ${ch.name}`, W - 18, 18, 'large', ch.color, { align: 'right' });
    text(ctx, ch.subtitle, W - 18, 54, 'medium', '#d6c8a4', { align: 'right' });
    if (this.currentRoom) {
      text(ctx, '◆ ' + this.currentRoom.name, W - 18, 84, 'small', '#8b7f5e', { align: 'right' });
    }

    // 任务条
    this._renderObjective(ctx);
    // 罗盘(指向 BOSS)
    this._renderCompass(ctx);
    // 支线房预告(Hades 门图标):未踏入的试炼/宝藏/静谧房,靠近时在房顶亮出类型与奖励
    this._renderSideRoomHints(ctx);
    // 帮助按钮
    this._renderHelpButton(ctx);
    if (this.helpOpen) this._renderHelp(ctx);
    if (this.echoLogOpen) this._renderEchoLog(ctx);

    // 底部操作条
    ctx.fillStyle = 'rgba(8,6,14,0.7)';
    ctx.fillRect(0, H - 26, W, 26);
    text(ctx, 'WASD 移动  ·  J 攻击  ·  SPACE 闪避  ·  T 交谈  ·  M 静音  ·  ?帮助  ·  ESC 暂停', W / 2, H - 18, 'small', '#d6c8a4', { align: 'center' });

    // 技能栏(冷却/法力消耗一目了然)
    this._renderSkillBar(ctx);

    // 右下角小地图
    this._renderMinimap(ctx);
  }

  // 底部中央技能栏:Q/E/R/SPACE/F 五格,显示图标、按键、冷却扫过与法力不足
  _renderSkillBar(ctx) {
    const p = this.player;
    if (!p || !p.alive) return;
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const slots = [
      { key: 'Q', icon: SPRITE_LIB.skills.recall, cd: p.skillRecallCd, total: p.effCd('recall'), mp: 12 },
      { key: 'E', icon: SPRITE_LIB.skills.shield, cd: p.skillShieldCd, total: p.effCd('shield'), mp: 20 },
      { key: 'R', icon: SPRITE_LIB.skills.echo, cd: p.skillEchoCd, total: p.effCd('echo'), mp: 30 },
      { key: 'SPC', icon: SPRITE_LIB.skills.dash, cd: p.dashCd, total: p.effCd('dash'), mp: 0 },
      { key: 'F', icon: SPRITE_LIB.skills.heal, cd: 0, total: 1, mp: 0, count: state.dew || 0 },
    ];
    const size = 34, gap = 8;
    const totalW = slots.length * size + (slots.length - 1) * gap;
    const x0 = (W - totalW) / 2;
    const y0 = H - 26 - size - 8; // 控制条上方
    uiPanel(ctx, x0 - 6, y0 - 6, totalW + 12, size + 12, { accent: 'rgba(183,140,224,0.3)', cornerLen: 4 });
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const x = x0 + i * (size + gap);
      // 就绪检测:冷却转好瞬间闪金(对比上一帧状态)
      const onCd = s.total > 0 && s.cd > 0;
      const usable = !onCd && !(s.mp > 0 && state.mp < s.mp) && !(s.count !== undefined && s.count <= 0);
      const prev = this._skillPrev[s.key];
      if (prev === false && usable && !(this._skillFlash[s.key] > 0)) this._skillFlash[s.key] = 0.45;
      this._skillPrev[s.key] = usable;
      const flash = Math.max(0, this._skillFlash[s.key] || 0);
      // 底框(就绪闪光时描金)
      uiSlot(ctx, x, y0, size, { ready: flash > 0, accent: flash > 0 ? '#ffcf4d' : 'rgba(183,140,224,0.45)' });
      // 图标
      const icon = s.icon;
      const noResource = s.mp > 0 && state.mp < s.mp;
      const noDew = s.count !== undefined && s.count <= 0;
      if (icon) {
        ctx.save();
        if (noResource || noDew) ctx.globalAlpha = 0.32;
        ctx.drawImage(icon, x + (size - icon.width) / 2, y0 + (size - icon.height) / 2);
        ctx.restore();
      }
      // 冷却遮罩(自上而下消退)
      if (s.total > 0 && s.cd > 0) {
        const frac = Math.max(0, Math.min(1, s.cd / s.total));
        ctx.fillStyle = 'rgba(4,3,10,0.72)';
        ctx.fillRect(x, y0, size, size * frac);
      }
      // 法力不足角标(蓝色小字)
      if (noResource) {
        text(ctx, `${s.mp}`, x + size - 2, y0 + size - 4, 'small', '#6c8ee0', { align: 'right' });
      }
      // 露珠存量
      if (s.count !== undefined) {
        text(ctx, `${s.count}`, x + size - 2, y0 + size - 4, 'small', s.count > 0 ? '#8ad0e0' : '#5a4a3a', { align: 'right' });
      }
      // 按键标签
      text(ctx, s.key, x + 3, y0 + 3, 'small', '#d6c8a4', { shadowColor: '#000', shadowOffset: { x: 1, y: 1 } });
    }
  }

  // 连击 HUD:数字越大越亮;最后一秒渐暗提醒窗口将尽
  _renderComboHud(ctx) {
    const g = this.game;
    if (g.comboCount < 2) return;
    const W = this.game.canvas.width;
    const frac = Math.max(0, Math.min(1, g.comboTimer / COMBAT.comboWindow));
    // 越接近断链越透明
    ctx.globalAlpha = 0.45 + 0.55 * frac;
    // 阶段色:白 → 金(≥5)→ 炽金(≥12)→ 炼金紫(≥22)
    let color = '#f4ecd0';
    if (g.comboCount >= 22) color = '#e0a8ff';
    else if (g.comboCount >= 12) color = '#ffc84d';
    else if (g.comboCount >= 5) color = '#ffdf8a';
    const pulse = g.comboFxT > 0 ? 34 : (g.comboCount >= 12 ? 28 : 24);
    const numStr = `${g.comboCount} 连击`;
    // y14/52:整块收进罗盘黑圈(顶边 y66)上方,脉冲放大也不压圈
    text(ctx, numStr, W / 2, 14, pulse, color, { align: 'center' });
    // 窗口余量条(细)
    const barW = 90, bx = W / 2 - barW / 2, by = 52;
    ctx.fillStyle = 'rgba(8,6,14,0.6)';
    ctx.fillRect(bx, by, barW, 3);
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, barW * frac, 3);
    // 当前伤害加成提示:跟在连击数右侧(正下方是罗盘位置,竖排会叠压)
    const mul = comboMultiplier(g.comboCount);
    if (mul > 1) {
      const off = textWidth(ctx, numStr, pulse) / 2 + 12;
      text(ctx, `伤害 +${Math.round((mul - 1) * 100)}%`, W / 2 + off, 22, 'small', color,
        { align: 'left', shadowColor: '#000', shadowOffset: { x: 1, y: 1 } });
    }
    ctx.globalAlpha = 1;
  }

  _renderMinimap(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    const mapW = 140, mapH = 90;
    const mapX = W - mapW - 12;
    const mapY = H - mapH - 32; // 位于底部操作条上方,避开 H-26 控制条
    const sx = mapW / this.world.pxW;
    const sy = mapH / this.world.pxH;
    // 背景
    ctx.fillStyle = 'rgba(8,6,14,0.7)';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    // 地牢结构底图(房间/走廊/封印门,预渲染一次)
    if (this.world.minimapCanvas) ctx.drawImage(this.world.minimapCanvas, mapX, mapY);
    // 未收集刻印(金菱形,探索指引)
    const { need, got } = this._sealProgress();
    if (got < need) {
      ctx.fillStyle = '#f4e0a0';
      this.world.sealPoints.forEach((sp, i) => {
        if (state.flags[`seal_${this.chapter}_${i}`]) return;
        const px = mapX + sp.x * sx, py = mapY + sp.y * sy;
        ctx.beginPath();
        ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3, py);
        ctx.closePath(); ctx.fill();
      });
    }
    // 玩家
    if (this.player && this.player.alive) {
      ctx.fillStyle = '#b78ce0';
      ctx.beginPath();
      ctx.arc(mapX + this.player.x * sx, mapY + this.player.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // BOSS(若存活且门已开或已开战)
    if (this.chapterBoss && this.chapterBoss.alive && (this.world.gateOpen || this.battleStarted)) {
      ctx.fillStyle = '#d65858';
      ctx.beginPath();
      ctx.arc(mapX + this.chapterBoss.x * sx, mapY + this.chapterBoss.y * sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // 普通敌人(小灰点;已警觉的偏红,便于绕行;精英金色菱形)
    for (const e of this.world.entities) {
      if (e === this.player || !e.alive || e.side !== 'enemy') continue;
      if (e === this.chapterBoss) continue;
      if (e.elite) {
        const px = mapX + e.x * sx, py = mapY + e.y * sy;
        ctx.fillStyle = '#ffcf4d';
        ctx.beginPath();
        ctx.moveTo(px, py - 3); ctx.lineTo(px + 2.5, py); ctx.lineTo(px, py + 3); ctx.lineTo(px - 2.5, py);
        ctx.closePath(); ctx.fill();
        continue;
      }
      ctx.fillStyle = e.alerted ? '#c86a5a' : '#7a5a5a';
      ctx.beginPath();
      ctx.arc(mapX + e.x * sx, mapY + e.y * sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // NPC
    ctx.fillStyle = '#e0b76a';
    for (const n of this.npcs) {
      ctx.beginPath();
      ctx.arc(mapX + n.x * sx, mapY + n.y * sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 镜瞳(隐藏奖励):小地图显示未收集的秘密宝物(菱形金点)
    if (state.collected.mirrorEye) {
      ctx.fillStyle = '#f4e0a0';
      for (const l of this.world.loot) {
        if (!l._secret || !l.alive) continue;
        const px = mapX + l.x * sx, py = mapY + l.y * sy;
        ctx.beginPath();
        ctx.moveTo(px, py - 4); ctx.lineTo(px + 4, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 4, py);
        ctx.closePath(); ctx.fill();
      }
    }
    uiMinimap(ctx, mapX, mapY, mapW, mapH);
  }

  _renderObjective(ctx) {
    if (!this.currentObjective) return;
    const W = this.game.canvas.width;
    const boxX = 18, boxY = 122, boxW = 300, boxH = 70;
    uiPanel(ctx, boxX, boxY, boxW, boxH, { accent: 'rgba(224,183,106,0.6)', fill: 'rgba(8,6,14,0.78)' });
    text(ctx, '◆ 当前目标', boxX + 12, boxY + 6, 'small', '#e0b76a');
    text(ctx, this.currentObjective.title, boxX + 12, boxY + 24, 'medium', '#f4ecd0');
    text(ctx, this.currentObjective.desc, boxX + 12, boxY + 46, 'small', '#c9bd97');
    if (this.objectiveT < 3) {
      const a = 0.3 + 0.3 * Math.sin(this.objectiveT * 8);
      ctx.fillStyle = `rgba(224,183,106,${a})`;
      ctx.fillRect(boxX, boxY, 4, boxH);
    }
  }

  // 罗盘:未集齐刻印时指向最近的未收集刻印,集齐后指向 BOSS
  _renderCompass(ctx) {
    if (!this.chapterBoss || !this.chapterBoss.alive || this.battleStarted) return;
    const W = this.game.canvas.width;
    const cx = W / 2, cy = 92;
    // 目标选择:最近的未收集刻印 → 否则 BOSS
    let tx = this.chapterBoss.x, ty = this.chapterBoss.y, label = 'BOSS', color = this.chapterBoss.color;
    const { need, got } = this._sealProgress();
    if (got < need) {
      let best = null, bestD = Infinity;
      this.world.sealPoints.forEach((sp, i) => {
        if (state.flags[`seal_${this.chapter}_${i}`]) return;
        const d = Math.hypot(sp.x - this.player.x, sp.y - this.player.y);
        if (d < bestD) { bestD = d; best = sp; }
      });
      if (best) {
        tx = best.x; ty = best.y;
        label = '刻印';
        color = '#e0b76a';
      }
    }
    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,14,0.7)';
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(8, 8); ctx.lineTo(8, -8); ctx.fill();
    ctx.restore();
    // 距离标签加深色底板,裸文字压在世界地面上会显得杂乱
    const lbl = `${label} ${Math.round(dist / 32)}m`;
    const lw = textWidth(ctx, lbl, 'small');
    ctx.fillStyle = 'rgba(8,6,14,0.72)';
    ctx.fillRect(cx - lw / 2 - 6, cy + 24, lw + 12, 20);
    text(ctx, lbl, cx, cy + 28, 'small', '#d6c8a4', { align: 'center' });
  }

  // 支线房预告(Hades 门后奖励):未踏入的试炼/宝藏/静谧房,靠近 560px 内
  // 在房间上沿亮出「类型 · 奖励」徽标,让"走哪条岔路"成为有依据的选择
  _renderSideRoomHints(ctx) {
    const cam = this.game.camera;
    const t = this.world.tile;
    for (const room of this.world.sideRooms || []) {
      if (room.visited) continue;
      const wx = (room.cx + 0.5) * t, wy = room.y * t - 14;
      const d = Math.hypot(this.player.x - wx, this.player.y - wy);
      if (d > 560) continue;
      const def = SIDE_ROOMS[room.side];
      if (!def) continue;
      const s = cam.worldToScreen(wx, wy);
      const a = Math.min(1, (560 - d) / 160) * 0.92; // 靠近渐显
      ctx.save();
      ctx.globalAlpha = a;
      const l1 = `◆ ${def.label}`;
      const l2 = def.desc;
      const w1 = textWidth(ctx, l1, 'small'), w2 = textWidth(ctx, l2, 'small');
      const bw = Math.max(w1, w2) + 20;
      ctx.fillStyle = 'rgba(8,6,14,0.78)';
      ctx.fillRect(s.x - bw / 2, s.y - 44, bw, 40);
      ctx.strokeStyle = def.color; ctx.lineWidth = 1;
      ctx.strokeRect(s.x - bw / 2 + 0.5, s.y - 43.5, bw - 1, 39);
      text(ctx, l1, s.x, s.y - 40, 'small', def.color, { align: 'center' });
      text(ctx, l2, s.x, s.y - 22, 'small', '#8b7f5e', { align: 'center' });
      ctx.restore();
    }
  }

  _renderHelpButton(ctx) {
    const W = this.game.canvas.width;
    // 下移避开右上章节名/房间名文本区
    const x = W - 44, y = 134, r = 18;
    ctx.fillStyle = 'rgba(8,6,14,0.8)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.helpOpen ? '#b78ce0' : '#e0b76a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    text(ctx, '?', x, y - 8, 'medium', '#f4ecd0', { align: 'center' });
  }

  _renderHelp(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, 0, W, H);
    uiPanel(ctx, 40, 30, W - 80, H - 70, { accent: 'rgba(183,140,224,0.4)', fill: 'rgba(12,10,20,0.6)' });
    text(ctx, '帮助 · 操作指南', W / 2, 50, 'title', '#e0b76a', { align: 'center' });
    text(ctx, '核心:WASD 移动 + J 攻击 + SPACE 闪避,就能通关(攻击自动瞄准最近敌人)', W / 2, 110, 'medium', '#a8e8b0', { align: 'center' });
    const col1 = W / 2 - 250, col2 = W / 2 + 30;
    text(ctx, '◆ 基础操作(够用了)', col1, 150, 'medium', '#b78ce0');
    const moves = [
      ['WASD / 方向键', '移动(8 方向)'],
      ['J / 鼠标', '攻击·自动瞄准最近敌人'],
      ['SPACE', '闪避冲刺(短暂无敌)'],
      ['T', '与 NPC 交谈'],
      ['? / H', '帮助'],
      ['ESC', '暂停'],
    ];
    let y = 184;
    for (const [k, v] of moves) { text(ctx, k, col1, y, 'small', '#e0b76a'); text(ctx, v, col1 + 130, y, 'small', '#d6c8a4'); y += 30; }
    text(ctx, '◆ 进阶技能(详见 暂停 → 技能图鉴,含动态演示)', col2, 150, 'medium', '#a9a07e');
    const skills = [
      ['Q', '追忆·法弹(耗12,24+等级×4)'],
      ['E', '枯荣之护·1.4s无敌(耗20)'],
      ['R', '回响共鸣·回40+清仇恨(耗30)'],
      ['SPACE', '余烬闪·无敌帧/完美闪避'],
      ['F', '晨露·耗1露珠回30'],
      ['', '命中敌人回蓝 · M 静音'],
      ['V', 'BOSS 力竭时「释怀」'],
    ];
    y = 184;
    for (const [k, v] of skills) { text(ctx, k, col2, y, 'small', '#a9a07e'); text(ctx, v, col2 + 90, y, 'small', '#a9a07e'); y += 30; }
    text(ctx, '◆ 战斗诀窍', W / 2, 372, 'medium', '#b78ce0', { align: 'center' });
    text(ctx, '连击:持续命中提升伤害(+10%/+20%/+32%),被击中会打断;闪避穿过攻击触发「完美闪避」(子弹时间 + 回蓝)', W / 2, 404, 'small', '#d6c8a4', { align: 'center' });
    text(ctx, '精英敌(金菱标):血厚收益×3,必掉枯叶 · 清空房间有奖励 · 拾取刻印会惊动守护者', W / 2, 426, 'small', '#d6c8a4', { align: 'center' });
    text(ctx, '资源:露珠(F回血) · 余烬(回蓝) · 枯叶(重置冷却) · 金币 · 碎片(剧情)', W / 2, 448, 'small', '#8b7f5e', { align: 'center' });
    text(ctx, '◆ 目标', W / 2, 476, 'medium', '#b78ce0', { align: 'center' });
    text(ctx, this.currentObjective.title + ' — ' + this.currentObjective.desc, W / 2, 506, 'small', '#f4ecd0', { align: 'center' });
    text(ctx, '按 ? 或 ESC 关闭', W / 2, H - 40, 'small', '#a9a07e', { align: 'center' });
  }

  _renderBossHud(ctx, boss) {
    const W = this.game.canvas.width;
    const barW = 620, barH = 16, bx = (W - barW) / 2, by = 130;
    const showRelease = this._renderReleasePrompt;
    const extraH = showRelease ? 30 : 0;
    uiBossFrame(ctx, bx - 8, by - 26, barW + 16, barH + 46 + extraH, boss.color);
    ctx.strokeStyle = boss.color; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 7, by - 25, barW + 14, barH + 44 + extraH);
    const releasable = boss.releaseAvailable?.();
    text(ctx, releasable ? '〔可释怀〕 ' + boss.data.name : boss.data.name, W / 2, by - 20, 'medium',
      releasable ? '#e0b76a' : boss.color, { align: 'center' });
    uiBar(ctx, bx, by, barW, barH, boss.hp / boss.maxHp, boss.color);
    text(ctx, `〔${boss.data.phases[boss.phaseIdx].name}〕`, W / 2, by + barH + 4, 'small', '#d6c8a4', { align: 'center' });
    // 阶段点:血条下方的一排圆点,标示 BOSS 总阶段与当前所处阶段
    const phases = boss.data.phases;
    const pipGap = 22;
    const pipX0 = W / 2 - ((phases.length - 1) * pipGap) / 2;
    for (let i = 0; i < phases.length; i++) {
      const px = pipX0 + i * pipGap;
      ctx.beginPath();
      ctx.arc(px, by - 8, i === boss.phaseIdx ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i <= boss.phaseIdx ? boss.color : '#4a3a3a';
      ctx.fill();
    }
    if (showRelease) {
      // 脉冲:频率 ~2Hz,alpha 在 0.6-1.0 间正弦变化;金色提示"按 V 释怀"
      const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.t * 4));
      ctx.save();
      ctx.globalAlpha = pulse;
      text(ctx, '按 V 释怀', W / 2, by + barH + 28, 'medium', '#e0b76a', { align: 'center', shadowColor: '#000', shadowOffset: { x: 2, y: 2 } });
      ctx.restore();
    }
  }

  _renderPause(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
    // 中央面板容器(菜单与背景彻底隔离,不再依赖暗层程度)
    const pw = 560, ph = 96 + this.pauseItems.length * 50 + 56;
    const px0 = (W - pw) / 2, py0 = (H - ph) / 2 - 10;
    uiPanel(ctx, px0, py0, pw, ph, { accent: 'rgba(183,140,224,0.5)', fill: 'rgba(16,12,28,0.96)' });
    text(ctx, '暂 停', W / 2, py0 + 30, 'title', '#f4ecd0', { align: 'center' });
    const listY = py0 + 96;
    for (let i = 0; i < this.pauseItems.length; i++) {
      const sel = i === this.pauseIndex;
      const y = listY + i * 50;
      if (sel) {
        ctx.fillStyle = 'rgba(183,140,224,0.18)';
        ctx.fillRect(px0 + 24, y - 17, pw - 48, 38);
        text(ctx, '▶', px0 + 34, y - 4, 'small', '#b78ce0');
        text(ctx, '◀', px0 + pw - 34, y - 4, 'small', '#b78ce0', { align: 'right' });
      }
      text(ctx, this.pauseItems[i].text, W / 2, y, sel ? 'medium' : 'small',
        sel ? '#f4ecd0' : '#a9a07e', { align: 'center' });
    }
    text(ctx, '↑↓ 选择 · ENTER 确认', W / 2, py0 + ph - 22, 'small', '#a9a07e', { align: 'center' });
  }

  // ===== 回响日志(碎片化叙事回看)=====
  _updateEchoLog(dt) {
    const k = this.game.input;
    const list = this._echoList();
    if (list.length === 0) {
      if (k.keysJustPressed.has('Escape')) { this.echoLogOpen = false; this.game.audio.sfxClick(); }
      return;
    }
    if (this.echoIdx >= list.length) this.echoIdx = 0;
    if (k.keysJustPressed.has('ArrowUp') || k.keysJustPressed.has('KeyW')) { this.echoIdx = (this.echoIdx - 1 + list.length) % list.length; this.game.audio.sfxHover(); }
    if (k.keysJustPressed.has('ArrowDown') || k.keysJustPressed.has('KeyS')) { this.echoIdx = (this.echoIdx + 1) % list.length; this.game.audio.sfxHover(); }
    if (k.keysJustPressed.has('Enter') || k.keysJustPressed.has('Space')) { this.echoDetail = !this.echoDetail; this.game.audio.sfxClick(); }
    if (k.keysJustPressed.has('Escape')) { this.echoLogOpen = false; this.game.audio.sfxClick(); }
  }

  _echoList() {
    return Object.keys(ECHOES).filter(id => (state.echoes || []).includes(id)).map(id => ({ id, ...ECHOES[id] }));
  }

  _renderEchoLog(ctx) {
    const W = this.game.canvas.width, H = this.game.canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, W, H);
    text(ctx, '◆ 回响日志', W / 2, 40, 'title', '#b78ce0', { align: 'center' });
    const list = this._echoList();
    text(ctx, `已收录 ${list.length} / ${Object.keys(ECHOES).length} 段记忆`, W / 2, 92, 'small', '#a9a07e', { align: 'center' });
    if (list.length === 0) {
      text(ctx, '尚未收录任何记忆。', W / 2, H / 2, 'medium', '#a9a07e', { align: 'center' });
      text(ctx, '与途中的人交谈、走进他们的故事——记忆会在此回响。', W / 2, H / 2 + 36, 'small', '#8b7f5e', { align: 'center' });
      text(ctx, '按 ESC 返回', W / 2, H - 50, 'small', '#a9a07e', { align: 'center' });
      return;
    }
    // 左侧条目列表
    const colX = 60, listY = 130, lh = 36;
    for (let i = 0; i < list.length; i++) {
      const sel = i === this.echoIdx;
      const y = listY + i * lh;
      if (sel) { ctx.fillStyle = 'rgba(183,140,224,0.16)'; ctx.fillRect(colX - 10, y - 8, 440, lh); }
      text(ctx, (sel ? '▶ ' : '  ') + list[i].title, colX, y, sel ? 'medium' : 'small', sel ? '#f4ecd0' : '#a9a07e');
    }
    // 右侧详情
    const sel = list[this.echoIdx];
    if (sel) {
      const dx = 540, dy = 130, dw = W - dx - 60, dh = H - dy - 80;
      uiPanel(ctx, dx, dy, dw, dh, { accent: '#3a2a5a', fill: 'rgba(20,16,30,0.75)' });
      text(ctx, sel.title, dx + 22, dy + 18, 'large', '#e0b76a');
      const chLabel = ['序章 · 世界观', '第一章 · 春之森', '第二章 · 夏之墟', '第三章 · 秋之墓', '第四章 · 冬之渊'][sel.chapter] || '';
      text(ctx, chLabel, dx + 22, dy + 58, 'small', '#8b7f5e');
      ctx.strokeStyle = 'rgba(183,140,224,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dx + 22, dy + 84); ctx.lineTo(dx + dw - 22, dy + 84); ctx.stroke();
      this._renderWrapped(ctx, sel.text, dx + 22, dy + 100, dw - 44, 'medium', '#d6c8a4');
    }
    text(ctx, '↑↓ 选择 · ENTER 展开/收起 · ESC 返回', W / 2, H - 40, 'small', '#a9a07e', { align: 'center' });
  }

  // 简易中文自动换行(按 textWidth 精确测量)
  _renderWrapped(ctx, str, x, y, maxW, size, color) {
    let line = '', yOff = 0;
    const px = (typeof size === 'number') ? size : ({ small: 16, medium: 22, large: 30, title: 42, hero: 56 })[size] || 22;
    const lh = Math.round(px * 1.45);
    for (const ch of str) {
      const test = line + ch;
      if (textWidth(ctx, test, size) > maxW && line) {
        text(ctx, line, x, y + yOff, size, color);
        yOff += lh;
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) text(ctx, line, x, y + yOff, size, color);
  }
}
