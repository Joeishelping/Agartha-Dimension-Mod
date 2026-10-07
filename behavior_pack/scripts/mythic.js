// The mythic layer of Agartha: Norse and Greek wonders that make the realm
// feel like the heaven at the top of the world.
//
//  * Yggdrasil, the white world tree, with the Well of Urd at its roots
//  * The Bifröst, a rainbow bridge arcing out to Heimdall's watchtower
//  * Two round Greek temples (tholoi) and a ring of rune stones
//  * White statues of stag, bear, horse and swans standing on the frozen lake
//  * Domes and slender spires that turn the temple into an ice palace
//  * Aurora ribbons of coloured glass hanging in the northern sky
//  * A ring of snowy peaks rising out of the cloud sea around the edge

import { REALM, B } from "./config.js";
import { LAYOUT, islandColumn, groundY } from "./terrain.js";
import { orient, stairs, pillar, lantern } from "./canvas.js";
import { fbm, hash2, ridged } from "./noise.js";
import { spire, crystal, spruce, ISLETS } from "./structures.js";

const QB = "minecraft:quartz_bricks";
const SQ = "minecraft:smooth_quartz";
const CQ = "minecraft:chiseled_quartz_block";
const QP = pillar("minecraft:quartz_pillar");
const PI = "minecraft:packed_ice";
const BI = "minecraft:blue_ice";
const GOLD = "minecraft:gold_block";
const GLASS = "minecraft:light_blue_stained_glass";
const WHITE = "minecraft:white_concrete";
const SEA = "minecraft:sea_lantern";

const bounds = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
const L = LAYOUT;
const M = L.mythic;

function capsule(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

/**
 * Builds a figure from primitives (ellipsoids and capsules in local units,
 * scaled by s). The first primitive containing a voxel decides its block.
 */
function sculpt(c, cx, baseY, cz, facing, s, prims) {
  let ext = 0;
  let top = 0;
  for (const p of prims) {
    const pts = p.kind === "ell" ? [p.c] : [p.a, p.b];
    const rad = p.kind === "ell" ? Math.max(...p.r) : p.r;
    for (const q of pts) {
      ext = Math.max(ext, Math.abs(q[0]) + rad, Math.abs(q[2]) + rad);
      top = Math.max(top, q[1] + rad);
    }
  }
  const e = Math.ceil(ext * s) + 1;
  const tol = 0.45 / s;
  c.voxels(-e, e, -e, e, baseY, baseY + Math.ceil(top * s) + 1, orient(cx, cz, facing), (u, y, v) => {
    const p = [u / s, (y - baseY) / s, v / s];
    for (const pr of prims) {
      if (pr.kind === "ell") {
        const d = Math.hypot((p[0] - pr.c[0]) / pr.r[0], (p[1] - pr.c[1]) / pr.r[1], (p[2] - pr.c[2]) / pr.r[2]);
        if (d <= 1 + tol / Math.min(...pr.r)) return [pr.m];
      } else if (capsule(p, pr.a, pr.b) <= pr.r + tol) {
        return [pr.m];
      }
    }
    return null;
  });
}

const ell = (cpos, r, m = WHITE) => ({ kind: "ell", c: cpos, r, m });
const cap = (a, b, r, m = WHITE) => ({ kind: "cap", a, b, r, m });
const both = (fn) => [fn(1), fn(-1)];

// ---------------------------------------------------------------------------
// White animal statues on the frozen lake
// ---------------------------------------------------------------------------

const ANIMALS = {
  stag: [
    ...both((s) => ell([s * 0.75, 12.6, 7.7], [0.25, 0.25, 0.25], BI)),
    ell([0, 12.4, 7], [1.3, 1.4, 2.2]),
    ell([0, 11.8, 8.9], [0.9, 0.9, 1.1]),
    ...both((s) => cap([s * 0.7, 13.6, 6.6], [s * 3.2, 17.2, 5.6], 0.45, PI)),
    ...both((s) => cap([s * 3.2, 17.2, 5.6], [s * 4.6, 19.4, 6.6], 0.4, PI)),
    ...both((s) => cap([s * 3.2, 17.2, 5.6], [s * 2.6, 19.8, 4.4], 0.4, PI)),
    ...both((s) => cap([s * 2, 15.4, 6.1], [s * 3.9, 16.6, 7.6], 0.38, PI)),
    cap([0, 8.5, 3.6], [0, 11.8, 6.2], 1.2),
    ell([0, 7.2, 0], [2.2, 2.6, 5]),
    ...both((s) => cap([s * 1.3, 6, 3.4], [s * 1.3, 0, 3.6], 0.75)),
    ...both((s) => cap([s * 1.3, 6, -3.2], [s * 1.3, 0, -3.4], 0.75)),
    ell([0, 8, -5.2], [0.6, 0.9, 0.6]),
  ],
  bear: [
    ...both((s) => ell([s * 0.8, 7.2, 8.6], [0.25, 0.25, 0.25], BI)),
    ell([0, 6.6, 6.8], [2, 2, 2.5]),
    ell([0, 5.9, 8.9], [1, 1, 1.3]),
    ...both((s) => ell([s * 1.4, 8.4, 6.4], [0.5, 0.5, 0.4])),
    ell([0, 5.4, 0], [3, 3.2, 5.6]),
    ...both((s) => cap([s * 2, 4, 3.6], [s * 2, 0, 3.8], 1.3)),
    ...both((s) => cap([s * 2, 4, -3.6], [s * 2, 0, -3.6], 1.3)),
  ],
  horse: [
    ...both((s) => ell([s * 0.7, 12.4, 7.2], [0.22, 0.22, 0.22], BI)),
    cap([0, 12.6, 6], [0, 10.8, 8.4], 1),
    ...both((s) => cap([s * 0.5, 13.6, 5.8], [s * 0.6, 14.6, 5.6], 0.3)),
    cap([0, 8.2, 3.6], [0, 12.4, 5.8], 1.2),
    cap([0, 9.6, 3.4], [0, 13, 5.4], 0.55, PI),
    ell([0, 7.2, 0], [1.9, 2.3, 4.6]),
    ...both((s) => cap([s * 1.1, 6, 3.4], [s * 1.2, 0, 3.6], 0.65)),
    ...both((s) => cap([s * 1.1, 6, -3.4], [s * 1.2, 0, -3.8], 0.65)),
    cap([0, 7.8, -4.4], [0, 3.6, -6], 0.55, PI),
  ],
  swan: [
    ell([0, 8.2, 4.2], [0.6, 0.6, 0.9]),
    cap([0, 8, 4.9], [0, 7.8, 6], 0.32, GOLD),
    cap([0, 3, 2.6], [0, 6, 3.6], 0.65),
    cap([0, 6, 3.6], [0, 8, 2.9], 0.6),
    cap([0, 8, 2.9], [0, 8.2, 4], 0.55),
    ...both((s) => ell([s * 1.6, 3.6, -0.4], [0.8, 1.6, 2.8])),
    ell([0, 2.5, 0], [2, 1.6, 3.5]),
  ],
};

function animalStatue(c, a) {
  const g = B - 1;
  // Pedestal of ice and quartz rising from the frozen lake.
  for (let dx = -6; dx <= 6; dx++) {
    for (let dz = -6; dz <= 6; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > 6.4) continue;
      c.fill(a.x + dx, g - 3, a.z + dz, a.x + dx, g + 1, a.z + dz, d > 5.4 ? PI : QB);
      c.set(a.x + dx, g + 2, a.z + dz, d > 5.4 ? CQ : SQ);
    }
  }
  sculpt(c, a.x, g + 3, a.z, a.facing, a.s, ANIMALS[a.kind]);
}

// ---------------------------------------------------------------------------
// Yggdrasil, the white world tree, and the Well of Urd
// ---------------------------------------------------------------------------

const BIRCH = ["minecraft:birch_wood", { pillar_axis: "y" }];
const LEAVES = ["minecraft:birch_leaves", { persistent_bit: true }];

function yggdrasil(c) {
  const { x: tx, z: tz } = M.yggdrasil;
  const gy = (groundY(tx, tz) ?? B + 1);
  const H = 46;
  const branches = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + hash2(i, 0, 1101) * 0.5;
    const y0 = 26 + (i % 3) * 6;
    const len = 15 + hash2(i, 1, 1101) * 6;
    const end = [Math.cos(a) * len, y0 + 8 + hash2(i, 2, 1101) * 8, Math.sin(a) * len];
    return { from: [0, y0, 0], to: end };
  });
  const roots = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    return { from: [0, 3, 0], to: [Math.cos(a) * 13, -1.5, Math.sin(a) * 13] };
  });
  const clusters = [...branches.map((b) => ({ c: b.to, r: 8.5 })), { c: [0, H + 6, 0], r: 11 }];
  c.voxels(-34, 34, -34, 34, gy - 3, gy + H + 19, (u, v) => [tx + u, tz + v], (u, y, v) => {
    const ly = y - gy;
    const p = [u, ly, v];
    // Trunk, flaring at the foot.
    const tr = ly < 0 ? 0 : 4.8 - 2.2 * Math.min(1, ly / H) + Math.max(0, 3 - ly) * 0.9;
    if (ly >= 0 && ly <= H && Math.hypot(u, v) <= tr) return BIRCH;
    for (const b of branches) if (capsule(p, b.from, b.to) <= 1.9 - 0.6 * Math.min(1, Math.hypot(u, v) / 18)) return BIRCH;
    for (const r of roots) if (capsule(p, r.from, r.to) <= 1.6) return BIRCH;
    for (const k of clusters) {
      const d = Math.hypot(u - k.c[0], (ly - k.c[1]) * 1.5, v - k.c[2]);
      if (d <= k.r) {
        const h = hash2(u * 31 + ly, v * 17 - ly, 1102);
        if (h < 0.045) return [SEA];
        // Heavy frost: snow on the crown and patches all over the outer shell.
        if (d > k.r - 1.2 && (ly > k.c[1] + 1 || h > 0.55)) return ["minecraft:snow"];
        if (h > 0.9) return [PI];
        return LEAVES;
      }
    }
    return null;
  });
  // Shimmering strands hanging from the canopy.
  for (const b of branches) {
    for (let k = 0; k < 6; k++) {
      const x = Math.round(tx + b.to[0] + (hash2(k, b.to[0], 1103) - 0.5) * 10);
      const z = Math.round(tz + b.to[2] + (hash2(k, b.to[2], 1104) - 0.5) * 10);
      const y = Math.round(gy + b.to[1] - 8);
      c.fill(x, y - 2 - (k % 3), z, x, y, z, "minecraft:end_rod");
    }
  }
  // The Well of Urd among the roots.
  const wx = tx + 9, wz = tz + 9;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const d = Math.hypot(dx, dz);
    if (d <= 4.4) c.set(wx + dx, gy - 1, wz + dz, d > 3.4 ? CQ : d < 1.5 ? SEA : BI);
  }
}

// ---------------------------------------------------------------------------
// The Bifröst and Heimdall's watchtower
// ---------------------------------------------------------------------------

const RAINBOW = ["red", "orange", "yellow", "lime", "light_blue", "blue", "purple"].map((k) => `minecraft:${k}_stained_glass`);

function bifrostEnds() {
  const s = M.bifrost.from;
  const h = M.heimdall;
  const dx = s[0] - h.x, dz = s[1] - h.z;
  const len = Math.hypot(dx, dz);
  return { a: s, b: [h.x + (dx / len) * (h.r - 1), h.z + (dz / len) * (h.r - 1)] };
}

/** True when (x, z) is within m blocks of the Bifröst's path. */
export function nearBifrost(x, z, m) {
  const { a, b } = bifrostEnds();
  return capsule([x, 0, z], [a[0], 0, a[1]], [b[0], 0, b[1]]) <= m;
}

function bifrost(c) {
  const { a, b } = bifrostEnds();
  const y0 = B, y1 = M.heimdall.y;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const px = -dz / len, pz = dx / len;
  const steps = Math.ceil(len * 3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + dx * t, z = a[1] + dz * t;
    const y = Math.round(y0 + (y1 - y0) * t + 38 * Math.sin(Math.PI * t));
    for (let k = -3; k <= 3; k++) {
      const cx = Math.round(x + px * k), cz = Math.round(z + pz * k);
      c.fill(cx, y - 1, cz, cx, y, cz, RAINBOW[k + 3]);
      c.fill(cx, y + 1, cz, cx, y + 3, cz, "minecraft:air");
    }
    if (i % 30 === 15) {
      for (const k of [-4, 4]) c.set(Math.round(x + px * k), y, Math.round(z + pz * k), SEA);
    }
  }
}

function heimdall(c) {
  const { x, z, y, r } = M.heimdall;
  c.voxels(-r - 1, r + 1, -r - 1, r + 1, y - r * 3, y, (u, v) => [x + u, z + v], (u, yy, v) => {
    const d = Math.hypot(u, v);
    const edge = r + (hash2(x + u, z + v, 1201) - 0.5) * 2;
    if (d > edge) return null;
    const depth = r * 3 * Math.pow(1 - d / (edge + 0.5), 0.8);
    if (yy < y - depth) return null;
    if (yy === y) return [d < r - 3 ? SQ : "minecraft:snow"];
    return [yy < y - depth + 4 ? PI : yy > y - 3 ? "minecraft:snow" : "minecraft:stone"];
  });
  // The watchtower.
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > 4.5) continue;
      for (let k = 1; k <= 26; k++) {
        const wall = d > 3.4;
        const yy = y + k;
        if (wall) c.set(x + dx, yy, z + dz, k % 6 === 0 ? CQ : (k % 6 === 3 && (dx === 0 || dz === 0)) ? GLASS : QB);
        else c.set(x + dx, yy, z + dz, "minecraft:air");
      }
      c.set(x + dx, y + 27, z + dz, SQ);
      if (d > 3.4 && (dx + dz) % 2 === 0) c.set(x + dx, y + 28, z + dz, QB);
    }
  }
  for (let k = 1; k <= 3; k++) c.set(x, y + k, z + 4, "minecraft:air");
  for (let k = 1; k <= 26; k++) c.set(x - 3, y + k, z, "minecraft:ladder", { facing_direction: 5 });
  c.set(x - 3, y + 27, z, "minecraft:air");
  // Gjallarhorn, the great golden horn, on the battlements.
  const horn = [[1, 29, 0], [2.5, 30, 0.5], [3.5, 31.5, 1.5], [4, 33, 3]];
  for (let k = 0; k < horn.length - 1; k++) {
    const [ax, ay, az] = horn[k], [bx, by, bz] = horn[k + 1];
    for (let t = 0; t <= 1; t += 0.2) c.set(Math.round(x + ax + (bx - ax) * t), Math.round(y + ay + (by - ay) * t - 1), Math.round(z + az + (bz - az) * t), GOLD);
  }
  c.fill(x - 1, y + 27, z - 1, x + 1, y + 27, z + 1, "minecraft:iron_block");
  c.set(x, y + 28, z, "minecraft:beacon");
  spruce(c, x + 8, y + 1, z - 6, 8, false);
  spruce(c, x - 8, y + 1, z + 5, 7, false);
}

// ---------------------------------------------------------------------------
// Tholoi: round Greek temples with golden-banded domes
// ---------------------------------------------------------------------------

function tholos(c, t) {
  const { x, z } = t;
  const g = B;
  for (let dx = -10; dx <= 10; dx++) {
    for (let dz = -10; dz <= 10; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > 9.4) continue;
      const lvl = d > 8.4 ? 1 : d > 7.4 ? 2 : 3;
      c.fill(x + dx, g - 2, z + dz, x + dx, g + lvl, z + dz, lvl === 3 ? SQ : QB);
      if (lvl === 3 && Math.abs(d - 3) < 0.6) c.set(x + dx, g + 3, z + dz, GOLD);
    }
  }
  const F = g + 4;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const cx = Math.round(x + Math.cos(a) * 6.2), cz = Math.round(z + Math.sin(a) * 6.2);
    c.set(cx, F, cz, CQ);
    c.fill(cx, F + 1, cz, cx, F + 9, cz, ...QP);
    c.set(cx, F + 10, cz, CQ);
  }
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const d = Math.hypot(dx, dz);
      if (d >= 5 && d <= 7.4) {
        c.set(x + dx, F + 11, z + dz, QB);
        c.set(x + dx, F + 12, z + dz, d > 6.8 ? GOLD : QB);
      }
      for (let k = 0; k <= 7; k++) {
        const rr = Math.sqrt(Math.max(0, 7.2 * 7.2 - k * k));
        if (Math.abs(d - rr) < 0.75 || (d < rr && k === 7)) c.set(x + dx, F + 13 + k, z + dz, k === 3 ? GOLD : k > 5 ? BI : SQ);
      }
    }
  }
  c.set(x, F + 21, z, GOLD);
  c.set(x, F + 22, z, "minecraft:end_rod");
  // Altar of light within.
  c.fill(x - 1, F, z - 1, x + 1, F + 1, z + 1, CQ);
  c.set(x, F + 2, z, SEA);
  crystal(c, x, z, F + 3, 6, 1.2, 0, 0);
}

// ---------------------------------------------------------------------------
// The ring of rune stones
// ---------------------------------------------------------------------------

function runeRing(c) {
  const { x, z } = M.runeRing;
  for (let dx = -13; dx <= 13; dx++) for (let dz = -13; dz <= 13; dz++) {
    const d = Math.hypot(dx, dz);
    if (d <= 12.5) c.set(x + dx, groundY(x + dx, z + dz) - 1, z + dz, d < 2.5 ? CQ : Math.abs(d - 7) < 0.6 ? BI : d > 11.5 ? "minecraft:gravel" : "minecraft:snow");
  }
  const tops = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const sx = x + Math.cos(a) * 10, sz = z + Math.sin(a) * 10;
    const tx = -Math.sin(a), tz = Math.cos(a);
    const h = 6 + (k % 2) * 2;
    for (const w of [-0.5, 0.5]) {
      const cx = Math.round(sx + tx * w), cz = Math.round(sz + tz * w);
      const gy = groundY(cx, cz) ?? B + 1;
      for (let y = gy; y < gy + h; y++) c.set(cx, y, cz, hash2(k, y, 1301) < 0.25 ? PI : (y - gy) % 3 === 1 && hash2(k, y, 1302) < 0.5 ? BI : "minecraft:calcite");
      c.set(cx, gy + h, cz, "minecraft:snow_layer", { height: 1 });
      tops.push([cx, gy + h, cz]);
    }
  }
  const gy = groundY(x, z) ?? B + 1;
  c.fill(x - 1, gy, z - 1, x + 1, gy, z + 1, CQ);
  c.set(x, gy + 1, z, SEA);
  c.fill(x, gy + 2, z, x, gy + 4, z, "minecraft:end_rod");
}

// ---------------------------------------------------------------------------
// The ice palace: domed towers, more spires, temple ornaments
// ---------------------------------------------------------------------------

function domedTower(c, x, z, base, h, r) {
  for (let dx = -r - 1; dx <= r + 1; dx++) {
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.4) continue;
      for (let y = base; y < base + h; y++) {
        const shell = d > r - 0.9;
        const k = y - base;
        if (!shell) c.set(x + dx, y, z + dz, k === 0 ? SQ : "minecraft:air");
        else c.set(x + dx, y, z + dz, k % 7 === 0 ? CQ : (k % 7 >= 2 && k % 7 <= 4 && (dx === 0 || dz === 0)) ? GLASS : QB);
      }
      c.set(x + dx, base + h, z + dz, d > r - 0.9 ? GOLD : SQ);
      // Onion-curved dome of ice.
      for (let k = 1; k <= r + 4; k++) {
        const t = k / (r + 4);
        const rr = (r + 1) * Math.sin(Math.PI * (0.5 + 0.5 * t)) * (1 + 0.25 * Math.sin(Math.PI * t));
        if (d <= rr + 0.35 && d > rr - 1.1) c.set(x + dx, base + h + k, z + dz, k % 3 === 0 ? GOLD : k > r + 2 ? GLASS : BI);
      }
    }
  }
  c.fill(x, base + h + r + 5, z, x, base + h + r + 6, z, GOLD);
  c.set(x, base + h + r + 7, z, "minecraft:end_rod");
}

function icePalace(c) {
  const { x: tx, z: tz } = L.temple;
  for (const sx of [-1, 1]) {
    domedTower(c, tx + sx * 26, tz + 21, B + 11, 14, 4);
    domedTower(c, tx + sx * 26, tz - 24, B + 11, 18, 4);
  }
  for (const [x, z, h, r] of [[-40, -112, 38, 2], [40, -112, 38, 2], [-34, -68, 28, 2], [34, -68, 28, 2], [-16, -131, 52, 2], [16, -131, 52, 2], [-8, -134, 60, 1], [8, -134, 60, 1]]) {
    spire(c, tx + x, z, B + 5, h, r);
  }
  // Ornaments on the temple hall.
  const F = B + 17;
  const x1 = tx - 16, x2 = tx + 16, z2 = tz + 14;
  const colTop = F + 14;
  for (let x = x1; x <= x2; x += 2) c.set(x, colTop + 2, z2 + 1, (x - x1) % 4 === 0 ? GOLD : GLASS);
  for (const [x, y, z] of [[tx, colTop + 12, z2 + 2], [x1 - 2, colTop + 3, z2 + 2], [x2 + 2, colTop + 3, z2 + 2]]) {
    c.set(x, y + 1, z, GOLD);
    c.set(x, y + 2, z, "minecraft:end_rod");
  }
  // Blue-flamed braziers flanking the stairs, and soul lanterns on the tiers.
  for (const sx of [-1, 1]) {
    for (const [dx, y, z] of [[9, B + 17, tz + 17], [10, B + 11, tz + 25], [11, B + 5, tz + 33], [12, B + 1, tz + 39]]) {
      c.set(tx + sx * dx, y, z, CQ);
      c.set(tx + sx * dx, y + 1, z, "minecraft:soul_campfire", { extinguished: false });
    }
  }
}

// ---------------------------------------------------------------------------
// Valkyries on columns along the Processional Avenue
// ---------------------------------------------------------------------------

const VALKYRIE = [
  // Winged helm.
  ...both((s) => cap([s * 1.05, 13.5, 0], [s * 2.3, 14.9, -0.7], 0.32, GOLD)),
  ell([0, 13.5, 0], [1.08, 0.75, 1.05], GOLD),
  ell([0, 12.7, 0.1], [1, 1.15, 1], "minecraft:calcite"),
  // Spear held high, and a golden shield.
  cap([2.4, 1.5, 0.9], [2.4, 19, 0.9], 0.3, GOLD),
  ell([2.4, 19.4, 0.9], [0.35, 0.9, 0.35], GLASS),
  ell([-1.9, 8.6, 1.6], [1.5, 1.5, 0.35], GOLD),
  cap([1.4, 10.8, 0], [2.3, 13.2, 0.8], 0.5),
  cap([-1.4, 10.8, 0], [-1.9, 8.6, 1.1], 0.5),
  // Great wings of white feathers, tipped with ice.
  ...[[4.4, 16, -2], [5.6, 12.6, -2.2], [5.2, 9.2, -2], [4.1, 6.6, -1.8]].flatMap(([x, y, z]) => both((s) => cap([s * 1.1, 11, -0.9], [s * x, y, z], 0.65))),
  ...both((s) => ell([s * 4.8, 13.8, -2.1], [0.6, 0.6, 0.6], PI)),
  ell([0, 9.6, 0], [1.6, 2.4, 1.1]),
  ell([0, 4.2, 0], [2.2, 4.4, 1.8]),
];

function valkyrie(c, v) {
  const g = B + 1;
  c.fill(v.x - 1, g, v.z - 1, v.x + 1, g, v.z + 1, CQ);
  c.fill(v.x, g + 1, v.z, v.x, g + 8, v.z, ...QP);
  c.fill(v.x - 1, g + 9, v.z - 1, v.x + 1, g + 9, v.z + 1, CQ);
  c.set(v.x, g + 9, v.z, SEA);
  sculpt(c, v.x, g + 10, v.z, v.facing, 0.85, VALKYRIE);
}

// ---------------------------------------------------------------------------
// Spirit orbs: lights of souls drifting over the lake and the valley
// ---------------------------------------------------------------------------

export const ORBS = (() => {
  const out = [];
  for (let i = 0; out.length < 44 && i < 400; i++) {
    const x = Math.round((hash2(i, 0, 1601) - 0.5) * 300);
    const z = Math.round((hash2(i, 1, 1601) - 0.5) * 300) - 10;
    const col = islandColumn(x, z);
    if (!col || col.top > B + 12) continue;
    if (Math.abs(x) < 10 || Math.hypot(x - L.pole.x, z - L.pole.z) < 16) continue;
    out.push({ x, z, y: Math.max(col.top, B) + 16 + Math.round(hash2(i, 2, 1601) * 26) });
  }
  return out;
})();

function orb(c, o) {
  c.set(o.x, o.y, o.z, SEA);
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) c.set(o.x + dx, o.y + dy, o.z + dz, "minecraft:white_stained_glass");
}

// ---------------------------------------------------------------------------
// Aurora ribbons of coloured glass hanging in the northern sky
// ---------------------------------------------------------------------------

const AURORA_COLORS = ["minecraft:lime_stained_glass", "minecraft:lime_stained_glass", "minecraft:cyan_stained_glass", "minecraft:light_blue_stained_glass", "minecraft:purple_stained_glass", "minecraft:magenta_stained_glass"];

function skyAurora(c) {
  const t = c.tile;
  for (const [zc, phase, x1, x2] of [[-70, 0, -230, 230], [-145, 2.1, -260, 260], [-220, 4.2, -280, 280]]) {
    for (let x = Math.max(x1, t.minX); x <= Math.min(x2, t.maxX); x++) {
      const z = Math.round(zc + 22 * Math.sin(x / 41 + phase) + 7 * Math.sin(x / 13 + phase * 2));
      if (!c.has(x, z)) continue;
      const streak = fbm(x / 6, phase * 10, 1401, 2);
      if (streak < 0.38) continue;
      // Ragged hems: rays of different lengths, like real aurora curtains.
      const ray = fbm(x / 3, phase * 7 + 50, 1402, 2);
      const bottom = 286 + Math.round(8 * Math.sin(x / 23 + phase)) + Math.round((1 - ray) * 18) + (streak < 0.48 ? 8 : 0);
      if (bottom > 312) continue;
      for (let y = bottom; y <= 318; y++) {
        const k = Math.min(AURORA_COLORS.length - 1, Math.floor(((y - bottom) / (318 - bottom)) * AURORA_COLORS.length));
        c.set(x, y, z, AURORA_COLORS[k]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Peaks rising from the cloud sea around the edge of the world
// ---------------------------------------------------------------------------

const STRATA = ["minecraft:calcite", PI, "minecraft:calcite", "minecraft:stone"];

export const OUTER_PEAKS = (() => {
  const peaks = [];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash2(i, 0, 1501) * 0.18;
    const d = 238 + hash2(i, 1, 1501) * 70;
    const p = { x: Math.round(Math.cos(a) * d), z: Math.round(Math.sin(a) * d), r: 12 + Math.round(hash2(i, 2, 1501) * 12), top: 170 + Math.round(hash2(i, 3, 1501) * 100) };
    if (nearBifrost(p.x, p.z, p.r + 10)) continue;
    if (ISLETS.some((it) => Math.hypot(it.x - p.x, it.z - p.z) < it.r + p.r + 4)) continue;
    if (Math.hypot(p.x - M.heimdall.x, p.z - M.heimdall.z) < p.r + M.heimdall.r + 8) continue;
    peaks.push(p);
  }
  return peaks;
})();

function outerPeak(c, p) {
  const t = c.tile;
  const base = REALM.cloudBaseY - 8;
  for (let x = Math.max(p.x - p.r - 3, t.minX); x <= Math.min(p.x + p.r + 3, t.maxX); x++) {
    for (let z = Math.max(p.z - p.r - 3, t.minZ); z <= Math.min(p.z + p.r + 3, t.maxZ); z++) {
      const d = Math.hypot(x - p.x, z - p.z) + (fbm(x / 6, z / 6, 1502) - 0.5) * 5;
      if (d >= p.r) continue;
      const k = Math.pow(1 - d / p.r, 1.5);
      const top = Math.round(base + (p.top - base) * k + ridged(x / 9, z / 9, 1503, 2) * 10 * k);
      if (top <= base) continue;
      const off = Math.floor(fbm(x / 20, z / 20, 1504) * 10);
      for (let y = base; y <= top - 2; ) {
        const band = Math.floor((y + off) / 6);
        const end = Math.min(top - 2, band * 6 + 5 - off);
        c.fill(x, y, z, x, end, z, STRATA[band & 3]);
        y = end + 1;
      }
      c.fill(x, top - 1, z, x, top, z, k > 0.25 ? "minecraft:snow" : PI);
    }
  }
}

// ---------------------------------------------------------------------------

export const MYTHIC = [
  { name: "yggdrasil", bounds: bounds(M.yggdrasil.x - 35, M.yggdrasil.x + 35, M.yggdrasil.z - 35, M.yggdrasil.z + 35), build: yggdrasil },
  { name: "bifrost", bounds: (() => { const { a, b } = bifrostEnds(); return bounds(Math.min(a[0], b[0]) - 6, Math.max(a[0], b[0]) + 6, Math.min(a[1], b[1]) - 6, Math.max(a[1], b[1]) + 6); })(), build: bifrost },
  { name: "heimdall", bounds: bounds(M.heimdall.x - 16, M.heimdall.x + 16, M.heimdall.z - 16, M.heimdall.z + 16), build: heimdall },
  ...M.tholoi.map((t, i) => ({ name: `tholos${i}`, bounds: bounds(t.x - 11, t.x + 11, t.z - 11, t.z + 11), build: (c) => tholos(c, t) })),
  { name: "runeRing", bounds: bounds(M.runeRing.x - 14, M.runeRing.x + 14, M.runeRing.z - 14, M.runeRing.z + 14), build: runeRing },
  ...M.animals.map((a, i) => ({ name: `animal${i}`, bounds: bounds(a.x - 30, a.x + 30, a.z - 30, a.z + 30), build: (c) => animalStatue(c, a) })),
  { name: "icePalace", bounds: bounds(L.temple.x - 48, L.temple.x + 48, L.temple.z - 40, L.temple.z + 42), build: icePalace },
  ...M.valkyries.map((v, i) => ({ name: `valkyrie${i}`, bounds: bounds(v.x - 10, v.x + 10, v.z - 10, v.z + 10), build: (c) => valkyrie(c, v) })),
  ...ORBS.map((o, i) => ({ name: `orb${i}`, bounds: bounds(o.x - 1, o.x + 1, o.z - 1, o.z + 1), build: (c) => orb(c, o) })),
  { name: "skyAurora", bounds: bounds(-280, 280, -260, -30), build: skyAurora },
  ...OUTER_PEAKS.map((p, i) => ({ name: `peak${i}`, bounds: bounds(p.x - p.r - 3, p.x + p.r + 3, p.z - p.r - 3, p.z + p.r + 3), build: (c) => outerPeak(c, p) })),
];
