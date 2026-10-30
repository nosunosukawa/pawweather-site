#!/usr/bin/env node
/**
 * verify-site.mjs — 公開前の検査。1件でも落ちたら exit 1。
 *
 *   node verify-site.mjs
 *
 * 1. JSON-LD がすべて JSON として読める
 * 2. FAQPage の答えが、ページに見えている文と一字一句同じ（違うと構造化データの規約違反）
 * 3. 値段・「無料」「買い切り」「サブスクなし」を書いていない（2.3.7 と、値下げで古い価格が残る事故の教訓）
 *    HTML コメントの中も見る。プライバシーポリシーの「購入」の節だけは法的な説明なので除外する
 * 4. CSS の font-family の先頭がヒラギノ（-apple-system が先頭だと iOS Safari で日本語が □ になる）
 * 5. img / link / a の行き先のローカルファイルが在る
 * 6. 日英のページが hreflang で互いを指している
 * 7. sitemap.xml の URL がすべて実在のファイル
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = "https://nosunosukawa.github.io/pawweather-site/";
const pages = [
  ...readdirSync(here).filter((f) => f.endsWith(".html") && !f.startsWith("google")),
  ...readdirSync(join(here, "ja")).filter((f) => f.endsWith(".html")).map((f) => "ja/" + f),
];
const fails = [];
const fail = (page, msg) => fails.push(`${page}: ${msg}`);
const text = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<\/?(?:strong|em|b|a|span)\b[^>]*>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–").replace(/&deg;/g, "°").replace(/&rarr;/g, "→").replace(/&minus;/g, "−")
    .replace(/\s+/g, " ");

const BANNED = [
  /無料/, /買い切り/, /サブスクなし/, /[¥￥]\s?\d/, /\d+\s?円/, /\$\s?\d/, /\bUSD\b|\bJPY\b/,
  /\bfree\b(?! pass)/i, /\btrial\b/i, /one-time/i, /\bprice\b(?!s? (?:are|is) shown)/i, /"offers"/,
];

for (const page of pages) {
  const html = readFileSync(join(here, page), "utf8");
  const visible = text(html);

  // 1・2
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { fail(page, "JSON-LD が読めない: " + e.message); continue; }
    if (data["@type"] === "FAQPage") {
      for (const q of data.mainEntity) {
        const a = q.acceptedAnswer.text.replace(/\s+/g, " ");
        if (!visible.includes(q.name)) fail(page, "FAQ の問いがページに無い: " + q.name);
        if (!visible.includes(a)) fail(page, "FAQ の答えがページの文と違う: " + q.name);
      }
    }
  }

  // 3
  const isPrivacy = /privacy\.html$/.test(page);
  let scan = html;
  if (isPrivacy) scan = scan.replace(/<div class="card">\s*<h2>(Purchases|購入|Notifications|通知)<\/h2>[\s\S]*?<\/div>/g, "");
  scan = scan.replace(/<script[\s\S]*?<\/script>/g, (s) => (s.includes("ld+json") ? s : ""));
  for (const re of BANNED) {
    const hit = scan.match(re);
    if (hit) fail(page, `書かない語がある: "${hit[0]}" … ${scan.slice(Math.max(0, hit.index - 40), hit.index + 40).replace(/\s+/g, " ")}`);
  }

  // 4
  for (const m of html.matchAll(/font-family:\s*([^;}"]+|"[^"]+"[^;}]*)/g)) {
    const first = m[1].trim().split(",")[0].replace(/["']/g, "").trim();
    if (first.startsWith("var(")) continue;
    if (!/^Hiragino/.test(first) && !/mono|Menlo/i.test(m[1])) fail(page, "font-family の先頭がヒラギノでない: " + first);
  }

  // 5
  for (const m of html.matchAll(/(?:src|href)="([^"#:?]+)(?:[#?][^"]*)?"/g)) {
    const ref = m[1];
    if (ref.startsWith("//") || ref.startsWith("mailto")) continue;
    let p = resolve(dirname(join(here, page)), ref);
    if (ref.endsWith("/")) p = join(p, "index.html");
    if (!existsSync(p)) fail(page, "行き先が無い: " + ref);
  }

  // 6
  const alts = [...html.matchAll(/<link rel="alternate" hreflang="(ja|en)" href="([^"]+)">/g)];
  for (const [, , url] of alts) {
    const local = url.replace(BASE, "") || "index.html";
    const file = local.endsWith("/") ? local + "index.html" : local;
    if (!existsSync(join(here, file))) { fail(page, "hreflang の先が無い: " + url); continue; }
    const other = readFileSync(join(here, file), "utf8");
    const self = BASE + (page === "index.html" ? "" : page.replace(/(^|\/)index\.html$/, "$1"));
    if (!other.includes(`href="${self}"`)) fail(page, `hreflang が片思い: ${file} が ${self} を指していない`);
  }
}

// 7
const sm = readFileSync(join(here, "sitemap.xml"), "utf8");
for (const [, url] of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const local = url.replace(BASE, "");
  const file = local === "" || local.endsWith("/") ? local + "index.html" : local;
  if (!existsSync(join(here, file))) fails.push("sitemap.xml: 実在しない URL " + url);
}
for (const f of ["llms.txt", "robots.txt"]) if (!existsSync(join(here, f))) fails.push(f + " が無い");

if (fails.length) {
  console.error(`\x1b[31m✗ ${fails.length} 件\x1b[0m`);
  for (const f of fails) console.error("  " + f);
  process.exit(1);
}
console.log(`\x1b[32m✓ 合格\x1b[0m（${pages.length} ページ: ${pages.join(", ")}）`);
