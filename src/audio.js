// audio.js — 8-bit 风格程序化音频(用 WebAudio API 合成)
// 不需要外部音频文件,所有 SFX/BGM 用振荡器生成

export class Audio {
  // 音量档位(暂停菜单 ←→ 步进;0 仍保留一格,便于"只留一点点")
  static VOL_LEVELS = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];

  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.vol = { music: 0.5, sfx: 0.7, voice: 0.85 }; // 分总线音量(localStorage 持久化)
    this._duckT = 0;        // 配音播放中 → BGM 闪避
    this._lookahead = 0.1;  // BGM 调度预约窗口(后台标签页时放大抗节流)
    this.musicGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this._musicNodes = [];
    this._voices = {};       // 已解码的台词配音缓存 key → AudioBuffer
    this._voiceFetching = {}; // 防并发重复拉取
    this._fileBufs = {};     // mmx 生成的 BGM 文件解码缓存 key → AudioBuffer
    this._fileSrc = null;    // 当前文件音轨源
    this._loadingFiles = {}; // 防并发重复拉取 BGM
    this._switchTimer = null; // 切轨淡出期间的延迟启动
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 音量档位恢复(先于总线创建,赋值直接生效)
      try { const v = JSON.parse(localStorage.getItem('witherbloom_vols') || 'null'); if (v) Object.assign(this.vol, v); } catch (e) {}
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      // 主输出限幅器:多声部同帧叠加(斩击+命中+心跳)不至于削波爆音
      // 只作安全网不参与调音;无 createDynamicsCompressor 的环境(测试 mock)自动跳过
      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        try {
          const comp = this.ctx.createDynamicsCompressor();
          comp.threshold.value = -6; comp.knee.value = 0; comp.ratio.value = 12;
          comp.attack.value = 0.003; comp.release.value = 0.25;
          this.master.connect(comp);
          comp.connect(this.ctx.destination);
        } catch (e) { this.master.connect(this.ctx.destination); }
      } else {
        this.master.connect(this.ctx.destination);
      }
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.vol.music;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.vol.sfx;
      this.sfxGain.connect(this.master);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this.vol.voice;
      this.voiceGain.connect(this.master);
      // 恢复持久化的静音状态
      try { if (localStorage.getItem('witherbloom_muted') === '1') { this.muted = true; this.musicGain.gain.value = 0; } } catch (e) {}
      // 后台标签页:Chrome 会把 setInterval 节流到 ≥1s,预约窗口同步放大,
      // 否则调度饥饿、BGM 断流(回前台恢复)
      try {
        document.addEventListener('visibilitychange', () => {
          this._lookahead = document.hidden ? 1.2 : 0.1;
        });
      } catch (e) {}
    } catch (e) {
      console.warn('AudioContext 不可用', e);
    }
  }

  // ===== 总线音量(带 ramp 的统一写入口;直接 .value 赋值会打断进行中的闪避/淡出) =====
  _rampGain(param, target, tau) {
    if (!param) return;
    try {
      if (typeof param.setTargetAtTime === 'function') {
        if (param.cancelScheduledValues && this.ctx) param.cancelScheduledValues(this.ctx.currentTime);
        param.setTargetAtTime(Math.max(0.0001, target), this.ctx.currentTime, tau);
        return;
      }
    } catch (e) {}
    param.value = target;
  }

  // 音乐总线目标值 = 音量 × (静音→0) × (闪避→0.32)
  _applyMusicGain(tau = 0.05) {
    if (!this.ctx || !this.musicGain) return;
    const target = this.muted ? 0 : this.vol.music * (this._duckT > 0 ? 0.32 : 1);
    this._rampGain(this.musicGain.gain, target, tau);
  }

  // BGM 闪避(ducking):配音/重要语音播放时把音乐压低约 10dB,结束后缓升恢复
  duckMusic(on) {
    this._duckT = Math.max(0, this._duckT + (on ? 1 : -1));
    this._applyMusicGain(on ? 0.04 : 0.35);
  }

  setBusVolume(bus, t) {
    if (!(bus in this.vol)) return;
    this.vol[bus] = t;
    if (this.ctx) {
      if (bus === 'music') this._applyMusicGain(0.03);
      else this._rampGain((bus === 'sfx' ? this.sfxGain : this.voiceGain).gain, this.muted ? 0 : t, 0.03);
    }
    try { localStorage.setItem('witherbloom_vols', JSON.stringify(this.vol)); } catch (e) {}
  }

  // 档位步进(d = ±1);返回新档位索引
  stepVolume(bus, d) {
    const lv = Audio.VOL_LEVELS;
    const cur = this.vol[bus] ?? 0.5;
    let idx = 0;
    for (let i = 1; i < lv.length; i++) if (Math.abs(lv[i] - cur) <= Math.abs(lv[idx] - cur)) idx = i;
    idx = Math.max(0, Math.min(lv.length - 1, idx + d));
    this.setBusVolume(bus, lv[idx]);
    return idx;
  }

  volBar(bus) {
    const lv = Audio.VOL_LEVELS;
    const cur = this.vol[bus] ?? 0.5;
    let n = 0;
    for (let i = 1; i < lv.length; i++) if (Math.abs(lv[i] - cur) <= Math.abs(lv[n] - cur)) n = i;
    return '▮'.repeat(n) + '▯'.repeat(lv.length - 1 - n);
  }

  async resume() {
    try {
      if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (e) {}
  }

  // 简单的音阶(8-bit 风格)
  note(freq, dur, type = 'square', gain = 0.2, attack = 0.005, release = 0.05) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(gain, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + release);
  }

  // ===== 工具:随机音高抖动(±cents 半音内),消除重复音效的"机关枪疲劳" =====
  _jit(freq, cents = 0.35) {
    return freq * (1 + (Math.random() * 2 - 1) * cents);
  }

  // 噪声缓冲(懒创建;Mock AudioContext 无 createBuffer 时返回 null,调用方自行跳过)
  _noise() {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return null;
    if (!this._noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._noiseBuf;
  }

  // 噪声爆破:打击/挥砍的"肉感"来源(dur 秒,gain 峰值, hp 高通截止)
  _noiseHit(dur = 0.12, gain = 0.18, hpFreq = 400) {
    const buf = this._noise();
    if (!buf || !this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const filter = typeof this.ctx.createBiquadFilter === 'function' ? this.ctx.createBiquadFilter() : null;
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      let node = src;
      if (filter) { filter.type = 'highpass'; filter.frequency.value = hpFreq; src.connect(filter); node = filter; }
      node.connect(g).connect(this.sfxGain);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch (e) { /* 音频失败静默 */ }
  }

  // 攻击音(短促):whoosh 噪声 + 双振荡器,带随机音高
  sfxSlash(comboStage = -1) {
    const stageUp = comboStage === 0 ? 1.25 : comboStage === 2 ? 0.85 : 1;
    this.note(this._jit(880 * stageUp), 0.04, 'square', 0.13);
    this.note(this._jit(440 * stageUp), 0.06, 'sawtooth', 0.09);
    this._noiseHit(0.07, 0.10, 1600);
  }

  // 击中:低频冲击 + 噪声 crunch + 随机音高
  sfxHit(crit = false) {
    const mul = crit ? 0.75 : 1;
    this.note(this._jit(120 * mul), crit ? 0.14 : 0.09, 'square', 0.22);
    this.note(this._jit(60 * mul), 0.15, 'sawtooth', 0.15);
    this._noiseHit(crit ? 0.16 : 0.09, crit ? 0.24 : 0.14, 300);
    if (crit) { // 暴击金属高频叮
      this.note(this._jit(1560), 0.1, 'square', 0.12);
      this.note(this._jit(2340), 0.08, 'sine', 0.08);
    }
  }

  // 击杀闷响(敌人倒地;起音/时长抖动,连杀不"机关枪")
  sfxKill() {
    this.note(this._jit(70, 0.06), this._jit(0.18, 0.2), 'sine', 0.24);
    this._noiseHit(this._jit(0.2, 0.2), 0.12, 150);
  }

  // 受击
  sfxHurt() {
    this.note(this._jit(200, 0.1), 0.15, 'square', 0.2);
    this.note(this._jit(150, 0.1), 0.2, 'square', 0.15);
  }

  // 拾取
  sfxPickup(freq = 660) {
    this.note(freq, 0.05, 'square', 0.15);
    this.note(freq * 1.5, 0.05, 'square', 0.15);
    this.note(freq * 2, 0.08, 'square', 0.12);
  }

  // 闪避/冲刺
  sfxDash() {
    this.note(this._jit(440), 0.08, 'sawtooth', 0.12);
    this.note(220, 0.1, 'sawtooth', 0.1);
    this._noiseHit(0.12, 0.07, 900);
  }

  // 完美闪避:清亮上行滑音 + 空气爆裂
  sfxPerfect() {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t0);
    osc.frequency.exponentialRampToValueAtTime(1760, t0 + 0.18);
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    osc.connect(env).connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + 0.32);
    this._noiseHit(0.15, 0.06, 2400);
  }

  // 技能释放
  sfxSkill() {
    this.note(330, 0.1, 'sine', 0.2);
    this.note(660, 0.15, 'sine', 0.18);
    this.note(990, 0.2, 'sine', 0.15);
  }

  sfxHeal() {
    if (!this.ctx || this.muted) return;
    this.note(523, 0.12, 'sine', 0.16);
    this.note(659, 0.12, 'sine', 0.15);
    this.note(784, 0.14, 'sine', 0.14);
  }

  // BOSS 战吼(起音/时长/峰值全抖动:反复触发不再是同一声)
  sfxRoar() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const f0 = this._jit(80, 0.1);
    const dur = this._jit(0.5, 0.2);
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f0 / 2, t0 + dur);
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(0.25 * (0.9 + Math.random() * 0.2), t0 + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // 死亡
  sfxDeath() {
    this.note(330, 0.2, 'square', 0.2);
    this.note(220, 0.2, 'square', 0.18);
    this.note(165, 0.3, 'square', 0.15);
    this.note(110, 0.5, 'square', 0.12);
  }

  // 章节切换
  sfxChapter() {
    this.note(330, 0.2, 'sine', 0.18);
    this.note(440, 0.2, 'sine', 0.18);
    this.note(550, 0.2, 'sine', 0.18);
    this.note(660, 0.4, 'sine', 0.2);
  }

  // UI 点击
  sfxClick() {
    this.note(660, 0.04, 'square', 0.1);
  }

  // UI 悬停
  sfxHover() {
    this.note(880, 0.02, 'square', 0.06);
  }

  // 发现秘密(闪亮琶音)
  sfxSecret() {
    const base = 660;
    this.note(base, 0.08, 'sine', 0.14);
    setTimeout(() => this.note(base * 1.25, 0.08, 'sine', 0.13), 70);
    setTimeout(() => this.note(base * 1.5, 0.08, 'sine', 0.12), 140);
    setTimeout(() => this.note(base * 2, 0.22, 'sine', 0.12), 210);
  }

  // 释怀(柔和的钟声下落)
  sfxRelease() {
    this.note(523, 0.5, 'sine', 0.16);
    this.note(392, 0.7, 'sine', 0.13);
    setTimeout(() => this.note(659, 0.6, 'sine', 0.1), 180);
  }

  // 低语(寒铁桥回忆)
  sfxWhisper() {
    this.note(196, 0.6, 'sine', 0.06);
    this.note(233, 0.6, 'sine', 0.05);
  }

  // 低血量心跳(lub-dub 双闷响;音量刻意低,是氛围不是警报)
  sfxHeartbeat() {
    this.note(52, 0.12, 'sine', 0.26);
    setTimeout(() => this.note(46, 0.1, 'sine', 0.18), 150);
  }

  // ===== 台词配音(mmx TTS 预生成 mp3;WebAudio 解码播放)=====
  // 文件缺失 / 非浏览器 / AudioContext 无解码能力 → 全部静默降级
  async playVoice(key, volume = 1) {
    if (!key || this.muted || !this.ctx || typeof this.ctx.decodeAudioData !== 'function') return;
    try {
      let buf = this._voices[key];
      if (!buf && !this._voiceFetching[key]) {
        this._voiceFetching[key] = true;
        const res = await fetch(`assets/audio/voice/${key}.mp3`);
        this._voiceFetching[key] = false;
        if (!res.ok) return;
        buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this._voices[key] = buf;
      }
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.voiceGain);
      // 配音闪避:BGM 压低约 10dB,台词结束缓升恢复(战争吼与人声不再互抢)
      src.onended = () => { try { this.duckMusic(false); } catch (e) {} };
      this.duckMusic(true);
      src.start();
    } catch (e) { /* 配音失败静默 */ }
  }

  // ===== 每章 BGM 音轨(16 步旋律 + 低音;风格随章节情绪变化) =====
  // ch1 春之森: 五声音阶,温柔上行 | ch2 夏之墟: 急促切分,火与锤
  // ch3 秋之墓: 半音阶下行,肃穆 | ch4 冬之渊: 稀疏长音,苍凉
  // boss: 小调紧凑循环,战斗张力 | title: 慢速摇篮曲式动机
  // drums: 鼓组强度(null=无鼓 / soft / sparse / full),test 环境自动降级
  static TRACKS = {
    ch1: {
      tempo: 104,
      melody: [330, 0, 392, 440, 0, 392, 330, 294, 330, 0, 440, 0, 392, 330, 294, 0],
      bass:   [165, 0, 0, 147, 0, 0, 131, 0, 165, 0, 0, 147, 0, 0, 196, 0],
      drums: 'soft',
      chords: [[262,330,392],[220,262,330],[196,247,294],[175,220,262]],
    },
    ch2: {
      tempo: 126,
      melody: [294, 294, 0, 370, 440, 0, 370, 294, 330, 330, 0, 392, 440, 494, 440, 0],
      bass:   [147, 0, 147, 0, 175, 0, 147, 0, 165, 0, 165, 0, 196, 0, 147, 0],
      drums: 'full',
      chords: [[147,175,220],[165,196,247],[131,165,196],[147,175,220]],
    },
    ch3: {
      tempo: 96,
      melody: [311, 0, 0, 349, 0, 466, 0, 415, 311, 0, 0, 349, 0, 415, 0, 349],
      bass:   [78, 0, 0, 0, 104, 0, 0, 0, 78, 0, 0, 0, 93, 0, 0, 0],
      drums: 'sparse',
      chords: [[156,186,233],[175,208,262],[139,165,208],[156,186,233]],
    },
    ch4: {
      tempo: 88,
      melody: [262, 0, 0, 0, 311, 0, 349, 0, 330, 0, 0, 262, 0, 0, 247, 0],
      bass:   [65, 0, 0, 0, 0, 0, 78, 0, 65, 0, 0, 0, 0, 0, 62, 0],
      drums: null,
      chords: [[131,156,196],[117,147,175],[131,156,196],[98,123,147]],
    },
    boss: {
      tempo: 140,
      melody: [220, 0, 262, 220, 294, 0, 262, 0, 220, 233, 0, 262, 311, 294, 262, 0],
      bass:   [110, 110, 0, 110, 0, 104, 0, 98, 110, 110, 0, 110, 0, 117, 0, 123],
      drums: 'full',
      chords: [[110,131,165],[117,147,175],[98,123,147],[110,131,165]],
    },
    title: {
      tempo: 84,
      melody: [330, 0, 0, 392, 0, 440, 0, 0, 392, 0, 330, 0, 294, 0, 0, 0],
      bass:   [82, 0, 0, 0, 110, 0, 0, 0, 98, 0, 0, 0, 123, 0, 0, 0],
      drums: null,
      chords: [[131,165,196],[110,131,165],[98,123,147],[123,147,186]],
    },
  };

  // BGM 循环 —— 用 WebAudio lookahead 调度:25ms 心跳把未来 100ms 内的音符
  // 预约到 ctx 时间轴,节拍精确(setInterval 抖动也无妨;后台标签页把窗口放大到 1.2s 抗节流)。
  // trackKey: 'ch1'|'ch2'|'ch3'|'ch4'|'boss'|'title';切轨时先淡出旧曲再起新曲(不硬切)。
  startMusic(tempo, trackKey = null) {
    if (!this.ctx) return;
    // 兼容旧签名 startMusic(tempo):无 trackKey 时沿用旧旋律
    const track = trackKey && Audio.TRACKS[trackKey] ? Audio.TRACKS[trackKey]
      : { tempo, melody: [330, 392, 440, 392, 330, 294, 330, 392, 440, 494, 440, 392, 330, 294, 247, 294],
          bass: [82, 0, 110, 0, 98, 0, 123, 0, 82, 0, 110, 0, 98, 0, 123, 0] };
    const useTempo = trackKey ? track.tempo : (tempo || track.tempo);
    // 同曲不重启:程序化走 _musicInterval,文件音轨走 _fileSrc(为 null 时会误判"没在播"导致回菜单 BGM 从头放)。
    // 淡出切换窗口内(_switchTimer 未触发)不 early-return,让最新的切轨请求覆盖排队中的旧请求。
    const switching = !!this._switchTimer;
    if (!switching && this._currentTrack === trackKey && (this._musicInterval || this._fileSrc)) return;
    const begin = () => {
      this._switchTimer = null;
      this.stopMusic();
      this._currentTrack = trackKey; // 必须在 stopMusic 之后写回(它会清空本字段)
      // 优先播放 mmx 生成的文件音轨;未解码则先播程序化旋律并异步加载,加载完平滑切换
      if (trackKey && this._tryFileTrack(trackKey)) { this._applyMusicGain(0.15); return; }
      if (trackKey) this._loadFileTrack(trackKey);
      const melody = track.melody;
      const bass = track.bass;
      const drums = track.drums || null;
      const beat = 60 / useTempo / 2; // 8 分音符
      let step = 0;
      let nextNoteTime = this.ctx.currentTime + 0.1;
      const schedule = () => {
        if (!this.ctx) return;
        while (nextNoteTime < this.ctx.currentTime + this._lookahead) {
          // 静音时只推进乐谱位置,不实例化节点(sfx/voice 由各自入口拦截)
          if (!this.muted) {
            const i = step % melody.length;
            const m = melody[i];
            if (m > 0) {
              this._bgmNoteAt(m, nextNoteTime, beat * 0.9, 'square', 0.08);
              // 旋律加法(轻微失谐三角波)+ 延迟一拍半的回声 —— 空间感来源
              this._bgmNoteAt(m * 1.004, nextNoteTime, beat * 0.85, 'triangle', 0.05);
              this._bgmNoteAt(m, nextNoteTime + beat * 1.5, beat * 0.7, 'triangle', 0.03);
            }
            const b = bass[i];
            if (b > 0) {
              this._bgmNoteAt(b, nextNoteTime, beat * 1.8, 'triangle', 0.12);
              // 小节起点的持续低音衬底(sub sine),把"蜂鸣"托成"和声"
              if (i % 8 === 0) this._bgmNoteAt(b / 2, nextNoteTime, beat * 7.5, 'sine', 0.09);
            }
            // 和声垫层:每小节一个软三和弦(sine 低增益),增加丰满度与调性支撑
            if (track.chords && i % 8 === 0) {
              const ch = track.chords[Math.floor(step / 8) % track.chords.length];
              for (const f of ch) this._bgmNoteAt(f, nextNoteTime, beat * 7.2, 'sine', 0.042);
            }
            if (drums) this._drumsAt(drums, i, nextNoteTime);
          }
          nextNoteTime += beat;
          step++;
        }
      };
      schedule();
      this._musicInterval = setInterval(schedule, 25);
      this._applyMusicGain(0.15); // 新曲淡入(从淡出的近零缓升回目标音量)
    };
    // 旧曲还在响:先 ~0.22s 淡出再切(硬切会把小节中间的音"啪"一声斩断)
    if (this._musicInterval || this._fileSrc) {
      if (this._switchTimer) clearTimeout(this._switchTimer);
      this._rampGain(this.musicGain && this.musicGain.gain, 0.0001, 0.09);
      this._switchTimer = setTimeout(begin, 220);
    } else begin();
  }

  // 在指定 ctx 绝对时间播放一个 BGM 音符(供 lookahead 预约)
  _bgmNoteAt(freq, startTime, dur, type, gain) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(gain, startTime + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
    osc.connect(env).connect(this.musicGain);
    osc.start(startTime); osc.stop(startTime + dur);
  }

  // ===== BGM 鼓组:底鼓(sine 下滑)+ 军鼓/镲(短噪声),按曲目强度分层 =====
  _drumsAt(mode, i, t0) {
    if (!this.ctx || typeof this.ctx.createBuffer !== 'function') return; // 测试 mock 自动降级
    try {
      if (mode === 'full' || mode === 'sparse') {
        if (i % 4 === 0) this._kickAt(t0, mode === 'full' ? 0.15 : 0.11);
        if (mode === 'full' && (i === 4 || i === 12)) this._musicNoiseAt(t0, 0.09, 0.055, 1400); // 军鼓
        if (i % 2 === 1) this._musicNoiseAt(t0, 0.03, mode === 'full' ? 0.028 : 0.016, 5200);   // hi-hat
      } else if (mode === 'soft') {
        if (i % 8 === 0) this._kickAt(t0, 0.09);
        if (i % 2 === 1) this._musicNoiseAt(t0, 0.025, 0.012, 6000);
      }
    } catch (e) { /* 单步调度失败静默 */ }
  }

  _kickAt(t0, gain = 0.14) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.connect(env).connect(this.musicGain);
    osc.start(t0); osc.stop(t0 + 0.16);
  }

  // 定时噪声(军鼓/hi-hat);无 createBuffer 的环境已被上层拦截
  _musicNoiseAt(t0, dur, gain, hpFreq) {
    const buf = this._noise();
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    let node = src;
    if (typeof this.ctx.createBiquadFilter === 'function') {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = hpFreq;
      src.connect(f); node = f;
    }
    node.connect(g).connect(this.musicGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  _bgmNote(freq, dur, type, gain) { this._bgmNoteAt(freq, this.ctx ? this.ctx.currentTime : 0, dur, type, gain); }

  stopMusic() {
    // 待执行的切轨启动一并取消(否则"停音乐"之后又自己响起来)
    if (this._switchTimer) { clearTimeout(this._switchTimer); this._switchTimer = null; }
    if (this._musicInterval) {
      clearInterval(this._musicInterval);
      this._musicInterval = null;
    }
    if (this._fileSrc) {
      try { this._fileSrc.stop(); } catch (e) {}
      try { this._fileSrc.disconnect(); } catch (e) {}
      this._fileSrc = null;
    }
    this._currentTrack = null;
  }

  // ===== mmx 文件音轨 =====
  _tryFileTrack(key) {
    const buf = this._fileBufs[key];
    if (!buf || !this.ctx) return false;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicGain);
      src.start(0);
      this._fileSrc = src;
      return true;
    } catch (e) { return false; }
  }

  _loadFileTrack(key) {
    if (this._fileBufs[key] || this._loadingFiles[key]) return;
    this._loadingFiles[key] = true;
    fetch('assets/audio/' + key + '.mp3')
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(ab => this.ctx.decodeAudioData(ab))
      .then(buf => {
        this._fileBufs[key] = buf;
        // 若当前仍在播该曲的程序化版本,切换到文件音轨
        if (this._currentTrack === key && !this._fileSrc) {
          if (this._musicInterval) { clearInterval(this._musicInterval); this._musicInterval = null; }
          this._tryFileTrack(key);
        }
      })
      .catch(() => { /* 无文件则保持程序化旋律 */ })
      .finally(() => { this._loadingFiles[key] = false; });
  }

  setMute(m) {
    this.muted = m;
    // 走统一 ramp 入口:直接 .value 赋值会打断进行中的闪避/切轨淡出曲线
    this._applyMusicGain(0.02);
    if (this.ctx && this.sfxGain) this._rampGain(this.sfxGain.gain, m ? 0 : this.vol.sfx, 0.02);
    if (this.ctx && this.voiceGain) this._rampGain(this.voiceGain.gain, m ? 0 : this.vol.voice, 0.02);
    try { localStorage.setItem('witherbloom_muted', m ? '1' : '0'); } catch (e) {}
  }
}
