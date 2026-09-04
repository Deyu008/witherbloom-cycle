#!/usr/bin/env bash
# 用 mmx TTS 合成 BOSS 台词配音(全部为游戏内既有文案)
# 文件名映射: b1=守林人 b2=焚身王 b3=编年者 b4=寂渊;数字 = 阶段序
set -u
cd /root/projects/html-game
mkdir -p assets/audio/voice

say() {
  local key="$1"; local text="$2"
  if [ -s "assets/audio/voice/${key}.mp3" ]; then echo "SKIP ${key}"; return; fi
  echo "=== SAY ${key}: ${text}"
  mmx speech synthesize --non-interactive --quiet \
    --text "$text" --language zh --speed 0.88 --pitch -8 --volume 1.0 \
    --format mp3 --sample-rate 32000 --bitrate 128000 \
    --out "assets/audio/voice/${key}.mp3" && echo "OK ${key}" || echo "FAIL ${key}"
  sleep 4
}

# 第 1 章 守林人 · 艾温(三阶段台词)
say v_b1_1 '我在等……等了很久。'
say v_b1_2 '你想起了什么？'
say v_b1_3 '现在，让我听你说。'

# 第 2 章 焚身王 · 阿撒兹勒
say v_b2_1 '火，会带走一切。'
say v_b2_2 '哀伤……还没有烧尽。'

# 第 3 章 编年者 · 赛弗
say v_b3_1 '所有事件，都已被记下。'
say v_b3_2 '但有些事，该被改写。'

# 第 4 章 寂渊 · 被遗忘者
say v_b4_1 '……你来了。'
say v_b4_2 '我曾有过名字。'
say v_b4_3 '现在，让我记住你。'

echo ALL DONE
ls -la assets/audio/voice/
