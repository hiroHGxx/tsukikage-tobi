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
  var IDS = Object.keys(CHIBI);
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

  // ---- 画像 ----
  var imgs = {}, imgReady = 0;
  IDS.forEach(function (id) {
    var im = new Image();
    im.onload = function () { imgReady++; };
    im.onerror = function () { imgReady++; };
    im.src = CHIBI[id];
    imgs[id] = im;
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
  function startBGM() {
    if (bgmEl || muted) return;
    try {
      bgmEl = new Audio(window.BGM_SRC || "assets/audio/bgm.m4a");
      bgmEl.loop = true; bgmEl.volume = 0.16;   // 声>SE>BGM の順（MEDIA.md）
      bgmEl.play().catch(function () { });
    } catch (e) { }
  }
  document.addEventListener("visibilitychange", function () {
    if (!bgmEl) return;
    if (document.hidden) bgmEl.pause(); else bgmEl.play().catch(function () { });
  });

  // ---- 台座（式札の飛び石）----
  var GROUND_Y = 520;       // 台座の上面
  var STAND_X = 130;        // 足元の固定位置（カメラはここに合わせて流れる）
  var state, lockUntil = 0;

  function newState() {
    return {
      phase: "title",       // title | play | fall | result
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
      overReason: ""
    };
  }

  // 段が進むほど「間が広く・幅が狭く」なる。会心の窓も少しずつ狭まるが、下限は切らない。
  // 次の飛び石は必ず画面内に収まること（STAND_X=130 + 最大gap + 幅/2 < 480）
  function gapFor(step) { return Math.min(96 + step * 2.6, 214) + Math.random() * Math.min(18 + step * 1.2, 52); }
  function widthFor(step) { return Math.max(112 - step * 2.1, 46); }
  function perfectWinFor(step) { return Math.max(26 - step * 0.32, 12); }

  function pushPlat(s) {
    var last = s.plats[s.plats.length - 1];
    var gap = gapFor(s.step + s.plats.length);
    var w = widthFor(s.step + s.plats.length);
    s.plats.push({ x: last.x + last.w / 2 + gap + w / 2, w: w });
  }

  function reset() {
    var keepBestMoon = state ? state.moonPhase : 0;
    state = newState();
    state.moonPhase = keepBestMoon;
    state.charIdx = 0;
    state.plats = [{ x: STAND_X, w: 130 }];
    for (var i = 0; i < 4; i++) pushPlat(state);
    lockUntil = performance.now() + 700;   // 開始・リトライ直後は入力を止める（既存2作の作法）
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
    var heavy = isHeavy(currentChar());
    // 重い御霊は同じ溜めでも伸びにくく、弧が低い
    var dist = (72 + t * (heavy ? 268 : 296)) * (heavy ? 0.96 : 1.0);
    var cur = s.plats[0], next = s.plats[1];
    var landX = cur.x + dist;
    var dur = 0.34 + Math.min(dist / 900, 0.34);
    var peak = (heavy ? 88 : 130) + dist * (heavy ? 0.18 : 0.28);

    s.jump = { t: 0, dur: dur, x0: cur.x, x1: landX, peak: peak, dist: dist, next: next };
    se("zan", 0.8);
    if (DBG.stat) statLog.push({ step: s.step, held: +held.toFixed(3), dist: Math.round(dist), target: Math.round(next.x - cur.x) });
  }

  function land() {
    var s = state, j = s.jump; s.jump = null;
    var next = j.next;
    var d = Math.abs(j.x1 - next.x);
    var half = next.w / 2;

    if (d > half) {                       // 台座を外した
      s.overReason = (j.x1 < next.x) ? "届かなかった" : "跳びすぎた";
      se(j.x1 < next.x ? "whiff" : "bomb", 1.0);
      gameOver();
      return;
    }
    s.step++;
    s.plats.shift(); pushPlat(s);

    var win = perfectWinFor(s.step);
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
    if (s.step % 5 === 0) { s.charIdx++; }
    // 満月（50段）
    if (s.step === 50) { flash("満月成就", C.moon); se("kiwami", 1.0); }
    s.moonPhase = Math.max(s.moonPhase, Math.min(s.step / 50, 1));
  }

  function flash(text, color) { state.flash = 1.0; state.flashText = text; state.flashColor = color; }

  function gameOver() {
    var s = state;
    s.phase = "result";
    if (s.step > best) { best = s.step; save("tsukikage_best", String(best)); s.newBest = true; }
    if (s.maxCombo > bestCombo) { bestCombo = s.maxCombo; save("tsukikage_best_combo", String(bestCombo)); }
    se("fukaku", 0.9);
    setTimeout(function () { se("end", 0.8); }, 260);
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
  }

  function drawPlat(p, camX) {
    var x = p.x - camX, y = GROUND_Y;
    var w = p.w, h = 16;
    ctx.save();
    // 式札に見立てた台座（角を落とした短冊）
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 6, y); ctx.lineTo(x + w / 2 - 6, y);
    ctx.lineTo(x + w / 2, y + h); ctx.lineTo(x - w / 2, y + h); ctx.closePath();
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#232338"); g.addColorStop(1, "#15151f");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(240,206,126,.55)"; ctx.lineWidth = 1.2; ctx.stroke();
    // 中央の印（会心の目安）
    ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + h - 3);
    ctx.strokeStyle = "rgba(240,206,126,.35)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  function drawChar(s, x, y, scale) {
    var id = currentChar();
    var im = imgs[id];
    var hgt = 78 * (scale || 1);
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
    } else {
      ctx.fillStyle = C.ink; ctx.fillRect(x - 12, y - hgt, 24, hgt);
    }
  }

  function drawChargeRing(s, x) {
    if (!s.charging) return;
    var held = Math.min((performance.now() - s.chargeStart) / 1000, 1.0);
    ctx.save();
    ctx.translate(x, GROUND_Y - 6);
    ctx.strokeStyle = "rgba(240,206,126,.25)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.moon; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * held); ctx.stroke();
    ctx.restore();
  }

  function drawHud(s) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillStyle = C.ink; ctx.font = "700 30px 'Shippori Mincho B1',serif";
    ctx.fillText(s.step + "段", 22, 56);
    ctx.font = "600 15px 'Shippori Mincho B1',serif"; ctx.fillStyle = C.inkDim;
    ctx.fillText("最高 " + best + "段", 22, 80);
    if (s.combo >= 2) {
      ctx.textAlign = "right";
      ctx.fillStyle = C.moon; ctx.font = "700 22px 'Shippori Mincho B1',serif";
      ctx.fillText("会心 " + s.combo + "連", W - 22, 56);
    }
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
    ctx.fillText(s.flashText, W / 2, 300 - (1 - s.flash) * 26);
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
    var want = next.x - cur.x;
    if (DBG.automiss) want *= 1.6;                       // わざと跳びすぎる
    var heavy = isHeavy(currentChar());
    var t = (want / (heavy ? 0.96 : 1.0) - 72) / (heavy ? 268 : 296);
    var held = Math.max(0.16, Math.min(t, 1.0));
    if ((performance.now() - s.chargeStart) / 1000 >= held) release();
  }

  // ---- ループ ----
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    var s = state;

    if (DBG.autoperfect || DBG.automiss) autoTick(s);

    // カメラは足元の台座が STAND_X に来るように追う
    var targetCam = s.plats[0].x - STAND_X;
    s.camX += (targetCam - s.camX) * Math.min(dt * 13, 1);

    drawBg(s);
    for (var i = 0; i < s.plats.length; i++) drawPlat(s.plats[i], s.camX);

    var px = s.plats[0].x - s.camX, py = GROUND_Y;
    if (s.jump) {
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

    if (s.phase === "play") drawHud(s);
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
  window.__tsukikage = { get state() { return state; }, get best() { return best; }, stat: function () { return statLog; } };
})();
