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

// 埋め込む音は **src/game.js の SE_NAMES / VOICE_KEYS から機械的に読む**。
// 手で並べていたときに koto / koto_high（会心）と r5（51段以上の声）が抜け、
// Artifact版だけ無音になっていた（2026-08-26 レビュー指摘）。
// AUDIO_DATA に無いキーは fetch へ落ちるが、Artifact の CSP で全滅するため気づきにくい。
const gameSrc = read("src/game.js");
const arr = (name) => {
  const m = gameSrc.match(new RegExp(name + "\\s*=\\s*\\[([^\\]]*)\\]"));
  if (!m) throw new Error(`src/game.js から ${name} を読めませんでした`);
  return (m[1].match(/"([a-z0-9_]+)"/g) || []).map((q) => q.slice(1, -1));
};
const SE = arr("SE_NAMES");
const VOICE_KEYS = arr("VOICE_KEYS");

// se("x") で鳴らしているのに SE_NAMES に無い音は、そもそも読み込まれず無音になる。
// 三項（se(cond ? "a" : "b", v)）も拾えるよう、呼び出し全体から文字列を取る。
const called = new Set(
  [...gameSrc.matchAll(/\bse\(([^)]*)\)/g)]
    .flatMap((m) => m[1].match(/"([a-z0-9_]+)"/g) || [])
    .map((q) => q.slice(1, -1))
);
const notLoaded = [...called].filter((n) => !SE.includes(n));
if (notLoaded.length) throw new Error(`se() で鳴らしているのに SE_NAMES に無い音: ${notLoaded.join(", ")}`);

const audio = {};
for (const n of SE) {
  const f = path.join(root, "assets", "audio", `${n}.m4a`);
  if (!fs.existsSync(f)) throw new Error(`実装が se("${n}") を鳴らすのに assets/audio/${n}.m4a がありません`);
  audio[n] = b64(`assets/audio/${n}.m4a`);
}
const bgm = b64("assets/audio/bgm.m4a");
// 背景も外部から取れないので埋め込む（PNGのままだと重いのでWebPを使う）
const bg = {
  far: "data:image/webp;base64," + b64("assets/art/bg-far.webp"),
  near: "data:image/webp;base64," + b64("assets/art/bg-near.webp"),
  title: "data:image/webp;base64," + b64("assets/art/title.webp"),
};

// ボイス（あれば埋め込む。無ければ空のまま＝鳴らないだけ）
const voice = {};
const missing = [];
for (const k of VOICE_KEYS) {
  const f = path.join(root, "assets", "voice", `shiori_${k}.m4a`);
  if (fs.existsSync(f)) voice[k] = fs.readFileSync(f).toString("base64");
  else missing.push(k);
}
if (missing.length) console.log(`  ※ 未収録のボイス: ${missing.join(", ")}（鳴らないだけで動く）`);

// page.html から <style> と本文だけを取り出す（head/body は公開時に付く）
const page = read("src/page.html");
const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];
// <body> の中身（タイトル札・帳・canvas）をそのまま持ってくる。script タグは除く
const body = page.match(/<body>([\s\S]*?)<script/)[1].trim();

const html = `<title>月影とび</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=M+PLUS+Rounded+1c:wght@800&display=swap" rel="stylesheet">
<style>
/* Artifact は body の背景を自分で塗らないと、閲覧側のテーマの地色が透けてしまう */
html,body{height:100%;background:#131320;}
${style}
</style>
${body}
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
