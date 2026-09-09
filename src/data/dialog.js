// data/dialog.js — 全部对话文本
// 节点格式: { id, lines: [{ speaker, text, portrait? }], choices?: [{ text, next }], next?: id }

export const DIALOGS = {
  // ===== 第一章 =====
  intro_opening: {
    id: 'intro_opening',
    echo: 'world_tree',
    lines: [
      { speaker: '王树', text: '你醒了。' },
      { speaker: '王树', text: '不必问你是谁——你的名字,在很久以前就被写在王树的叶脉里,只是被风吹散了。' },
      { speaker: '王树', text: '走吧,去找回它。' },
    ],
    next: 'intro_first_step',
  },
  intro_first_step: {
    id: 'intro_first_step',
    lines: [
      { speaker: '回响者', text: '…我的脚步很轻。' },
      { speaker: '回响者', text: '但落叶却在我脚下唱歌。' },
    ],
    next: null,
    onFinish: 'goto_village',
  },

  child_a: {
    id: 'child_a',
    lines: [
      { speaker: '孩子 A', text: '你是外地人吗?' },
      { speaker: '孩子 A', text: '你的影子跟我们的不一样——你的影子在笑。' },
    ],
    next: 'child_a_2',
  },
  child_a_2: {
    id: 'child_a_2',
    lines: [
      { speaker: '回响者', text: '影子会笑?' },
      { speaker: '孩子 A', text: '会啊。你没听过影子唱歌吗?' },
      { speaker: '孩子 A', text: '回声湖的守林人会唱。' },
    ],
  },

  child_b: {
    id: 'child_b',
    echo: 'the_echo',
    lines: [
      { speaker: '孩子 B', text: '我们这里有个传说,' },
      { speaker: '孩子 B', text: '王树每过一千二百年会召唤一个"回响者"。' },
      { speaker: '孩子 B', text: '你肯定是那个。' },
    ],
  },

  elder: {
    id: 'elder',
    echo: 'past_echoes',
    lines: [
      { speaker: '长者', text: '我活了八百岁,见过三次召唤。' },
      { speaker: '长者', text: '前两个回响者都走了——一个去了冬之渊,再也没有回来。' },
      { speaker: '长者', text: '一个在夏之墟的火里消失了。' },
      { speaker: '长者', text: '你呢?' },
    ],
  },

  forest_keeper_intro: {
    id: 'forest_keeper_intro',
    lines: [
      { speaker: '守林人', text: '我在等。' },
      { speaker: '守林人', text: '不是等你,是等一个能听见的人。' },
      { speaker: '守林人', text: '我已经一千二百年没有被人叫过名字了。' },
      { speaker: '守林人', text: '…若你想过去,就请证明你能听见。' },
    ],
    // 战前开场白结束即开战;章节通关只在守林人被击败时触发(boss.onKilled)
  },
  forest_keeper_question: {
    id: 'forest_keeper_question',
    echo: 'forest_keeper',
    lines: [
      { speaker: '回响者', text: '你叫什么名字?' },
      { speaker: '守林人', text: '……' },
      { speaker: '守林人', text: '一千二百年了,你是第一个问的。' },
      { speaker: '守林人', text: '我叫…艾温。' },
      { speaker: '守林人', text: '谢谢你,旅人。' },
    ],
    onFinish: 'forest_keeper_released',
  },

  // ===== 第二章 =====
  blacksmith: {
    id: 'blacksmith',
    lines: [
      { speaker: '铁匠', text: '外乡人?你不属于这座燃烧的城市。' },
      { speaker: '铁匠', text: '但你会习惯的。' },
      { speaker: '铁匠', text: '我们都习惯了。' },
    ],
  },

  gladiator: {
    id: 'gladiator',
    lines: [
      { speaker: '斗技场战士', text: '你是新的挑战者?' },
      { speaker: '斗技场战士', text: '黄昏斗技场欢迎你。' },
      { speaker: '斗技场战士', text: '我在这里赢了二百三十七场,输了零场。' },
      { speaker: '斗技场战士', text: '但我不快乐。' },
    ],
  },

  burning_daughter: {
    id: 'burning_daughter',
    lines: [
      { speaker: '灰烬之影', text: '……' },
      { speaker: '回响者', text: '你…还活着吗?' },
      { speaker: '灰烬之影', text: '我曾是焚身王的女儿。' },
      { speaker: '灰烬之影', text: '三百年前,我唱过他为我写的摇篮曲。' },
      { speaker: '灰烬之影', text: '你愿意为我再唱一次吗?' },
    ],
    next: 'burning_daughter_lullaby',
  },
  burning_daughter_lullaby: {
    id: 'burning_daughter_lullaby',
    echo: 'lullaby',
    condition: (state) => state.collected.lullaby,
    lines: [
      { speaker: '灰烬之影', text: '啊……' },
      { speaker: '灰烬之影', text: '是这首。' },
      { speaker: '灰烬之影', text: '谢谢你,旅人。' },
      { speaker: '灰烬之影', text: '……爸爸,听到了吗?' },
    ],
    onFinish: 'burning_king_released',
  },
  burning_daughter_lullaby_no: {
    id: 'burning_daughter_lullaby_no',
    condition: (state) => !state.collected.lullaby,
    lines: [
      { speaker: '灰烬之影', text: '……不记得了。' },
      { speaker: '灰烬之影', text: '但春天的时候……森林深处,好像有人哼过这样的歌。' },
      { speaker: '灰烬之影', text: '那也没关系。' },
    ],
    // 没有乐谱也能按 V"释怀",但不点亮 boss2_released(共忆结局需要它);
    // 这条线索把玩家指回第一章的未收集秘密(罗盘在集齐刻印后也会指向它)
    onFinish: 'flag:lullaby_hint',
  },

  burning_king_intro: {
    id: 'burning_king_intro',
    lines: [
      { speaker: '焚身王', text: '这座城烧了三百年了。' },
      { speaker: '焚身王', text: '我没打算灭它。' },
      { speaker: '焚身王', text: '火在烧他们的哀伤——如果哀伤烧尽了,他们就不必再哭了。' },
    ],
    next: 'burning_king_challenge',
  },
  burning_king_challenge: {
    id: 'burning_king_challenge',
    echo: 'burning_king',
    lines: [
      { speaker: '回响者', text: '但他们还在哭。' },
      { speaker: '焚身王', text: '……是的。' },
      { speaker: '焚身王', text: '那你要怎么办?旅人。' },
    ],
    // 开场白结束即开战;通关只在焚身王被击败时触发
  },

  // ===== 第三章 =====
  gravedigger: {
    id: 'gravedigger',
    echo: 'nameless_grave',
    lines: [
      { speaker: '守墓人', text: '这里没有哭声。' },
      { speaker: '守墓人', text: '只有名字。' },
      { speaker: '守墓人', text: '你也可以立一块碑,给那些没人记起的人。' },
    ],
  },

  scholar_1: {
    id: 'scholar_1',
    lines: [
      { speaker: '倒悬学者', text: '我研究循环,研究了一千年。' },
      { speaker: '倒悬学者', text: '但循环本身,不是研究对象。' },
      { speaker: '倒悬学者', text: '循环,是被研究的对象。' },
    ],
  },

  scholar_2: {
    id: 'scholar_2',
    echo: 'the_cycle',
    lines: [
      { speaker: '倒悬学者', text: '寂渊不坏。' },
      { speaker: '倒悬学者', text: '他只是……被我们写漏了。' },
      { speaker: '倒悬学者', text: '你以为循环是诅咒?' },
      { speaker: '倒悬学者', text: '不,循环是慈悲——忘记,是一种慈悲。' },
      { speaker: '倒悬学者', text: '但对他不是。' },
    ],
  },

  // ===== 倒悬学院 · 七位根者的残响(支线,集齐触发「七根者」奖励)=====
  root_1: {
    id: 'root_1',
    echo: 'root_spring',
    lines: [
      { speaker: '春之根者', text: '我把第一颗种子埋进冻土。' },
      { speaker: '春之根者', text: '那时世界还没有名字,也没有遗忘。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_2: {
    id: 'root_2',
    echo: 'root_summer',
    lines: [
      { speaker: '夏之根者', text: '我教人们锻造——把眼泪锤进铁里。' },
      { speaker: '夏之根者', text: '后来阿撒兹勒学会了把整座城点着。那不是我的本意。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_3: {
    id: 'root_3',
    echo: 'root_autumn',
    lines: [
      { speaker: '秋之根者', text: '收割是我的仁慈:凡成熟的,都该被收进循环。' },
      { speaker: '秋之根者', text: '只有不肯成熟的,会在风里挂成空壳。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_4: {
    id: 'root_4',
    echo: 'root_winter',
    lines: [
      { speaker: '冬之根者', text: '寂,是我的季节。我让万物睡去,好让他们忘了疼。' },
      { speaker: '冬之根者', text: '可我自己,一个冬天都没能睡着。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_5: {
    id: 'root_5',
    echo: 'root_chronicle',
    lines: [
      { speaker: '编年者之影', text: '赛弗把一切写进书里。写漏的那个名字,是第七位。' },
      { speaker: '编年者之影', text: '书页会记得写下的,也会记得空缺的形状。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_6: {
    id: 'root_6',
    echo: 'root_hearth',
    lines: [
      { speaker: '炉火根者', text: '我守护村庄的火塘。火灭之前,故事一直有人讲。' },
      { speaker: '炉火根者', text: '第七位从不来火塘边。他说,火光太亮,会照出他没被记得的脸。' },
    ],
    onFinish: 'seven_roots_check',
  },
  root_7: {
    id: 'root_7',
    echo: 'root_seventh',
    lines: [
      { speaker: '无名残响', text: '……你不是来找我的,对吗。' },
      { speaker: '无名残响', text: '没关系。第六次被路过,也比第一次被遗忘好。' },
      { speaker: '无名残响', text: '去吧。往桥的那头,替我们所有人问一句他的名字。' },
    ],
    onFinish: 'seven_roots_check',
  },

  chronomancer_intro: {
    id: 'chronomancer_intro',
    lines: [
      { speaker: '编年者', text: '我把所有事件编入循环。' },
      { speaker: '编年者', text: '但有一件事,我从来没编进去。' },
      { speaker: '编年者', text: '——第七位根者的名字。' },
      { speaker: '编年者', text: '我也忘了。' },
    ],
  },
  // todo 3 将在 BOSS 低血量时通过 `_startDialog('chronomancer_question')` 触发此节点
  chronomancer_question: {
    id: 'chronomancer_question',
    echo: 'chronomancer',
    lines: [
      { speaker: '回响者', text: '第七位根者——叫什么名字?' },
      { speaker: '编年者', text: '……' },
      { speaker: '编年者', text: '你愿意替我记着吗?' },
      { speaker: '回响者', text: '愿意。' },
      { speaker: '编年者', text: '那就不是空白了。' },
      { speaker: '编年者', text: '谢谢你,旅人。' },
    ],
    onFinish: 'chronomancer_released',
  },

  // ===== 第四章 =====
  echo_first: {
    id: 'echo_first',
    echo: 'first_echo',
    lines: [
      { speaker: '第一代回响者', text: '你也来了。' },
      { speaker: '第一代回响者', text: '我在寂渊回廊里游荡了两千年,等你。' },
      { speaker: '第一代回响者', text: '——但别问我问题。' },
      { speaker: '第一代回响者', text: '等你坐下来再问。' },
    ],
  },

  forgotten_intro: {
    id: 'forgotten_intro',
    echo: 'three_endings',
    lines: [
      { speaker: '寂渊', text: '我等了很久。' },
      { speaker: '寂渊', text: '不是等你打败我。' },
      { speaker: '寂渊', text: '是等你问我一句——' },
    ],
    // 战前开场白结束即开战;结局只在寂渊被击败后由 boss.onKilled 触发
  },
  forgotten_question: {
    id: 'forgotten_question',
    lines: [
      { speaker: '回响者', text: '你叫什么名字?' },
      { speaker: '寂渊', text: '……' },
      { speaker: '寂渊', text: '……你问了。' },
    ],
    next: 'forgotten_reveal',
  },
  forgotten_reveal: {
    id: 'forgotten_reveal',
    echo: 'forgotten',
    lines: [
      { speaker: '寂渊', text: '我曾经叫…' },
      { speaker: '寂渊', text: '……我不记得了。' },
      { speaker: '寂渊', text: '但你问了。' },
      { speaker: '寂渊', text: '你问了,这本身——' },
      { speaker: '寂渊', text: '就够了。' },
    ],
    onFinish: 'ending_choice',
  },
};
