#!/usr/bin/env node
/**
 * make-pavement.mjs — 記事 hot-pavement.html の数値部分を生成する。
 *
 * ここは以前**手打ちの表**だった（平衡値をそのまま書いてあり、熱慣性が入る前の数字）。
 * 手で書いた数字は必ずアプリから遅れるので、生成に寄せた。
 * 数値は assessHours（＝アプリが画面で使う入口）から取り、その日の路面のピークを読む。
 *
 * 使い方: ./build-engine.sh && node verify-engine.mjs && node make-pavement.mjs
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

const r = (f) => Math.round(f);
const peak = (airF, sky) => PawDay.peak({ airF, rh: 40, sky }).assessment;

const AIRS = [70, 75, 80, 85, 90, 95, 100];
const rows = AIRS.map((airF) => {
  const clear = peak(airF, "Sunny");
  const half = peak(airF, "Partly Cloudy");
  return `        <tr><td>${airF}°F</td><td>${r(clear.asphaltF)}°F</td><td>${r(clear.concreteF)}°F</td><td>${r(half.asphaltF)}°F</td></tr>`;
}).join("\n");

const DANGER = 125;
const at75 = peak(75, "Sunny");
/* 125°F(危険線)に達する気温を1°F刻みで探す。「75°Fで125°F」と書きっぱなしにしない */
let crossAir = null;
for (let a = 60; a <= 110; a++) {
  if (peak(a, "Sunny").asphaltF >= DANGER) { crossAir = a; break; }
}
const crossPeak = peak(crossAir, "Sunny");
const peakHour = PawDay.peak({ airF: 85, rh: 40, sky: "Sunny" }).localHour;

const block = `<!-- data:start（node make-pavement.mjs が生成。手で直さない） -->
    <div class="scroll">
    <table>
      <thead>
        <tr><th>Air</th><th>Asphalt, clear</th><th>Concrete, clear</th>
            <th>Asphalt, half cloud</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    </div>
    <p class="hint">Swipe the table sideways for concrete and cloudy days &rarr;</p>
    <p class="muted" style="margin-top:12px">The day's hottest pavement — around
       ${peakHour}:00 on a mid-July day in the middle of the US, including the heat the
       surface stored earlier in the day (the same calculation the app runs on your real
       forecast). Real pavement varies with colour, age, shade and wind — these are
       planning numbers, not measurements of your street.</p>
  </div>

  <h2>What the numbers mean for paws</h2>
  <div class="card">
    <ul>
      <li><span class="dot go"></span><strong>Below 110°F</strong> — generally fine for
          normal walk lengths.</li>
      <li><span class="dot caution"></span><strong>110–125°F</strong> — uncomfortable, and
          risky over distance. Keep it short, stick to grass and shade, walk early.</li>
      <li><span class="dot danger"></span><strong>125°F and above</strong> — skin damage has
          been reported from about a minute of contact at this temperature. This is
          potty-break-on-the-grass territory, not walk territory.</li>
    </ul>
    <p style="margin-top:10px">Notice where 125°F lands on the chart: a
       <strong>${crossAir}°F</strong> sunny afternoon (${r(crossPeak.asphaltF)}°F).
       Most people would not think twice about that forecast.</p>
  </div>
  <!-- data:end -->`;

const PAGE = join(here, "hot-pavement.html");
const page = readFileSync(PAGE, "utf8");
const next = page.replace(/<!-- data:start[\s\S]*?<!-- data:end -->/, block);
if (next === page && !page.includes("data:start"))
  throw new Error("hot-pavement.html にマーカーが無い");
writeFileSync(PAGE, next);
console.log(
  `更新した: 75°F快晴のピーク ${r(at75.asphaltF)}°F / 125°Fに届く気温 ${crossAir}°F`
);
