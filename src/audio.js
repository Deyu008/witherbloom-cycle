// audio.js — 8-bit 风格程序化音频(用 WebAudio API 合成)
// 不需要外部音频文件,所有 SFX/BGM 用振荡器生成

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicGain = null;
    this.sfxGain = null;
    this.voiceGain = null;
    this._musicNodes = [];
    this._voices = {};       // 已解码的台词配音缓存 key → AudioBuffer
    this._voiceFetching = {}; // 防并发重复拉取
    this._fileBufs = {};     // mmx 生成的 BGM 文件解码缓存 key → AudioBuffer
    this._fileSrc = null;    // 当前文件音轨源
    this._loadingFiles = {}; // 防并发重复拉取 BGM
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.master);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 0.85;
      this.voiceGain.connect(this.master);
      // 恢复持久化的静音状态
      try { if (localStorage.getItem('witherbloom_muted') === '1') { this.muted = true; this.musicGain.gain.value = 0; } } catch (e) {}
    } catch (e) {
      console.warn('AudioContext 不可用', e);
    }
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

  // 击杀闷响(敌人倒地)
  sfxKill() {
    this.note(70, 0.18, 'sine', 0.24);
    this._noiseHit(0.2, 0.12, 150);
  }

  // 受击
  sfxHurt() {
    this.note(200, 0.15, 'square', 0.2);
    this.note(150, 0.2, 'square', 0.15);
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

  // BOSS 战吼
  sfxRoar() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t0);
    osc.frequency.linearRampToValueAtTime(40, t0 + 0.5);
    env.gain.value = 0;
    env.gain.linearRampToValueAtTime(0.25, t0 + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
    osc.connect(env).connect(this.sfxGain);
    osc.start(t0); osc.stop(t0 + 0.55);
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
  // 预约到 ctx 时间轴,节拍精确且不受后台标签页节流影响(setInterval 抖动也无妨)。
  // trackKey: 'ch1'|'ch2'|'ch3'|'ch4'|'boss'|'title';传入曲目变化时无缝切轨。
  startMusic(tempo, trackKey = null) {
    if (!this.ctx) return;
    // 兼容旧签名 startMusic(tempo):无 trackKey 时沿用旧旋律
    const track = trackKey && Audio.TRACKS[trackKey] ? Audio.TRACKS[trackKey]
      : { tempo, melody: [330, 392, 440, 392, 330, 294, 330, 392, 440, 494, 440, 392, 330, 294, 247, 294],
          bass: [82, 0, 110, 0, 98, 0, 123, 0, 82, 0, 110, 0, 98, 0, 123, 0] };
    const useTempo = trackKey ? track.tempo : (tempo || track.tempo);
    if (this._currentTrack === trackKey && this._musicInterval) return; // 同曲不重启
    this._currentTrack = trackKey;
    this.stopMusic();
    // 优先播放 mmx 生成的文件音轨;未解码则先播程序化旋律并异步加载,加载完平滑切换
    if (trackKey && this._tryFileTrack(trackKey)) return;
    if (trackKey) this._loadFileTrack(trackKey);
    const melody = track.melody;
    const bass = track.bass;
    const drums = track.drums || null;
    const beat = 60 / useTempo / 2; // 8 分音符
    let step = 0;
    let nextNoteTime = this.ctx.currentTime + 0.1;
    const lookahead = 0.1; // 预约窗口(秒)
    const schedule = () => {
      if (!this.ctx) return;
      while (nextNoteTime < this.ctx.currentTime + lookahead) {
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
        nextNoteTime += beat;
        step++;
      }
    };
    schedule();
    this._musicInterval = setInterval(schedule, 25);
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
    if (this.musicGain) this.musicGain.gain.value = m ? 0 : 0.5;
    try { localStorage.setItem('witherbloom_muted', m ? '1' : '0'); } catch (e) {}
  }
}
