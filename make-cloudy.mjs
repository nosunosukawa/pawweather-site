#!/usr/bin/env node
/**
 * make-cloudy.mjs — 記事 cloudy-day-walks.html の数値部分を生成する。
 *
 * 数値は**アプリと同じ判定エンジン（pawrisk.js）を実行して**作る（手打ちしない）。
 * 使い方: node make-cloudy.mjs
 *   cloudy-day-walks.html の <!-- data:start --> 〜 <!-- data:end --> を書き換える。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(here, "pawrisk.js"), "utf8"), ctx);
const { assess } = ctx.PawRisk;

// 正午近く（太陽高度60°）。rh は路面温度に効かないが assess の必須入力なので置く
const cond = (airF, cloudFraction) => ({ airF, rh: 40, cloudFraction, solarElevationDeg: 60 });
const CAUTION = 110, DANGER = 125; // エンジンの肉球しきい値と同じ

const cell = (f) => {
  const v = Math.round(f);
  const cls = v >= DANGER ? ' class="danger"' : v >= CAUTION ? ' class="caution"' : "";
  return `<td${cls}>${v}°F</td>`;
};

const rows = [75, 80, 85, 90, 95, 100]
  .map((airF) => {
    const sun = assess("asphalt", cond(airF, 0));
    const partly = assess("asphalt", cond(airF, 0.5));
    const overcast = assess("asphalt", cond(airF, 1));
    return `        <tr><th scope="row">${airF}°F</th>${cell(sun.asphaltF)}${cell(partly.asphaltF)}${cell(overcast.asphaltF)}${cell(sun.concreteF)}</tr>`;
  })
  .join("\n");

// 本文で使う個別の数字（全部エンジンから）
const at95 = assess("asphalt", cond(95, 1));
const at95sun = assess("asphalt", cond(95, 0));
const r = (f) => Math.round(f);

const block = `<!-- data:start（node make-cloudy.mjs が生成。手で直さない） -->
  <div class="scroll">
    <table>
      <thead>
        <tr><th>Air temp</th><th>Asphalt<br>full sun</th><th>Asphalt<br>partly cloudy</th>
            <th>Asphalt<br>overcast</th><th>Concrete<br>full sun</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
  <p class="hint">Swipe the table sideways &rarr;</p>
  <p class="muted">Midday sun (solar elevation 60°). <span class="chip caution">Yellow</span> = at or
     above the ${CAUTION}°F caution line for paw pads; <span class="chip danger">red</span> = at or
     above ${DANGER}°F, where damage can happen fast. Same thresholds the app uses.</p>

  <p style="margin-top:16px">Read the overcast column at 95°F: <strong>${r(at95.asphaltF)}°F</strong> —
     the clouds took away most of the solar gain (full sun would be ${r(at95sun.asphaltF)}°F),
     but the pavement is still past the ${CAUTION}°F caution line. "No sun" and
     "safe" are different claims, and the gap between them is exactly what you
     can't feel through shoes.</p>
  <!-- data:end -->`;

const PAGE = join(here, "cloudy-day-walks.html");
const page = readFileSync(PAGE, "utf8");
const next = page.replace(/<!-- data:start[\s\S]*?<!-- data:end -->/, block);
if (next === page && !page.includes("data:start"))
  throw new Error("cloudy-day-walks.html にマーカーが無い");
writeFileSync(PAGE, next);
console.log(
  `更新した: 95°F曇天のアスファルト ${r(at95.asphaltF)}°F（快晴 ${r(at95sun.asphaltF)}°F）`
);
