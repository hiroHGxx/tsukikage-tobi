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
  var WEATHER_EVERY = 8;   // 天候が変わる段数
  // 御霊が交代する段数。30体を5段ごとだと全員に会うのに150段かかり、
  // 20〜30段で終わる遊びでは大半の御霊が一度も出ない（2026-08-25 指摘）
  var SWAP_EVERY = 4;

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
  // **栞のボイスと1対1で対応させる**（docs/VOICE.md の r0〜r4）。
  // 画面に出る称号と、読み上げる称号がずれていると気持ちが悪いため、段の区切りも声に合わせた。
  var TITLES = [
    { n: 0, t: "宵の踏み出し" },    // 声 r0「まだ一ページ目、ですこと」
    { n: 10, t: "夜歩き" },         // 声 r1「よあるき、ですこと」
    { n: 22, t: "月見の足" },       // 声 r2「つきみの足、ですこと」
    { n: 38, t: "闇夜の跳ね手" },   // 声 r3「やみよの跳ね手、ですこと」
    { n: 50, t: "満月渡り" }        // 声 r4「まんげつわたり」／r5（満月を越えて落ちたとき）
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
  var bootAt = performance.now();   // #autowobble: 外部の録画ツールがCDPスクリーンキャストを
                                     // 繋ぎ終えるまで開幕を待つための起点（式札かさねの600ms待ちと同じ考え方）
  var hash = location.hash || "";
  var DBG = {
    autoperfect: hash.indexOf("autoperfect") >= 0,
    automiss: hash.indexOf("automiss") >= 0,
    stat: hash.indexOf("stat") >= 0,
    nofloat: hash.indexOf("nofloat") >= 0,
    autoskip: hash.indexOf("autoskip") >= 0,  // わざと台座を飛ばして狙う（飛ばしの確認用）
    autowobble: hash.indexOf("autowobble") >= 0,  // 本番ルールのまま少し崩す（PV/動画撮影用）
    wx: (hash.match(/wx(\d)/) || [])[1]        // 天候を固定する（0=月夜 1=追い風 2=雨）
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
  var titleArt = (window.BG_DATA && window.BG_DATA.title) || "assets/art/title.webp";
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
  // 鳴らす効果音の一覧。**ここが正本**で、読み込みも Artifact 版の埋め込み
  // （scripts/build-artifact.js）も、この配列を見る。手で二重管理しない
  // （リストのずれで Artifact だけ無音になった 2026-08-26 の事故の再発防止）。
  var SE_NAMES = ["zan", "combo", "kiwami", "fukaku", "whiff", "end"];
  var actx = null, seBuf = {}, bgmEl = null, muted = false;
  // 効果音は専用バス（sfxBus）に集めて、台詞の間だけまとめて沈める。
  // 式札かさねで「SEが声とほぼ同じ大きさで並んでいた」取りこぼしがあったので、
  // その sfxBus 方式をこちらにも持ってきた（docs/MEDIA.md「ダッキング」）。
  var SFX_BUS = 0.9, SFX_DUCK = 0.45, sfxBus = null;   // 台詞中は約 -7dB
  function audioCtx() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        // 効果音バスは**ここで先に作る**。最初の効果音が鳴るまで作らない書き方だと、
        // 開始の台詞（帳と同時に鳴る）のダッキングが空振りする。
        sfxBus = actx.createGain(); sfxBus.gain.value = SFX_BUS; sfxBus.connect(actx.destination);
      } catch (e) { }
    }
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
      s.connect(g); g.connect(sfxBus || a.destination); s.start(0);
    } catch (e) { }
  }
  // ---- ボイス（栞・公式指定のElevenLabs Voice ID で制作）----
  // 台詞は docs/VOICE.md。音源が無ければ黙って何も鳴らさない（差し替え前でも遊べる）
  var VOICE_KEYS = ["start", "r0", "r1", "r2", "r3", "r4", "r5"];
  var voiceBuf = {}, voicePlaying = null;
  function loadVoice() {
    var a = audioCtx(); if (!a) return;
    VOICE_KEYS.forEach(function (k) {
      var got = function (ab) { a.decodeAudioData(ab, function (b) { voiceBuf[k] = b; }, function () { }); };
      if (window.VOICE_DATA && window.VOICE_DATA[k]) { got(b64ToBuf(window.VOICE_DATA[k])); return; }
      fetch("assets/voice/shiori_" + k + ".m4a").then(function (r) {
        if (!r.ok) throw 0; return r.arrayBuffer();
      }).then(got).catch(function () { });
    });
  }
  function voice(key) {
    if (muted) return;
    var a = audioCtx(); if (!a || !voiceBuf[key]) return;
    try {
      if (voicePlaying) { try { voicePlaying.stop(); } catch (e) { } }
      var src = a.createBufferSource(); src.buffer = voiceBuf[key];
      var g = a.createGain(); g.gain.value = 1.0;      // 声 > SE > BGM（MEDIA.md）
      src.connect(g); g.connect(a.destination); src.start(0);
      voicePlaying = src;
      duck(a, src.buffer.duration);
    } catch (e) { }
  }
  // 台詞が鳴っている間だけ BGM と効果音を沈める。
  // **BGMの経路は2本ある**: Artifact版は WebAudio（bgmGain）、Pages版は HTMLAudio（bgmEl）。
  // 以前は bgmGain しか下げておらず、主配信の Pages 版でダッキングが効いていなかった
  // （2026-08-26 レビュー指摘）。
  var duckTimer = null, duckUntil = 0;
  function bgmVol(v) {
    if (bgmEl) { try { bgmEl.volume = v; } catch (e) { } return; }
    if (bgmGain) { try { bgmGain.gain.value = v; } catch (e) { } }
  }
  function duck(a, sec) {
    var ms = Math.min(sec * 1000 + 250, 9000);
    duckUntil = Math.max(duckUntil, performance.now() + ms);   // 台詞が重なったら長い方に合わせる
    bgmVol(0.07);
    if (sfxBus) { try { sfxBus.gain.setTargetAtTime(SFX_BUS * SFX_DUCK, a.currentTime, 0.05); } catch (e) { } }
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = setTimeout(function () {
      duckTimer = null;
      if (document.hidden) return;
      bgmVol(0.16);
      if (sfxBus) { try { sfxBus.gain.setTargetAtTime(SFX_BUS, audioCtx().currentTime, 0.12); } catch (e) { } }
    }, Math.max(0, duckUntil - performance.now()));
  }
  // 到達段数から、結果で読む台詞を選ぶ
  function resultVoiceKey(step) {
    // 50段以上はどちらも r5。r4 は満月成就の儀（moonRite）で鳴らすので、ここでは使わない
    if (step >= 50) return "r5";
    if (step >= 38) return "r3";
    if (step >= 22) return "r2";
    if (step >= 10) return "r1";
    return "r0";
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
    bgmVol(document.hidden ? 0 : (duckTimer ? 0.07 : 0.16));
  });

  // ---- 台座（石の飛び石）----
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
      order: null,           // その回の御霊の並び（毎回シャッフルする）
      test: false, immortal: true,   // テストモード（記録は保存しない）
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
  // 12段までは静止。以降ゆっくり左右に揺れ、終盤の主役になる。
  // 50段（満月）を越えたら振幅をもう少し伸ばし、揺れの周期を速くする
  // （それまでに幅・間合い・会心の窓が下限に達していて、難度が頭打ちになるため）
  function driftFor(step) {
    if (step < 12) return 0;
    var amp = Math.min((step - 12) * 0.85, 26);
    if (step > 50) amp = Math.min(26 + (step - 50) * 0.22, 38);
    return amp;
  }
  function driftSpeedFor(step) {        // 周期(ms)。小さいほど速い
    return step <= 50 ? 900 : Math.max(900 - (step - 50) * 9, 420);
  }

  function pushPlat(s) {
    var last = s.plats[s.plats.length - 1];
    var n = s.step + s.plats.length;
    var gap = gapFor(n);
    var w = widthFor(n);
    s.plats.push({
      x: last.x + last.w / 2 + gap + w / 2, w: w,
      amp: driftFor(n), spd: driftSpeedFor(n), ph: Math.random() * Math.PI * 2
    });
  }
  // 台座の実際の位置（左右に揺れるものがある）
  function platX(p) { return p.amp ? p.x + Math.sin(performance.now() / (p.spd || 900) + p.ph) * p.amp : p.x; }

  function reset() {
    var keepBestMoon = state ? state.moonPhase : 0;
    state = newState();
    state.moonPhase = keepBestMoon;
    state.charIdx = 0;
    state.plats = [{ x: STAND_X, w: 130, amp: 0, spd: 900, ph: 0 }];
    for (var i = 0; i < 4; i++) pushPlat(state);
    lockUntil = performance.now() + 700;   // 開始・リトライ直後は入力を止める（既存2作の作法）
    ripples.length = 0; swap.t = 0; swap.pending = null; rite.t = 0;
    state.charX = STAND_X; state.charOff = 0; state.camX = 0;
    state.order = shuffled(IDS);   // 毎回ちがう御霊から始まり、ちがう順で出る
    state.test = testMode;
    if (DBG.wx !== undefined) state.weather = parseInt(DBG.wx, 10) || 0;
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {   // Fisher-Yates
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function currentChar() {
    var o = state.order || IDS;
    return o[state.charIdx % o.length];
  }

  // ---- 跳ぶ ----
  function release() {
    var s = state;
    if (s.phase !== "play" || !s.charging) return;
    var held = (performance.now() - s.chargeStart) / 1000;
    s.charging = false;

    // ノーチャージ保護: 触れただけでは跳ばない（誤タップ即死を消す）
    if (held < 0.15) { s.shake = 0.35; se("whiff", 0.5); return; }

    var t = Math.min(held, 1.0);
    // 飛距離は溜めの長さ×天候の係数。御霊ごとの癖は入れない
    // （体感できず詰みも生んだので、差は「場」＝天候で作ると裁定した 2026-08-25）。
    var dist = (72 + t * 300) * WEATHER[s.weather].mul;
    var cur = s.plats[0], next = s.plats[1];
    var landX = s.charX + dist;   // 台座の中央ではなく、いま立っている場所から跳ぶ
    var dur = 0.34 + Math.min(dist / 900, 0.34);
    var peak = 118 + dist * 0.30;

    s.jump = { t: 0, dur: dur, x0: s.charX, x1: landX, peak: peak, dist: dist, next: next };
    se("zan", 0.75);
    if (DBG.stat) statLog.push({ step: s.step, held: +held.toFixed(3), dist: Math.round(dist), target: Math.round(next.x - cur.x) });
  }

  function land() {
    var s = state, j = s.jump; s.jump = null;
    // どの台座に乗ったかを探す。目の前の台座を飛び越して、その先に乗ることもある
    var hit = -1, d = 0;
    for (var k = 1; k < s.plats.length; k++) {
      var pk = s.plats[k], dk = Math.abs(j.x1 - platX(pk));
      if (dk <= pk.w / 2) { hit = k; d = dk; break; }
    }
    if (hit < 0) {                        // どの台座にも乗れなかった
      var short = j.x1 < platX(s.plats[1]);
      s.overReason = short ? "届かなかった" : "跳びすぎた";
      se("whiff", 1.0);   // 届かない/跳びすぎで音を変えない（差が大きすぎたため）
      if (s.test && s.immortal) {         // 試しモードの不死: 落ちずに元の台座へ戻す
        s.charX = platX(s.plats[0]) + s.charOff;
        s.combo = 0; flash(short ? "届かず" : "跳びすぎ", C.shokko);
        return;
      }
      startFall(j.x1, short);             // 即終了せず、画面の下まで落として見せる
      return;
    }
    var next = s.plats[hit];
    var skipped = hit - 1;                // 飛ばした台座の数
    var prevStep = s.step;
    s.step += hit;
    // 着いた場所にそのまま立つ（次の間合いが変わる＝考慮要素が増える）。
    // 位置は台座の中心からのずれで持つ。そうしないと、揺れる台座だけが足元を滑ってしまう。
    s.charOff = j.x1 - platX(next);
    for (var sh = 0; sh < hit; sh++) { s.plats.shift(); pushPlat(s); }
    s.charX = platX(s.plats[0]) + s.charOff;
    if (DBG.wx === undefined && Math.floor(s.step / WEATHER_EVERY) > Math.floor(prevStep / WEATHER_EVERY)) {
      // 同じ天候は続かない。月夜（基準）を重めに引いて、追い風と雨が「出来事」として立つようにする
      var bag = [];
      for (var wi = 0; wi < WEATHER.length; wi++) {
        if (wi === s.weather) continue;
        bag.push(wi); if (wi === 0) bag.push(0);   // 月夜は2枚
      }
      s.weather = bag[Math.floor(Math.random() * bag.length)];
      s.wxT = 1.0;
    }

    if (skipped > 0) {                    // 台座を飛び越した
      flash(skipped === 1 ? "一つ飛ばし" : skipped + "つ飛ばし", C.shokko);
      se("combo", 0.85);
      s.combo += skipped;                 // 思い切りの分だけ連が伸びる
      s.maxCombo = Math.max(s.maxCombo, s.combo);
    }
    var win = perfectWinFor(s.step);
    ripple(j.x1, GROUND_Y + 12, d <= win);
    if (d <= win) {                       // 会心
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      // **会心は無音**（2026-08-26 オーナー裁定）。琴 → 自作のキラリン → 公式comboと
      // 3度差し替えたが、跳ぶ音の0.56秒後に毎回鳴るものは、何を置いても手数の邪魔になった。
      // 会心の手応えは金の帯・「会心」の浮き文字・連カウントで足りている。
      // 音を足すのではなく、引くほうが正解だった場面。
      flash("会心", C.moon);
    } else {
      s.combo = 0;      // 通常の着地は無音（音を足しすぎない）
    }
    // 節目（10段ごと）
    if (Math.floor(s.step / 10) > Math.floor(prevStep / 10) && !(prevStep < 50 && s.step >= 50)) {
      flash(s.step + "段", C.kindei);   // 50段は満月成就の儀に譲る
    }
    // 満月（50段）。**交代より先に立てる**——重なったときに儀を優先させるため（下の showSwap 参照）
    if (prevStep < 50 && s.step >= 50) moonRite();
    // 4段ごとに御霊が交代する（34体を巡回＝素材がそのまま尺になる）
    if (Math.floor(s.step / SWAP_EVERY) > Math.floor(prevStep / SWAP_EVERY)) { s.charIdx++; showSwap(currentChar()); }
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
    var was = f.t;
    f.t += dt;
    // 落ちていく音。外した瞬間の音（空振り／爆）だけだと、
    // とくに「届かなかった」側は0.5秒の軽い音で終わって無音に感じる（2026-08-25 指摘）
    if (was < 0.22 && f.t >= 0.22) se("fukaku", 0.6);
    f.vy += 1500 * dt;               // 重力
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.rv * dt;
    if (f.y > H + 160) { s.fall = null; gameOver(); }
  }

  function flash(text, color) { state.flash = 1.0; state.flashText = text; state.flashColor = color; }

  // 満月成就（50段）の演出。御霊おとしの皆既月蝕にならい、1.8秒だけ手を止めて見せる。
  // 帳のときと同じで、終わるまで跳べない（lockUntil）。
  var rite = { t: 0, sparks: [] };
  function moonRite() {
    // 走っているカットインはここで畳む（沈めた画面の下から帯と立ち絵が透けるため）。
    // 途中まで見えていたものは見えたぶんで打ち切り、儀のあとに出すのは**新しい交代だけ**にする。
    swap.t = 0;
    rite.t = 1.0;
    rite.sparks = [];
    for (var i = 0; i < 46; i++) {
      rite.sparks.push({
        x: Math.random() * W, y: H * (0.55 + Math.random() * 0.5),
        v: 40 + Math.random() * 120, r: 1 + Math.random() * 2.4, ph: Math.random() * 6.28
      });
    }
    lockUntil = performance.now() + 1900;
    se("kiwami", 1.0);
    setTimeout(function () { se("fukaku", 0.7); }, 620);
    // 満月に届いた瞬間に栞が言祝ぐ（2026-08-26 オーナー指摘で追加）。
    // r4 はもともと「ちょうど50段で終えた回のリザルト」用だったが、50段に届いた人は
    // 普通そのまま続けるので、実際にはほとんど誰にも聞かれない台詞だった。
    // 一番の見せ場に置き直す。鐘（kiwami）の一撃を先に聴かせてから重ねる。
    setTimeout(function () { voice("r4"); }, 500);
  }
  function drawRite(dt) {
    if (rite.t <= 0) return;
    rite.t = Math.max(0, rite.t - dt / 1.9);
    if (rite.t <= 0 && swap.pending) { var q = swap.pending; swap.pending = null; showSwap(q); }
    var p = 1 - rite.t;                    // 0→1
    var fade = p < 0.12 ? p / 0.12 : (p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1);

    ctx.save();
    // 宵闇を一段深くして、月だけを残す
    ctx.globalAlpha = 0.90 * fade;
    ctx.fillStyle = "#08080f"; ctx.fillRect(0, 0, W, H);

    // 月の光が満ちて広がる
    var mx = 360, my = 118, mr = 46 * (1 + p * 0.5);
    ctx.globalAlpha = fade;
    var glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * (3.4 + p * 2.4));
    glow.addColorStop(0, "rgba(240,206,126,.55)"); glow.addColorStop(1, "rgba(240,206,126,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(mx, my, mr * (3.4 + p * 2.4), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.moon;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

    // 金の粉が立ちのぼる
    for (var i = 0; i < rite.sparks.length; i++) {
      var sp = rite.sparks[i];
      sp.y -= sp.v * dt;
      ctx.globalAlpha = fade * (0.25 + 0.55 * Math.abs(Math.sin(sp.ph + p * 6)));
      ctx.fillStyle = C.moon;
      ctx.beginPath(); ctx.arc(sp.x + Math.sin(sp.ph + p * 4) * 8, sp.y, sp.r, 0, Math.PI * 2); ctx.fill();
    }

    // 大文字（式札かさねの満願と同じ字間・金泥）
    ctx.globalAlpha = fade;
    var ease = 1 - Math.pow(1 - Math.min(p / 0.22, 1), 3);
    ctx.save();
    ctx.shadowColor = "rgba(240,206,126,.45)"; ctx.shadowBlur = 22;
    ctx.font = "800 " + (30 + 12 * ease) + "px " + MINCHO;
    ctx.fillStyle = goldGrad(566, 40);
    textLS("満月成就", W / 2, 566, 13 * ease, "center");
    ctx.restore();
    ctx.font = "500 12px " + MINCHO; ctx.fillStyle = C.ink;
    textLS("五十段の高みで、満月に逢えた", W / 2, 600, 2.0, "center");
    ctx.font = "700 15px " + MINCHO; ctx.fillStyle = C.kindei;
    textLS("この先も、記録は伸ばせる", W / 2, 628, 2.0, "center");
    ctx.restore();
  }

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
  var swap = { t: 0, id: null, pending: null };
  // 満月成就の儀と重なったら、カットインは**積んでおいて儀のあとに出す**。
  // 儀は画面全体を沈めるので、そのまま出すと帯の下で1.5秒が過ぎ、
  // 「誰に代わったのか分からないまま」になる（段数の刻みが変わると実際に重なる）。
  function showSwap(id) {
    if (rite.t > 0) { swap.pending = id; return; }
    swap.t = 1.0; swap.id = id;
  }
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
    if (!s.test) {   // 試しモードの記録は残さない（BESTを汚さない）
      if (s.step > best) { best = s.step; save("tsukikage_best", String(best)); s.newBest = true; }
      if (s.maxCombo > bestCombo) { bestCombo = s.maxCombo; save("tsukikage_best_combo", String(bestCombo)); s.newBestCombo = true; }
    }
    se("end", 0.8);
    setTimeout(function () { voice(resultVoiceKey(s.step)); }, 420);
    lockUntil = performance.now() + 700;
    if (DBG.stat) console.log("[stat]", JSON.stringify(statLog));
  }

  // ---- テストモード ----
  // 入り方: タイトル画面を1.5秒以内に3回タップ（既存2作の「稽古」と同じ流儀）。
  // 目的は「遊びながら各要素を確かめる」こと。**記録は一切保存しない**
  // （式札かさねで稽古モードがBESTを汚した件の再発防止）。
  // 出入りの判定は DOM の題字（.game-title）側が数える（この下の入力節）。
  var testMode = false, titleTaps = [];

  // 画面下のボタン列（テストモードのときだけ出す）
  function testButtons() {
    var labels = ["天候", "+10段", "御霊", "声", state.immortal ? "不死 入" : "不死 切"];
    var w = W / labels.length, y = H - 52;
    return labels.map(function (t, i) { return { t: t, x: i * w, y: y, w: w, h: 52, i: i }; });
  }
  function drawTestBar(s) {
    if (!s.test) return;
    ctx.save();
    ctx.fillStyle = "rgba(10,10,20,.82)"; ctx.fillRect(0, H - 52, W, 52);
    ctx.strokeStyle = "rgba(224,86,47,.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - 52); ctx.lineTo(W, H - 52); ctx.stroke();
    ctx.textAlign = "center";
    testButtons().forEach(function (b) {
      ctx.fillStyle = C.ink; ctx.font = "700 15px 'Shippori Mincho B1',serif";
      ctx.fillText(b.t, b.x + b.w / 2, H - 20);
      if (b.i > 0) {
        ctx.strokeStyle = "rgba(232,228,216,.16)";
        ctx.beginPath(); ctx.moveTo(b.x, H - 44); ctx.lineTo(b.x, H - 10); ctx.stroke();
      }
    });
    // 記録が残らないことを明示する
    ctx.textAlign = "left";
    ctx.fillStyle = C.shokko; ctx.font = "700 13px 'Shippori Mincho B1',serif";
    ctx.fillText("試し（記録は残りません）", 14, H - 62);
    ctx.restore();
  }
  var voiceCycle = 0;
  function hitTestBar(x, y) {
    if (!state.test || y < H - 52) return false;
    var b = testButtons().filter(function (b) { return x >= b.x && x < b.x + b.w; })[0];
    if (!b) return false;
    var s = state;
    if (b.i === 0) {                                   // 天候を回す
      s.weather = (s.weather + 1) % WEATHER.length; s.wxT = 1.0;
    } else if (b.i === 1) {                            // 段を進める
      var prev = s.step; s.step += 10;
      for (var k = 0; k < 10; k++) { s.plats.shift(); pushPlat(s); }
      s.charOff = 0; s.charX = platX(s.plats[0]);
      s.moonPhase = Math.max(s.moonPhase, Math.min(s.step / 50, 1));
      if (prev < 50 && s.step >= 50) moonRite(); else flash(s.step + "段", C.kindei);
      if (Math.floor(s.step / SWAP_EVERY) > Math.floor(prev / SWAP_EVERY)) { s.charIdx++; showSwap(currentChar()); }
    } else if (b.i === 2) {                            // 次の御霊のカットインを見る
      s.charIdx++; showSwap(currentChar());
    } else if (b.i === 3) {                            // 台詞を順に鳴らす
      var keys = ["start", "r0", "r1", "r2", "r3", "r4", "r5"];
      var k2 = keys[voiceCycle % keys.length]; voiceCycle++;
      voice(k2); flash("声 " + k2, C.anshi);
    } else {                                           // 落ちない/落ちるの切替
      s.immortal = !s.immortal;
    }
    return true;
  }

  // ---- 入力 ----
  var lastPointer = { x: 0, y: 0 };
  function down(e) {
    if (e.cancelable) e.preventDefault();
    if (typeof e.clientX === "number") {
      var r = cv.getBoundingClientRect();
      lastPointer.x = (e.clientX - r.left) / r.width * W;
      lastPointer.y = (e.clientY - r.top) / r.height * H;
    }
    var now = performance.now();
    if (now < lockUntil) return;
    audioCtx();
    var s = state;
    if (s.phase === "title") return;   // タイトルはDOMの札が受ける
    if (s.phase === "play" && hitTestBar(lastPointer.x, lastPointer.y)) return;   // 試しのボタン
    // reset() は state を作り直すので、phase は必ず新しい state 側に立てる（古い s に書くと始まらない）
    if (s.phase === "result") { reset(); state.phase = "play"; return; }
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

  // ---- 描き味を既存2作（御霊おとし・式札かさね）に合わせるための道具 ----
  var MINCHO = '"Shippori Mincho B1","Hiragino Mincho ProN",serif';
  var ROUND = '"M PLUS Rounded 1c","Shippori Mincho B1",sans-serif';   // 数字はこちら（2作と同じ）
  var LINE = "#6d5a33";                                                 // 金枠

  // 字間を空けて描く。既存2作はラベルに .2em、題字に .3em を使っている
  function textLS(text, x, y, ls, align) {
    var chars = String(text).split("");
    var w = 0, i;
    for (i = 0; i < chars.length; i++) w += ctx.measureText(chars[i]).width + ls;
    w -= ls;
    var cx = align === "center" ? x - w / 2 : (align === "right" ? x - w : x);
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, y);
      cx += ctx.measureText(chars[i]).width + ls;
    }
    return w;
  }
  // 金のグラデ文字（式札かさねの .game-title と同じ配合）
  function goldGrad(y, h) {
    var g = ctx.createLinearGradient(0, y - h, 0, y + h * 0.35);
    g.addColorStop(0.15, "#f6e5ae"); g.addColorStop(0.55, "#D9A94C"); g.addColorStop(0.85, "#F0CE7E");
    return g;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  // 金枠のパネル（既存2作の .stats / .card と同じ質感）
  function panel(x, y, w, h, r) {
    roundRect(x, y, w, h, r || 8);
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "rgba(28,24,54,.88)"); g.addColorStop(1, "rgba(19,16,38,.92)");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke();
    roundRect(x + 1.5, y + 1.5, w - 3, h - 3, (r || 8) - 1);
    ctx.strokeStyle = "rgba(184,155,90,.25)"; ctx.lineWidth = 1; ctx.stroke();
  }
  function label(text, x, y, align) {   // 9px・字間.2em・補助色（2作のラベルと同じ）
    ctx.font = "500 10px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS(text, x, y, 2.0, align || "left");
  }
  function num(text, x, y, size, color, align) {   // 数字は丸ゴシック（2作と同じ）
    ctx.font = "800 " + size + "px " + ROUND; ctx.fillStyle = color || C.ink;
    ctx.textAlign = align || "left"; ctx.fillText(text, x, y); ctx.textAlign = "left";
  }

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
      // 右上から左下へ降らせる（跳ぶ向き＝右に逆らう「向かい風」に見せる）。
      // 速さは落ち着かせる。粒ごとに種を持たせて、横も縦もなめらかに流す。
      ctx.strokeStyle = "rgba(160,220,248,.66)"; ctx.lineWidth = 1.7;
      ctx.lineCap = "round";
      for (var i = 0; i < 72; i++) {
        var seed = i * 137.5;
        var fall = 520 + (i % 5) * 26;                        // 粒ごとに少し速さを変える
        var y = ((seed * 7.3 + t * fall) % (H + 140)) - 70;
        var x = ((seed * 31.7 - t * fall * 0.34) % (W + 160) + (W + 160)) % (W + 160) - 80;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 30); ctx.stroke();
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

    // 上部の帯（絵と文字がぶつからないよう薄く敷く）
    var band = ctx.createLinearGradient(0, 0, 0, 96);
    band.addColorStop(0, "rgba(12,12,22,.74)"); band.addColorStop(1, "rgba(12,12,22,0)");
    ctx.fillStyle = band; ctx.fillRect(0, 0, W, 96);

    // 左: 題字（金のグラデ・字間.14em）＋ローマ字（式札かさねの h1 と同じ作り）
    ctx.font = "800 17px " + MINCHO;
    ctx.fillStyle = goldGrad(26, 17);
    textLS("月影とび", 16, 28, 2.4, "left");
    ctx.font = "500 9px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS("TSUKIKAGE TOBI", 16, 42, 2.0, "left");

    // 右: 金枠のスタッツ箱（段・最高）＋いまの御霊の顔
    var faceR = 19, faceX = W - 16 - faceR;
    var boxW = 150, boxH = 44, boxX = faceX - faceR - 10 - boxW, boxY = 14;
    panel(boxX, boxY, boxW, boxH, 8);
    label("だん", boxX + 14, boxY + 16, "left");
    num(s.step, boxX + 14, boxY + 36, 20, C.ink, "left");
    label("さいこう", boxX + 84, boxY + 16, "left");
    num(best, boxX + 84, boxY + 36, 20, C.inkDim, "left");

    var id = currentChar(), ic = icons[id];
    ctx.save();
    ctx.beginPath(); ctx.arc(faceX, boxY + boxH / 2, faceR, 0, Math.PI * 2);
    ctx.fillStyle = C.night2; ctx.fill();
    ctx.save(); ctx.clip();
    if (ic && ic.complete && ic.naturalWidth) ctx.drawImage(ic, faceX - faceR, boxY + boxH / 2 - faceR, faceR * 2, faceR * 2);
    ctx.restore();
    ctx.strokeStyle = LINE; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    // 天候（左下に小さな金枠の札。既存2作の chip と同じ質感）
    var cw = 116, ch = 30, cx0 = 16, cy0 = 52;
    panel(cx0, cy0, cw, ch, 6);
    ctx.font = "800 13px " + MINCHO; ctx.fillStyle = w.color;
    var nameW = textLS(w.name, cx0 + 10, cy0 + 20, 1.6, "left");
    ctx.font = "500 10px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS(w.note, cx0 + 10 + nameW + 8, cy0 + 20, 0.8, "left");

    // 会心の連（左の列。中央に置くとスタッツ箱と重なる）
    if (s.combo >= 2) {
      var kw = 116, kh = 30, kx = 16, ky = cy0 + ch + 8;
      panel(kx, ky, kw, kh, 6);
      ctx.font = "500 9px " + MINCHO; ctx.fillStyle = C.inkDim;
      var lw = textLS("かいしん", kx + 10, ky + 20, 2.0, "left");
      num(s.combo + " 連", kx + 10 + lw + 10, ky + 21, 16, C.moon, "left");
    }
    ctx.restore();
  }

  // 天候が変わった瞬間だけ  // 天候が変わった瞬間だけ、画面中央に短く出す（遊びは止めない）
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

    // 題字を載せる帳（金枠の板。既存2作のカードと同じ質感）
    var cw = 330, ch = 210, cx0 = (W - cw) / 2, cy0 = 168;
    panel(cx0, cy0, cw, ch, 12);

    // 題字（金のグラデ＋淡い発光・字間.3em）
    ctx.save();
    ctx.shadowColor = "rgba(240,206,126,.30)"; ctx.shadowBlur = 14;
    ctx.font = "800 36px " + MINCHO;
    ctx.fillStyle = goldGrad(cy0 + 62, 36);
    textLS("月影とび", W / 2, cy0 + 62, 10.8, "center");
    ctx.restore();

    ctx.font = "500 10px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS("TSUKIKAGE TOBI", W / 2, cy0 + 84, 2.2, "center");

    // 罫（2作のカード内の区切りと同じ）
    ctx.strokeStyle = "rgba(184,155,90,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx0 + 40, cy0 + 100); ctx.lineTo(cx0 + cw - 40, cy0 + 100); ctx.stroke();

    ctx.font = "700 14px " + MINCHO; ctx.fillStyle = C.ink;
    textLS("長押しで力を溜め、離して跳ぶ", W / 2, cy0 + 126, 1.2, "center");
    ctx.font = "500 12px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS("式札の道を、月まで", W / 2, cy0 + 148, 1.6, "center");

    if (best > 0) {
      ctx.font = "500 9px " + MINCHO; ctx.fillStyle = C.inkDim;
      textLS("これまでのほまれ", W / 2, cy0 + 172, 2.2, "center");
      ctx.font = "800 17px " + ROUND; ctx.fillStyle = C.kindei;
      ctx.textAlign = "center"; ctx.fillText(best + "段  " + titleFor(best), W / 2, cy0 + 192); ctx.textAlign = "left";
    }

    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 380) * 0.35;
    ctx.font = "700 15px " + MINCHO; ctx.fillStyle = C.ink;
    textLS("画面を長押し", W / 2, 596, 3.2, "center");
    ctx.globalAlpha = 1;

    ctx.font = "500 10px " + MINCHO;
    ctx.fillStyle = testMode ? C.shokko : "rgba(157,147,181,.45)";
    textLS(testMode ? "試しモード（題字を3回タップで戻る）" : "題字を3回すばやくタップで試しモード", W / 2, 648, 1.0, "center");
    ctx.restore();
  }

  function drawResult(s) {
    var clear = s.step >= 50;
    ctx.save();
    ctx.fillStyle = "rgba(10,10,20,.74)"; ctx.fillRect(0, 0, W, H);

    var cw = 320, ch = 300, cx0 = (W - cw) / 2, cy0 = 196;
    // 最後に跳んでいた御霊を、札の上縁に立たせる。
    // 3作で唯一「絵が1枚も無いリザルト」だった（2026-08-26 レビュー指摘）。
    // 記録更新の瞬間はスクショされる場所なので、誰が連れて行ったかを残す。
    var rid = currentChar(), rim = imgs[rid];
    if (rim && rim.complete && rim.naturalWidth) {
      var rh = 104, rw = rh * (rim.naturalWidth / rim.naturalHeight);
      ctx.save();
      ctx.globalAlpha = 0.32; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(W / 2, cy0 + 1, rw * 0.34, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(rim, W / 2 - rw / 2, cy0 - rh + 2, rw, rh);
      ctx.restore();
    }
    panel(cx0, cy0, cw, ch, 12);

    // 見出し（2作と同じ: 通常は蝕紅、達成は金・字間.3em）
    ctx.font = "800 21px " + MINCHO;
    ctx.fillStyle = clear ? C.moon : C.shokko;
    textLS(clear ? "満月成就" : "夜明け", W / 2, cy0 + 40, 6.3, "center");
    ctx.font = "500 10px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS(s.overReason, W / 2, cy0 + 60, 1.6, "center");

    ctx.strokeStyle = "rgba(184,155,90,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx0 + 36, cy0 + 76); ctx.lineTo(cx0 + cw - 36, cy0 + 76); ctx.stroke();

    // 到達段数（丸ゴシック・2作の final-score と同じ扱い）
    ctx.font = "500 9px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS("とうたつ", W / 2, cy0 + 98, 2.4, "center");
    num(s.step + "段", W / 2, cy0 + 146, 44, clear ? C.moon : C.ink, "center");

    ctx.font = "700 17px " + MINCHO; ctx.fillStyle = C.ink;
    textLS(titleFor(s.step), W / 2, cy0 + 176, 2.4, "center");

    ctx.strokeStyle = "rgba(184,155,90,.22)";
    ctx.beginPath(); ctx.moveTo(cx0 + 36, cy0 + 196); ctx.lineTo(cx0 + cw - 36, cy0 + 196); ctx.stroke();

    // 今回の会心連と、記録2種を3列で並べる。
    // 腕前の2軸目（会心連続）は保存だけして表示していなかった（2026-08-26 レビュー指摘）。
    // Discordに貼れる数字を段数の1軸に痩せさせない。
    var col = [cx0 + 58, W / 2, cx0 + cw - 58];
    ctx.font = "500 9px " + MINCHO; ctx.fillStyle = C.inkDim;
    textLS("かいしん", col[0], cy0 + 218, 2.2, "center");
    textLS("さいこうだん", col[1], cy0 + 218, 1.4, "center");
    textLS("さいこうれん", col[2], cy0 + 218, 1.4, "center");
    num(s.maxCombo + " 連", col[0], cy0 + 244, 19, s.newBestCombo ? C.moon : C.ink, "center");
    num(best + "段", col[1], cy0 + 244, 19, C.ink, "center");
    num(bestCombo + " 連", col[2], cy0 + 244, 19, C.ink, "center");

    if (s.newBest || s.newBestCombo) {
      ctx.font = "700 12px " + MINCHO; ctx.fillStyle = C.kindei;
      textLS(s.newBest && s.newBestCombo ? "だんも れんも こうしん"
        : s.newBest ? "じこさいこうを こうしん" : "かいしんの れんを こうしん",
        W / 2, cy0 + 276, 2.0, "center");
    } else if (s.test) {
      ctx.font = "700 12px " + MINCHO; ctx.fillStyle = C.shokko;
      textLS("試し（記録は残りません）", W / 2, cy0 + 276, 1.6, "center");
    }

    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 380) * 0.35;
    ctx.font = "700 15px " + MINCHO; ctx.fillStyle = C.ink;
    textLS("もう一夜", W / 2, 596, 3.2, "center");
    ctx.restore();
  }

  // ---- 自動プレイ（検証用）----
  // 撮影用（#autowobble）: 本番ルールのまま少し崩して見せる。開幕の数段はぴったり決めて
  // 気持ちよく入り、以降は台座の縁から手前で必ず止まる範囲でときどきずらす
  // （会心にならない「ふつうの着地」も混ぜて、自動プレイの綺麗すぎる絵を崩す。式札かさねの
  // nextWobble と同じ考え方）。安全域を守るので落下・結果画面には行き着かない。
  function wobbleFor(step, w) {
    if (step < 3) return 0;                       // 開幕はぴったり決める
    var safe = Math.max(w / 2 - 16, 6);            // 台座の縁の手前で必ず止める
    if (Math.random() < 0.5) return 0;             // 半分は会心級にぴったり合わせる
    var mag = Math.min(6 + step * 0.5, safe);
    return (Math.random() < 0.5 ? -1 : 1) * mag * (0.5 + Math.random() * 0.5);
  }
  function autoTick(s) {
    // 撮影用は帳（とばり）の開幕演出を見せる。検証用（他の自動プレイ）は従来どおり素通りさせる。
    if (s.phase === "title") {
      // 録画ツールがナビゲーション後にCDPスクリーンキャストを繋ぐ猶予（既存2作の600ms待ちと同じ考え方）。
      // ここで即座に開幕すると、外部から繋ぐ前に帳が開き切ってしまう。
      if (DBG.autowobble && performance.now() - bootAt < 1200) return;
      begin(false, !DBG.autowobble);
      return;
    }
    if (s.phase === "result") {
      if (performance.now() >= lockUntil) down({ preventDefault: function () { }, cancelable: false });
      return;
    }
    if (s.phase !== "play" || s.jump) return;
    // 実プレイと同じで、入力止め（帳・満月成就の儀）の間は溜め始めない。
    // ここを素通りさせると、儀の最中に自動プレイだけが跳び続けて、検証が実物とずれる。
    if (performance.now() < lockUntil) return;
    if (!s.charging) { s.charging = true; s.chargeStart = performance.now(); return; }
    var cur = s.plats[0], next = s.plats[1];
    var want = platX(next) - s.charX;
    if (DBG.automiss) want *= 1.6;                       // わざと跳びすぎる
    if (DBG.autoskip && s.plats[2]) want = platX(s.plats[2]) - s.charX;   // 一つ飛ばしを狙う
    if (DBG.autowobble) want += wobbleFor(s.step, next.w);
    var t = Math.max(0, Math.min((want / WEATHER[s.weather].mul - 72) / 300, 1));
    var held = Math.max(0.16, Math.min(t, 1.0));
    if ((performance.now() - s.chargeStart) / 1000 >= held) release();
  }

  // ---- ループ ----
  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    var s = state;

    if (DBG.autoperfect || DBG.automiss || DBG.autoskip || DBG.autowobble) autoTick(s);

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
    } else if (!s.jump && s.phase !== "result") {
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
    } else if (s.phase !== "result" && s.phase !== "title") {
      // 結果画面では描かない。落ちて消えたキャラが、また台座の上に立って見えてしまうため
      var shake = 0;
      if (s.shake > 0) { s.shake = Math.max(0, s.shake - dt * 2.2); shake = Math.sin(now / 24) * s.shake * 6; }
      drawChar(s, px + shake, py, 1);
      drawChargeRing(s, px + shake);
    }

    drawRipples(dt, s.camX);
    if (s.phase === "play" || s.phase === "fall") drawWeatherFx(s, dt);
    if ((s.phase === "play" || s.phase === "fall") && rite.t <= 0) drawHud(s);
    drawSwap(dt, 1);
    if (s.phase === "play") drawWeatherSwap(s, dt);
    if (rite.t <= 0) drawFlash(s, dt);
    drawRite(dt);
    drawTestBar(s);
    if (s.phase === "result") drawResult(s);

    // 撮影用に浮き文字を消す
    if (DBG.nofloat && s.phase === "play") { /* HUDのみ残す */ }

    requestAnimationFrame(frame);
  }

  // ---- タイトルと帳（式札かさねと同じ構え）----
  // タイトルはDOMの札（#title-overlay）。開始を押すと帳（#door）が閉じた状態で現れ、
  // 栞のひと言のあとに左右へ開く。開ききるまで入力は受けない。
  var overlay = document.getElementById("title-overlay");
  var doorEl = document.getElementById("door");
  var started = false;

  function showTitle() {
    var bg = document.getElementById("title-bg");
    var im = new Image();
    im.onload = function () {
      bg.style.backgroundImage = "url(" + titleArt + ")";
      overlay.classList.add("art-in");
      setTimeout(function () { overlay.classList.add("ready"); }, 420);
    };
    im.onerror = function () { overlay.classList.add("ready"); };
    im.src = titleArt;

    if (best > 0) {
      var el = document.getElementById("best-title");
      el.hidden = false;
      el.innerHTML = bestLine();
    }
  }
  // タイトルの誉れ行。**段と会心連の2軸**を出す（連を保存だけして表示していなかった
  // ＝貼れる数字が1軸に痩せていた、の是正。2026-08-26 レビュー指摘）。
  function bestLine() {
    if (best <= 0) return "";
    return "これまでの誉れ：<em>" + best + "段　" + titleFor(best) + "</em>"
      + (bestCombo > 0 ? "　／　会心 <em>" + bestCombo + "連</em>" : "");
  }

  function begin(withSound, skipDoor) {
    if (started) return;
    started = true;
    muted = !withSound;
    overlay.classList.add("hidden");

    reset();
    state.phase = "play";
    if (withSound) { audioCtx(); startBGM(); }

    // 帳が開く: 閉じた扉を見せ、栞のひと言のあとに左右へ開く
    if (skipDoor) { lockUntil = performance.now() + 300; return; }   // 検証用（自動プレイ）
    doorEl.classList.remove("open");
    doorEl.classList.add("show");
    lockUntil = performance.now() + 2600;      // 開ききるまで跳べない
    setTimeout(function () { voice("start"); }, 350);
    setTimeout(function () { doorEl.classList.add("open"); }, 1100);
    setTimeout(function () { doorEl.classList.remove("show"); }, 2700);
  }
  document.getElementById("start").addEventListener("click", function () { begin(true); });
  document.getElementById("start-silent").addEventListener("click", function () { begin(false); });

  // 試しモード: 題字を1.5秒以内に3回タップ（既存2作と同じ操作）。
  // click ではなく pointerdown で数える（iOSのダブルタップ抑止が2回目以降のclickを消すため）
  document.querySelector(".game-title").addEventListener("pointerdown", function () {
    var now = performance.now();
    titleTaps = titleTaps.filter(function (t) { return now - t < 1500; });
    titleTaps.push(now);
    if (titleTaps.length >= 3) {
      titleTaps = [];
      testMode = !testMode;
      var el = document.getElementById("best-title");
      el.hidden = false;
      el.innerHTML = testMode ? "<em>試し（記録は残りません）</em>" : bestLine();
      if (!testMode && best <= 0) el.hidden = true;
    }
  });

  // ---- 起動 ----
  resize();
  reset();
  state.phase = "title";     // 実際の見た目はDOMのタイトル札（#title-overlay）が担う
  loadSE();
  loadVoice();
  showTitle();
  requestAnimationFrame(frame);

  // 検証用に外へ出す
  window.__tsukikage = { get state() { return state; }, get best() { return best; },
  get bestCombo() { return bestCombo; }, get swap() { return swap; }, get rite() { return rite; },
  // 検証用: ダッキングが効いているかは音を聴かずに数値で確かめる（2026-08-26）
  get audio() {
    return { bgm: bgmEl ? bgmEl.volume : (bgmGain ? bgmGain.gain.value : null),
             path: bgmEl ? "HTMLAudio(Pages)" : (bgmGain ? "WebAudio(Artifact)" : "なし"),
             sfx: sfxBus ? sfxBus.gain.value : null, ducking: !!duckTimer };
  },
  stat: function () { return statLog; } };
})();
