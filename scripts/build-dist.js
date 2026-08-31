#!/usr/bin/env node
/* src/ 一式を index.html（単一HTML）に畳む。
   既存2作と同じ方針: JS・CSSはすべてインライン、音声だけ assets/audio/ の別ファイルのまま。
   （Pagesのキャッシュずれで「押しても無反応」になる事故を避けるため、分割配信はしない） */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");

let html = read("src/page.html");
const chars = read("src/chars.js");
const game = read("src/game.js");

html = html.replace('<script src="chars.js"></script>', `<script>\n${chars}\n</script>`);
html = html.replace('<script src="game.js"></script>', `<script>\n${game}\n</script>`);

// 見張り: **手元の** script が畳めずに残っていないか。外部URL（わいわいSDK）は
// 意図して外に置いたままなので除く（Pagesではタウンから読む・Artifactでは読めなくてよい）。
const leftover = (html.match(/<script src="([^"]+)"/g) || []).filter(t => !/src="https:\/\//.test(t));
if (leftover.length) { console.error("インライン化できていない script が残っています", leftover); process.exit(1); }
fs.writeFileSync(path.join(root, "index.html"), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`index.html を生成: ${kb}KB`);
