#!/bin/bash
# 月影とびPV組み立て（縦720x1280・約29秒・公式BGM「無用の火」＋栞のボイス3本）
#
# 型は kitan-works/docs/MEDIA.md「PVの型」に従う:
#   シネマ → 実機プレイ＋ジャンルテロップ → 見せ場 → キャラ総見せ → CTAエンドカード
#
# 素材は #autowobble（本番ルールのまま少し崩す自動プレイ）で撮る。
# **満月成就（50段）は見せない**——ボイス r4「つきに、届きましたこと」だけ流して引きを作る。
# 式札かさねが72段の栞の台詞で締めたのと同じ作法。
#
# カット点は events.json の実測（撮り直したら要調整）:
#   開始 0.58 / 1段 5.24 / 4段・交代 8.67 / 8段・雨 13.28 / 20段 28.58
#   / 30段 40.78 / 40段 53.92 / 48段 65.54 / **50段・儀 68.39** / 素材終端 80.73
set -e
cd "$(dirname "$0")"

V="-c:v libx264 -pix_fmt yuv420p -crf 18 -r 30"
G=gameplay.mp4

# ---- S1: シネマ導入（キービジュアルにゆっくり寄る）3.2s
ffmpeg -y -v error -loop 1 -i s1.png -t 3.2 \
  -vf "scale=1440:2560,zoompan=z='min(1+0.0012*on,1.11)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=30,fade=in:st=0:d=0.6" \
  $V seg1.mp4

# ---- S2: 帳が開く＋最初の数跳び＋ジャンルテロップ 6.0s
# 静止画に fade alpha を使うので -loop 1 必須（単フレームだと alpha=0 で固定される）
ffmpeg -y -v error -ss 1.8 -t 6.0 -i $G -loop 1 -framerate 30 -i telop.png \
  -filter_complex "[1]scale=720:1280,format=rgba,fade=in:st=2.0:d=0.45:alpha=1,fade=out:st=4.9:d=0.5:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" \
  $V seg2.mp4

# ---- S3: 8段の御霊交代と、天候が雨に変わる 5.0s
ffmpeg -y -v error -ss 12.3 -t 5.0 -i $G -vf "fps=30,format=yuv420p" $V seg3.mp4

# ---- S4: 終盤の張り（台座が細く揺れ、月が満ちてくる）5.0s
# 儀（68.39）の手前で切る。ここが引き
ffmpeg -y -v error -ss 59.5 -t 5.0 -i $G -vf "fps=30,format=yuv420p" $V seg4.mp4

# ---- S5: 御霊のカットイン総見せ＋コピー 4.8s（6枚×0.8s）
ffmpeg -y -v error -f concat -safe 0 -i mlist.txt -loop 1 -framerate 30 -i m_copy.png \
  -filter_complex "[1]scale=720:1280,format=rgba,fade=in:st=0.3:d=0.45:alpha=1[t];[0][t]overlay=0:0:shortest=1,fps=30,format=yuv420p" \
  -t 4.8 $V seg5.mp4

# ---- S6: エンドカード（寄り＋フェードアウト）5.0s
ffmpeg -y -v error -loop 1 -i s6.png -t 5.0 \
  -vf "scale=1440:2560,zoompan=z='min(1+0.0006*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280,fps=30,fade=out:st=4.2:d=0.8" \
  $V seg6.mp4

# ---- 無音の通し
ffmpeg -y -v error -f concat -safe 0 -i clist.txt -c copy silent.mp4
TOTAL=$(ffprobe -v error -show_entries format=duration -of csv=p=0 silent.mp4)
echo "  無音の尺: ${TOTAL}s"

# ---- 音付け
# ボイス位置（最終タイムライン秒）。本体のダッキングと同じ考え方でBGMを沈める
T_VS=0.6    # start「今宵の道が、開きました。ゆるりと、まいりましょう」6.5s
T_V2=14.5   # r2「つきみの足、ですこと。ずいぶん、遠くまで」5.0s
T_V4=19.6   # r4「満月渡り、と。つきに、届きましたこと」4.9s ← 儀は見せずに声だけ
VOX=../../assets/voice
FADE_ST=$(python3 -c "print(max(0,$TOTAL-2.6))")

ffmpeg -y -v error -i silent.mp4 -i ../../assets/audio/bgm.m4a \
  -i $VOX/shiori_start.m4a -i $VOX/shiori_r2.m4a -i $VOX/shiori_r4.m4a \
  -filter_complex "\
[1:a]atrim=0:$TOTAL,asetpts=N/SR/TB,afade=t=in:st=0:d=0.8,afade=t=out:st=$FADE_ST:d=2.6,\
volume='0.85-0.45*(between(t,$T_VS,$T_VS+6.5)+between(t,$T_V2,$T_V2+5.0)+between(t,$T_V4,$T_V4+4.9))':eval=frame[bg];\
[2:a]adelay=$(python3 -c "print(int($T_VS*1000))")|$(python3 -c "print(int($T_VS*1000))"),volume=1.15[v1];\
[3:a]adelay=$(python3 -c "print(int($T_V2*1000))")|$(python3 -c "print(int($T_V2*1000))"),volume=1.15[v2];\
[4:a]adelay=$(python3 -c "print(int($T_V4*1000))")|$(python3 -c "print(int($T_V4*1000))"),volume=1.15[v3];\
[bg][v1][v2][v3]amix=inputs=4:duration=first:normalize=0,alimiter=limit=0.95[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest tsukikage-pv.mp4

echo "  → tsukikage-pv.mp4 / silent.mp4"
