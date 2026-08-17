/* PawWeather サイト — 「1コマだけの入力」をアプリと同じ判定に通すための代表日モデル。
 *
 * これは**サイト側のコード**（手書き。生成物ではない）。ここがやるのは入力の組み立てだけで、
 * 計算は必ず pawrisk.js（＝アプリ本体から生成したエンジン）の assessHours に渡す。
 *
 * === なぜ要るのか ===
 * 路面温度は熱慣性（蓄熱）を持つので、**その瞬間の日射だけでは決まらない**。
 * アプリは24時間の時系列を解いて出している（mobile/pawweather/src/logic/hours.ts）。
 * サイトの電卓は「いまの気温」しか受け取らないが、だからといって熱慣性なしの
 * 単発値（surfaceTempF）を使ってはいけない——**日没前後を10〜19°F低く出す**。
 * そこで、入力された条件が1日続いた「代表的な晴れの夏日」を組み立てて、
 * アプリと同じ assessHours に通し、選ばれた時刻のコマを読む。
 *
 * === 仮定（ページ側に必ず明記すること） ===
 *  - 場所と日付: 北緯35°／西経98°（米本土のまん中）・7月15日。太陽高度はここから実計算する
 *    （sin(高度)/sin(60°) は60°で頭打ちなので、緯度を数度ずらしても日中の値は動かない）
 *  - 入力した気温・空模様が前日から続いている（アプリは実際の毎時予報を使う）
 */
var PawDay = (function () {
  var PLACE = { lat: 35.0, lon: -98.0, timeZone: "America/Chicago" };
  var DATE = "2026-07-15";
  var TZ_OFFSET = "-05:00"; /* America/Chicago の夏時間 */

  /* 空模様は NWS の文言そのまま渡す。雲量への変換もアプリのテーブルに任せる
     （cloud.ts。Sunny=0.05 / Partly Cloudy=0.5 / Overcast=0.95） */
  var SKY = ["Sunny", "Partly Cloudy", "Overcast"];

  /* 時刻の選択肢。日の出6:36、日の入り20:42（上の場所・日付での実計算値）。
     朝と夕方を別々に置いてあるのは飾りではない——**同じ太陽高度でも路面温度が違う**のが
     熱慣性で、それがこのアプリの主張そのものだから。 */
  var HOURS = [
    { hour: 7, label: "Early morning (about 7 a.m.)" },
    { hour: 10, label: "Mid-morning (about 10 a.m.)" },
    { hour: 13, label: "Midday (about 1 p.m.)" },
    { hour: 17, label: "Late afternoon (about 5 p.m.)" },
    { hour: 20, label: "Around sunset (about 8 p.m.)" },
    { hour: 22, label: "After dark (about 10 p.m.)" }
  ];

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /* 入力条件が丸一日続く24コマを作る。assessHours が自前で24時間の助走を足すので、
     こちらで前日分を用意する必要はない（hours.ts の WARMUP_H）。 */
  function hourly(cond) {
    var out = [];
    for (var h = 0; h < 24; h++) {
      out.push({
        startIso: DATE + "T" + pad(h) + ":00:00" + TZ_OFFSET,
        airF: cond.airF,
        rh: cond.rh,
        shortForecast: cond.sky,
        popPct: 0,
        isDaytime: h >= 7 && h < 20
      });
    }
    return out;
  }

  /** 代表日まるごと（24コマの AssessedHour） */
  function day(cond, surfaceKind, dog) {
    return PawRisk.assessHours(
      PLACE,
      hourly(cond),
      surfaceKind || "asphalt",
      dog || PawRisk.DEFAULT_RISK_PROFILE
    );
  }

  /** 代表日の指定時刻1コマ */
  function at(cond, hour, surfaceKind, dog) {
    return day(cond, surfaceKind, dog)[hour];
  }

  /** その時刻の太陽高度。hours.ts と同じく「枠の中央（+30分）」で代表させる */
  function solarElevAt(hour) {
    var mid = new Date(DATE + "T" + pad(hour) + ":30:00" + TZ_OFFSET);
    return PawRisk.solarElevationDeg(mid, PLACE.lat, PLACE.lon);
  }

  /**
   * 熱慣性を**外した**平衡値。判定には絶対に使わない——
   * 「熱慣性を入れないと何度に見えるか」をその場で見せるためだけの数字。
   */
  function equilibriumAt(cond, hour, surfaceKind) {
    return PawRisk.equilibriumSurfaceTempF(surfaceKind || "asphalt", {
      airF: cond.airF,
      cloudFraction: PawRisk.cloudFractionFromForecast(cond.sky),
      solarElevationDeg: solarElevAt(hour)
    });
  }

  /** その日のいちばん熱い路面（記事の「ピーク」表で使う） */
  function peak(cond, surfaceKind, dog) {
    var d = day(cond, surfaceKind, dog);
    var best = d[0];
    for (var i = 1; i < d.length; i++) {
      if (d[i].assessment.asphaltF > best.assessment.asphaltF) best = d[i];
    }
    return best;
  }

  return {
    PLACE: PLACE, DATE: DATE, SKY: SKY, HOURS: HOURS,
    day: day, at: at, peak: peak,
    solarElevAt: solarElevAt, equilibriumAt: equilibriumAt
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = PawDay;
