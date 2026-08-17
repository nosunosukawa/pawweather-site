/**
 * make-curve.mjs — draws the front-page curve and the support-page table
 * from the app's own risk engine. Never hand-edit the numbers.
 *
 *   node make-curve.mjs
 *
 * Rewrites everything between the ENGINE-DATA / ENGINE-TABLE markers in
 * index.html and support.html. Re-run after any change to pawrisk.js.
 */
import { readFileSync, writeFileSync } from "node:fs";

const engineSrc = readFileSync(new URL("./pawrisk.js", import.meta.url), "utf8");
const dayModelSrc = readFileSync(new URL("./day-model.js", import.meta.url), "utf8");
// pawrisk.js is an IIFE bundle that assigns `var PawRisk = ...`; day-model.js needs it in scope
const { PawRisk, PawDay } = new Function(
  `${engineSrc}\n${dayModelSrc}\nreturn { PawRisk, PawDay };`
)();

/* ---- conditions: clear sky, the day's hottest pavement ----
   Do NOT call PawRisk.assess() on a single moment here. Pavement stores heat, so a
   one-shot reading has no memory in it and reads 10-19 F low from late afternoon
   onward — the exact hours this app tells people to walk in. Everything goes through
   the day model, which feeds the app's own assessHours(). See day-model.js. */
const surfaces = (airF) => {
  const r = PawDay.peak({ airF, rh: 40, sky: "Sunny" }).assessment;
  return { asphaltF: r.asphaltF, concreteF: r.concreteF };
};

/* ---- chart geometry (must match the viewBox in index.html) ---- */
const VB = { w: 420, h: 320 };
const AIR0 = 60, AIR1 = 100;
const SUR_TOP = 175, SUR_BOT = 80;
const X0 = 44, X1 = 404, Y0 = 24, Y1 = 272;
const CAUTION_F = 110, DANGER_F = 125;

const px = (a) => +(X0 + ((a - AIR0) / (AIR1 - AIR0)) * (X1 - X0)).toFixed(1);
const py = (s) => +(Y0 + ((SUR_TOP - s) / (SUR_TOP - SUR_BOT)) * (Y1 - Y0)).toFixed(1);

const airs = [];
for (let a = AIR0; a <= AIR1; a += 2) airs.push(a);

const rows = airs.map((a) => ({ a, ...surfaces(a) }));
const asphalt = rows.map((r) => `${px(r.a)},${py(r.asphaltF)}`).join(" ");
const concrete = rows.map((r) => `${px(r.a)},${py(r.concreteF)}`).join(" ");

/* ---- direct labels (dataviz: label the lines, don't make people read a legend key).
   Right-anchored just above each line's hot end, where the two are furthest apart. ---- */
const last = rows[rows.length - 1];
const labels = {
  ASPHALT_LABEL_X: "400",
  ASPHALT_LABEL_Y: String(+(py(last.asphaltF) - 9).toFixed(1)),
  CONCRETE_LABEL_X: "400",
  CONCRETE_LABEL_Y: String(+(py(last.concreteF) - 9).toFixed(1)),
};

/* ---- threshold crossings, searched at 0.1 F ---- */
const crossing = (key, target) => {
  for (let t = AIR0 * 10; t <= AIR1 * 10; t++) {
    const air = t / 10;
    if (surfaces(air)[key] >= target) return air;
  }
  return null;
};
const cross = {
  asphaltCaution: crossing("asphaltF", CAUTION_F),
  asphaltDanger: crossing("asphaltF", DANGER_F),
  concreteCaution: crossing("concreteF", CAUTION_F),
  concreteDanger: crossing("concreteF", DANGER_F),
};

/* ---- zone bands, in the same y-space as the lines ---- */
const bands = {
  dangerY: Y0,
  dangerH: +(py(DANGER_F) - Y0).toFixed(1),
  cautionY: py(DANGER_F),
  cautionH: +(py(CAUTION_F) - py(DANGER_F)).toFixed(1),
  goY: py(CAUTION_F),
  goH: +(Y1 - py(CAUTION_F)).toFixed(1),
};

/* ---------- patch index.html ---------- */
const idxPath = new URL("./index.html", import.meta.url);
let idx = readFileSync(idxPath, "utf8");

const svgBody = `
        <rect x="44" y="${bands.dangerY}" width="360" height="${bands.dangerH}" fill="var(--zone-danger)"></rect>
        <rect x="44" y="${bands.cautionY}" width="360" height="${bands.cautionH}" fill="var(--zone-caution)"></rect>
        <rect x="44" y="${bands.goY}" width="360" height="${bands.goH}" fill="var(--zone-go)"></rect>

        <g stroke="currentColor" stroke-width="1" opacity=".22">
          <path d="M44 ${py(160)}H404M44 ${py(140)}H404M44 ${py(100)}H404"></path>
          <path d="M134 24V272M224 24V272M314 24V272"></path>
        </g>

        <g stroke="#C8202F" stroke-width="2"><path d="M44 ${py(DANGER_F)}H404"></path></g>
        <g stroke="#FFC414" stroke-width="2"><path d="M44 ${py(CAUTION_F)}H404"></path></g>

        <polyline fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"
          points="${asphalt}"></polyline>
        <polyline fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"
          stroke-dasharray="7 5" points="${concrete}"></polyline>

        <g font-family="Menlo,ui-monospace,monospace" font-size="12" fill="currentColor">
          <text x="40" y="${(py(160) + 4).toFixed(1)}" text-anchor="end">160</text>
          <text x="40" y="${(py(140) + 4).toFixed(1)}" text-anchor="end">140</text>
          <text x="40" y="${(py(DANGER_F) + 4).toFixed(1)}" text-anchor="end">125</text>
          <text x="40" y="${(py(CAUTION_F) + 4).toFixed(1)}" text-anchor="end">110</text>
          <text x="40" y="${(py(80) + 4).toFixed(1)}" text-anchor="end">80</text>
          <text x="44" y="292">60</text>
          <text x="134" y="292" text-anchor="middle">70</text>
          <text x="224" y="292" text-anchor="middle">80</text>
          <text x="314" y="292" text-anchor="middle">90</text>
          <text x="404" y="292" text-anchor="end">100</text>
        </g>
        <g font-family="Menlo,ui-monospace,monospace" font-size="11" font-weight="700"
           letter-spacing="1.2" fill="currentColor">
          <text x="0" y="14">Pavement &deg;F</text>
          <text x="404" y="313" text-anchor="end">Air temperature &deg;F</text>
        </g>
        <g font-family="Menlo,ui-monospace,monospace" font-size="11" font-weight="700" letter-spacing="1">
          <text x="400" y="${(py(DANGER_F) - 5).toFixed(1)}" text-anchor="end" fill="#C8202F">DANGER 125&deg;F</text>
          <text x="400" y="${(py(CAUTION_F) - 5).toFixed(1)}" text-anchor="end" fill="#8A6B00">CAUTION 110&deg;F</text>
        </g>
        <g font-family="Menlo,ui-monospace,monospace" font-size="12" font-weight="700" fill="currentColor">
          <text x="${labels.ASPHALT_LABEL_X}" y="${labels.ASPHALT_LABEL_Y}" text-anchor="end">Asphalt</text>
          <text x="${labels.CONCRETE_LABEL_X}" y="${labels.CONCRETE_LABEL_Y}" text-anchor="end">Concrete sidewalk</text>
        </g>
        `;

idx = replaceBetween(idx, "<!-- ENGINE-DATA-START (regenerated from pawrisk.js — do not hand-edit) -->",
  "<!-- ENGINE-DATA-END -->", svgBody);
writeFileSync(idxPath, idx);

/* ---------- patch support.html ---------- */
const supPath = new URL("./support.html", import.meta.url);
let sup = readFileSync(supPath, "utf8");
const tableRows = rows
  .filter((r) => r.a % 5 === 0)
  .map(
    (r) =>
      `          <tr><td class="n">${r.a}&deg;F</td><td class="n">${r.asphaltF.toFixed(0)}&deg;F</td>` +
      `<td class="n">${r.concreteF.toFixed(0)}&deg;F</td><td class="n">${(r.asphaltF - r.concreteF).toFixed(0)}&deg;F</td></tr>`
  )
  .join("\n");
sup = replaceBetween(sup, "<!-- ENGINE-TABLE-START -->", "<!-- ENGINE-TABLE-END -->", "\n" + tableRows + "\n        ");
writeFileSync(supPath, sup);

function replaceBetween(text, startMark, endMark, body) {
  const s = text.indexOf(startMark);
  const e = text.indexOf(endMark);
  if (s < 0 || e < 0) throw new Error(`markers not found: ${startMark}`);
  return text.slice(0, s + startMark.length) + body + text.slice(e);
}

/* ---------- prose guard ----------
   The aria-label and the caption sit outside the ENGINE-DATA markers (one is an SVG
   attribute), so they cannot be generated. They can still go stale, which is how this
   whole mess started — so fail loudly instead of drifting quietly. */
const mustContain = [
  `${Math.round(rows[0].asphaltF)} degrees at ${AIR0} degrees of air`,
  `about ${Math.round(rows[rows.length - 1].asphaltF)} degrees at ${AIR1}`,
  `${Math.round(cross.asphaltCaution)} degrees of air`,
  `about ${Math.round(cross.asphaltDanger)} degrees`,
  `${Math.round(DANGER_F)}&deg;F on a\n        ${Math.round(cross.asphaltDanger)}&deg;F day`,
];
const stale = mustContain.filter((s) => !idx.includes(s));
if (stale.length) {
  console.error("\n\x1b[31m✗ index.html の説明文がエンジンの出力とずれている\x1b[0m");
  for (const s of stale) console.error("  見つからない: " + JSON.stringify(s));
  process.exitCode = 1;
}

/* ---------- report ---------- */
const at = (a) => rows.find((r) => r.a === a);
console.log("conditions: clear sky (Sunny), the day's hottest hour, RH 40, thermal lag included");
console.log("air  asphalt  concrete  delta");
for (const a of [60, 70, 76, 80, 86, 90, 100]) {
  const r = at(a);
  if (r) console.log(`${a}   ${r.asphaltF.toFixed(1)}   ${r.concreteF.toFixed(1)}   ${(r.asphaltF - r.concreteF).toFixed(1)}`);
}
console.log("crossings (air F):", cross);
console.log("asphalt polyline:", asphalt.slice(0, 60) + " ...");
