#!/usr/bin/env node
/**
 * verify-engine.mjs — 同梱エンジン(pawrisk.js) と アプリ本体のソースが**同じ答えを出す**ことを検算する。
 *
 * 生成し忘れ・手編集・アプリ側の改修に置いていかれた状態を、ここで落とす。
 * （2026-08-17: 公開中の電卓に熱慣性モデル applyThermalLag が入っていなかった。
 *   同梱エンジンが導入前のリビジョンのままで、日没前後の路面を10〜19°F低く出していた。
 *   検算が無かったので誰も気づけなかった）
 *
 *   node verify-engine.mjs      → 全一致なら緑で「合格」、1件でも違えば赤で落ちる(exit 1)
 *
 * 比較のやり方: アプリ本体の src/logic を**その場で別ビルド**して読み込み、
 * 同梱の pawrisk.js と総当たりで突き合わせる。同梱物を自分自身と比べても意味がない。
 *
 * さらに、サイト側の代表日モデル(day-model.js)が**熱慣性を通した値**を使っていることも見る。
 * ここが単発値に戻ると数字は「もっともらしいまま」低く出るので、人の目では気づけない。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const APP_SRC = join(here, "../../mobile/pawweather/src/logic");
const TMP = join(here, ".engine-tmp");

if (!existsSync(APP_SRC)) {
  console.error(`\x1b[31m✗ アプリ本体のソースが無い: ${APP_SRC}\x1b[0m`);
  process.exit(1);
}
const esbuild = join(here, "node_modules/.bin/esbuild");
if (!existsSync(esbuild)) {
  console.error("\x1b[31m✗ esbuild が無い。npm install を先に。\x1b[0m");
  process.exit(1);
}

/* --- 1) 同梱エンジン + サイト側の代表日モデル（公開されている実物） --- */
const siteCtx = { Math, Date, JSON, console, Intl, Map, Array, Number, isFinite, parseInt };
vm.createContext(siteCtx);
vm.runInContext(readFileSync(join(here, "pawrisk.js"), "utf8"), siteCtx);
vm.runInContext(readFileSync(join(here, "day-model.js"), "utf8"), siteCtx);
const bundled = siteCtx.PawRisk;
const PawDay = siteCtx.PawDay;

/* --- 2) アプリ本体のソースから、その場で作り直した参照実装 --- */
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const refPath = join(TMP, "ref.mjs");
execFileSync(esbuild, [
  join(here, "pawrisk-entry.ts"),
  "--bundle",
  "--format=esm",
  "--target=es2018",
  "--log-level=error",
  `--outfile=${refPath}`,
], { stdio: ["ignore", "ignore", "inherit"] });
const ref = await import(pathToFileURL(refPath).href);

/* --- 3) 総当たり --- */
const failures = [];
let checks = 0;
const call = (fn) => {
  try {
    return JSON.stringify(fn());
  } catch (e) {
    return "throw:" + e.message;
  }
};
const same = (label, fn) => {
  checks++;
  const a = call(() => fn(bundled));
  const b = call(() => fn(ref));
  if (a !== b) failures.push({ label, bundled: a, source: b });
};

const DOGS = [
  { sizeClass: "medium", brachy: false, ageStage: "adult", coat: "medium" },
  { sizeClass: "small", brachy: true, ageStage: "puppy", coat: "dark" },
  { sizeClass: "large", brachy: false, ageStage: "senior", coat: "dark" },
  { sizeClass: "medium", brachy: true, ageStage: "senior", coat: "light" },
];
same("DEFAULT_RISK_PROFILE", (E) => E.DEFAULT_RISK_PROFILE);

/* 熱指数（NWS式。80°Fの分岐と両端の補正項を必ず踏む） */
for (const t of [50, 70, 79, 80, 81, 87, 88, 95, 105, 112, 120])
  for (const rh of [0, 5, 12, 13, 40, 85, 86, 95, 100])
    same(`heatIndexF ${t}/${rh}`, (E) => E.heatIndexF(t, rh));

/* 平衡路面温度（Δmaxの下限22・上限68の両側と、地平線の上下） */
for (const kind of ["asphalt", "concrete"])
  for (const airF of [20, 40, 60, 70, 77, 85, 95, 100, 110, 130])
    for (const cloud of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1])
      for (const elev of [-40, -5, -0.1, 0, 0.1, 10, 30, 59, 60, 61, 89]) {
        same(`equilibriumSurfaceTempF ${kind} ${airF}/${cloud}/${elev}`,
          (E) => E.equilibriumSurfaceTempF(kind, { airF, cloudFraction: cloud, solarElevationDeg: elev }));
        same(`surfaceTempF ${kind} ${airF}/${cloud}/${elev}`,
          (E) => E.surfaceTempF(kind, { airF, cloudFraction: cloud, solarElevationDeg: elev }));
      }

/* 熱慣性（昇温 tau=1h / 冷却 tau=4h の切替を跨ぐ列を食わせる） */
const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));
for (const stepH of [0.5, 1, 3])
  for (const shape of [
    { eq: (i) => 80 + 50 * Math.max(0, Math.sin((Math.PI * i) / 12)), air: () => 80 },
    { eq: (i) => 90 + (i < 6 ? 60 : 0), air: (i) => 90 - i },
    { eq: () => 70, air: () => 70 },
    { eq: (i) => 60 + i, air: (i) => 60 + i },
  ]) {
    const eq = series(30, shape.eq);
    const air = series(30, shape.air);
    same(`applyThermalLag step=${stepH} ${shape.eq(0)}`, (E) => E.applyThermalLag(eq, air, stepH));
  }
same("applyThermalLag 空列", (E) => E.applyThermalLag([], []));

/* 判定（肉球軸・暑熱軸・犬の補正・気温100°F以上の無条件DANGER） */
for (const kind of ["asphalt", "concrete"])
  for (const airF of [45, 65, 77, 85, 95, 99, 100, 101, 110])
    for (const rh of [10, 35, 60, 90])
      for (const cloud of [0, 0.4, 0.5, 0.6, 0.95])
        for (const elev of [-20, -1, 0, 1, 20, 45, 70])
          for (let d = 0; d < DOGS.length; d++) {
            same(`assess ${kind} ${airF}/${rh}/${cloud}/${elev}/dog${d}`,
              (E) => E.assess(kind, { airF, rh, cloudFraction: cloud, solarElevationDeg: elev }, DOGS[d]));
            same(`assess(precomputed) ${kind} ${airF}/${elev}/dog${d}`,
              (E) => E.assess(kind, { airF, rh, cloudFraction: cloud, solarElevationDeg: elev }, DOGS[d],
                { asphaltF: airF + 30, concreteF: airF + 18 }));
          }
for (const a of ["go", "caution", "danger"])
  for (const b of ["go", "caution", "danger"]) same(`worstVerdict ${a}/${b}`, (E) => E.worstVerdict(a, b));

/* 天気文言 → 雲量（判定順が命。Mostly Cloudy を Cloudy より先に見る） */
for (const s of [
  "Sunny", "Mostly Sunny", "Partly Cloudy", "Mostly Cloudy", "Cloudy", "Overcast", "Clear",
  "Mostly Clear", "Patchy Fog", "Areas Of Fog", "Slight Chance Showers And Thunderstorms",
  "Isolated Rain Showers", "Chance Showers And Thunderstorms", "Showers And Thunderstorms Likely",
  "Likely Rain Showers", "Rain Showers", "Light Snow", "Haze", "Widespread Smoke", "Blowing Dust",
  "Sleet", "Freezing Rain", "", "なんだこれ",
]) same(`cloudFractionFromForecast ${JSON.stringify(s)}`, (E) => E.cloudFractionFromForecast(s));

/* 太陽高度（NOAA式。緯度・季節・時刻を振る） */
for (const iso of [
  "2026-01-15T12:00:00Z", "2026-03-20T18:30:00Z", "2026-06-21T19:00:00Z",
  "2026-07-15T18:30:00Z", "2026-09-23T06:00:00Z", "2026-12-21T20:00:00Z",
])
  for (const [lat, lon] of [[35, -98], [33.45, -112.07], [47.6, -122.3], [25.8, -80.2], [64.8, -147.7], [-33.9, 151.2]])
    same(`solarElevationDeg ${iso} ${lat}/${lon}`, (E) => E.solarElevationDeg(new Date(iso), lat, lon));
for (const [lat, lon, tz] of [[35, -98, "-05:00"], [64.8, -147.7, "-08:00"]])
  for (const d of ["2026-06-21", "2026-12-21"])
    same(`sunTimesForDay ${d} ${lat}`, (E) => E.sunTimesForDay(new Date(`${d}T00:00:00${tz}`), lat, lon));

/* 時系列そのもの（アプリが画面で使う入口。ここが一致しないとページ全部がずれる） */
const forecast = (airs, sky) =>
  airs.map((airF, i) => ({
    startIso: new Date(Date.parse("2026-07-15T12:00:00Z") + i * 3600000).toISOString(),
    airF, rh: 45, shortForecast: sky, popPct: 0, isDaytime: true,
  }));
for (const place of [
  { lat: 35, lon: -98, timeZone: "America/Chicago" },
  { lat: 33.45, lon: -112.07, timeZone: "America/Phoenix" },
  { lat: 47.6, lon: -122.3, timeZone: undefined },
])
  for (const sky of ["Sunny", "Mostly Cloudy", "Chance Showers And Thunderstorms"])
    for (const kind of ["asphalt", "concrete"])
      for (let d = 0; d < DOGS.length; d++) {
        const airs = series(48, (i) => 78 + 20 * Math.sin((Math.PI * i) / 12));
        same(`assessHours ${place.lat} ${sky} ${kind} dog${d}`,
          (E) => E.assessHours(place, forecast(airs, sky), kind, DOGS[d]));
        same(`assessHours limit ${place.lat} ${sky} ${kind} dog${d}`,
          (E) => E.assessHours(place, forecast(airs, sky), kind, DOGS[d], 12));
      }
same("assessHours 空", (E) => E.assessHours({ lat: 35, lon: -98, timeZone: "UTC" }, [], "asphalt", DOGS[0]));

/* 表示整形 */
for (const f of [-10, 0, 32, 62.4, 98.6, 123.7, 168])
  for (const u of ["f", "c"]) same(`formatSurfaceTemp ${f}${u}`, (E) => E.formatSurfaceTemp(f, u));

rmSync(TMP, { recursive: true, force: true });

/* --- 4) サイト側: 代表日モデルが熱慣性を通していること ---
   単発値に戻るとページの数字だけが静かに下がる。日没前後で必ず差が出るので、そこで検出する。 */
const siteChecks = [];
try {
for (const airF of [75, 85, 95]) {
  for (const [hour, expectWarmer] of [[17, true], [20, true], [22, true]]) {
    const cond = { airF, rh: 45, sky: "Sunny" };
    const withLag = PawDay.at(cond, hour).assessment.asphaltF;
    const noLag = PawDay.equilibriumAt(cond, hour);
    checks++;
    if (expectWarmer && !(withLag - noLag >= 5)) {
      siteChecks.push(
        `${airF}°F ${hour}時: 熱慣性ありの路面 ${withLag.toFixed(1)}°F が、` +
        `熱慣性なし ${noLag.toFixed(1)}°F を5°F以上上回っていない` +
        `（day-model.js が assessHours を通っていない疑い）`
      );
    }
  }
  checks++;
  const dark = PawDay.at({ airF, rh: 45, sky: "Sunny" }, 22).assessment.asphaltF;
  if (!(dark > airF + 5)) {
    siteChecks.push(`${airF}°F 22時: 日没後の路面が気温+5°F以下（${dark.toFixed(1)}°F）。蓄熱が効いていない`);
  }
}
} catch (e) {
  siteChecks.push(`代表日モデルが動かない: ${e.message}（同梱エンジンに要る関数が無い＝生成が古い）`);
}
for (const s of siteChecks) failures.push({ label: "代表日モデル", bundled: s, source: "熱慣性が入っていること" });

/* --- 5) 判定 --- */
const header = readFileSync(join(here, "pawrisk.js"), "utf8").slice(0, 400);
if (!header.includes("生成物") || !header.includes("build-engine.sh")) {
  failures.push({
    label: "pawrisk.js の先頭",
    bundled: "生成物であることの注記が無い",
    source: "build-engine.sh で作り直すこと",
  });
}

if (failures.length) {
  console.error(`\x1b[31m✗ 不一致 ${failures.length} 件 / ${checks} 件中\x1b[0m`);
  for (const f of failures.slice(0, 20)) {
    console.error(`\x1b[31m  [${f.label}]\x1b[0m`);
    console.error(`    同梱 pawrisk.js   : ${f.bundled}`);
    console.error(`    アプリ本体のソース: ${f.source}`);
  }
  if (failures.length > 20) console.error(`  …ほか ${failures.length - 20} 件`);
  console.error("\n  直し方: ./build-engine.sh で作り直し、記事の生成も回す");
  console.error("          node make-pavement.mjs && node make-cloudy.mjs && node make-curve.mjs");
  process.exit(1);
}
console.log(`\x1b[32m✓ 合格: ${checks} 件すべて一致（同梱 pawrisk.js == mobile/pawweather/src/logic・熱慣性も有効）\x1b[0m`);
