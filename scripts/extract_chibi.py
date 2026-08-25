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
    top = fg[:int(h*0.62), :]
    H = top.shape[0]
    colsum = top.sum(axis=0)
    minw = int(w * 0.04)
    for frac in (0.01, 0.03, 0.06, 0.10, 0.16, 0.24):
        rs = _runs(colsum, max(3, H*frac), minw)
        if not rs: continue
        x0, x1 = rs[0]
        ys = np.where(top[:, x0:x1].sum(axis=1) > 0)[0]
        if len(ys) == 0: continue
        y0, y1 = ys.min(), ys.max()+1
        if (x1-x0) / max(1, (y1-y0)) >= 0.85: continue
        cut = np.array(img)[y0:y1, x0:x1].copy()
        keep = ~outside[y0:y1, x0:x1]

        # 立ち絵以外の破片（隣の小物や面など）が混ざることがあるので、
        # つながったかたまりのうち一番大きいものだけを残す（狐白の足元に狐の面が入っていた）
        lab2, n2 = ndimage.label(keep)
        if n2 > 1:
            sizes = ndimage.sum(keep, lab2, range(1, n2 + 1))
            main = int(np.argmax(sizes)) + 1
            keep = (lab2 == main)
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
