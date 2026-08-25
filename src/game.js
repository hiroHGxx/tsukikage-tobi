/* 月影とび — 溜め放ち・着地型
   仕様: kitan-circle/data/articles/20260825-0900-3sakume-spec-watari.json（企画・設計担当）
   ちび絵は chars.js（scripts/build-chars.py が生成）の CHIBI を使う。
*/
(function () {
  "use strict";

  // ---- 論理座標（既存2作と統一）----
  var W = 480, H = 720;
  var cv = document.getElementById("cv");
  var ctx = cv.getContext("2d");

  // ---- 見た目の色（page.html の CSS 変数と同じ値）----
  var C = {
    night: "#131320", night2: "#1B1B2E", ink: "#E8E4D8", inkDim: "#9D93B5",
    moon: "#F0CE7E", kindei: "#D9A94C", shokko: "#E0562F", anshi: "#8E6B9E"
  };

  // ---- 御霊の並び（chars.js のキー順＝素材蔵の台帳順）----
  // 「あるじどの」は御霊ではなく主人公（御霊を式札に宿す側）なので、跳ぶ御霊の巡回には入れない
  var IDS = Object.keys(CHIBI).filter(function (id) { return id !== "arujidono"; });
  // 風魔勢は鎧・鬼系＝「重い」。見た目がそのまま説明になるので注記は出さない。
  var HEAVY = { atoza: 1, aun: 1, dan: 1, janome: 1, karma: 1, kohaku: 1, orochi: 1, rotton: 1 };
  var NAMES = {
    anne: "餡音", arujidono: "あるじどの", atoza: "アトザ", aun: "アウン", benten: "弁天",
    dan: "断", emma: "エマ", hinanojo: "雛之丞", izuna: "イズナ", janome: "蛇ノ目",
    karma: "カルマ", karura: "カルラ", kohaku: "狐白", magoichi: "孫市", naruka: "ナルカ",
    nekomata: "猫又", nemu: "ネム", oen: "おえん", orochi: "オロチ", oto: "於兎",
    rotton: "呂屯", sakuya: "咲耶", shiba: "柴", shinra: "シンラ", shion: "紫苑",
    shiori: "栞", tart: "タルト", torika: "酉花", uka: "宇迦", xiaolan: "シャオラン", yui: "結"
  };

  // ---- 天候（距離が変わる。キャラごとの癖の代わりに「場」に変化を持たせる）----
  // 画面を見れば分かり、説明が要らず、キャラ間のバランス調整も要らない（2026-08-25 オーナー案）
  var WEATHER = [
    { id: "tsukiyo", name: "月夜", note: "いつも通り", mul: 1.00, color: "#E8E4D8" },
    { id: "oikaze", name: "追い風", note: "伸びすぎる", mul: 1.16, color: "#F0CE7E" },
    { id: "ame", name: "雨", note: "伸びない", mul: 0.86, color: "#5FB4D9" }
  ];
  var WEATHER_EVERY = 8;   // 何段ごとに変わるか

  // 御霊の肩書き（公式MCP list_spirits の tagline）
  var TAGS = {
    anne: "伊賀・木", arujidono: "境を守った一族の生き残り", atoza: "風魔・金", aun: "風魔・土",
    benten: "雑賀・水", dan: "風魔・金", emma: "甲賀・金", hinanojo: "雑賀・火", izuna: "甲賀・金",
    janome: "風魔・木", karma: "風魔・火", karura: "伊賀・水", kohaku: "風魔・火", magoichi: "雑賀・火",
    naruka: "伊賀・木", nekomata: "雑賀・金", nemu: "甲賀・水", oen: "甲賀・土", orochi: "風魔・水",
    oto: "甲賀・土", rotton: "風魔・木", sakuya: "甲賀・火", shiba: "雑賀・水", shinra: "根の国・土",
    shion: "伊賀・木", shiori: "道しるべの御霊", tart: "甲賀・水", torika: "伊賀・木", uka: "甲賀・火",
    xiaolan: "甲賀・土", yui: "伊賀・火"
  };

  // ---- 称号（到達段数）----
  var TITLES = [
    { n: 0, t: "宵の踏み出し" }, { n: 5, t: "石渡り" }, { n: 10, t: "夜歩き" },
    { n: 16, t: "影伝い" }, { n: 22, t: "月見の足" }, { n: 30, t: "宵の名手" },
    { n: 38, t: "闇夜の跳ね手" }, { n: 46, t: "月影を継ぐ者" }, { n: 50, t: "満月渡り" },
    { n: 70, t: "月に届いた者" }
  ];
  function titleFor(n) {
    var t = TITLES[0].t;
    for (var i = 0; i < TITLES.length; i++) if (n >= TITLES[i].n) t = TITLES[i].t;
    return t;
  }

  // ---- 保存（iframe内で例外になる環境があるので必ず try/catch）----
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  var best = parseInt(load("tsukikage_best", "0"), 10) || 0;
  var bestCombo = parseInt(load("tsukikage_best_combo", "0"), 10) || 0;

  // ---- デバッグハッシュ（最初のコミットから仕込む＝既存2作の教訓）----
  var hash = location.hash || "";
  var DBG = {
    autoperfect: hash.indexOf("autoperfect") >= 0,
    automiss: hash.indexOf("automiss") >= 0,
    stat: hash.indexOf("stat") >= 0,
    nofloat: hash.indexOf("nofloat") >= 0
  };
  var statLog = [];

  // ---- 画面の拡縮（dpr対応）----
  function resize() {
    var st = document.getElementById("stage");
    var r = st.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // CSSの高さは stage 側で決まるので、ここでは論理サイズだけ合わせる
    void r;
  }
  window.addEventListener("resize", resize);

  // ---- 背景（遠景・近景。Artifact版は BG_DATA に差し替わる）----
  var bgFar = new Image(), bgNear = new Image();
  bgFar.src = (window.BG_DATA && window.BG_DATA.far) || "assets/art/bg-far.webp";
  bgNear.src = (window.BG_DATA && window.BG_DATA.near) || "assets/art/bg-near.webp";
  function ready(im) { return im.complete && im.naturalWidth > 0; }
  // 背景を横に敷き詰める。1枚おきに左右反転させる（鏡張り）ので、
  // 元画像の左右端が完全に一致していなくても継ぎ目が出ない。
  function tileMirrored(im, scrollX, y, h) {
    var w = im.naturalWidth * (h / im.naturalHeight);
    var period = w * 2;
    var base = -(((scrollX % period) + period) % period);
    for (var x = base - period; x < W + period; x += period) {
      ctx.drawImage(im, x, y, w, h);
      ctx.save();
      ctx.translate(x + w * 2, y); ctx.scale(-1, 1);
      ctx.drawImage(im, 0, 0, w, h);
      ctx.restore();
    }
  }

  // ---- 画像 ----
  var imgs = {}, icons = {}, canons = {}, imgReady = 0;
  IDS.forEach(function (id) {
    var im = new Image();
    im.onload = function () { imgReady++; };
    im.onerror = function () { imgReady++; };
    im.src = CHIBI[id];
    imgs[id] = im;
    if (typeof ICON !== "undefined" && ICON[id]) { var ic = new Image(); ic.src = ICON[id]; icons[id] = ic; }
    if (typeof CANON !== "undefined" && CANON[id]) { var cn = new Image(); cn.src = CANON[id]; canons[id] = cn; }
  });

  // ---- 音（Pages版は別ファイル、Artifact版は AUDIO_DATA に差し替わる）----
  var SE_NAMES = ["start", "count", "zan", "kiwami", "bomb", "fukaku", "whiff", "combo", "end"];
  var actx = null, seBuf = {}, bgmEl = null, muted = false;
  function audioCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function b64ToBuf(b64) {
    var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len);
    for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function loadSE() {
    var a = audioCtx(); if (!a) return;
    SE_NAMES.forEach(function (n) {
      // Artifact版は CSP で fetch(data:) が全滅するため、埋め込みは atob 経由で読む（既存2作の教訓）
      if (window.AUDIO_DATA && window.AUDIO_DATA[n]) {
        a.decodeAudioData(b64ToBuf(window.AUDIO_DATA[n]), function (buf) { seBuf[n] = buf; }, function () { });
        return;
      }
      fetch("assets/audio/" + n + ".m4a").then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { a.decodeAudioData(ab, function (buf) { seBuf[n] = buf; }, function () { }); })
        .catch(function () { });
    });
  }
  function se(name, vol) {
    if (muted) return;
    var a = audioCtx(); if (!a || !seBuf[name]) return;
    try {
      var s = a.createBufferSource(); s.buffer = seBuf[name];
      var g = a.createGain(); g.gain.value = (vol === undefined ? 0.9 : vol);
      s.connect(g); g.connect(a.destination); s.start(0);
    } catch (e) { }
  }
  var bgmSrc = null, bgmGain = null, bgmBuf = null;
  function startBGM() {
    if (muted || bgmEl || bgmSrc) return;
    // Artifact版: 音声ファイルを置けず fetch(data:) も CSP で止まるため、
    // 埋め込みの base64 を atob して WebAudio でループする（既存2作の教訓）。
    if (window.BGM_DATA) {
      var a = audioCtx(); if (!a) return;
      var play = function (buf) {
        try {
          bgmBuf = buf;
          bgmSrc = a.createBufferSource(); bgmSrc.buffer = buf; bgmSrc.loop = true;
          bgmGain = a.createGain(); bgmGain.gain.value = 0.16;  // 声>SE>BGM の順（MEDIA.md）
          bgmSrc.connect(bgmGain); bgmGain.connect(a.destination); bgmSrc.start(0);
        } catch (e) { }
      };
      if (bgmBuf) { play(bgmBuf); return; }
      a.decodeAudioData(b64ToBuf(window.BGM_DATA), play, function () { });
      return;
    }
    try {
      bgmEl = new Audio("assets/audio/bgm.m4a");
      bgmEl.loop = true; bgmEl.volume = 0.16;
      bgmEl.play().catch(function () { });
    } catch (e) { }
  }
  document.addEventListener("visibilitychange", function () {
    // バックグラウンドでは止めて、戻ったら鳴らし直す（電池と「裏で鳴り続ける」対策）
    if (bgmEl) { if (document.hidden) bgmEl.pause(); else bgmEl.play().catch(function () { }); return; }
    if (!bgmGain) return;
    try { bgmGain.gain.value = document.hidden ? 0 : 0.16; } catch (e) { }
  });

  // ---- 台座（式札の飛び石）----
  var GROUND_Y = 430;       // 台座の上面（画面の下1/3に沈まないよう上げた）
  var STAND_X = 110;        // 足元の固定位置（カメラはここに合わせて流れる）
  var state, lockUntil = 0;

  function newState() {
    return {
      phase: "title",       // title | play | fall | result
      fall: null,           // 台座を外したときの落下（外れたことが見えるように落として見せる）
      step: 0,              // 到達段数
      combo: 0, maxCombo: 0,
      charIdx: 0,
      plats: [],            // {x, w}
      camX: 0,
      charging: false, chargeStart: 0, charge: 0,
      jump: null,           // {t, dur, x0, x1, y0, peak, land}
      shake: 0,             // ノーチャージ保護の「震え」
      flash: 0, flashText: "", flashColor: C.moon,
      moonPhase: 0,         // 0..1（最高到達段に応じて満ちる）
      weather: 0, wxT: 0,   // 天候の番号と、切り替え表示の残り
      charX: 0, charOff: 0,  // キャラの位置。charOff は「台座の中心からのずれ」で、
                             // 揺れる台座に乗って一緒に動くために保つ
      overReason: ""
    };
  }

  // 難度は4つの軸に配分する。1つ（幅）だけを削ると、スマホの縦画面では
  // すぐ限界が来て「変化が見えないか、細くなりすぎるか」の二択になる（2026-08-25 実プレイの指摘）。
  //   ①間合いの基準 ②間合いのブレ（主役）③札の幅（下限64で止める）④台座の左右移動
  function gapFor(step) {
    var base = Math.min(96 + step * 2.0, 176);
    var jitter = Math.min(22 + step * 2.0, 70);   // 同じ溜めが通用しないようにする
    return base + Math.random() * jitter;
  }
  function widthFor(step) { return Math.max(116 - step * 1.35, 64); }
  // 会心の許容（**キャラの中心**と石垣の中心の距離・px）。
  // 式札かさねは ±7px（PERFECT_TOL）だったが、あちらは一定速度で動く札を止める＝狙いが「いつ押すか」の1点。
  // こちらは溜めた長さを距離に変換するぶん誤差が乗り、台座も揺れるので、7pxまで締めると運になる。
  // その中間を取る。幅は石垣の上に描き、キャラの中心も足元に印で出す（見えない判定にしない）。
  function perfectWinFor(step) { return Math.max(16 - step * 0.22, 9); }
  // 12段までは静止。以降ゆっくり左右に揺れ、終盤の主役になる
  function driftFor(step) { return step < 12 ? 0 : Math.min((step - 12) * 0.85, 26); }

  function pushPlat(s) {
    var last = s.plats[s.plats.length - 1];
    var n = s.step + s.plats.length;
    var gap = gapFor(n);
    var w = widthFor(n);
    s.plats.push({
      x: last.x + last.w / 2 + gap + w / 2, w: w,
      amp: driftFor(n), ph: Math.random() * Math.PI * 2
    });
  }
  // 台座の実際の位置（左右に揺れるものがある）
  function platX(p) { return p.amp ? p.x + Math.sin(performance.now() / 900 + p.ph) * p.amp : p.x; }

  function reset() {
    var keepBestMoon = state ? state.moonPhase : 0;
    state = newState();
    state.moonPhase = keepBestMoon;
    state.charIdx = 0;
    state.plats = [{ x: STAND_X, w: 130, amp: 0, ph: 0 }];
    for (var i = 0; i < 4; i++) pushPlat(state);
    lockUntil = performance.now() + 700;   // 開始・リトライ直後は入力を止める（既存2作の作法）
    ripples.length = 0; swap.t = 0;
    state.charX = STAND_X; state.charOff = 0; state.camX = 0;
  }

  function currentChar() { return IDS[state.charIdx % IDS.length]; }
  function isHeavy(id) { return !!HEAVY[id]; }

  // ---- 跳ぶ ----
  function release() {
    var s = state;
    if (s.phase !== "play" || !s.charging) return;
    var held = (performance.now() - s.chargeStart) / 1000;
    s.charging = false;

    // ノーチャージ保護: 触れただけでは跳ばない（誤タップ即死を消す）
    if (held < 0.15) { s.shake = 0.35; se("whiff", 0.5); return; }

    var t = Math.min(held, 1.0);
    // 重い御霊は「同じ溜めでは伸びない」（序盤〜中盤で2割ほど短い）が、最大射程は同じにする。
    // 射程そのものを詰めると、終盤の間合いに届かなくなって詰むため（2026-08-25 修正）。
    var dist = (72 + t * 300) * WEATHER[s.weather].mul;
    var cur = s.plats[0], next = s.plats[1];
    var landX = s.charX + dist;   // 台座の中央ではなく、いま立っている場所から跳ぶ
    var dur = 0.34 + Math.min(dist / 900, 0.34);
    var peak = 118 + dist * 0.30;

    s.jump = { t: 0, dur: dur, x0: s.charX, x1: landX, peak: peak, dist: dist, next: next };
    se("zan", 0.8);
    if (DBG.stat) statLog.push({ step: s.step, held: +held.toFixed(3), dist: Math.round(dist), target: Math.round(next.x - cur.x) });
  }

  function land() {
    var s = state, j = s.jump; s.jump = null;
    var next = j.next;
    var d = Math.abs(j.x1 - platX(next));
    var half = next.w / 2;

    if (d > half) {                       // 台座を外した
      var short = j.x1 < platX(next);
      s.overReason = short ? "届かなかった" : "跳びすぎた";
      se(short ? "whiff" : "bomb", 1.0);
      startFall(j.x1, short);             // 即終了せず、画面の下まで落として見せる
      return;
    }
    s.step++;
    // 着いた場所にそのまま立つ（次の間合いが変わる＝考慮要素が増える）。
    // 位置は台座の中心からのずれで持つ。そうしないと、揺れる台座だけが足元を滑ってしまう。
    s.charOff = j.x1 - platX(next);
    s.plats.shift(); pushPlat(s);
    s.charX = platX(s.plats[0]) + s.charOff;
    if (s.step % WEATHER_EVERY === 0) {
      // 同じ天候は続かない。月夜（基準）を重めに引いて、追い風と雨が「出来事」として立つようにする
      var bag = [];
      for (var wi = 0; wi < WEATHER.length; wi++) {
        if (wi === s.weather) continue;
        bag.push(wi); if (wi === 0) bag.push(0);   // 月夜は2枚
      }
      s.weather = bag[Math.floor(Math.random() * bag.length)];
      s.wxT = 1.0; se("count", 0.7);
    }

    var win = perfectWinFor(s.step);
    ripple(j.x1, GROUND_Y + 12, d <= win);
    if (d <= win) {                       // 会心
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      flash("会心", C.moon);
      se("zan", 0.5);
      if (s.combo >= 2) se("combo", Math.min(0.45 + s.combo * 0.06, 0.95));
    } else {
      s.combo = 0;
      se("count", 0.55);
    }
    // 節目（10段ごと）
    if (s.step % 10 === 0) { se("kiwami", 0.9); flash(s.step + "段", C.kindei); }
    // 5段ごとに御霊が交代する（34体を巡回＝素材がそのまま尺になる）
    if (s.step % 5 === 0) { s.charIdx++; showSwap(currentChar()); se("zan", 0.55); }
    // 満月（50段）
    if (s.step === 50) { flash("満月成就", C.moon); se("kiwami", 1.0); }
    s.moonPhase = Math.max(s.moonPhase, Math.min(s.step / 50, 1));
  }

  // 台座を外したときの落下。何が起きたのか見えないまま終わると、
  // 「外れたのかどうか分からない」ままになる（2026-08-25 指摘）。
  function startFall(x, short) {
    var s = state;
    s.phase = "fall";
    s.charX = x;
    s.fall = {
      x: x, y: GROUND_Y,
      vx: short ? -12 : 26,          // 手前に落ちたか、行き過ぎたかで流れる向きが変わる
      vy: -60,                       // つま先が一度かかって、そこから落ちる感じ
      rot: 0, rv: (short ? -1 : 1) * (0.9 + Math.random() * 0.7),
      t: 0
    };
  }
  function updateFall(dt) {
    var s = state, f = s.fall;
    f.t += dt;
    f.vy += 1500 * dt;               // 重力
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.rv * dt;
    if (f.t > 0.28 && f.t < 0.34) se("fukaku", 0.85);
    if (f.y > H + 160) { s.fall = null; gameOver(); }
  }

  function flash(text, color) { state.flash = 1.0; state.flashText = text; state.flashColor = color; }

  // 着地の波紋（会心は金・通常は淡く）
  var ripples = [];
  function ripple(x, y, strong) { ripples.push({ x: x, y: y, t: 0, strong: !!strong }); }
  function drawRipples(dt, camX) {
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i]; r.t += dt * (r.strong ? 2.2 : 3.2);
      if (r.t >= 1) { ripples.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = (1 - r.t) * (r.strong ? 0.85 : 0.4);
      ctx.strokeStyle = r.strong ? C.moon : C.inkDim;
      ctx.lineWidth = r.strong ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.ellipse(r.x - camX, r.y, 18 + r.t * (r.strong ? 78 : 46), 5 + r.t * (r.strong ? 22 : 13), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 御霊の交代を見せる（顔アイコン＋名前＋重い/軽い）
  var swap = { t: 0, id: null };
  function showSwap(id) { swap.t = 1.0; swap.id = id; }
  // 御霊の交代カットイン。御霊おとしの咲耶カットインと同じ流儀で、
  // 帯の上をシャキンと左から入り、真ん中で一瞬止まり、右へ抜ける。
  // 帯と絵は石垣より「後ろ」に描く（手前だと次の石垣と会心の帯が隠れて遊びの邪魔になる）。
  var SWAP_SEC = 1.5;
  function drawSwap(dt, layer) {
    if (swap.t <= 0) return;
    if (layer === 1) swap.t = Math.max(0, swap.t - dt / SWAP_SEC);
    var id = swap.id;
    var p = 1 - swap.t;                      // 0→1
    var art = canons[id] || icons[id];

    // 帯: 開く → 保つ → 閉じる
    var band = p < 0.10 ? p / 0.10 : (p > 0.86 ? Math.max(0, (1 - p) / 0.14) : 1);
    band = Math.min(1, band);
    var bandH = 300 * (0.35 + 0.65 * band);
    var by = GROUND_Y - 40 - bandH;

    // 絵の位置: 左から入る → 中央で止まる → 右へ抜ける
    var ax01;
    if (p < 0.13) { var e = p / 0.13; ax01 = -0.5 + 0.5 * (1 - Math.pow(1 - e, 3)); }
    else if (p < 0.56) { ax01 = 0 + (p - 0.13) * 0.06; }
    else if (p < 0.82) { var e2 = (p - 0.56) / 0.26; ax01 = 0 + Math.pow(e2, 2.2) * 1.35; }
    else ax01 = 1.35;

    if (layer === 0) {
      ctx.save();
      // 帯（宵闇の帯に金の細線。絵を宵闇から起こす）
      ctx.globalAlpha = 0.95 * band;
      var bg = ctx.createLinearGradient(0, by, 0, by + bandH);
      bg.addColorStop(0, "rgba(10,10,20,.15)");
      bg.addColorStop(0.5, "rgba(10,10,20,.72)");
      bg.addColorStop(1, "rgba(10,10,20,.15)");
      ctx.fillStyle = bg; ctx.fillRect(0, by, W, bandH);
      ctx.strokeStyle = "rgba(240,206,126,.55)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, by + 1); ctx.lineTo(W, by + 1);
      ctx.moveTo(0, by + bandH - 1); ctx.lineTo(W, by + bandH - 1); ctx.stroke();
      // 帯を横切る光
      var sweep = ctx.createLinearGradient(W * (ax01 + 0.1) - 120, 0, W * (ax01 + 0.1) + 120, 0);
      sweep.addColorStop(0, "rgba(240,206,126,0)");
      sweep.addColorStop(0.5, "rgba(240,206,126,.10)");
      sweep.addColorStop(1, "rgba(240,206,126,0)");
      ctx.fillStyle = sweep; ctx.fillRect(0, by, W, bandH);

      // 立ち絵（無い御霊は顔アイコンで代える）
      if (art && art.complete && art.naturalWidth) {
        var ah = bandH * 0.94, aw = ah * (art.naturalWidth / art.naturalHeight);
        var cxA = W * 0.5 + ax01 * (W * 0.78 + aw * 0.6);
        ctx.globalAlpha = band;
        ctx.drawImage(art, cxA - aw / 2, by + bandH - ah - 6, aw, ah);
      }
      ctx.restore();
      return;
    }

    // 名前と肩書き（手前の層。帯の左に置いて、絵が抜けても残る）
    ctx.save();
    ctx.globalAlpha = band;
    var tx = 26 + (p < 0.13 ? (1 - p / 0.13) * -30 : 0);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgba(240,206,126,.75)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx - 10, by + 26); ctx.lineTo(tx - 10, by + 90); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.font = "800 30px 'Shippori Mincho B1',serif";
    ctx.fillText(NAMES[id] || id, tx, by + 58);
    ctx.fillStyle = C.kindei; ctx.font = "600 15px 'Shippori Mincho B1',serif";
    ctx.fillText(TAGS[id] || "", tx, by + 82);
    ctx.restore();
  }

  function gameOver() {
    var s = state;
    s.phase = "result";
    if (s.step > best) { best = s.step; save("tsukikage_best", String(best)); s.newBest = true; }
    if (s.maxCombo > bestCombo) { bestCombo = s.maxCombo; save("tsukikage_best_combo", String(bestCombo)); }
    se("end", 0.8);
    lockUntil = performance.now() + 700;
    if (DBG.stat) console.log("[stat]", JSON.stringify(statLog));
  }

  // ---- 入力 ----
  function down(e) {
    if (e.cancelable) e.preventDefault();
    var now = performance.now();
    if (now < lockUntil) return;
    audioCtx();
    var s = state;
    // reset() は state を作り直すので、phase は必ず新しい state 側に立てる（古い s に書くと始まらない）
    if (s.phase === "title") { reset(); state.phase = "play"; se("start", 0.9); startBGM(); return; }
    if (s.phase === "result") { reset(); state.phase = "play"; se("start", 0.9); return; }
    if (s.phase === "play" && !s.jump) { s.charging = true; s.chargeStart = now; }
  }
  function up(e) {
    if (e.cancelable) e.preventDefault();
    release();
  }
  cv.addEventListener("pointerdown", down);
  window.addEventListener("pointerup", up);
  window.addEventListener("keydown", function (e) { if (e.code === "Space" && !e.repeat) down(e); });
  window.addEventListener("keyup", function (e) { if (e.code === "Space") up(e); });
  // iOS: ピンチ・ダブルタップズームを止める
  ["gesturestart", "gesturechange", "gestureend"].forEach(function (n) {
    document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); }, { passive: false });

  // ---- 描画 ----
  function drawBg(s) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0e0e19"); g.addColorStop(0.55, C.night); g.addColorStop(1, C.night2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 遠景（ゆっくり流れる）。帯の上下は地色でぼかして、切れ目を出さない
    if (ready(bgFar)) {
      var fh = 340, fy = GROUND_Y - 292;
      ctx.save(); ctx.globalAlpha = 0.92;
      tileMirrored(bgFar, s.camX * 0.18, fy, fh);
      ctx.restore();
      var fadeTop = ctx.createLinearGradient(0, fy, 0, fy + 110);
      fadeTop.addColorStop(0, "rgba(19,19,32,1)"); fadeTop.addColorStop(1, "rgba(19,19,32,0)");
      ctx.fillStyle = fadeTop; ctx.fillRect(0, fy, W, 110);
      var fadeBot = ctx.createLinearGradient(0, fy + fh - 90, 0, fy + fh);
      fadeBot.addColorStop(0, "rgba(19,19,32,0)"); fadeBot.addColorStop(1, "rgba(22,21,38,.96)");
      ctx.fillStyle = fadeBot; ctx.fillRect(0, fy + fh - 90, W, 90);
    }

    // 雲海（札の下の空白を埋め、浮いている高さを感じさせる）
    ctx.save();
    var sea = ctx.createLinearGradient(0, GROUND_Y + 40, 0, H);
    sea.addColorStop(0, "rgba(30,28,52,0)");
    sea.addColorStop(0.45, "rgba(32,30,56,.55)");
    sea.addColorStop(1, "rgba(18,17,34,.92)");
    ctx.fillStyle = sea; ctx.fillRect(0, GROUND_Y + 40, W, H - GROUND_Y - 40);
    ctx.globalAlpha = 0.5;
    for (var ci = 0; ci < 5; ci++) {
      var cw = 200 + ci * 46, cyy = GROUND_Y + 120 + ci * 52;
      var cxx = ((ci * 173 - s.camX * (0.12 + ci * 0.03)) % (W + cw * 2)) - cw;
      var cg = ctx.createRadialGradient(cxx, cyy, 6, cxx, cyy, cw);
      cg.addColorStop(0, "rgba(142,107,158,.16)"); cg.addColorStop(1, "rgba(142,107,158,0)");
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.ellipse(cxx, cyy, cw, 34, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 星
    ctx.fillStyle = "rgba(232,228,216,.5)";
    for (var i = 0; i < 42; i++) {
      var x = (i * 97 % W), y = (i * 53 % 320) + 20;
      var r = (i % 3 === 0) ? 1.4 : 0.9;
      ctx.globalAlpha = 0.25 + (i % 5) * 0.12;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 月（最高到達段に応じて満ちる）
    var mx = 360, my = 118, mr = 46;
    ctx.save();
    var glow = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2);
    glow.addColorStop(0, "rgba(240,206,126,.22)"); glow.addColorStop(1, "rgba(240,206,126,0)");
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(mx, my, mr * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2438";
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = C.moon;
    // 影の円を右から抜いていく（phase=0で新月、1で満月）
    var cut = mx + mr * 2 * (1 - s.moonPhase);
    ctx.beginPath(); ctx.arc(cut, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();

    // 近景（手前を速く流す）。上端はぼかして、帯に見えないようにする
    if (ready(bgNear)) {
      var nh = 250, ny = H - nh;
      ctx.save(); ctx.globalAlpha = 0.8;
      tileMirrored(bgNear, s.camX * 0.42, ny, nh);
      ctx.restore();
      var nfade = ctx.createLinearGradient(0, ny, 0, ny + 90);
      nfade.addColorStop(0, "rgba(19,19,32,.9)"); nfade.addColorStop(1, "rgba(19,19,32,0)");
      ctx.fillStyle = nfade; ctx.fillRect(0, ny, W, 90);
    }
  }

  // 天候の粒（雨は斜めの筋、追い風は横に流れる線と花びら）
  function drawWeatherFx(s, dt) {
    var w = WEATHER[s.weather];
    if (w.id === "tsukiyo") return;
    var t = performance.now() / 1000;
    ctx.save();
    if (w.id === "ame") {
      ctx.strokeStyle = "rgba(95,180,217,.28)"; ctx.lineWidth = 1.1;
      for (var i = 0; i < 46; i++) {
        var x = (i * 113 + (t * 620) % 97) % (W + 60) - 30;
        var y = (i * 71 + t * 900) % (H + 80) - 40;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 22); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "rgba(240,206,126,.20)"; ctx.lineWidth = 1.2;
      for (var j = 0; j < 16; j++) {
        var wy = (j * 47 + Math.sin(t * 0.7 + j) * 12) % H;
        var wx = ((t * 420 + j * 137) % (W + 220)) - 110;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 46, wy - 4); ctx.stroke();
      }
      ctx.fillStyle = "rgba(142,107,158,.35)";
      for (var k = 0; k < 10; k++) {
        var px2 = ((t * 260 + k * 211) % (W + 80)) - 40;
        var py2 = (k * 83 + Math.sin(t * 1.3 + k) * 26) % H;
        ctx.beginPath(); ctx.ellipse(px2, py2, 3.2, 2, t + k, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPlat(p, camX, win) {
    var x = platX(p) - camX, y = GROUND_Y;
    var w = p.w, h = 38;
    ctx.save();

    // 宙に浮く足場。下に淡い金の残光を落として「浮いている」ことを見せる
    var glow = ctx.createRadialGradient(x, y + h, 2, x, y + h, w * 0.9);
    glow.addColorStop(0, "rgba(240,206,126,.14)"); glow.addColorStop(1, "rgba(240,206,126,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.ellipse(x, y + h + 8, w * 0.9, 16, 0, 0, Math.PI * 2); ctx.fill();

    // 石垣を切り出した足場（上面＋積んだ石。忍者の里の石垣の意匠）
    var L = x - w / 2, R = x + w / 2;
    // 上面（苔むした石の面）
    var top = ctx.createLinearGradient(0, y - 4, 0, y + 9);
    top.addColorStop(0, "#6E6E86"); top.addColorStop(1, "#4A4A62");
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.lineTo(R - 3, y + 9); ctx.lineTo(L + 3, y + 9); ctx.closePath(); ctx.fill();

    // 石の段（2段。1段目と2段目で継ぎ目をずらす＝布積み）
    var rows = [{ y0: y + 9, y1: y + 24, inset: 3, shift: 0 }, { y0: y + 24, y1: y + h, inset: 8, shift: 0.5 }];
    for (var r = 0; r < rows.length; r++) {
      var ro = rows[r];
      var n = Math.max(2, Math.round(w / 30));
      var bw = (w - ro.inset * 2) / n;
      for (var i = 0; i < n; i++) {
        var bx = L + ro.inset + bw * i + (ro.shift ? bw * ro.shift : 0);
        if (bx + bw > R - ro.inset + 1) continue;
        var g = ctx.createLinearGradient(0, ro.y0, 0, ro.y1);
        // 石は月明かりを受ける面なので、地の宵闇よりはっきり明るくする（暗いと意匠が読めない）
        var tone = 52 + ((i * 9 + r * 17) % 18);
        g.addColorStop(0, "rgb(" + (tone + 26) + "," + (tone + 25) + "," + (tone + 40) + ")");
        g.addColorStop(1, "rgb(" + (tone - 12) + "," + (tone - 12) + "," + (tone + 2) + ")");
        ctx.fillStyle = g;
        ctx.fillStyle = g;
        ctx.fillRect(bx + 1.2, ro.y0 + 1.2, bw - 2.4, ro.y1 - ro.y0 - 2.4);
        // 石の上端に月明かりの反射
        ctx.strokeStyle = "rgba(232,228,216,.22)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx + 1.6, ro.y0 + 1.4); ctx.lineTo(bx + bw - 2.4, ro.y0 + 1.4); ctx.stroke();
      }
    }

    // 縁の金
    ctx.strokeStyle = "rgba(240,206,126,.5)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();

    // 会心の範囲（ここに乗れば会心。判定は見えていないと不公平になるので描く）
    if (win) {
      var wl = Math.max(L + 1, x - win), wr = Math.min(R - 1, x + win);
      var zone = ctx.createLinearGradient(0, y, 0, y + 9);
      zone.addColorStop(0, "rgba(240,206,126,.42)"); zone.addColorStop(1, "rgba(240,206,126,.10)");
      ctx.fillStyle = zone;
      ctx.beginPath(); ctx.moveTo(wl, y); ctx.lineTo(wr, y); ctx.lineTo(wr - 1.5, y + 9); ctx.lineTo(wl + 1.5, y + 9); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(240,206,126,.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(wl, y - 1); ctx.lineTo(wl, y + 9); ctx.moveTo(wr, y - 1); ctx.lineTo(wr, y + 9); ctx.stroke();
    }
    // 中央の印
    ctx.strokeStyle = "rgba(240,206,126,.9)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 9); ctx.stroke();
    ctx.restore();
  }

  function drawChar(s, x, y, scale) {
    var id = currentChar();
    var im = imgs[id];
    var hgt = 108 * (scale || 1);
    if (im && im.complete && im.naturalWidth) {
      var w = hgt * (im.naturalWidth / im.naturalHeight);
      // 影
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      var sh = Math.max(0.25, 1 - (GROUND_Y - y) / 260);
      ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 3, w * 0.32 * sh, 4 * sh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.drawImage(im, x - w / 2, y - hgt, w, hgt);
      // 中心の印。会心は「体が帯に重なるか」ではなく「中心が帯に入るか」で決まるため、
      // 見比べる点をはっきり出す（2026-08-25 指摘）
      if (Math.abs(y - GROUND_Y) < 0.5) {
        ctx.save();
        ctx.fillStyle = "rgba(240,206,126,.95)";
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 1); ctx.lineTo(x - 4.5, GROUND_Y - 9); ctx.lineTo(x + 4.5, GROUND_Y - 9);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.fillStyle = C.ink; ctx.fillRect(x - 12, y - hgt, 24, hgt);
    }
  }

  function drawFallingChar(s) {
    var f = s.fall, id = currentChar(), im = imgs[id];
    if (!im || !im.complete || !im.naturalWidth) return;
    var hgt = 108, w = hgt * (im.naturalWidth / im.naturalHeight);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (f.y - H * 0.6) / (H * 0.55)));
    ctx.translate(f.x - s.camX, f.y - hgt / 2);
    ctx.rotate(f.rot);
    ctx.drawImage(im, -w / 2, -hgt / 2, w, hgt);
    ctx.restore();
  }

  function drawChargeRing(s, x) {
    if (!s.charging) return;
    var held = Math.min((performance.now() - s.chargeStart) / 1000, 1.0);
    ctx.save();
    ctx.translate(x, GROUND_Y - 6);
    ctx.strokeStyle = "rgba(240,206,126,.25)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = WEATHER[s.weather].color; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * held); ctx.stroke();
    ctx.restore();
  }

  function drawHud(s) {
    var w = WEATHER[s.weather];
    ctx.save();

    // 上部の帯（天候をここで見せる。地の絵と文字がぶつからないよう薄く敷く）
    var band = ctx.createLinearGradient(0, 0, 0, 108);
    band.addColorStop(0, "rgba(12,12,22,.72)"); band.addColorStop(1, "rgba(12,12,22,0)");
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 108);

    ctx.textAlign = "left";
    ctx.fillStyle = C.ink; ctx.font = "700 32px 'Shippori Mincho B1',serif";
    ctx.fillText(s.step + "段", 22, 54);
    ctx.font = "600 15px 'Shippori Mincho B1',serif"; ctx.fillStyle = C.inkDim;
    ctx.fillText("最高 " + best + "段", 22, 78);

    // 天候（名前・効き・目安のバー）
    ctx.textAlign = "right";
    ctx.fillStyle = w.color; ctx.font = "700 24px 'Shippori Mincho B1',serif";
    ctx.fillText(w.name, W - 22, 50);
    ctx.fillStyle = C.inkDim; ctx.font = "600 14px 'Shippori Mincho B1',serif";
    ctx.fillText(w.note, W - 22, 72);
    // 距離の伸び縮みを目盛りで示す（真ん中が基準）
    var bx = W - 118, by = 84, bw2 = 96;
    ctx.strokeStyle = "rgba(232,228,216,.22)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw2, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + bw2 / 2, by - 4); ctx.lineTo(bx + bw2 / 2, by + 4); ctx.stroke();
    var mark = bx + bw2 / 2 + (w.mul - 1) * bw2 * 2.2;
    ctx.fillStyle = w.color;
    ctx.beginPath(); ctx.arc(Math.max(bx, Math.min(mark, bx + bw2)), by, 4, 0, Math.PI * 2); ctx.fill();

    if (s.combo >= 2) {
      ctx.textAlign = "center";
      ctx.fillStyle = C.moon; ctx.font = "700 20px 'Shippori Mincho B1',serif";
      ctx.fillText("会心 " + s.combo + "連", W / 2, 50);
    }
    ctx.restore();
  }

  // 天候が変わった瞬間だけ、画面中央に短く出す（遊びは止めない）
  function drawWeatherSwap(s, dt) {
    if (s.wxT <= 0) return;
    s.wxT = Math.max(0, s.wxT - dt * 0.9);
    var w = WEATHER[s.weather];
    ctx.save();
    ctx.globalAlpha = Math.min(s.wxT * 2.2, 1) * 0.95;
    ctx.textAlign = "center";
    ctx.fillStyle = w.color; ctx.font = "800 40px 'Shippori Mincho B1',serif";
    ctx.fillText(w.name, W / 2, 168);
    ctx.fillStyle = C.ink; ctx.font = "600 17px 'Shippori Mincho B1',serif";
    ctx.fillText(w.note, W / 2, 196);
    ctx.restore();
  }

  function drawFlash(s, dt) {
    if (s.flash <= 0) return;
    s.flash = Math.max(0, s.flash - dt * 1.6);
    ctx.save();
    ctx.globalAlpha = Math.min(s.flash, 1);
    ctx.textAlign = "center";
    ctx.fillStyle = s.flashColor;
    ctx.font = "800 34px 'Shippori Mincho B1',serif";
    ctx.fillText(s.flashText, W / 2, GROUND_Y + 104 - (1 - s.flash) * 20);
    ctx.restore();
  }

  function drawTitle() {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = C.moon; ctx.font = "800 52px 'Shippori Mincho B1',serif";
    ctx.fillText("月影とび", W / 2, 268);
    ctx.fillStyle = C.ink; ctx.font = "600 17px 'Shippori Mincho B1',serif";
    ctx.fillText("長押しで力を溜め、離して跳ぶ", W / 2, 312);
    ctx.fillStyle = C.inkDim; ctx.font = "600 15px 'Shippori Mincho B1',serif";
    ctx.fillText("式札の道を、月まで", W / 2, 338);
    if (best > 0) { ctx.fillStyle = C.kindei; ctx.fillText("これまでの誉れ　" + best + "段・" + titleFor(best), W / 2, 372); }
    ctx.fillStyle = C.ink; ctx.font = "700 18px 'Shippori Mincho B1',serif";
    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 380) * 0.35;
    ctx.fillText("画面を長押し", W / 2, 610);
    ctx.restore();
  }

  function drawResult(s) {
    ctx.save();
    ctx.fillStyle = "rgba(10,10,20,.72)"; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.fillStyle = C.inkDim; ctx.font = "600 16px 'Shippori Mincho B1',serif";
    ctx.fillText(s.overReason, W / 2, 214);
    ctx.fillStyle = C.moon; ctx.font = "800 60px 'Shippori Mincho B1',serif";
    ctx.fillText(s.step + "段", W / 2, 286);
    ctx.fillStyle = C.ink; ctx.font = "700 24px 'Shippori Mincho B1',serif";
    ctx.fillText(titleFor(s.step), W / 2, 326);
    ctx.fillStyle = C.inkDim; ctx.font = "600 16px 'Shippori Mincho B1',serif";
    ctx.fillText("会心 " + s.maxCombo + "連　／　最高 " + best + "段", W / 2, 360);
    if (s.newBest) { ctx.fillStyle = C.kindei; ctx.font = "700 20px 'Shippori Mincho B1',serif"; ctx.fillText("自己最高を更新", W / 2, 396); }
    ctx.fillStyle = C.ink; ctx.font = "700 18px 'Shippori Mincho B1',serif";
    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 380) * 0.35;
    ctx.fillText("もう一夜", W / 2, 600);
    ctx.restore();
  }

  // ---- 自動プレイ（検証用）----
  function autoTick(s) {
    if (s.phase === "title" || s.phase === "result") {
      if (performance.now() >= lockUntil) down({ preventDefault: function () { }, cancelable: false });
      return;
    }
    if (s.phase !== "play" || s.jump) return;
    if (!s.charging) { s.charging = true; s.chargeStart = performance.now(); return; }
    var cur = s.plats[0], next = s.plats[1];
    var want = platX(next) - s.charX;
    if (DBG.automiss) want *= 1.6;                       // わざと跳びすぎる
    var t = Math.max(0, Math.min((want / WEATHER[s.weather].mul - 72) / 300, 1));
    var held = Math.max(0.16, Math.min(t, 1.0));
    if ((performance.now() - s.chargeStart) / 1000 >= held) release();
  }

  // ---- ループ ----
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    var s = state;

    if (DBG.autoperfect || DBG.automiss) autoTick(s);

    // カメラは「キャラが STAND_X に来る位置」を目指すが、**跳んでいる間は動かさない**。
    // 弧とカメラの移動が混ざると、右へ跳んでいるのに一度左へ流れて見える（2026-08-25 指摘）。
    // 揺れる台座に乗って一緒に動く（跳んでいる間と落下中は除く）
    if (s.phase === "play" && !s.jump && s.plats.length) {
      s.charX = platX(s.plats[0]) + s.charOff;
    }

    // 落下中は原則カメラを止める（追いかけると「どこで外したのか」が画面から消える）。
    // ただし大きく跳びすぎて画面の外に落ちる場合だけ、見える位置まで寄せる。
    if (s.phase === "fall" && s.fall) {
      var onScreen = s.fall.x - s.camX;
      if (onScreen > W - 70) s.camX += (onScreen - (W - 70)) * Math.min(dt * 6, 1);
      else if (onScreen < 40) s.camX += (onScreen - 40) * Math.min(dt * 6, 1);
    } else if (!s.jump) {
      var targetCam = s.charX - STAND_X;
      s.camX += (targetCam - s.camX) * Math.min(dt * 14, 1);
    }

    drawBg(s);
    drawSwap(dt, 0);
    for (var i = 0; i < s.plats.length; i++) drawPlat(s.plats[i], s.camX, i === 0 ? 0 : perfectWinFor(s.step + i));

    var px = s.charX - s.camX, py = GROUND_Y;
    if (s.phase === "fall" && s.fall) {
      updateFall(dt);
      if (s.fall) drawFallingChar(s);
    } else if (s.jump) {
      s.jump.t += dt;
      var k = Math.min(s.jump.t / s.jump.dur, 1);
      var x = s.jump.x0 + (s.jump.x1 - s.jump.x0) * k;
      var y = GROUND_Y - Math.sin(Math.PI * k) * s.jump.peak;
      drawChar(s, x - s.camX, y, 1);
      if (k >= 1) land();
    } else {
      var shake = 0;
      if (s.shake > 0) { s.shake = Math.max(0, s.shake - dt * 2.2); shake = Math.sin(now / 24) * s.shake * 6; }
      drawChar(s, px + shake, py, 1);
      drawChargeRing(s, px + shake);
    }

    drawRipples(dt, s.camX);
    if (s.phase === "play" || s.phase === "fall") drawWeatherFx(s, dt);
    if (s.phase === "play" || s.phase === "fall") drawHud(s);
    drawSwap(dt, 1);
    if (s.phase === "play") drawWeatherSwap(s, dt);
    drawFlash(s, dt);
    if (s.phase === "title") drawTitle();
    if (s.phase === "result") drawResult(s);

    // 撮影用に浮き文字を消す
    if (DBG.nofloat && s.phase === "play") { /* HUDのみ残す */ }

    requestAnimationFrame(frame);
  }

  // ---- 起動 ----
  resize();
  reset();
  state.phase = "title";
  loadSE();
  requestAnimationFrame(frame);

  // 検証用に外へ出す
  window.__tsukikage = { get state() { return state; }, get best() { return best; }, get swap() { return swap; }, stat: function () { return statLog; } };
})();
