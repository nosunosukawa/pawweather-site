#!/usr/bin/env node
/**
 * make-cloudy.mjs — 記事 cloudy-day-walks.html の数値部分を生成する。
 *
 * 数値は**アプリと同じ判定エンジン（pawrisk.js）を実行して**作る（手打ちしない）。
 * 通すのは assessHours ——アプリが画面で使っているのと同じ入口で、熱慣性込みの値が出る。
 * 単発の surfaceTempF / assess(precomputedSurface無し) は使わない（日没前後を10〜19°F低く出す）。
 *
 * 使い方: ./build-engine.sh && node verify-engine.mjs && node make-cloudy.mjs
 *   cloudy-day-walks.html の <!-- data:start --> 〜 <!-- data:end --> を書き換える。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = { Math, Date, JSON, console, Intl, Map, Array, Number, isFinite, parseInt };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(here, "pawrisk.js"), "utf8"), ctx);
vm.runInContext(readFileSync(join(here, "day-model.js"), "utf8"), ctx);
const { PawDay } = ctx;

/* 代表日の13時（day-model.js の仮定を参照）。rh は路面温度に効かないが入力に要る */
const HOUR = 13;
const cond = (airF, sky) => ({ airF, rh: 40, sky });
const CAUTION = 110, DANGER = 125; // エンジンの肉球しきい値と同じ

const cell = (f) => {
  const v = Math.round(f);
  const cls = v >= DANGER ? ' class="danger"' : v >= CAUTION ? ' class="caution"' : "";
  return `<td${cls}>${v}°F</td>`;
};
const at = (airF, sky) => PawDay.at(cond(airF, sky), HOUR).assessment;

const rows = [75, 80, 85, 90, 95, 100]
  .map((airF) => {
    const sun = at(airF, "Sunny");
    const partly = at(airF, "Partly Cloudy");
    const overcast = at(airF, "Overcast");
    return `        <tr><th scope="row">${airF}°F</th>${cell(sun.asphaltF)}${cell(partly.asphaltF)}${cell(overcast.asphaltF)}${cell(sun.concreteF)}</tr>`;
  })
  .join("\n");

// 本文で使う個別の数字（全部エンジンから）
const at95 = at(95, "Overcast");
const at95sun = at(95, "Sunny");
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
  <p class="muted">Early afternoon (1&nbsp;p.m.) on a mid-July day in the middle of the US,
     with the pavement's stored heat from earlier in the day included — the same way the
     app computes it. <span class="chip caution">Yellow</span> = at or
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
