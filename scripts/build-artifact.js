#!/usr/bin/env node
/* Artifact（claude.ai）版を作る。
   Artifact は外部ホストへの取得が CSP で止まり（Google Fonts だけ例外）、
   fetch(data:) も通らない。そのため音は base64 で埋め込み、atob → decodeAudioData で読む。
   また公開時に <!doctype html><head>…</head><body> で包まれるので、
   ここでは html/head/body タグを書かず、中身だけを出力する。

   出力: dist/artifact.html（リポジトリには含めない）
*/
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const b64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");

const SE = ["start", "count", "zan", "kiwami", "bomb", "fukaku", "whiff", "combo", "end"];
const audio = {};
for (const n of SE) audio[n] = b64(`assets/audio/${n}.m4a`);
const bgm = b64("assets/audio/bgm.m4a");
// 背景も外部から取れないので埋め込む（PNGのままだと重いのでWebPを使う）
const bg = {
  far: "data:image/webp;base64," + b64("assets/art/bg-far.webp"),
  near: "data:image/webp;base64," + b64("assets/art/bg-near.webp"),
};

// ボイス（あれば埋め込む。無ければ空のまま＝鳴らないだけ）
const voice = {};
for (const k of ["start", "r0", "r1", "r2", "r3", "r4"]) {
  const f = path.join(root, "assets", "voice", `shiori_${k}.m4a`);
  if (fs.existsSync(f)) voice[k] = fs.readFileSync(f).toString("base64");
}

// page.html から <style> と本文だけを取り出す（head/body は公開時に付く）
const page = read("src/page.html");
const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];

const html = `<title>月影とび</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&display=swap" rel="stylesheet">
<style>
/* Artifact は body の背景を自分で塗らないと、閲覧側のテーマの地色が透けてしまう */
html,body{height:100%;background:#131320;}
${style}
</style>
<div id="stage"><canvas id="cv"></canvas></div>
<p class="sr">長押しで力を溜め、離して跳びます。式札の飛び石に着地し、何段先まで届くかを競うゲームです。</p>
<script>
window.AUDIO_DATA = ${JSON.stringify(audio)};
window.BGM_DATA = ${JSON.stringify(bgm)};
window.BG_DATA = ${JSON.stringify(bg)};
window.VOICE_DATA = ${JSON.stringify(voice)};
</script>
<script>
${read("src/chars.js")}
</script>
<script>
${read("src/game.js")}
</script>
`;

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "artifact.html");
fs.writeFileSync(out, html);
console.log(`dist/artifact.html を生成: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);
