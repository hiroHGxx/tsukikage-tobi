// 月影とび PV/プレビュー用 縦型720x1280キャプチャ。
// 自動プレイで帳の開幕〜50段の儀まで通しで撮り、カット点探しのために
// 段替わり・御霊交代・天候変化・儀の時刻を events.json に残す。
//
// 使い方:
//   npm i playwright && npx playwright install chromium   （初回だけ）
//   node scripts/pv/capture-pv.mjs [ハッシュ] [秒]
//     PV用      : node scripts/pv/capture-pv.mjs autowobble 115
//     プレビュー用: node scripts/pv/capture-pv.mjs autoperfect 30
//
// ハッシュの違い（src/game.js の autoTick）:
//   autowobble  — 本番ルールのまま揺れる台座を狙う。**帳を飛ばさない**ので開幕から撮れる
//   autoperfect — 常に会心で跳ぶ。**帳を飛ばす**ので1コマ目からプレー画面
//
// 注意（docs/MEDIA.md より）:
//   Chrome の --virtual-time-budget では rAF 駆動のゲームループが進まない。実時間で待つ。
//   タブがバックグラウンドだと rAF が止まるのでヘッドレスで撮る。
const { chromium } = await import('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const HASH = process.argv[2] || 'autowobble';
const SECS = +(process.argv[3] || 115);
const MIME = { html: 'text/html', js: 'text/javascript', m4a: 'audio/mp4', webp: 'image/webp', png: 'image/png' };

const srv = http.createServer((q, p) => {
  const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return p.writeHead(404).end();
  p.writeHead(200, { 'Content-Type': MIME[path.extname(f).slice(1)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(p);
});
await new Promise(r => srv.listen(0, r));
const base = 'http://127.0.0.1:' + srv.address().port + '/index.html';

const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({
  viewport: { width: 720, height: 1280 },
  recordVideo: { dir: HERE, size: { width: 720, height: 1280 } },
});
const pg = await ctx.newPage();
const t0 = Date.now();
await pg.goto(base + '#' + HASH, { waitUntil: 'load' });

const ev = [];
let lastStep = -1, lastWx = -1, lastSwap = 0, riteSeen = false;
for (let i = 0; i < SECS * 20; i++) {
  await pg.waitForTimeout(50);
  const s = await pg.evaluate(() => {
    const t = window.__tsukikage, s = t.state;
    return { step: s.step, wx: s.weather, phase: s.phase, swapT: t.swap && t.swap.t, riteT: t.rite && t.rite.t, combo: s.combo };
  });
  const at = (Date.now() - t0) / 1000;
  if (s.step !== lastStep) { ev.push({ at: +at.toFixed(2), k: 'step', v: s.step, combo: s.combo }); lastStep = s.step; }
  if (s.wx !== lastWx) { ev.push({ at: +at.toFixed(2), k: 'weather', v: s.wx }); lastWx = s.wx; }
  if (s.swapT > 0 && at - lastSwap > 1.2) { ev.push({ at: +at.toFixed(2), k: 'swap', step: s.step }); lastSwap = at; }
  if (!riteSeen && s.riteT > 0) { ev.push({ at: +at.toFixed(2), k: 'rite', step: s.step }); riteSeen = true; }
  if (s.phase === 'result') { ev.push({ at: +at.toFixed(2), k: 'result', step: s.step }); break; }
  if (s.step > 56 && riteSeen) break;
}
await ctx.close();
await b.close();
srv.close();

fs.writeFileSync(path.join(HERE, 'events.json'), JSON.stringify(ev, null, 1));
// playwright は webm で吐くので h264 へ。ffmpeg は別途叩く
const webm = fs.readdirSync(HERE).filter(f => f.endsWith('.webm')).sort().pop();
console.log(`イベント ${ev.length}件 / 最終段 ${lastStep} / 儀 ${riteSeen ? 'あり' : 'なし'}`);
console.log(`次: ffmpeg -y -i ${webm} -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -an gameplay.mp4`);
