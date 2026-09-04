// tiles.js — Tile 集(从 sprite.js 拆出,像素数据未改动)
import { makeSprite } from './_tools.js';
import { PAL } from '../palette.js';

// ============================================================
// Tile 集(草地、墙、水、楼梯等)
// ============================================================
// 8x8 tile,使用程序化生成
export function makeTileSet() {
  const tiles = {};

  // 草地 tile(加入红叶/小黄花让地面有辨识度)
  tiles.grass = makeSprite(`
.Gg.GgG.
GgGgggGg
gGgpGgGg
.GgGggg.
gGggGg.G
GgGgggGg
gGgygGgG
.GgGgggG`, {
    g: PAL.ch1_grass, G: PAL.ch1_grassH,
    p: '#e89cb4', // 粉红叶
    y: '#e0b76a', // 小黄花
  }, 4);

  // 草地带叶子
  tiles.grassLeaf = makeSprite(`
.Gg.GgG.
GgGgggGg
gGggGgGg
.GgGlgg.
gGggGg.G
GgGgggGg
gGgggGgG
.GgGgggG`, {
    g: PAL.ch1_grass, G: PAL.ch1_grassH, l: PAL.ch1_leaf,
  }, 4);

  // 苔藓石
  tiles.mossStone = makeSprite(`
mmmmmmm.
mMMMMMMm
mMmmmMMm
mMmmMmMm
mMMmMmMm
mMmmmMMm
mMMMMMMm
.mmmmmmm`, {
    m: PAL.ch1_bark, M: PAL.ch1_barkH,
  }, 4);

  // 砖墙(章节 2)
  tiles.brick = makeSprite(`
EEEEEEEE
EeeeeeeE
EeeEeeEe
EEEEEEEE
eEeEeEee
EeeeeeeE
EeEeeEee
EEEEEEEE`, {
    E: PAL.ch2_ash, e: PAL.ch2_ashH,
  }, 4);

  // 锻炉铁板
  tiles.iron = makeSprite(`
kkkkkkkk
kIIIIIIk
kIIkkIIk
kIIkkIIk
kIIIIIIk
kIIkkIIk
kIIkkIIk
kkkkkkkk`, {
    k: PAL.black, I: PAL.ch2_iron, i: PAL.ch2_ironH,
  }, 4);

  // 火焰地表
  tiles.ember = makeSprite(`
eEeEeEeE
EeEeEeEe
eEeEeEeE
EeEeEeEe
eEeEeEeE
EeEeEeEe
eEeEeEeE
EeEeEeEe`, {
    e: PAL.ch2_ember, E: PAL.ch2_emberH,
  }, 4);

  // 墓石
  tiles.grave = makeSprite(`
GGGGGGGG
GggggggG
GggggggG
GggggggG
GggGGggG
GggggggG
GggggggG
kkkkkkkk`, {
    G: PAL.ch3_grave, g: PAL.ch3_graveH, k: PAL.black,
  }, 4);

  // 石板地
  tiles.stone = makeSprite(`
gggggggg
gGGGGGGg
gGggggGg
gGggggGg
gGGGGGGg
gggggggG
gGGGGGGg
gggggggg`, {
    g: PAL.ch3_grave, G: PAL.ch3_graveH,
  }, 4);

  // 暗石板(第 3 章走廊):比墙更暗,与亮石墙拉开层次
  tiles.stoneDark = makeSprite(`
gggggggg
gGGGGGGg
gggggggg
gGggggGg
gggggggg
gGGGGGGg
gggggggg
gGggggGg`, {
    g: '#26242e', G: '#332f3e',
  }, 4);

  // 暗冰(第 4 章走廊):低亮度冰面,与亮镜面墙区分
  tiles.iceDark = makeSprite(`
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf`, {
    f: '#2c4258', F: '#3a5570',
  }, 4);

  // 冰面
  tiles.ice = makeSprite(`
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf
fFfFfFfF
FfFfFfFf`, {
    f: PAL.ch4_ice, F: PAL.ch4_iceH,
  }, 4);

  // 镜面冰
  tiles.mirrorIce = makeSprite(`
mMmMmMmM
MmMmMmMm
mMmMmMmM
MmMmMmMm
mMmMmMmM
MmMmMmMm
mMmMmMmM
MmMmMmMm`, {
    m: PAL.ch4_iceD, M: PAL.ch4_mirror,
  }, 4);

  // 水
  tiles.water = makeSprite(`
.aa.aa..
aaa.aa.a
.aa.aa..
aa.aa.aa
.aa.aa..
aaa.aa.a
.aa.aa..
aa.aa.aa`, {
    a: PAL.ch1_water,
  }, 4);

  return tiles;
}
