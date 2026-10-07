// Shape of the floating continent: a snowfield valley with a frozen lake,
// ringed by a mountain range to the north that reaches the build limit.
// All coordinates are relative to REALM.origin; y is absolute.

import { REALM, B } from "./config.js";
import { fbm, ridged, hash2, smoothstep } from "./noise.js";

export { B };

// Where everything sits. Structures and the terrain both read from here so
// the land is flattened exactly where buildings stand.
export const LAYOUT = {
  plaza: { x: 0, z: 176, r: 18 },
  gate: { z: 154 },
  avenue: { x1: -5, x2: 5, z1: 61, z2: 158 },
  lake: { x: 0, z: -5, rx: 84, rz: 62 },
  bridge: { z1: 60, z2: -68, half: 5 },
  temple: { x: 0, z: -100 },
  colossus: { x: 0, z: -156, y: B + 28 },
  guardians: [{ x: -27, z: 112 }, { x: 27, z: 112 }],
  citadel: { x: 100, z: -120, y: B + 24 },
  pyramids: [
    { x: -132, z: 18, half: 33 },
    { x: -110, z: 84, half: 24 },
    { x: -146, z: -50, half: 20 },
  ],
  village: { x: 104, z: 98 },
  // [x, z, width, length, axis] — axis is the direction the roof ridge runs.
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
};

function rectPad(x1, z1, x2, z2, y, blend) {
  return { kind: "rect", x1, z1, x2, z2, y, blend };
}
function circlePad(x, z, r, y, blend) {
  return { kind: "circle", x, z, r, y, blend };
}

const L = LAYOUT;
const PADS = [
  circlePad(L.plaza.x, L.plaza.z, L.plaza.r + 4, B, 10),
  rectPad(-16, 58, 16, 166, B, 8),
  rectPad(-46, -140, 46, -62, B, 10),
  circlePad(L.colossus.x, L.colossus.z, 17, L.colossus.y, 8),
  ...L.guardians.map((g) => circlePad(g.x, g.z, 14, B, 8)),
  ...L.pyramids.map((p) => circlePad(p.x, p.z, p.half * 1.45 + 4, B, 10)),
  ...L.houses.map(([x, z, w, l, axis]) => {
    const hx = (axis === "x" ? l : w) / 2 + 3;
    const hz = (axis === "x" ? w : l) / 2 + 3;
    return rectPad(x - hx, z - hz, x + hx, z + hz, B, 6);
  }),
  circlePad(L.village.x, L.village.z, 9, B, 6),
  // Citadel terrace (castle courtyard is flat; stairs run down the south face).
  rectPad(L.citadel.x - 31, L.citadel.z + 8, L.citadel.x + 31, L.citadel.z + 60, L.citadel.y, 3),
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
 * Returns { top, bottom, lake, padded } for a column, or null for open sky.
 * top is the y of the highest solid block.
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

  // Northern mountain range.
  const zb = -126 + 12 * Math.sin(x / 37) + 7 * Math.sin(x / 13 + 1);
  const mm = smoothstep((zb - z) / 50);
  let mountain = 0;
  if (mm > 0) {
    const r = ridged(x / 75, z / 75, 9, 4);
    mountain = mm * (20 + 118 * Math.pow(r, 1.5)) + mm * (fbm(x / 12, z / 12, 10) - 0.5) * 10;
  }
  // Foothills hugging the east and west rims, fading out toward the south.
  const rimMask = smoothstep((d - (edgeR - 75)) / 45) * smoothstep((30 - z) / 70);
  const rim = rimMask > 0 ? rimMask * (18 + 95 * Math.pow(ridged(x / 55, z / 55, 13, 3), 1.2)) : 0;
  h += Math.max(mountain, rim);

  // Flatten land under the structures.
  let padded = 0;
  for (const p of PADS) {
    const w = padWeight(p, x, z);
    if (w > 0) {
      h = h * (1 - w) + p.y * w;
      padded = Math.max(padded, w);
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

  // Crumbling rim at the very edge of the world.
  const rimDrop = Math.max(0, d - (edgeR - 4)) * 2;
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
  return { top, bottom, lake, padded: padded > 0.2 };
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
  return false;
}
