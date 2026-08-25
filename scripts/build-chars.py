#!/usr/bin/env python3
"""公式ちびシートから正面立ち絵を、顔アイコンを縮めて、src/chars.js（data URI）を生成する。

出どころ: 素材蔵の台帳 https://kura.vibe.co.jp/index.json の canon_sheet「ちびシート(2頭身)」。
**URLは必ず台帳の値を使う**（パスが混在するため手で組み立てない）。

シートは 1536x1024 と 1024x768 が混在し、背景も白と緑が混在する。そのため
 ①四隅から背景色を推定 ②外側とつながった背景だけを塗り抜く（白い衣装に穴を空けない）
 ③上6割の列projectionで最初の縦長のかたまり＝正面立ち絵を取る
の3段で処理する。生成物は編集しない（このスクリプトを直して作り直す）。
"""
import base64, io, json, os, subprocess, sys
from PIL import Image
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_chibi import extract_front

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "assets", "chars")
LEDGER = "https://kura.vibe.co.jp/index.json"
BOX = 150            # 表示は最大75px（dpr2で150px）
JPEG_LIKE_QUALITY = 6  # PNG最適化の圧縮レベル

def fetch(url, dest, tries=3):
    """素材蔵は大きいPNGで時々切れる（curl 56）ので、数回まで黙って引き直す。"""
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    for i in range(tries):
        r = subprocess.run(["curl", "-sfL", "--retry", "2", "--max-time", "120", "-o", dest, url])
        if r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 0:
            return dest
    return None

def main():
    idx = os.path.join(CACHE, "_index.json")
    fetch(LEDGER, idx)
    items = json.load(open(idx, encoding="utf-8"))
    if isinstance(items, dict):
        items = items.get("assets") or items.get("items") or []
    chibi = sorted([a for a in items if "chibi" in (a.get("id","") + a.get("label",""))],
                   key=lambda a: a.get("char",""))
    out, skipped = {}, []
    for a in chibi:
        cid = a["char"]
        src = fetch(a["url"], os.path.join(CACHE, f"{cid}_chibi.png"))
        if src is None:
            # 台帳に載っていても素材蔵側が404のことがある（栞・あるじどの）。
            # その場合だけ、公式サイトのmediaパス（webp）へ退避する。
            src = fetch(f"https://vibe.co.jp/luna-occulta/media/img/canon/{cid}_chibi.webp",
                        os.path.join(CACHE, f"{cid}_chibi.webp"))
        if src is None:
            skipped.append(cid + "(取得失敗)"); continue
        img = extract_front(src, box=BOX)
        if img is None:
            skipped.append(cid); continue
        buf = io.BytesIO()
        # 透過つきWebPで持つ（同じ絵でPNGの4分の1以下になる。単一HTMLの重さに直結するため）
        img.save(buf, "WEBP", quality=82, method=6, exact=False)
        out[cid] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    # 正典立ち絵（白背景の全身イラスト）。御霊が交代するときに大きく出す。
    # 背景は白なので、外側とつながった白だけを塗り抜く（衣装の白を残すため）。
    from extract_chibi import ndimage as _nd
    canon = {}
    for a in [x for x in items if x.get("id","").endswith("_canon")]:
        cid = a["char"]
        if cid not in out: continue
        src = fetch(a["url"], os.path.join(CACHE, f"{cid}_canon.png"))
        if src is None:
            # 台帳に載っていても素材蔵が404のことがある。公式サイトのmediaパスへ退避する
            src = fetch(f"https://vibe.co.jp/luna-occulta/media/img/canon/{cid}_canon.webp",
                        os.path.join(CACHE, f"{cid}_canon.webp"))
        if src is None: continue
        im = Image.open(src).convert("RGBA")
        arr = np.array(im).astype(int)
        h0, w0 = arr.shape[:2]
        corners = np.array([arr[2,2,:3], arr[2,w0-3,:3], arr[h0-3,2,:3], arr[h0-3,w0-3,:3]])
        bg = np.median(corners, axis=0)
        same = np.abs(arr[:,:,:3] - bg).sum(axis=2) < 40
        lab, n = _nd.label(same)
        border = set(np.unique(np.concatenate([lab[0,:], lab[-1,:], lab[:,0], lab[:,-1]])))
        border.discard(0)
        outside = np.isin(lab, list(border))
        px = np.array(im)
        px[:,:,3] = np.where(outside, 0, 255).astype(np.uint8)
        ys, xs = np.where(~outside)
        if not len(xs): continue
        cut = Image.fromarray(px[ys.min():ys.max()+1, xs.min():xs.max()+1], "RGBA")
        cut.thumbnail((360, 380), Image.LANCZOS)
        b = io.BytesIO(); cut.save(b, "WEBP", quality=76, method=6)
        canon[cid] = "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

    # 正典立ち絵が配布されていないキャラ（栞など）は、正典シート（三面図）の
    # 正面立ち絵をちび絵と同じ手順で切り出して代える。
    for cid in out.keys():
        if cid in canon: continue
        src = fetch(f"https://vibe.co.jp/luna-occulta/media/img/canon/{cid}_sheet.webp",
                    os.path.join(CACHE, f"{cid}_sheet.webp"))
        if src is None: continue
        im = extract_front(src, box=380)
        if im is None: continue
        b = io.BytesIO(); im.save(b, "WEBP", quality=78, method=6)
        canon[cid] = "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

    # 顔アイコン（透過・そのまま使える）も小さくして持つ。御霊の交代表示に使う。
    icons = {}
    for a in [x for x in items if x.get("id","").endswith("_icon")]:
        cid = a["char"]
        if cid not in out: continue
        src = fetch(a["url"], os.path.join(CACHE, f"{cid}_icon.png"))
        if src is None: continue
        im = Image.open(src).convert("RGBA")
        im.thumbnail((96, 96), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, "WEBP", quality=80, method=6)
        icons[cid] = "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

    js = os.path.join(ROOT, "src", "chars.js")
    with open(js, "w", encoding="utf-8") as f:
        f.write("// generated by scripts/build-chars.py — do not edit\n")
        f.write("// 公式ちびシート(2頭身)の正面立ち絵を切り出し、高さ150pxに縮めて透過WebPにしたもの\n")
        f.write("// 出どころ: 素材蔵の台帳 https://kura.vibe.co.jp/index.json の canon_sheet\n")
        f.write("const CHIBI = {\n")
        for cid, uri in out.items():
            f.write(f'  {cid}: "{uri}",\n')
        f.write("};\n")
        f.write("const CANON = {\n")
        for cid, uri in canon.items():
            f.write(f'  {cid}: "{uri}",\n')
        f.write("};\n")
        f.write("const ICON = {\n")
        for cid, uri in icons.items():
            f.write(f'  {cid}: "{uri}",\n')
        f.write("};\n")
    total = os.path.getsize(js)
    print(f"生成: ちび{len(out)}体・立ち絵{len(canon)}点・顔{len(icons)}点 / {total/1024:.0f}KB → src/chars.js")
    if skipped:
        print("切り出せなかったキャラ:", ", ".join(skipped))

if __name__ == "__main__":
    main()
