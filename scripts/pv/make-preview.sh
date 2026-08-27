#!/bin/bash
# わいわいタウン用プレビュー動画（640x640・13.5秒・無音・冒頭からプレー画面）
# タイルhover再生は最初の1〜2秒が勝負なので、**帳も棒立ちも見せない**。
#
# 素材は #autoperfect の30秒キャプチャ（帳を飛ばすので1コマ目から跳んでいる）:
#   node scripts/pv/capture-pv.mjs autoperfect 30
#   ffmpeg -y -i page@*.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -an preview-src.mp4
#
# 切り出しの当たりは寸法から逆算している（src/game.js）:
#   W=480 / GROUND_Y=430 / 跳躍の頂点は最大 y=200 / HUDの帯は 0〜96
#   → 論理座標の上から480x480を抜くと、HUD・月・弧の頂点・台座がちょうど収まる
#   → 実寸(720x1080相当)では crop=720:720:0:0
set -e
cd "$(dirname "$0")"

SRC="${1:-preview-src.mp4}"
[ -f "$SRC" ] || { echo "素材がない: $SRC（上のコメントの手順で作る）"; exit 1; }

ffmpeg -y -v error -ss 2.0 -t 13.5 -i "$SRC" \
  -vf "crop=720:720:0:0,scale=640:640,fps=30" \
  -an -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -crf 23 \
  -movflags +faststart waiwai-preview.mp4

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 waiwai-preview.mp4)
B=$(stat -f%z waiwai-preview.mp4 2>/dev/null || stat -c%s waiwai-preview.mp4)
echo "done: waiwai-preview.mp4 (${D}s / $((B/1024))KB)"
echo "  規格: 640x640・5〜15秒・無音・10MB以内・冒頭からプレー画面 → docs/MEDIA.md"

# サムネ（640x640・文字なし）は跳躍中の1コマから切る。HUDの帯を外すため y=132 から。
#   ffmpeg -ss <跳躍の頂点の時刻> -i "$SRC" -frames:v 1 raw-jump.png
#   ffmpeg -i raw-jump.png -vf "crop=585:585:68:132,scale=640:640" waiwai-thumb.png
