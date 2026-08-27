// PVの文字カードを HTML → PNG に焼く（docs/MEDIA.md「文字カードは HTML + Google Fonts → スクショ」）。
// 透過が要るもの（テロップ・モンタージュのコピー）は omitBackground で抜く。
// deviceScaleFactor 2 で 1440x2560 に焼き、assemble.sh 側で 720x1280 に落とす（文字が締まる）。
//
// 使い方: node scripts/pv/make-cards.mjs
const { chromium } = await import('playwright');
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cards = [
  { html: 's1.html',     png: 's1.png',     alpha: false },  // シネマ導入（キービジュアル＋コピー）
  { html: 'telop.html',  png: 'telop.png',  alpha: true  },  // ジャンルテロップ
  { html: 'm_copy.html', png: 'm_copy.png', alpha: true  },  // 御霊モンタージュのコピー
  { html: 's6.html',     png: 's6.png',     alpha: false },  // エンドカード
];

const b = await chromium.launch({ headless: true });
const pg = await b.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 2 });
for (const c of cards) {
  await pg.goto(pathToFileURL(path.join(HERE, c.html)).href, { waitUntil: 'load' });
  // Google Fonts の読み込み待ち。落ちても止めない（フォールバックの明朝で焼ける）
  await pg.evaluate(() => document.fonts.ready).catch(() => {});
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: path.join(HERE, c.png), omitBackground: c.alpha });
  console.log('  ' + c.png + (c.alpha ? ' (透過)' : ''));
}
await b.close();
