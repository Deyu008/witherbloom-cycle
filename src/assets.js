// assets.js — 资源加载器(程序化精灵 + 远程 mmx 生成的过场图)
import { SPRITE_LIB } from './sprite.js';
import { applyImageSprites } from './spriteImages.js';

export class AssetLoader {
  constructor() {
    this.sprites = null;
    this.cutscenes = {}; // 远程生成的过场图
    this.ui = {}; // mmx 生成的 UI 装饰素材(边框/图标)
    this.spriteImgs = {}; // mmx 生成的角色立绘(透明 PNG, 替换程序化精灵)
  }

  async preload(game, onProgress) {
    onProgress?.(0, '准备精灵图集…');
    this.sprites = SPRITE_LIB;
    onProgress?.(0.1, '加载主角立绘…');

    // 异步加载 mmx 生成的过场图(失败不阻塞)
    const cutsceneList = [
      { key: 'ch1', url: 'assets/img/scene/scene_ch1_world_tree.png' },
      { key: 'ch2', url: 'assets/img/scene/scene_ch2_forge_city.png' },
      { key: 'ch3', url: 'assets/img/scene/scene_ch3_eternal_stair.png' },
      { key: 'ch3_library', url: 'assets/img/scene/scene_ch3_inverted_library.png' },
      { key: 'ch4', url: 'assets/img/scene/scene_ch4_frozen_canyon.png' },
      { key: 'title', url: 'assets/img/scene/scene_title_night.png' },
      { key: 'ending', url: 'assets/img/scene/scene_ending_bloom.png' },
      // 章节过场标题卡背景(mmx 生成;Ken Burns 缓推用)
      { key: 'ch1_trans', url: 'assets/img/scene/scene_ch1_transition.png' },
      { key: 'ch2_trans', url: 'assets/img/scene/scene_ch2_transition.png' },
      { key: 'ch3_trans', url: 'assets/img/scene/scene_ch3_transition.png' },
      { key: 'ch4_trans', url: 'assets/img/scene/scene_ch4_transition.png' },
      // Boss 战场背景
      { key: 'boss1_arena', url: 'assets/img/scene/scene_boss1_arena.png' },
      { key: 'boss2_arena', url: 'assets/img/scene/scene_boss2_arena.png' },
      { key: 'boss1', url: 'assets/img/boss/boss1_forest_keeper.png' },
      { key: 'boss2', url: 'assets/img/boss/boss2_burning_king.png' },
      { key: 'boss3', url: 'assets/img/boss/boss3_chronomancer.png' },
      { key: 'boss4', url: 'assets/img/boss/boss4_the_forgotten.png' },
      // NPC 立绘(mmx 生成;失败则对话无立绘,不阻塞)
      { key: 'npc_child', url: 'assets/img/npc/npc_child.png' },
      { key: 'npc_elder', url: 'assets/img/npc/npc_elder.png' },
      { key: 'npc_blacksmith', url: 'assets/img/npc/npc_blacksmith.png' },
      { key: 'npc_ash_daughter', url: 'assets/img/npc/npc_ash_daughter.png' },
      { key: 'npc_gravedigger', url: 'assets/img/npc/npc_gravedigger.png' },
      { key: 'npc_scholar', url: 'assets/img/npc/npc_scholar.png' },
      { key: 'npc_first_echo', url: 'assets/img/npc/npc_first_echo.png' },
      // 职业立绘(职业选择卡顶部大图;按职业命名,换图不怕浏览器缓存)
      { key: 'hero_recall', url: 'assets/img/char/hero_recall_v2.png' },
      { key: 'hero_forge', url: 'assets/img/char/hero_forge.png' },
      { key: 'hero_weave', url: 'assets/img/char/hero_weave.png' },
    ];
    // UI 装饰已由 src/uiKit.js 程序化绘制(像素级精准,不拉伸变形),
    // mmx 贴图框与 item_icons 不再加载;assets.img/ui 下的文件仅作留档。
    const uiList = [];
    // 角色立绘(mmx 生成透明 PNG;失败则回退程序化精灵,不阻塞)
    const spriteList = [
      'hero_recall','hero_forge','hero_weave',
      'enemy_forest_spirit','enemy_moss_lurker','enemy_vine_wraith','enemy_ember_imp',
      'enemy_forge_knight','enemy_ash_phantom','enemy_grave_warden','enemy_ink_scholar',
      'enemy_frost_lurker','enemy_mirror_knight','enemy_void_seeker',
      'boss_forest_keeper','boss_burning_king','boss_chronomancer','boss_forgotten',
      'npc_child','npc_blacksmith','npc_scholar',
    ].map(k => ({ key: k, url: 'assets/img/sprites/' + k + '.png', spr: true }));
    // 并行加载所有过场图 + UI 素材 + 角色立绘
    const allList = [
      ...cutsceneList.map(c => ({ ...c, ui: false })),
      ...uiList.map(c => ({ ...c, ui: true })),
      ...spriteList,
    ];
    let done = 0;
    const total = allList.length;
    await Promise.all(allList.map(cs => this._loadImage(cs.url)
      .then(img => { if (cs.spr) this.spriteImgs[cs.key] = img; else if (cs.ui) this.ui[cs.key] = img; else this.cutscenes[cs.key] = img; })
      .catch(e => { console.warn(`过场图加载失败: ${cs.url}`, e); })
      .finally(() => { done++; onProgress?.(done / total * 0.85, `加载美术 ${done}/${total}…`); })
    ));
    // 装配图片精灵(覆盖程序化网格;缺图的部分保持原样)
    applyImageSprites(this.sprites, this.spriteImgs);
    onProgress?.(0.95, '初始化完成');
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // 兜底超时:个别资源 stalled 而浏览器迟迟不 onerror 时,不至卡死整个启动流程
      const timer = setTimeout(() => reject(new Error('load timeout: ' + url)), 12000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = (e) => { clearTimeout(timer); reject(e); };
      img.src = url;
    });
  }
}
