// world.js — 俯视角地图、分离轴碰撞、拾取物
// 地图 = 房间+走廊地牢。每章按列分三个区域主题(怪物组/房名/装饰/色调,data/zones.js),
// 主路之外额外生成支线房(试炼/宝藏/静谧),探索自带风险-回报选择。
import { SPRITE_LIB } from './sprite.js';
import { ZONES, SIDE_ROOMS, zoneOfCol } from './data/zones.js';

export const TILE = {
  AIR: 0,
  CH1_GRASS: 10, CH1_DIRT: 11, CH1_WATER: 12, CH1_STONE: 13,
  CH2_EMBER: 20, CH2_IRON: 21, CH2_BRICK: 22, CH2_LAVA: 23,
  CH3_GRAVE: 30, CH3_STONE: 31, CH3_BONE: 32, CH3_PATH: 34,
  CH4_ICE: 40, CH4_MIRROR: 41, CH4_VOID: 42, CH4_PATH: 44,
};

const CHAPTER_THEME = {
  1: { ground: TILE.CH1_GRASS, corridor: TILE.CH1_DIRT, wall: TILE.CH1_STONE, hazard: TILE.CH1_WATER, hazardDmg: 8,
       bgTop: '#243a3a', bgBot: '#13201d', accent: '#6fb872' },
  2: { ground: TILE.CH2_EMBER, corridor: TILE.CH2_IRON, wall: TILE.CH2_BRICK, hazard: TILE.CH2_LAVA, hazardDmg: 14,
       bgTop: '#3a2017', bgBot: '#1a0d09', accent: '#e87a3c' },
  3: { ground: TILE.CH3_GRAVE, corridor: TILE.CH3_PATH, wall: TILE.CH3_STONE, hazard: TILE.CH3_BONE, hazardDmg: 10,
       bgTop: '#241a33', bgBot: '#120a1c', accent: '#a8643a' },
  4: { ground: TILE.CH4_ICE, corridor: TILE.CH4_PATH, wall: TILE.CH4_MIRROR, hazard: TILE.CH4_VOID, hazardDmg: 12,
       bgTop: '#15263a', bgBot: '#08121e', accent: '#8aa9c4' },
};

// 房间命名池:进入房间时以横幅展示(第一章房间 = 落脚点叙事)
const ROOM_NAME_POOLS = {
  1: ['王树苗圃', '苔藓村落', '萤火小径', '露珠池', '藤蔓回廊', '守林人小屋', '落叶谷', '青苔洞窟'],
  2: ['锻炉城门', '铁匠街区', '余烬广场', '熔渣巷', '黄昏斗技场', '冷却塔', '灰烬民宅', '鼓风炉心'],
  3: ['无名墓园', '碑林', '倒悬学院', '墨水书库', '白骨祭坛', '哭墙', '纸页回廊', '守墓人小屋'],
  4: ['寒铁桥头', '冻风驿站', '镜湖', '悔恨回廊', '碎冰穹顶', '低语厅', '无名殿', '静默深渊'],
};

// 每章需要收集的回响刻印数(开启 BOSS 封印门)
export const SEALS_PER_CHAPTER = { 1: 2, 2: 2, 3: 2, 4: 3 };

export class World {
  constructor(chapter, levelData) {
    this.chapter = chapter;
    this.data = levelData;
    this.w = levelData.width;
    this.h = levelData.height;
    this.tile = levelData.tile;
    const n = this.w * this.h;
    this.tiles = new Uint8Array(n);
    this.solids = new Uint8Array(n);
    this.spikes = new Uint8Array(n);
    this.tilesets = SPRITE_LIB.tiles;
    this.theme = CHAPTER_THEME[chapter] || CHAPTER_THEME[1];
    this.zones = ZONES[chapter] || ZONES[1];
    this.entities = [];
    this.projectiles = [];
    this.loot = [];
    this.spawnGrace = 0; // >0 时敌人不主动仇恨(入场/复活保护,由 GameScene 倒计时)
    this.player = null;
    this.boss = null;
    this.pxW = this.w * this.tile;
    this.pxH = this.h * this.tile;
    this.rooms = [];            // 房间列表(tile 单位):{x,y,w,h,cx,cy,col,row,name,visited}
    this.gateTiles = [];        // BOSS 封印门 tile 列表(tile 单位)
    this.gateOpen = false;
    this.gateOpenFx = 0;        // 开门残影:屏障淡出剩余时间(秒)
    this.sealCount = SEALS_PER_CHAPTER[chapter] || 2;
    this.bgCanvas = null;
    this.mapCanvas = null;   // 预渲染的整张静态地图(地面+墙+掩体+hazard),render 时单次 blit
    this.minimapCanvas = null; // 预渲染的小地图底图(房间/走廊可见)
    this.generate();
    this._buildBackground();
    this._buildMap();
    this._buildMinimap();
  }

  // ===== 地图生成:房间 + 走廊地牢(替代旧的"横向走廊+随机掩体") =====
  // 结构:宏观网格(cols×rows)。每格内随机尺寸房间,少数格子留空形成不规则轮廓;
  // 水平方向按行串联,行间随机竖向连接形成环路 —— 保证全图连通(再做 flood-fill 校验)。
  // BOSS 房在最右列,所有入口被"封印门"堵住,需收集 N 枚回响刻印开启。
  generate() {
    const { w, h } = this;
    const wall = this.theme.wall;
    const rng = mulberry32(this.data.seed || 1);
    const rand = () => rng();

    // 1) 全图铺墙(与旧版相反:旧版全地面加墙,新版全墙挖洞 —— 墙外即不可达)
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = wall;
      this.solids[i] = 1;
    }
    const setFloor = (x, y, t) => {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
      this.tiles[y * w + x] = t;
      this.solids[y * w + x] = 0;
      this.spikes[y * w + x] = 0;
    };
    const isFloor = (x, y) => this.solids[y * w + x] === 0;

    // 2) 宏观网格与房间
    const cols = 5, rows = 3;
    const cellW = Math.floor((w - 4) / cols);
    const cellH = Math.floor((h - 4) / rows);
    const grid = []; // grid[row][col] = room | null
    const nameIdx = [0, 0, 0]; // 每区域独立的房名计数
    for (let row = 0; row < rows; row++) {
      grid[row] = [];
      for (let col = 0; col < cols; col++) {
        // 首列(玩家起点)与末列(BOSS)必出房间;中间提高留空率(≈25%),
        // 空格供支线房使用 —— 主路之外长出"可选的岔路"
        const must = col === 0 || col === cols - 1;
        if (!must && rand() < 0.25) { grid[row][col] = null; continue; }
        const x0 = 2 + col * cellW;
        const y0 = 2 + row * cellH;
        // 房间尺寸:格内随机收缩(自适应 margin,矮地图保底 3 格高);BOSS 房更大
        const isBossCol = col === cols - 1;
        const marginX = isBossCol ? 1 : 1 + Math.floor(rand() * 2);
        const marginY = isBossCol ? 1 : (cellH >= 8 ? 1 + Math.floor(rand() * 2) : 1);
        const rx = x0 + marginX;
        const ry = y0 + marginY;
        const rw = cellW - marginX * 2 + (isBossCol ? 2 : 0);
        const rh = cellH - marginY * 2 + (isBossCol ? 2 : 0);
        if (rw < 4 || rh < 3) { grid[row][col] = null; continue; }
        const floorTile = this.theme.ground;
        for (let y = ry; y < ry + rh; y++) {
          for (let x = rx; x < rx + rw; x++) setFloor(x, y, floorTile);
        }
        const zone = zoneOfCol(col, cols);
        const zoneDef = this.zones[zone];
        const room = {
          x: rx, y: ry, w: rw, h: rh,
          cx: rx + (rw >> 1), cy: ry + (rh >> 1),
          col, row, zone,
          name: zoneDef.roomNames[nameIdx[zone]++ % zoneDef.roomNames.length] || '深处',
          visited: false,
        };
        grid[row][col] = room;
        this.rooms.push(room);
      }
    }

    // 保底:首列/末列若因尺寸被拒,强制重建(地图可玩性的硬前提)
    const forceRoom = (col, row) => {
      if (grid[row][col]) return;
      const x0 = 2 + col * cellW, y0 = 2 + row * cellH;
      const rw = Math.max(5, cellW - 2), rh = Math.max(3, cellH - 2);
      const rx = x0 + 1, ry = y0 + Math.max(1, Math.floor((cellH - rh) / 2));
      for (let y = ry; y < Math.min(ry + rh, h - 2); y++) {
        for (let x = rx; x < Math.min(rx + rw, w - 2); x++) setFloor(x, y, this.theme.ground);
      }
      const zone = zoneOfCol(col, cols);
      const zoneDef = this.zones[zone];
      const room = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1), col, row, zone,
        name: zoneDef.roomNames[nameIdx[zone]++ % zoneDef.roomNames.length] || '深处', visited: false };
      grid[row][col] = room;
      this.rooms.push(room);
    };
    forceRoom(0, 1);
    forceRoom(cols - 1, 1);

    // 3) 走廊:L 形(水平段 + 垂直段),宽 2
    const carveCorridor = (a, b) => {
      const horizFirst = rand() < 0.5;
      const cw = this.theme.corridor;
      const segH = (y0, y1, x) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { setFloor(x, y, cw); setFloor(x + 1, y, cw); } };
      const segV = (x0, x1, y) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { setFloor(x, y, cw); setFloor(x, y + 1, cw); } };
      if (horizFirst) { segV(a.cx, b.cx, a.cy); segH(a.cy, b.cy, b.cx); }
      else { segH(a.cy, b.cy, a.cx); segV(a.cx, b.cx, b.cy); }
    };
    // 3a) 每行水平串联(跳过空格,连接该行相邻房间)
    for (let row = 0; row < rows; row++) {
      const line = grid[row].filter(r => r);
      for (let i = 0; i + 1 < line.length; i++) carveCorridor(line[i], line[i + 1]);
    }
    // 3b) 行间竖向连接:每对相邻行在随机列各连 1-2 条,形成环路
    for (let row = 0; row + 1 < rows; row++) {
      const links = 1 + (rand() < 0.6 ? 1 : 0);
      for (let k = 0; k < links; k++) {
        const candidates = [];
        for (let col = 0; col < cols; col++) {
          if (grid[row][col] && grid[row + 1][col]) candidates.push([grid[row][col], grid[row + 1][col]]);
        }
        if (candidates.length === 0) break;
        const [a, b] = candidates[Math.floor(rand() * candidates.length)];
        carveCorridor(a, b);
      }
    }

    // 3c) 支线房:雕刻在空置格(主路之外的真岔路);无空格则由远端普通房升级兜底。
    // 类型:试炼(重兵+精英,清空给稀有祝福)/宝藏(守卫+宝库)/静谧(泉水回复)
    this.sideRooms = [];
    const rollSideType = () => {
      const r = rand();
      if (r < SIDE_ROOMS.trial.weight) return 'trial';
      if (r < SIDE_ROOMS.trial.weight + SIDE_ROOMS.treasure.weight) return 'treasure';
      return 'shrine';
    };
    const emptyCells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 1; col < cols - 1; col++) {
        if (!grid[row][col]) emptyCells.push({ row, col });
      }
    }
    const wantSides = Math.min(emptyCells.length, 1 + Math.floor(rand() * 2)); // 1-2 个支线房
    for (let i = 0; i < wantSides; i++) {
      const cell = emptyCells[Math.floor(rand() * emptyCells.length)];
      if (!cell || grid[cell.row][cell.col]) continue;
      const type = rollSideType();
      const def = SIDE_ROOMS[type];
      const x0 = 2 + cell.col * cellW, y0 = 2 + cell.row * cellH;
      // 小房间:格内居中收缩(6-8 × 3-4)
      const sw = Math.min(cellW - 4, 6 + Math.floor(rand() * 3));
      const sh = Math.max(3, Math.min(cellH - 3, 3 + Math.floor(rand() * 2)));
      const rx = x0 + Math.floor((cellW - sw) / 2);
      const ry = y0 + Math.floor((cellH - sh) / 2);
      for (let y = ry; y < ry + sh; y++) {
        for (let x = rx; x < rx + sw; x++) setFloor(x, y, this.theme.corridor);
      }
      const room = {
        x: rx, y: ry, w: sw, h: sh,
        cx: rx + (sw >> 1), cy: ry + (sh >> 1),
        col: cell.col, row: cell.row, zone: zoneOfCol(cell.col, cols),
        name: def.names[i % def.names.length],
        side: type, visited: false,
      };
      grid[cell.row][cell.col] = room;
      this.rooms.push(room);
      this.sideRooms.push(room);
      // 连接:最近的已有房间(主路房间),一条 L 走廊 —— 单入口岔路
      const others = this.rooms.filter(r => r !== room);
      const near = others.reduce((best, r) =>
        Math.hypot(r.cx - room.cx, r.cy - room.cy) < Math.hypot(best.cx - room.cx, best.cy - room.cy) ? r : best, others[0]);
      if (near) carveCorridor(near, room);
    }
    // 兜底:全图没有支线房时,把离起点最远的两个普通房升级为试炼/宝藏
    if (this.sideRooms.length === 0) {
      const firstCol = this.rooms.filter(r => r.col === 0);
      const origin = firstCol[0] || this.rooms[0];
      const far = this.rooms
        .filter(r => r.col > 0 && r.col < cols - 1)
        .sort((a, b) => Math.hypot(b.cx - origin.cx, b.cy - origin.cy) - Math.hypot(a.cx - origin.cx, a.cy - origin.cy));
      ['trial', 'treasure'].forEach((type, i) => {
        const r = far[i];
        if (!r) return;
        r.side = type;
        r.name = SIDE_ROOMS[type].names[0];
        this.sideRooms.push(r);
      });
    }

    // 4) 关键锚点:起点房(首列中行)、BOSS 房(末列中行)
    const midRow = 1;
    const pickRoom = (col, rowPref) => grid[rowPref]?.[col] || grid.flat().filter(r => r && r.col === col).sort((a, b) => Math.abs(a.row - rowPref) - Math.abs(b.row - rowPref))[0];
    const spawnRoom = pickRoom(0, midRow);
    let bossRoom = pickRoom(cols - 1, midRow);
    // BOSS 房永远存在(末列 must);若中行缺房则任取末列
    if (!bossRoom) bossRoom = grid.flat().filter(r => r && r.col === cols - 1)[0];
    this.spawnRoom = spawnRoom;
    this.bossRoom = bossRoom;
    this.spawnPoint = { x: spawnRoom.cx * this.tile + this.tile / 2, y: spawnRoom.cy * this.tile + this.tile / 2 };
    this.bossPoint = { x: bossRoom.cx * this.tile + this.tile / 2, y: bossRoom.cy * this.tile + this.tile / 2 };
    // BOSS 房命名:沿用章节 BOSS 区名
    bossRoom.name = this.data.bosses?.[0]?.region === 'sun_throne' ? '太阳王座'
      : this.data.bosses?.[0]?.region === 'eternal_stair' ? '永恒阶梯'
      : this.data.bosses?.[0]?.region === 'throne' ? '寂渊之心' : '回声湖畔';

    // 5) BOSS 封印门:封住所有"走廊/房外地板 → BOSS 房地板"的接缝 tile
    // (实现在 _sealGate;连通性修复后会重新扫描,防止修复凿路开后门)
    this.gateTiles = [];
    this._sealGate();
    this.gateColor = ['#6fb872', '#e87a3c', '#a8643a', '#8aa9c4'][this.chapter - 1] || '#e0b76a';

    // 6) 连通性:真实 tile BFS + 修复(修复凿路绝不穿过封印门/BOSS 房)
    this._ensureConnectivity();

    // 7) 回响刻印:只放在"关门状态下可达"的远处非 BOSS 房间(强制探索但不卡关)
    this._placeSeals();

    // 8) 章节特色 hazard(每章均有伤害:毒沼/熔岩/骨刺/裂冰):放在中间随机房间内部,
    //    避开起点/BOSS/静谧泉房(歇脚处保持干净)
    const haz = this.theme.hazard;
    const hazDmg = this.theme.hazardDmg;
    if (haz !== this.theme.ground) {
      const poolRooms = this.rooms.filter(r => r !== spawnRoom && r !== bossRoom && r.side !== 'shrine');
      const n = Math.min(3, poolRooms.length);
      for (let i = 0; i < n; i++) {
        const r = poolRooms[Math.floor(rand() * poolRooms.length)];
        const cxT = r.cx, cyT = r.cy;
        const radius = 1 + Math.floor(rand() * 2);
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius + 1) continue;
            const x = cxT + dx, y = cyT + dy;
            if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
            if (!isFloor(x, y)) continue;
            // 不覆盖刻印点与房门附近(刻印在房中心,放偏一格)
            this.tiles[y * w + x] = haz;
            if (hazDmg > 0) this.spikes[y * w + x] = 1;
          }
        }
        // 刻印点若被 hazard 盖住,把中心一格还原为地面(可站立)
        for (const sp of this.sealPoints) {
          if (sp.room === r) {
            const sx = Math.floor(sp.x / this.tile), sy = Math.floor(sp.y / this.tile);
            this.tiles[sy * w + sx] = this.theme.ground;
            this.spikes[sy * w + sx] = 0;
          }
        }
      }
    }
  }

  // tile 级 BFS:从起点可到达的 tile 集合(封印门视为墙 —— 门后区域"不可达")
  _reachableTiles() {
    const w = this.w, h = this.h;
    const seen = new Uint8Array(w * h);
    const sx = this.spawnRoom.cx, sy = this.spawnRoom.cy;
    const q = [[sx, sy]];
    seen[sy * w + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        if (seen[i] || this.solids[i]) continue;
        seen[i] = 1;
        q.push([nx, ny]);
      }
    }
    return seen;
  }

  // 连通性修复:不可达的非 BOSS 房间,就近接到最近的可达房间(凿路避开 BOSS 房内部),
  // 修复后重新扫描封印(任何与 BOSS 地板相邻的新地板一律封住,杜绝"后门")。
  _ensureConnectivity() {
    const w = this.w, h = this.h;
    const boss = this.bossRoom;
    const inBossRect = (x, y) => x >= boss.x && x < boss.x + boss.w && y >= boss.y && y < boss.y + boss.h;
    const carve = (x, y) => {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
      if (inBossRect(x, y)) return; // 不穿过 BOSS 房
      this.tiles[y * w + x] = this.theme.corridor;
      this.solids[y * w + x] = 0;
    };
    const carveL = (a, b) => {
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { carve(x, a.cy); carve(x, a.cy + 1); }
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { carve(b.cx, y); carve(b.cx + 1, y); }
    };
    const reachableRooms = (seen) => this.rooms.filter(r => {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) if (seen[y * w + x]) return true;
      }
      return false;
    });
    for (let pass = 0; pass < 3; pass++) {
      const seen = this._reachableTiles();
      const reach = reachableRooms(seen);
      const unreachable = this.rooms.filter(r => r !== this.bossRoom && r !== this.spawnRoom && !reach.includes(r));
      if (unreachable.length === 0) break;
      for (const b of unreachable) {
        // 就近接入:最近的可达房间(通常是邻格,路径短,不会绕经 BOSS 房)
        const a = reach.length > 0
          ? reach.reduce((best, r) => Math.hypot(r.cx - b.cx, r.cy - b.cy) < Math.hypot(best.cx - b.cx, best.cy - b.cy) ? r : best, reach[0])
          : this.spawnRoom;
        carveL(a, b);
      }
      // 修复后重新封印:把一切"与 BOSS 地板相邻的非 BOSS 地板"重新视为门
      this._sealGate();
    }
  }

  // 封印扫描:所有与 BOSS 房地板正交相邻的房外地板 → solids=1 并登记为门 tile
  _sealGate() {
    const boss = this.bossRoom;
    const inBoss = (x, y) => x >= boss.x && x < boss.x + boss.w && y >= boss.y && y < boss.y + boss.h;
    this.gateTiles = [];
    for (let y = boss.y - 1; y <= boss.y + boss.h; y++) {
      for (let x = boss.x - 1; x <= boss.x + boss.w; x++) {
        if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) continue;
        if (inBoss(x, y) || this.solids[y * this.w + x]) continue;
        const touches = inBoss(x + 1, y) || inBoss(x - 1, y) || inBoss(x, y + 1) || inBoss(x, y - 1);
        if (touches) {
          if (!this.gateOpen) this.solids[y * this.w + x] = 1;
          this.gateTiles.push({ x, y });
        }
      }
    }
  }

  // 刻印布置:关门可达 ∪ 离起点最远 的房间(去重,最多取 sealCount 个)
  _placeSeals() {
    const seen = this._reachableTiles();
    const w = this.w;
    const reachableRoom = (r) => {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) if (seen[y * w + x]) return true;
      }
      return false;
    };
    const s = this.spawnRoom;
    const candidates = this.rooms
      .filter(r => r !== this.bossRoom && r !== this.spawnRoom && reachableRoom(r))
      .sort((a, b) => Math.hypot(b.cx - s.cx, b.cy - s.cy) - Math.hypot(a.cx - s.cx, a.cy - s.cy));
    this.sealPoints = [];
    for (const r of candidates) {
      if (this.sealPoints.length >= this.sealCount) break;
      this.sealPoints.push({ x: r.cx * this.tile + this.tile / 2, y: r.cy * this.tile + this.tile / 2, room: r });
    }
  }

  // 开启 BOSS 封印门(收集齐刻印后调用)
  openGate() {
    if (this.gateOpen) return false;
    this.gateOpen = true;
    this.gateOpenFx = 0.9; // 屏障碎裂淡出
    for (const g of this.gateTiles) this.solids[g.y * this.w + g.x] = 0;
    this._buildMinimap(); // 小地图底图是预烘焙的:重画一次,抹掉门的红标
    return true;
  }

  isGateTile(x, y) {
    return this.gateTiles.some(g => g.x === x && g.y === y);
  }

  // 点(px)所在房间;走廊/房外返回 null
  roomAt(px, py) {
    const tx = Math.floor(px / this.tile), ty = Math.floor(py / this.tile);
    for (const r of this.rooms) {
      if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
    }
    return null;
  }

  isSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    return this.solids[ty * this.w + tx] === 1;
  }
  isSpike(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.spikes[ty * this.w + tx] === 1;
  }
  solidAtPx(px, py) {
    return this.isSolid(Math.floor(px / this.tile), Math.floor(py / this.tile));
  }

  // ===== 分离轴碰撞(先 X 后 Y,杜绝卡墙) =====
  physics(ent) {
    const t = this.tile, w = ent.w, h = ent.h;
    // X 轴
    if (ent.dx !== 0) {
      ent.x += ent.dx;
      const dir = ent.dx > 0 ? 1 : -1;
      const y0 = Math.floor((ent.y - h / 2) / t);
      const y1 = Math.floor((ent.y + h / 2 - 0.01) / t);
      const xProbe = dir > 0 ? Math.floor((ent.x + w / 2) / t) : Math.floor((ent.x - w / 2) / t);
      for (let ty = y0; ty <= y1; ty++) {
        if (this.isSolid(xProbe, ty)) {
          ent.x = dir > 0 ? (xProbe * t) - w / 2 - 0.01 : (xProbe + 1) * t + w / 2 + 0.01;
          ent.vx = 0;
          break;
        }
      }
    }
    // Y 轴
    if (ent.dy !== 0) {
      ent.y += ent.dy;
      const dir = ent.dy > 0 ? 1 : -1;
      const x0 = Math.floor((ent.x - w / 2) / t);
      const x1 = Math.floor((ent.x + w / 2 - 0.01) / t);
      const yProbe = dir > 0 ? Math.floor((ent.y + h / 2) / t) : Math.floor((ent.y - h / 2) / t);
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolid(tx, yProbe)) {
          ent.y = dir > 0 ? (yProbe * t) - h / 2 - 0.01 : (yProbe + 1) * t + h / 2 + 0.01;
          ent.vy = 0;
          break;
        }
      }
    }
    ent.dx = 0; ent.dy = 0;
    // 钳制到世界内
    ent.x = Math.max(w / 2 + 1, Math.min(this.pxW - w / 2 - 1, ent.x));
    ent.y = Math.max(h / 2 + 1, Math.min(this.pxH - h / 2 - 1, ent.y));
    // 伤害地表
    if (ent.team === 'player' && ent.iFrameNear <= 0) {
      if (this.isSpike(Math.floor(ent.x / t), Math.floor(ent.y / t))) {
        ent.takeDamage(this.theme.hazardDmg, ent.x, ent.y);
        ent.iFrameNear = 0.6;
      }
    }
  }

  spawnLoot(x, y, type) {
    const l = new Loot(x, y, type);
    l.world = this; // 掉落物贴墙反弹用
    this.loot.push(l);
  }

  // ===== 渲染 =====
  _buildBackground() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const cx = c.getContext('2d');
    const g = cx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, this.theme.bgTop);
    g.addColorStop(1, this.theme.bgBot);
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    this.bgCanvas = c;
  }

  render(ctx, cam) {
    const W = cam.viewW, H = cam.viewH;
    // 扁平背景
    ctx.fillStyle = this.theme.bgBot;
    ctx.fillRect(0, 0, W, H);
    // 单次 blit 预渲染的整张静态地图(地面+墙+掩体+hazard),消除每帧逐 tile drawImage
    if (this.mapCanvas) {
      ctx.drawImage(this.mapCanvas, cam.x, cam.y, W, H, cam.shakeX, cam.shakeY, W, H);
    }
    // BOSS 封印门:未开启常态脉动;刚开启时屏障碎裂淡出(gateOpenFx)
    if (this.gateTiles.length > 0 && (!this.gateOpen || this.gateOpenFx > 0)) {
      const t = performance.now() * 0.003;
      const fade = this.gateOpen ? Math.max(0, this.gateOpenFx / 0.9) : 1;
      ctx.save();
      for (const g of this.gateTiles) {
        const sx = cam.screenX(g.x * this.tile);
        const sy = cam.screenY(g.y * this.tile);
        if (sx < -this.tile || sx > W || sy < -this.tile || sy > H) continue;
        const a = (0.35 + 0.18 * Math.sin(t + g.x * 0.8 + g.y * 0.5)) * fade;
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.gateColor;
        ctx.fillRect(sx, sy, this.tile, this.tile);
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + this.tile / 2 - 1, sy + 4, 2, this.tile - 8);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // 预渲染小地图底图(140×90):房间按区域色调分层,支线房带专属图标 ——
  // 展开地图即见"三个区域 + 哪里有岔路",探索决策前置
  _buildMinimap() {
    if (typeof document === 'undefined') return;
    const W = 140, H = 90;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgba(10,8,18,0.9)';
    cx.fillRect(0, 0, W, H);
    const sx = W / this.w, sy = H / this.h;
    const zoneRoomColors = ['rgba(214,224,180,0.62)', 'rgba(214,200,164,0.55)', 'rgba(190,160,150,0.5)'];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.solids[y * this.w + x]) continue;
        const room = this.roomAt(x * this.tile + 1, y * this.tile + 1);
        cx.fillStyle = room ? (zoneRoomColors[room.zone] || zoneRoomColors[1]) : 'rgba(120,104,150,0.4)';
        cx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
    // 支线房图标:试炼红环 / 宝藏金方 / 静谧青菱(烘进底图,位置静态)
    for (const r of this.sideRooms || []) {
      const px = r.cx * sx, py = r.cy * sy;
      if (r.side === 'trial') {
        cx.strokeStyle = 'rgba(230,110,90,0.95)'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.arc(px, py, 4, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = 'rgba(230,110,90,0.95)';
        cx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
      } else if (r.side === 'treasure') {
        cx.fillStyle = 'rgba(240,208,120,0.95)';
        cx.fillRect(px - 3, py - 3, 6, 6);
        cx.fillStyle = 'rgba(40,28,10,0.9)';
        cx.fillRect(px - 1.5, py - 1.5, 3, 3);
      } else {
        cx.fillStyle = 'rgba(138,208,224,0.95)';
        cx.beginPath();
        cx.moveTo(px, py - 4); cx.lineTo(px + 3, py); cx.lineTo(px, py + 4); cx.lineTo(px - 3, py);
        cx.closePath(); cx.fill();
      }
    }
    // 封印门位置(未开启)标红
    if (!this.gateOpen) {
      cx.fillStyle = 'rgba(230,90,90,0.95)';
      for (const g of this.gateTiles) cx.fillRect(g.x * sx - 1, g.y * sy - 1, Math.ceil(sx) + 2, Math.ceil(sy) + 2);
    }
    this.minimapCanvas = c;
  }

  // 把静态地图一次性渲染到离屏 canvas(world 在 generate() 后不变,无需每帧重画)
  _buildMap() {
    if (typeof document === 'undefined') return; // 测试环境兜底
    const c = document.createElement('canvas');
    c.width = this.pxW; c.height = this.pxH;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    const ts = this.tile, w = this.w;
    const groundSpr = this._tileSprite(this.theme.ground);
    // 区域地面色调:越靠近 BOSS 区域越暗、越冷(分层直接烘进地图,零运行时成本)
    const cols = 5;
    const cellW = Math.floor((w - 4) / cols);
    const zoneTint = ['rgba(255,244,214,0.045)', 'rgba(8,6,18,0.07)', 'rgba(8,6,18,0.14)'];
    // 地面(全部铺)
    if (groundSpr) {
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < w; tx++) cx.drawImage(groundSpr, tx * ts, ty * ts);
      }
    }
    // 区域色调层(先铺色调再叠瓦片,让墙/危险地形保持清晰)
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const zone = zoneOfCol(Math.floor((tx - 2) / cellW), cols);
        const tint = zoneTint[zone] || zoneTint[1];
        cx.fillStyle = tint;
        cx.fillRect(tx * ts, ty * ts, ts, ts);
      }
    }
    // 非地面 tile(墙/掩体/hazard)叠在上面
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = this.tiles[ty * w + tx];
        if (t === 0 || t === this.theme.ground) continue;
        const spr = this._tileSprite(t);
        if (spr) cx.drawImage(spr, tx * ts, ty * ts);
        // 伤害地形警示:暖红罩层 + 边缘描线,任何章节都一眼可辨
        if (this.spikes[ty * w + tx]) {
          cx.fillStyle = 'rgba(200,60,40,0.28)';
          cx.fillRect(tx * ts, ty * ts, ts, ts);
          cx.strokeStyle = 'rgba(255,90,60,0.5)';
          cx.lineWidth = 1;
          cx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
        }
      }
    }
    this._drawProps(cx);
    this._drawWallEdges(cx);
    this.mapCanvas = c;
  }

  // 墙体可读性增强(烘焙进静态地图,零运行时成本):
  //  1) 墙 tile 南侧是地板 → 墙底部画"立面"暗带 + 顶缘亮线(2.5D 高度感)
  //  2) 地板 tile 北侧是墙 → 地板顶部画接触阴影(墙体投到地上的影子)
  //  3) 墙整体轻微压暗,与地板拉开明度差
  // 封印门 tile 视作地板(动态渲染),不参与墙体描边
  _drawWallEdges(cx) {
    const ts = this.tile, w = this.w, h = this.h;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return true;
      if (this.isGateTile(x, y)) return false;
      return this.solids[y * w + x] === 1;
    };
    cx.save();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!solid(x, y)) continue;
        const px = x * ts, py = y * ts;
        // 墙体整体压暗(与地板拉开层次)
        cx.fillStyle = 'rgba(6,4,10,0.25)';
        cx.fillRect(px, py, ts, ts);
        // 南侧临空 → 画立面与顶缘亮线
        if (!solid(x, y + 1)) {
          cx.fillStyle = 'rgba(4,2,8,0.5)';
          cx.fillRect(px, py + ts - 10, ts, 10);
          cx.fillStyle = 'rgba(244,236,208,0.22)';
          cx.fillRect(px, py + ts - 10, ts, 2);
        }
        // 北侧临空 → 顶部亮线(被后墙衬出的墙头)
        if (!solid(x, y - 1)) {
          cx.fillStyle = 'rgba(244,236,208,0.12)';
          cx.fillRect(px, py, ts, 2);
        }
      }
    }
    // 地板接触阴影:北侧是墙的地板,顶部一条暗带
    cx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x, y - 1)) cx.fillRect(x * ts, y * ts, ts, 7);
      }
    }
    cx.restore();
  }

  // 章节装饰物:烘进静态地图的小物件,按区域风格绘制 ——
  // village = 人迹(小屋/栅栏/木箱),wild = 自然/荒废(原有章节美术),
  // ritual = 仪式(符石/烛阵/刻纹),同一张图从"住的地方"走进"举行仪式的地方"
  _drawProps(cx) {
    const ts = this.tile, w = this.w, h = this.h;
    const rng = mulberry32((this.data.seed || 1) * 7 + 13);
    const ground = this.theme.ground;
    const cols = 5;
    const cellW = Math.floor((w - 4) / cols);
    const accent = this.theme.accent;
    const isPlainGround = (tx, ty) => {
      if (tx < 2 || ty < 2 || tx >= w - 2 || ty >= h - 2) return false;
      const t = this.tiles[ty * w + tx];
      return t === ground && this.solids[ty * w + tx] === 0;
    };
    const count = Math.floor(w * h * 0.05); // 约 5% 的地面格有装饰
    for (let i = 0; i < count; i++) {
      const tx = 2 + Math.floor(rng() * (w - 4));
      const ty = 2 + Math.floor(rng() * (h - 4));
      if (!isPlainGround(tx, ty)) continue;
      const px = tx * ts + 4 + Math.floor(rng() * (ts - 12));
      const py = ty * ts + 4 + Math.floor(rng() * (ts - 12));
      const zone = this.zones[zoneOfCol(Math.floor((tx - 2) / cellW), cols)];
      const style = zone?.props || 'wild';
      this._drawProp(cx, px, py, rng, style, accent);
    }
  }

  _drawProp(cx, x, y, rng, style = 'wild', accent = '#e0b76a') {
    const r = rng();
    cx.save();
    if (style === 'village') {
      // 人迹:小屋(2×2 屋体 + 屋顶色带 + 门)或栅栏桩/木箱
      if (r < 0.4) {
        cx.fillStyle = 'rgba(90,70,52,0.85)';
        cx.fillRect(x - 1, y, 7, 5);
        cx.fillStyle = accent;
        cx.fillRect(x - 1, y, 7, 2);
        cx.fillStyle = 'rgba(20,14,10,0.9)';
        cx.fillRect(x + 1, y + 2, 2, 3);
      } else if (r < 0.7) {
        cx.fillStyle = 'rgba(110,88,62,0.8)';
        cx.fillRect(x - 2, y, 2, 4);
        cx.fillRect(x + 2, y, 2, 4);
        cx.fillStyle = 'rgba(70,56,40,0.8)';
        cx.fillRect(x - 3, y + 1, 8, 1);
      } else {
        cx.fillStyle = 'rgba(96,74,50,0.85)';
        cx.fillRect(x - 2, y - 1, 6, 6);
        cx.strokeStyle = 'rgba(40,30,20,0.8)';
        cx.lineWidth = 1;
        cx.strokeRect(x - 2, y - 1, 6, 6);
        cx.beginPath(); cx.moveTo(x - 2, y + 2); cx.lineTo(x + 4, y + 2); cx.stroke();
      }
    } else if (style === 'ritual') {
      // 仪式:符石(立柱+顶端辉光)或烛阵(三点烛火)或地面刻纹圆环
      if (r < 0.4) {
        cx.fillStyle = 'rgba(120,116,140,0.9)';
        cx.fillRect(x, y - 3, 3, 7);
        cx.fillStyle = accent;
        cx.globalAlpha = 0.85;
        cx.fillRect(x, y - 4, 3, 2);
        cx.globalAlpha = 1;
      } else if (r < 0.7) {
        for (const [dx, dy] of [[-3, 2], [0, -1], [3, 2]]) {
          cx.fillStyle = 'rgba(214,200,164,0.9)';
          cx.fillRect(x + dx, y + dy, 2, 3);
          cx.fillStyle = accent;
          cx.globalAlpha = 0.9;
          cx.fillRect(x + dx, y + dy - 2, 2, 2);
          cx.globalAlpha = 1;
        }
      } else {
        cx.strokeStyle = 'rgba(183,140,224,0.5)';
        cx.lineWidth = 1;
        cx.beginPath(); cx.arc(x + 2, y + 2, 4, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = 'rgba(183,140,224,0.35)';
        cx.fillRect(x + 1, y + 1, 2, 2);
      }
    } else if (this.chapter === 1) {
      // 春之森 · 自然:小花(白/粉)与蘑菇
      if (r < 0.5) {
        cx.fillStyle = rng() < 0.5 ? '#f4ecd0' : '#e89cb4';
        cx.fillRect(x, y, 3, 3);
        cx.fillStyle = '#2e5e3a';
        cx.fillRect(x + 1, y + 3, 1, 2);
      } else {
        cx.fillStyle = '#d6c8a4';
        cx.fillRect(x - 1, y, 5, 3);
        cx.fillStyle = '#8a3a2a';
        cx.fillRect(x, y + 3, 3, 2);
      }
    } else if (this.chapter === 2) {
      // 夏之墟 · 荒废:地面裂纹与火星堆
      if (r < 0.6) {
        cx.strokeStyle = 'rgba(20,8,4,0.5)';
        cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(x, y); cx.lineTo(x + 4 + rng() * 4, y + 2);
        cx.stroke();
      } else {
        cx.fillStyle = 'rgba(255,150,60,0.55)';
        cx.fillRect(x, y, 2, 2);
        cx.fillStyle = 'rgba(90,50,30,0.8)';
        cx.fillRect(x + 3, y + 1, 3, 2);
      }
    } else if (this.chapter === 3) {
      // 秋之墓 · 枯寂:白骨与枯枝
      if (r < 0.5) {
        cx.fillStyle = '#c8c0a8';
        cx.fillRect(x, y, 4, 2);
        cx.fillRect(x + 1, y - 2, 2, 2);
      } else {
        cx.strokeStyle = 'rgba(60,40,26,0.7)';
        cx.lineWidth = 1;
        cx.beginPath();
        cx.moveTo(x, y + 4); cx.lineTo(x + 2, y);
        cx.moveTo(x + 2, y + 2); cx.lineTo(x + 5, y + 1);
        cx.stroke();
      }
    } else {
      // 冬之渊 · 冰封:冰晶与霜斑
      if (r < 0.5) {
        cx.fillStyle = 'rgba(200,230,255,0.8)';
        cx.fillRect(x, y, 2, 4);
        cx.fillRect(x - 2, y + 1, 2, 2);
        cx.fillRect(x + 2, y + 1, 2, 2);
      } else {
        cx.fillStyle = 'rgba(230,245,255,0.35)';
        cx.beginPath();
        cx.arc(x + 2, y + 2, 3, 0, Math.PI * 2);
        cx.fill();
      }
    }
    cx.restore();
  }

  _tileSprite(t) {
    const set = this.tilesets;
    if (t === TILE.CH1_GRASS) return set.grass;
    if (t === TILE.CH1_DIRT) return set.grassLeaf;
    if (t === TILE.CH1_WATER) return set.water;
    if (t === TILE.CH1_STONE) return set.mossStone;
    if (t === TILE.CH2_EMBER) return set.ember;
    if (t === TILE.CH2_BRICK) return set.brick;
    // 熔岩/骨刺/裂冰:用更暗的瓦片与地面拉开,配合 _buildMap 的红色警示着色
    if (t === TILE.CH2_LAVA) return set.iron;
    if (t === TILE.CH2_IRON) return set.iron;
    if (t === TILE.CH3_GRAVE) return set.grave;
    if (t === TILE.CH3_STONE) return set.stone;
    if (t === TILE.CH3_BONE) return set.stoneDark;
    if (t === TILE.CH3_PATH) return set.stoneDark;
    if (t === TILE.CH4_ICE) return set.ice;
    if (t === TILE.CH4_MIRROR) return set.mirrorIce;
    if (t === TILE.CH4_VOID) return set.iceDark;
    if (t === TILE.CH4_PATH) return set.iceDark;
    return null;
  }
}

export class Loot {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 80;
    this.vy = -60 - Math.random() * 60;
    this.type = type;
    this.alive = true;
    this.size = 16;
    this.bobT = Math.random() * Math.PI * 2;
    this.life = 45; // 延长寿命:战斗中来不及捡的掉落不再"隔房间蒸发"
    this._settled = false;
  }
  update(dt) {
    this.bobT += dt * 3;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
    // 简单落地(只下落一点);遇墙/水体反弹,不穿进不可行走的格子
    if (!this._settled) {
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      if (this.world?.solidAtPx(nx, this.y)) this.vx *= -0.4;
      else this.x = nx;
      if (this.world?.solidAtPx(this.x, ny)) this.vy *= -0.4;
      else this.y = ny;
      this.vy += 300 * dt; this.vx *= 0.9;
      if (this.vy >= 0 && Math.abs(this.vx) < 2) this._settled = true;
    }
  }
  render(ctx, cam) {
    if (!cam.inView(this.x, this.y, 48)) return;
    const spr = SPRITE_LIB.icons[this.type] || SPRITE_LIB.icons.gold;
    if (!spr) return;
    const sx = cam.screenX(this.x);
    const sy = cam.screenY(this.y + Math.sin(this.bobT) * 3);
    // 光晕
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(spr, sx - spr.width / 2, sy - spr.height / 2);
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
