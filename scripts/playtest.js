// 月影とび 通し検証。自動プレイ（#autoperfect）で満月（50段）まで、
// わざと外す（#automiss）で夜明け（結果画面）まで、実時間で確認する。
//
// 使い方:
//   NODE_PATH=../shikifuda-kasane/node_modules node scripts/playtest.js
//
// 注意（既存2作の教訓）:
//   - Chrome の --virtual-time-budget では rAF 駆動のループが進まない。実時間で待つこと。
//   - ヘッドレスは幅500px未満に縮まないので、スマホ幅の見た目は実機/Artifactで確認する。
const puppeteer = require("puppeteer-core");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { html: "text/html", js: "text/javascript", m4a: "audio/mp4", webp: "image/webp", png: "image/png" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).slice(1)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function run(base, hash, until, timeout, shot, opts = {}) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=480,860", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 860 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    // 外部の sdk.js（waiwai.town）は取れなくてよい。取れないことを織り込んだ作りなので、
    // ネットワーク由来の失敗を検証の赤にしない（本体の誤りだけを見る）。
    if (m.type() === "error" && !/sdk\.js|ERR_(CONNECTION|NAME|INTERNET|NETWORK)/.test(m.text())) {
      errors.push("console: " + m.text());
    }
  });
  // 全国ランキングへの送信を数える。**自動プレイと試しモードからは1回も呼ばれてはいけない。**
  // 本作はエンドレスで #autoperfect に終わりが無く、塞がないと青天井のスコアが本番へ載る。
  await page.evaluateOnNewDocument(() => {
    window.__submits = [];
    Object.defineProperty(window, "waiwai", { configurable: true, value: {
      mode: "bridged",
      load: () => Promise.resolve(null),
      // 本物のSDKが standalone で置くのと同じ場所に書く（記録が残ることまで検証で見るため）
      save: (k, v) => { try { localStorage.setItem("waiwai:" + k, JSON.stringify(v)); } catch (e) {} return Promise.resolve(true); },
      submitScore: (b, sc, meta) => { window.__submits.push([b, sc, meta]); return Promise.resolve({ ok: true, best: sc, rank: 1, improved: true }); },
      getMyScore: () => Promise.resolve(null),
      getTopScores: () => Promise.resolve({ entries: [{ rank: 1, name: "ヒロ", score: 30000 }], total: 1 }),
    } });
  });
  const t0 = Date.now();
  await page.goto(base + hash, { waitUntil: "load" });
  if (opts.human) {
    // 人の手で遊んだ夜（デバッグ用ハッシュを使わない経路）。静かに入って帳が開くのを待ち、
    // 長く溜めて跳びすぎ、夜明けまで行く。ここでは**送信が1回起きる**のが正しい。
    await page.evaluate(() => document.getElementById("start-silent").click());
    await new Promise((r) => setTimeout(r, 2900)); // 帳が開ききる（lockUntil = 2600ms）まで待つ
    await page.mouse.move(240, 430);
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 1000)); // 目一杯まで溜める＝跳びすぎる
    await page.mouse.up();
  }
  let ok = true, msg = "";
  try {
    await page.waitForFunction(until, { timeout, polling: 300 });
  } catch (e) { ok = false; msg = "条件に到達せず: " + until; }
  const state = await page.evaluate(() => {
    const s = window.__tsukikage.state;
    let saved = null;
    try { saved = localStorage.getItem("waiwai:tsukikage_save") || localStorage.getItem("tsukikage_best"); } catch (e) { }
    return { phase: s.phase, step: s.step, maxCombo: s.maxCombo, moon: +s.moonPhase.toFixed(2), reason: s.overReason,
             saved: saved, submits: window.__submits.slice() };
  });
  if (shot) await page.screenshot({ path: shot });
  await browser.close();
  return { ok, msg, state, errors, sec: ((Date.now() - t0) / 1000).toFixed(1) };
}

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/index.html";
  let failed = 0;

  const routes = [
    { name: "自動プレイで満月（50段）まで", hash: "#autoperfect",
      until: "window.__tsukikage.state.step >= 50", timeout: 180000, shot: "/tmp/tsukikage-moon.png" },
    { name: "中盤の見た目（17段・雨）", hash: "#autoperfect,wx2",
      until: "window.__tsukikage.state.step >= 17", timeout: 90000, shot: "/tmp/tsukikage-mid.png" },
    { name: "御霊の交代（立ち絵が出る）", hash: "#autoperfect",
      until: "window.__tsukikage.swap.t > 0.55 && window.__tsukikage.state.step >= 10",
      timeout: 40000, shot: "/tmp/tsukikage-swap.png" },
    { name: "交代カットイン・30段台", hash: "#autoperfect",
      until: "window.__tsukikage.swap.t > 0.55 && window.__tsukikage.state.step >= 30",
      timeout: 90000, shot: "/tmp/tsukikage-swap30.png" },
    { name: "台座の一つ飛ばし（追い風で成立するか）", hash: "#autoskip,wx1",
      until: "window.__tsukikage.state.step >= 4 || window.__tsukikage.state.phase === 'result'",
      timeout: 40000, shot: "/tmp/tsukikage-skip.png" },
    { name: "外したときの落下（画面下へ落ちる）", hash: "#automiss",
      until: "window.__tsukikage.state.phase === 'fall' && window.__tsukikage.state.fall && window.__tsukikage.state.fall.y > 520",
      timeout: 30000, shot: "/tmp/tsukikage-fall.png" },
    { name: "わざと外して夜明け（結果画面）", hash: "#automiss",
      until: "window.__tsukikage.state.phase === 'result'", timeout: 30000, shot: "/tmp/tsukikage-over.png" },
    // 番付を汚さないこと。自動プレイ・撮影用・試しモードのどれからも送信は起きてはいけない。
    { name: "番付を汚さない・自動プレイ（送信0回）", hash: "#autoperfect",
      until: "window.__tsukikage.state.step >= 6", timeout: 40000, submits: 0 },
    { name: "番付を汚さない・撮影用（送信0回）", hash: "#autowobble",
      until: "window.__tsukikage.state.step >= 6", timeout: 40000, submits: 0 },
    { name: "番付を汚さない・夜明けまで行っても（送信0回）", hash: "#automiss",
      until: "window.__tsukikage.state.phase === 'result'", timeout: 30000, submits: 0 },
    // 人の手で遊んだ夜は、ちゃんと送る（ガードが効きすぎて誰も載らない、を防ぐ）
    { name: "人の手で遊んだ夜は送る（送信1回）", hash: "",
      until: "window.__tsukikage.state.phase === 'result'", timeout: 30000, submits: 1,
      human: true, shot: "/tmp/tsukikage-rank.png" },
  ];

  for (const r of routes) {
    const res = await run(base, r.hash, r.until, r.timeout, r.shot, { human: r.human });
    let ok = res.ok, extra = "";
    // 送信回数の判定。合成値が `段*1000 + 会心連` になっていることもここで見る
    if (r.submits !== undefined) {
      const n = res.state.submits.length;
      if (n !== r.submits) { ok = false; extra = `送信 ${r.submits} 回のはずが ${n} 回: ${JSON.stringify(res.state.submits)}`; }
      else if (n === 1) {
        const [board, score] = res.state.submits[0];
        const want = res.state.step * 1000 + res.state.maxCombo;
        if (board !== "main" || score !== want) { ok = false; extra = `送った値が合わない: board=${board} score=${score} 期待=${want}`; }
      }
    }
    const head = ok ? "OK  " : "NG  ";
    console.log(`${head}${r.name}  ${res.sec}秒  ${JSON.stringify(res.state)}`);
    if (!res.ok) { console.log("    " + res.msg); }
    if (extra) console.log("    " + extra);
    if (!ok) failed++;
    if (res.errors.length) { console.log("    エラー: " + res.errors.slice(0, 3).join(" / ")); failed++; }
  }
  // ---- セーブ保全の移行（旧キー2つ → 束1つ）----
  // 遊びの結果に頼らず、記録の道だけを見る。旧キーが束へ移り、**書けてから**消えること、
  // どちらの経路から読んでも大きいほうが残ることを確かめる。
  {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=480,860"] });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    await page.evaluateOnNewDocument(() => {
      // 向こう（わいわい側）には 12段 の古い記録がある。手元の旧キーは 40段。
      // 大きいほうを採るなら 40 が残るのが正しい。
      window.__saved = null;
      Object.defineProperty(window, "waiwai", { configurable: true, value: {
        mode: "bridged",
        load: () => Promise.resolve({ best: 12, bestCombo: 3 }),
        save: (k, v) => { window.__saved = v; return Promise.resolve(true); },
        submitScore: () => Promise.resolve({ ok: true }),
        getMyScore: () => Promise.resolve(null),
        getTopScores: () => Promise.resolve(null),
      } });
      try {
        localStorage.setItem("tsukikage_best", "40");
        localStorage.setItem("tsukikage_best_combo", "9");
      } catch (e) {}
    });
    await page.goto(base, { waitUntil: "load" });
    await page.waitForFunction("window.__saved !== null", { timeout: 8000 }).catch(() => {});
    const got = await page.evaluate(() => ({
      saved: window.__saved,
      best: window.__tsukikage.best,
      bestCombo: window.__tsukikage.bestCombo,
      legacyBest: (() => { try { return localStorage.getItem("tsukikage_best"); } catch (e) { return "?"; } })(),
    }));
    await browser.close();
    const ok = got.saved && got.saved.best === 40 && got.saved.bestCombo === 9
      && got.best === 40 && got.bestCombo === 9 && got.legacyBest === null;
    console.log(`${ok ? "OK  " : "NG  "}記録の移行（旧キー→束・大きいほうが残る・書けてから消す）  ${JSON.stringify(got)}`);
    if (!ok) failed++;
    if (errors.length) { console.log("    エラー: " + errors.slice(0, 3).join(" / ")); failed++; }
  }

  srv.close();
  process.exit(failed ? 1 : 0);
})();
