/**
 * pawrisk-entry.ts — pawrisk.js（サイト同梱エンジン）の生成元エントリ。
 *
 * ここは**再輸出だけ**を書く。閾値・係数を1行でもここに書いたら、
 * 「アプリ本体が唯一の出典」という前提が崩れて、また手コピーの写し崩れが始まる。
 *
 * 生成元: ../../mobile/pawweather/src/logic/*.ts
 * 生成:   ./build-engine.sh   →  pawrisk.js
 * 検算:   node verify-engine.mjs（同梱エンジン vs アプリ本体のソースを総当たりで突き合わせる）
 *
 * applyThermalLag / equilibriumSurfaceTempF を必ず出すこと。
 * 熱慣性を通さない surfaceTempF だけを画面で使うと、日没前後の路面を約7°F低く出す
 * ——このアプリが「歩ける」と案内する時間帯を、いちばん外す向きに外す。
 */

export { heatIndexF } from "../../mobile/pawweather/src/logic/heatIndex";

export {
  applyThermalLag,
  equilibriumSurfaceTempF,
  surfaceTempF,
  type SurfaceInput,
  type SurfaceKind,
} from "../../mobile/pawweather/src/logic/surface";

export {
  DEFAULT_RISK_PROFILE,
  assess,
  worstVerdict,
  type AgeStage,
  type Assessment,
  type CoatColor,
  type DogRiskProfile,
  type HourConditions,
  type SizeClass,
  type Verdict,
} from "../../mobile/pawweather/src/logic/risk";

export {
  assessHours,
  groupByDay,
  type AssessedHour,
  type ForecastPlace,
  type HourlyForecast,
} from "../../mobile/pawweather/src/logic/hours";

export { cloudFractionFromForecast } from "../../mobile/pawweather/src/logic/cloud";
export { solarElevationDeg, sunTimesForDay } from "../../mobile/pawweather/src/logic/solar";
export { formatSurfaceTemp, fToC } from "../../mobile/pawweather/src/logic/format";
