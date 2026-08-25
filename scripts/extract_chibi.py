"""公式ちびシートから正面立ち絵だけを切り出し、背景を透過にする。

シートは1536x1024と1024x768が混在し、背景も白と緑が混在する（既存2作の記録どおり）。
そのため ①四隅から背景色を推定 ②外側とつながった背景だけを塗り抜く（内側の白は残す）
③上6割の列projectionで最初の縦長のかたまり＝正面立ち絵を取る、の3段で処理する。
"""
from PIL import Image
from scipy import ndimage
import numpy as np

def _runs(colsum, thr, minw):
    runs, start = [], None
    for x, v in enumerate(colsum):
        if v > thr and start is None: start = x
        elif v <= thr and start is not None:
            if x - start >= minw: runs.append((start, x))
            start = None
    if start is not None and len(colsum) - start >= minw: runs.append((start, len(colsum)))
    return runs

def extract_front(path, box=200):
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    a = np.array(img).astype(int)
    corners = np.array([a[2,2,:3], a[2,w-3,:3], a[h-3,2,:3], a[h-3,w-3,:3]])
    bg = np.median(corners, axis=0)
    dist = np.abs(a[:,:,:3] - bg).sum(axis=2)

    # 外側とつながった背景だけを背景とみなす（白い衣装に穴を空けないため）
    same = dist < 60
    lab, n = ndimage.label(same)
    border = set(np.unique(np.concatenate([lab[0,:], lab[-1,:], lab[:,0], lab[:,-1]])))
    border.discard(0)
    outside = np.isin(lab, list(border))

    fg = ~outside

    # 上段（全身の三面図）の帯を、行ごとの分布から見つける。
    # 「上6割」の決め打ちだと、図が大きいシートで脚が切れる（雛之丞・タルトで発生）。
    rowsum = fg.sum(axis=1)
    rthr = max(2, w * 0.004)
    bands, st = [], None
    for yy, v in enumerate(rowsum):
        if v > rthr and st is None: st = yy
        elif v <= rthr and st is not None:
            if yy - st > h * 0.10: bands.append((st, yy))
            st = None
    if st is not None and h - st > h * 0.10: bands.append((st, h))
    candidates = []
    if bands: candidates.append(bands[0])
    candidates.append((0, int(h * 0.62)))      # 退避（従来の決め打ち）
    for y_top, y_bot in candidates:
        got = _pick_front(img, fg, outside, y_top, y_bot, w, box)
        if got is not None: return got
    return None


def _pick_front(img, fg, outside, y_top, y_bot, w, box):
    """帯 (y_top, y_bot) の中から、最初の縦長のかたまり＝正面立ち絵を切り出す。"""
    import numpy as np
    from scipy import ndimage
    from PIL import Image
    top = fg[y_top:y_bot, :]
    H = top.shape[0]
    colsum = top.sum(axis=0)
    minw = int(w * 0.04)
    for frac in (0.01, 0.03, 0.06, 0.10, 0.16, 0.24):
        rs = _runs(colsum, max(3, H*frac), minw)
        if not rs: continue
        x0, x1 = rs[0]
        ys = np.where(top[:, x0:x1].sum(axis=1) > 0)[0]
        if len(ys) == 0: continue
        y0, y1 = ys.min() + y_top, ys.max() + 1 + y_top
        # 立ち絵1体の縦横比はおおむね0.7以下。0.78を超えたら隣の図とくっついているとみなし、
        # しきい値を上げて分離をやり直す
        if (x1-x0) / max(1, (y1-y0)) >= 0.78: continue
        cut = np.array(img)[y0:y1, x0:x1].copy()
        keep = ~outside[y0:y1, x0:x1]

        # 立ち絵以外の破片（隣の小物や面など）が混ざることがあるので落とす。
        # ただし「一番大きいかたまりだけ」にすると、白いフリルの裾が背景の白と同化して
        # 上半身と脚が別のかたまりに割れているキャラ（雛之丞）で、脚ごと消えてしまう。
        # そこで**本体に接している（縦の隙間が小さく、横に重なる）かたまりは残す**。
        lab2, n2 = ndimage.label(keep)
        if n2 > 1:
            sizes = ndimage.sum(keep, lab2, range(1, n2 + 1))
            main = int(np.argmax(sizes)) + 1
            objs = ndimage.find_objects(lab2)
            my, mx = objs[main - 1]
            merged = (lab2 == main)
            for li in range(1, n2 + 1):
                if li == main: continue
                sy, sx = objs[li - 1]
                # 横に重なっているか
                overlap = min(mx.stop, sx.stop) - max(mx.start, sx.start)
                # 縦の隙間（本体の上下どちらでも）
                gap = max(sy.start - my.stop, my.start - sy.stop)
                if overlap > 0 and gap <= 6:
                    merged |= (lab2 == li)
            keep = merged
            ys2, xs2 = np.where(keep)
            if len(xs2):
                a0, a1, b0, b1 = xs2.min(), xs2.max() + 1, ys2.min(), ys2.max() + 1
                cut = cut[b0:b1, a0:a1]
                keep = keep[b0:b1, a0:a1]

        cut[:,:,3] = np.where(keep, 255, 0).astype(np.uint8)
        out = Image.fromarray(cut, "RGBA")
        # 細身のキャラ（弁天など）は同じ高さだと存在感が痩せるので、幅の下限で少しだけ持ち上げる
        ratio = out.width / out.height
        h = box if ratio >= 0.42 else min(int(box * (0.42 / ratio) ** 0.5), int(box * 1.16))
        out.thumbnail((int(box * 1.2), h), Image.LANCZOS)
        return out
    return None
