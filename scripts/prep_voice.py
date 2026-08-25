#!/usr/bin/env python3
"""ElevenLabsから落としたmp3を、ゲームで使う形に整える。

使い方:
    python3 scripts/prep_voice.py <落としたmp3> <キー>
    # キー: start / r0 / r1 / r2 / r3 / r4（docs/VOICE.md 参照）

やること:
  ①前後の無音を落とす（v3は末尾に数秒の無音が付くことがある）
  ②ピークを -1dB に揃える（台詞ごとの音量差をなくす）
  ③96kbps AAC で assets/voice/shiori_<キー>.m4a に書き出す
"""
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THRESH = 0.012      # 無音とみなす振幅
PAD = 0.06          # 前後に残す余白（秒）


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", "44100", "-"],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768


def main():
    if len(sys.argv) < 3:
        sys.exit("使い方: python3 scripts/prep_voice.py <mp3> <start|r0|r1|r2|r3|r4>")
    src, key = sys.argv[1], sys.argv[2]
    a = decode(src)
    if len(a) == 0:
        sys.exit("音声を読み取れませんでした")

    idx = np.where(np.abs(a) > THRESH)[0]
    if len(idx) == 0:
        sys.exit("無音のようです（生成に失敗している可能性）")
    start = max(0, idx[0] / 44100 - PAD)
    end = min(len(a) / 44100, idx[-1] / 44100 + PAD)
    peak = float(np.abs(a).max())
    gain = min(10 ** (-1 / 20) / max(peak, 1e-6), 4.0)   # ピークを-1dBへ（上げすぎない）

    out = os.path.join(ROOT, "assets", "voice", f"shiori_{key}.m4a")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run([
        "ffmpeg", "-y", "-v", "error", "-i", src,
        "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-vn", "-map", "0:a", "-af", f"volume={gain:.3f}",
        "-c:a", "aac", "-b:a", "96k", out
    ], check=True)
    print(f"{key}: {len(a)/44100:.2f}秒 → {end-start:.2f}秒（無音を落とし、ピークを-1dBに）→ {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
