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

async function run(base, hash, until, timeout, shot) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--window-size=480,860", "--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 860 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const t0 = Date.now();
  await page.goto(base + hash, { waitUntil: "load" });
  let ok = true, msg = "";
  try {
    await page.waitForFunction(until, { timeout, polling: 300 });
  } catch (e) { ok = false; msg = "条件に到達せず: " + until; }
  const state = await page.evaluate(() => {
    const s = window.__tsukikage.state;
    let best = null; try { best = localStorage.getItem("tsukikage_best"); } catch (e) { }
    return { phase: s.phase, step: s.step, maxCombo: s.maxCombo, moon: +s.moonPhase.toFixed(2), reason: s.overReason, best: best };
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
    { name: "中盤の見た目（17段・天候あり）", hash: "#autoperfect",
      until: "window.__tsukikage.state.step >= 17", timeout: 90000, shot: "/tmp/tsukikage-mid.png" },
    { name: "わざと外して夜明け（結果画面）", hash: "#automiss",
      until: "window.__tsukikage.state.phase === 'result'", timeout: 30000, shot: "/tmp/tsukikage-over.png" },
  ];

  for (const r of routes) {
    const res = await run(base, r.hash, r.until, r.timeout, r.shot);
    const head = res.ok ? "OK  " : "NG  ";
    console.log(`${head}${r.name}  ${res.sec}秒  ${JSON.stringify(res.state)}`);
    if (!res.ok) { console.log("    " + res.msg); failed++; }
    if (res.errors.length) { console.log("    エラー: " + res.errors.slice(0, 3).join(" / ")); failed++; }
  }
  srv.close();
  process.exit(failed ? 1 : 0);
})();
