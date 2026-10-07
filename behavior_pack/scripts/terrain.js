// Shape of the floating continent, after Mercator's map of the far north:
// a frozen lake at the centre holds the Pole, and four ways lead out from it.
// They are a glacier to the north, frozen rivers east and west that spill off
// the edge of the world as icefalls, and the Processional Avenue to the south.
// A crown of mountains rings the north and reaches the build limit.
// All coordinates are relative to REALM.origin; y is absolute.

import { REALM, B } from "./config.js";
import { fbm, ridged, hash2, smoothstep } from "./noise.js";

export { B };

// Where everything sits. Structures and the terrain both read from here so
// the land is shaped exactly where buildings stand.
export const LAYOUT = {
  plaza: { x: 0, z: 176, r: 18 },
  gate: { z: 154 },
  allFather: { x: 0, z: 165 },
  // The one way home: a portal behind the arrival point, facing the gate.
  returnPortal: { x: 0, z: 189 },
  avenue: { x1: -5, x2: 5, z1: 61, z2: 158 },
  lake: { x: 0, z: -5, rx: 84, rz: 62 },
  pole: { x: 0, z: -5, r: 13 },
  bridge: { z1: 60, z2: -68, half: 5 },
  temple: { x: 0, z: -100 },
  colossus: { x: 0, z: -156, y: B + 28 },
  guardians: [{ x: -27, z: 112 }, { x: 27, z: 112 }],
  citadel: { x: 100, z: -120, y: B + 24 },
  pyramids: [
    { x: -130, z: 40, half: 30 },
    { x: -95, z: 100, half: 20 },
    { x: -150, z: -62, half: 18 },
  ],
  village: { x: 104, z: 98 },
  // [x, z, width, length, axis]: axis is the direction the roof ridge runs.
  houses: [
    [104, 58, 19, 39, "z"],
    [72, 30, 11, 21, "x"],
    [138, 30, 11, 19, "z"],
    [74, 74, 11, 21, "z"],
    [132, 100, 13, 23, "x"],
    [102, 128, 11, 19, "x"],
    [142, 64, 11, 19, "z"],
    [56, 130, 11, 17, "x"],
  ],
  // Rock-cut halls carved into the mountains: [x, frontZ, floorY].
  halls: [
    { x: -135, z: -112, y: B + 18 },
    { x: 30, z: -142, y: B },
  ],
  // Guardians of the northern glacier, carved standing in the cliffs.
  argonath: [{ x: -124, z: -168 }, { x: -76, z: -168 }],
  summit: { x: -40, z: -178, y: B + 100 },
  // Norse and Greek wonders (built by mythic.js).
  mythic: {
    yggdrasil: { x: -62, z: 160 },
    bifrost: { from: [17, 184] },
    heimdall: { x: 150, z: 252, y: B + 12, r: 13 },
    tholoi: [{ x: -62, z: -50 }, { x: 50, z: 62 }],
    runeRing: { x: -38, z: 76 },
    valkyries: [
      { x: -14, z: 78, facing: "east" }, { x: 14, z: 78, facing: "west" },
      { x: -14, z: 98, facing: "east" }, { x: 14, z: 98, facing: "west" },
      { x: -14, z: 134, facing: "east" }, { x: 14, z: 134, facing: "west" },
    ],
    animals: [
      { kind: "stag", x: -60, z: -20, facing: "east", s: 1.2 },
      { kind: "bear", x: 55, z: -25, facing: "west", s: 1.1 },
      { kind: "swan", x: 22, z: 38, facing: "west", s: 1.0 },
      { kind: "swan", x: 34, z: 45, facing: "west", s: 0.9 },
      { kind: "horse", x: -20, z: 38, facing: "south", s: 1.1 },
      { kind: "stag", x: 66, z: 8, facing: "west", s: 1.1 },
    ],
  },
};

// ---------------------------------------------------------------------------
// The four ways
// ---------------------------------------------------------------------------

/** Centreline z of the east river at x (x > 70). */
export const eastRiverZ = (x) => -8 + 5 * Math.sin(x / 17);
/** Centreline z of the west river at x (x < -70). */
export const westRiverZ = (x) => -10 + 6 * Math.sin(x / 19);
/** Centreline x of the northern glacier at z (z < -25). */
export const glacierX = (z) => -100 + 5 * Math.sin(z / 17);

const RIVER_HALF = 6;
const GLACIER_HALF = 8;

/** 0 outside, 1 on the ice; and the bed height for the column. */
function waterways(x, z) {
  if (x > 70) {
    const d = Math.abs(z - eastRiverZ(x));
    if (d < RIVER_HALF + 4) return { w: 1 - smoothstep((d - RIVER_HALF + 1) / 5), y: B - 2, ice: d < RIVER_HALF };
  }
  if (x < -70) {
    const d = Math.abs(z - westRiverZ(x));
    if (d < RIVER_HALF + 4) return { w: 1 - smoothstep((d - RIVER_HALF + 1) / 5), y: B - 2, ice: d < RIVER_HALF };
  }
  if (z < -25) {
    const d = Math.abs(x - glacierX(z));
    if (d < GLACIER_HALF + 6) {
      // The glacier climbs gently into the mountains as a tongue of ice.
      const y = B - 1 + Math.max(0, (-40 - z) * 0.45);
      return { w: 1 - smoothstep((d - GLACIER_HALF + 1) / 7), y, ice: d < GLACIER_HALF, glacier: true };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Flattened pads under structures
// ---------------------------------------------------------------------------

function rectPad(x1, z1, x2, z2, y, blend, hard = false) {
  return { kind: "rect", x1, z1, x2, z2, y, blend, hard };
}
function circlePad(x, z, r, y, blend, hard = false) {
  return { kind: "circle", x, z, r, y, blend, hard };
}

const L = LAYOUT;
const PADS = [
  circlePad(L.plaza.x, L.plaza.z, L.plaza.r + 4, B, 10, true),
  rectPad(-16, 58, 16, 166, B, 8, true),
  rectPad(-46, -140, 46, -62, B, 10, true),
  circlePad(L.pole.x, L.pole.z, L.pole.r, B, 3, true),
  circlePad(L.colossus.x, L.colossus.z, 17, L.colossus.y, 8, true),
  ...L.guardians.map((g) => circlePad(g.x, g.z, 14, B, 8, true)),
  ...L.pyramids.map((p) => circlePad(p.x, p.z, p.half * 1.45 + 4, B, 10, true)),
  ...L.houses.map(([x, z, w, l, axis]) => {
    const hx = (axis === "x" ? l : w) / 2 + 3;
    const hz = (axis === "x" ? w : l) / 2 + 3;
    return rectPad(x - hx, z - hz, x + hx, z + hz, B, 6, true);
  }),
  circlePad(L.village.x, L.village.z, 9, B, 6, true),
  // Citadel terrace (castle courtyard is flat; stairs run down the south face).
  rectPad(L.citadel.x - 31, L.citadel.z + 8, L.citadel.x + 31, L.citadel.z + 60, L.citadel.y, 3, true),
  // Forecourts of the rock-cut halls.
  ...L.halls.map((h) => rectPad(h.x - 12, h.z, h.x + 12, h.z + 12, h.y, 6, true)),
  // Ledges where the glacier guardians stand.
  ...L.argonath.map((a) => circlePad(a.x, a.z, 12, B + 14, 6, true)),
  // Summit of the Pole Star shrine.
  circlePad(L.summit.x, L.summit.z, 11, L.summit.y, 16, true),
  // Yggdrasil's mound, the tholoi and the rune ring.
  circlePad(L.mythic.yggdrasil.x, L.mythic.yggdrasil.z, 12, B + 3, 14, true),
  ...L.mythic.tholoi.map((t) => circlePad(t.x, t.z, 11, B, 6, true)),
  circlePad(L.mythic.runeRing.x, L.mythic.runeRing.z, 13, B, 6, true),
];

function padWeight(p, x, z) {
  let dist;
  if (p.kind === "rect") {
    const dx = Math.max(p.x1 - x, 0, x - p.x2);
    const dz = Math.max(p.z1 - z, 0, z - p.z2);
    dist = Math.hypot(dx, dz);
  } else {
    dist = Math.hypot(x - p.x, z - p.z) - p.r;
  }
  if (dist <= 0) return 1;
  if (dist >= p.blend) return 0;
  return 1 - smoothstep(dist / p.blend);
}

export function lakeValue(x, z) {
  const { lake } = LAYOUT;
  const e = ((x - lake.x) / lake.rx) ** 2 + ((z - lake.z) / lake.rz) ** 2;
  return e + (fbm(x / 20, z / 20, 7) - 0.5) * 0.25;
}

export function edgeRadius(x, z) {
  return REALM.islandRadius + (fbm(x / 55 + 100, z / 55 + 100, 1) - 0.5) * 30;
}

const cache = new Map();

/**
 * Returns { top, bottom, lake, river, glacier, padded } for a column, or null
 * for open sky. top is the y of the highest solid block.
 */
export function islandColumn(x, z) {
  const key = (x + 2048) * 4096 + (z + 2048);
  let res = cache.get(key);
  if (res !== undefined) return res;
  if (cache.size > 60000) cache.clear();
  res = computeColumn(x, z);
  cache.set(key, res);
  return res;
}

function computeColumn(x, z) {
  const d = Math.hypot(x, z);
  const edgeR = edgeRadius(x, z);
  if (d > edgeR) return null;

  // Rolling snowfield.
  const plain = B + (fbm(x / 45, z / 45, 2) - 0.5) * 7;

  // Frozen lake with gently sloping shores.
  const lv = lakeValue(x, z);
  let h = plain;
  if (lv < 1) h = B - 1;
  else if (lv < 1.3) h = B - 1 + (plain - (B - 1)) * smoothstep((lv - 1) / 0.3);

  // The northern crown of mountains: ridged peaks with needle-like spires.
  const zb = -126 + 12 * Math.sin(x / 37) + 7 * Math.sin(x / 13 + 1);
  const mm = smoothstep((zb - z) / 45);
  let mountain = 0;
  let valley = 1;
  if (mm > 0) {
    const r = ridged(x / 70, z / 70, 9, 4);
    valley = r;
    mountain = mm * (28 + 135 * Math.pow(r, 1.35)) + mm * (fbm(x / 11, z / 11, 10) - 0.5) * 12;
    mountain += mm * needles(x, z);
  }
  // Mountains hugging the east and west rims, fading out toward the south.
  const rimMask = smoothstep((d - (edgeR - 75)) / 45) * smoothstep((30 - z) / 70);
  let rim = 0;
  if (rimMask > 0) rim = rimMask * (22 + 105 * Math.pow(ridged(x / 55, z / 55, 13, 3), 1.2) + needles(x, z) * 0.7);
  h += Math.max(mountain, rim);

  // Rivers and the glacier cut through everything except the structures.
  const ww = waterways(x, z);
  if (ww) h = h * (1 - ww.w) + Math.min(h, ww.y) * ww.w;

  // Flatten land under the structures.
  let padded = 0;
  for (const p of PADS) {
    const w = padWeight(p, x, z);
    if (w > 0) {
      h = h * (1 - w) + p.y * w;
      if (p.hard) padded = Math.max(padded, w);
    }
  }

  // Sheer cliff behind the citadel courtyard.
  const cit = LAYOUT.citadel;
  if (z < cit.z + 8 && Math.abs(x - cit.x) < 44) {
    const ax = Math.abs(x - cit.x);
    const fade = ax < 30 ? 1 : Math.max(0, 1 - (ax - 30) / 14);
    const c = cit.y + Math.min(50, (cit.z + 8 - z) * 2.5) * fade + (fbm(x / 5, z / 5, 4) - 0.5) * 4 * fade;
    if (fade > 0) h = Math.max(h, c);
  }

  // Crumbling rim at the very edge of the world (rivers run straight off it).
  const onIce = ww?.ice && padded < 0.5;
  const rimDrop = onIce ? 0 : Math.max(0, d - (edgeR - 4)) * 2;
  const top = Math.min(REALM.clearToY - 1, Math.round(h - rimDrop));

  // Underside: an inverted mountain hanging into the clouds.
  let depth = 8 + 72 * Math.pow(Math.max(0, 1 - (d / edgeR) ** 2), 0.8) + (fbm(x / 14, z / 14, 5) - 0.5) * 12;
  depth += mountain * 0.25;
  const cx = Math.floor(x / 10);
  const cz = Math.floor(z / 10);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const gx = cx + ox;
      const gz = cz + oz;
      if (hash2(gx, gz, 21) > 0.5) continue;
      const sx = gx * 10 + 2 + hash2(gx, gz, 22) * 6;
      const sz = gz * 10 + 2 + hash2(gx, gz, 23) * 6;
      const rad = 2 + hash2(gx, gz, 25) * 3;
      const sd = Math.hypot(x - sx, z - sz);
      if (sd > rad || Math.hypot(sx, sz) > edgeR - 6) continue;
      const len = 8 + hash2(gx, gz, 24) * 30;
      depth += len * Math.pow(1 - sd / rad, 1.2);
    }
  }
  const bottom = Math.max(REALM.killY + 6, Math.min(top - 1, Math.round(B - depth)));

  const lake = lv < 1 && padded < 0.5 && top <= B;
  const river = !!onIce && !ww.glacier;
  const glacier = (!!onIce && ww.glacier) || (mm > 0.4 && valley < 0.18 && top > B + 25 && padded < 0.2);
  return { top, bottom, lake, river, glacier, padded: padded > 0.2 };
}

/** Tall rock needles scattered through the mountains. */
function needles(x, z) {
  const cx = Math.floor(x / 23);
  const cz = Math.floor(z / 23);
  let best = 0;
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const gx = cx + ox;
      const gz = cz + oz;
      if (hash2(gx, gz, 41) > 0.55) continue;
      const sx = gx * 23 + 4 + hash2(gx, gz, 42) * 15;
      const sz = gz * 23 + 4 + hash2(gx, gz, 43) * 15;
      const rad = 4 + hash2(gx, gz, 44) * 5;
      const dd = Math.hypot(x - sx, z - sz);
      if (dd >= rad) continue;
      const hgt = 25 + hash2(gx, gz, 45) * 45;
      best = Math.max(best, hgt * Math.pow(1 - dd / rad, 0.9));
    }
  }
  return best;
}

/** y of the first air block above the ground at (x, z), or undefined. */
export function groundY(x, z) {
  const c = islandColumn(x, z);
  return c ? c.top + 1 : undefined;
}

export function slopeAt(x, z) {
  const c = islandColumn(x, z);
  if (!c) return 99;
  let s = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = islandColumn(x + dx, z + dz);
    s = Math.max(s, n ? Math.abs(n.top - c.top) : 6);
  }
  return s;
}

/** Areas kept clear of trees, crystals and other scatter. */
export function isReserved(x, z, margin = 0) {
  const L2 = LAYOUT;
  if (lakeValue(x, z) < 1.12) return true;
  if (waterways(x, z)?.w > 0.3) return true;
  if (Math.hypot(x - L2.plaza.x, z - L2.plaza.z) < L2.plaza.r + 8 + margin) return true;
  if (Math.abs(x) < 20 + margin && z > 50 && z < 170) return true;
  if (Math.abs(x) < 52 + margin && z > -175 && z < -55) return true;
  for (const g of L2.guardians) if (Math.hypot(x - g.x, z - g.z) < 16 + margin) return true;
  if (Math.abs(x - L2.citadel.x) < 44 + margin && z > L2.citadel.z - 50 && z < L2.citadel.z + 92 + margin) return true;
  for (const p of L2.pyramids) if (Math.hypot(x - p.x, z - p.z) < p.half * 1.45 + 6 + margin) return true;
  for (const [hx, hz, w, l, axis] of L2.houses) {
    const ex = (axis === "x" ? l : w) / 2 + 4 + margin;
    const ez = (axis === "x" ? w : l) / 2 + 4 + margin;
    if (Math.abs(x - hx) < ex && Math.abs(z - hz) < ez) return true;
  }
  if (Math.hypot(x - L2.village.x, z - L2.village.z) < 12 + margin) return true;
  // Village road from the avenue.
  if (x > 0 && x < L2.village.x && Math.abs(z - L2.village.z) < 4 + margin) return true;
  for (const h of L2.halls) if (Math.abs(x - h.x) < 16 + margin && z > h.z - 26 && z < h.z + 16) return true;
  for (const a of L2.argonath) if (Math.hypot(x - a.x, z - a.z) < 15 + margin) return true;
  if (Math.hypot(x - L2.summit.x, z - L2.summit.z) < 14 + margin) return true;
  const my = L2.mythic;
  if (Math.hypot(x - my.yggdrasil.x, z - my.yggdrasil.z) < 30 + margin) return true;
  for (const t of my.tholoi) if (Math.hypot(x - t.x, z - t.z) < 13 + margin) return true;
  if (Math.hypot(x - my.runeRing.x, z - my.runeRing.z) < 15 + margin) return true;
  return false;
}
