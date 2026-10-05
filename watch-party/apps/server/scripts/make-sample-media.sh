#!/usr/bin/env bash
# Generates the dev harness's test video: 10 minutes of a moving test pattern
# with a burnt-in timecode and a tone, small enough to generate in seconds.
set -euo pipefail
cd "$(dirname "$0")/.."
out=public/dev/media/sample.webm
if [[ -f "$out" ]]; then
  echo "sample media exists: $out"
  exit 0
fi
if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg is required to generate $out (or place any WebM there yourself)" >&2
  exit 1
fi
mkdir -p "$(dirname "$out")"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=320x180:rate=15" \
  -f lavfi -i "sine=frequency=440:sample_rate=22050" \
  -t 600 -c:v libvpx -b:v 120k -deadline realtime -cpu-used 8 -g 30 \
  -c:a libvorbis -b:a 32k "$out"
echo "wrote $out"
