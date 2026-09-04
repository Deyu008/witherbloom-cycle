#!/usr/bin/env bash
# 生成 6 首 BGM(title/ch1-ch4/boss);music-2.6-free RPM=3,每次调用间隔 21s
set -u
cd /root/projects/html-game
mkdir -p assets/audio/bgm

gen() {
  local key="$1"; shift
  if [ -s "assets/audio/bgm/${key}.mp3" ]; then echo "SKIP ${key} (exists)"; return; fi
  echo "=== GEN ${key} $(date +%T) ==="
  mmx music generate --instrumental --non-interactive --quiet \
    --format mp3 --sample-rate 44100 --bitrate 192000 \
    --out "assets/audio/bgm/${key}.mp3" \
    "$@" && echo "OK ${key}" || echo "FAIL ${key}"
  sleep 21
}

gen title --prompt "Melancholic gentle lullaby for a game title screen: music box, soft harp and warm strings, starry night over an ancient withering world tree, tender mysterious hopeful, very slow tempo" --genre ambient orchestral --mood bittersweet dreamlike --bpm 84

gen ch1 --prompt "Warm pastoral spring forest adventure theme for a fantasy game: wooden flute lead melody on pentatonic scale, harp arpeggios, light strings, birdsong atmosphere, hopeful and innocent morning light, moderate tempo" --instruments "wooden flute, harp, strings" --mood warm hopeful --bpm 104

gen ch2 --prompt "Smoldering industrial forge-city battle march for a fantasy game: war drums, anvil strikes percussion, brassy stabs, driving ostinato low strings, fierce sorrow of a city burning for three hundred years, fast tempo" --instruments "taiko drums, brass, low strings" --mood fierce smoldering --bpm 126

gen ch3 --prompt "Solemn funeral processional in an autumn graveyard for a fantasy game: tolling bells, low sustained strings, muted choir pads, descending chromatic motif, mournful dignified silence, slow tempo" --instruments "bell, low strings, choir pad" --mood solemn mournful --bpm 92

gen ch4 --prompt "Desolate frozen abyss ambient for a fantasy game finale: sparse lonely piano notes over icy drones, distant echoing deep percussion, a long wait beside a mirror throne, grief turning to forgiveness, very slow spacious" --instruments "piano, icy pads, deep drum" --mood desolate cold forgiving --bpm 76

gen boss --prompt "Intense dark epic boss battle theme for an action RPG: urgent string ostinato, taiko and toms, brass hits, menacing choir accents, desperate heroic confrontation against a forgotten god, fast aggressive" --instruments "strings, taiko, brass, choir" --mood intense dramatic --bpm 142

echo "ALL DONE"
ls -la assets/audio/bgm/
