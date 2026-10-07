// The great landmarks of Agartha. Each structure has a bounding box (so it is
// only generated for tiles it touches) and a build(canvas) function.

import { LAYOUT, B, islandColumn, groundY, lakeValue, isReserved, slopeAt } from "./terrain.js";
import { orient, stairs, slab, pillar, lantern } from "./canvas.js";
import { hash2, hash3 } from "./noise.js";
import { buildCitadel, CITADEL_BOUNDS } from "./citadel.js";

const Q = "minecraft:quartz_block";
const QB = "minecraft:quartz_bricks";
const SQ = "minecraft:smooth_quartz";
const CQ = "minecraft:chiseled_quartz_block";
const QP = pillar("minecraft:quartz_pillar");
const PI = "minecraft:packed_ice";
const BI = "minecraft:blue_ice";
const GLASS = "minecraft:light_blue_stained_glass";
const SNOW = "minecraft:snow";
const GOLD = "minecraft:gold_block";

const bounds = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

function beacon(c, x, y, z, glass = GLASS) {
  c.fill(x - 1, y - 1, z - 1, x + 1, y - 1, z + 1, "minecraft:iron_block");
  c.set(x, y, z, "minecraft:beacon");
  if (glass) c.set(x, y + 1, z, glass);
}

function lampPost(c, x, y, z, glow = "minecraft:sea_lantern") {
  c.fill(x, y, z, x, y + 3, z, ...QP);
  c.set(x, y + 4, z, glow);
}

/** Stair flight climbing toward `dir` ("north"/"south"/"east"/"west"). */
function stairFlight(c, x1, x2, start, y0, steps, dir, id = "minecraft:quartz_stairs", support = SQ) {
  const dz = dir === "north" ? -1 : dir === "south" ? 1 : 0;
  const dx = dir === "west" ? -1 : dir === "east" ? 1 : 0;
  for (let i = 0; i < steps; i++) {
    const y = y0 + i;
    if (dz) {
      const z = start + dz * i;
      if (y > y0) c.fill(x1, y0, z, x2, y - 1, z, support);
      c.fill(x1, y, z, x2, y, z, ...stairs(id, dir));
    } else {
      const x = start + dx * i;
      if (y > y0) c.fill(x, y0, x1, x, y - 1, x2, support);
      c.fill(x, y, x1, x, y, x2, ...stairs(id, dir));
    }
  }
}

// ---------------------------------------------------------------------------
// Heaven's Gate, the arrival plaza and the processional avenue
// ---------------------------------------------------------------------------

function plaza(c) {
  const { x: px, z: pz, r } = LAYOUT.plaza;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.5) continue;
      let id = SQ;
      if (d < 1.5) id = GOLD;
      else if (Math.abs(d - 5) < 0.6 || Math.abs(d - 11) < 0.6) id = "minecraft:light_blue_concrete";
      else if (Math.abs(d - r) < 0.8) id = QB;
      else {
        // Eight-armed snowflake inlaid in the floor.
        const a = Math.atan2(dz, dx);
        const arm = Math.abs(((a / (Math.PI / 4)) % 1 + 1) % 1 - 0.5);
        if (arm > 0.47 && d < 15) id = BI;
      }
      c.fill(px + dx, B - 2, pz + dz, px + dx, B, pz + dz, id);
    }
  }
  // Ring of lamp posts and crystal braziers.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.round(px + Math.cos(a) * (r - 1.5));
    const z = Math.round(pz + Math.sin(a) * (r - 1.5));
    if (Math.abs(x - px) < 6 && z < pz) continue; // keep the way north open
    lampPost(c, x, B + 1, z);
  }
  c.set(px + 4, B + 1, pz + 4, "agartha:runestone");
  c.set(px - 4, B + 1, pz + 4, "agartha:runestone");
  returnPortal(c);
}

/** Quartz-and-gold archway holding the portal back to the mortal world. */
function returnPortal(c) {
  const { x: rx, z: rz } = LAYOUT.returnPortal;
  c.fill(rx - 4, B + 1, rz - 1, rx + 4, B + 8, rz + 1, QB);
  c.fill(rx - 4, B + 1, rz, rx + 4, B + 8, rz, CQ);
  c.fill(rx - 5, B + 1, rz - 1, rx - 5, B + 6, rz + 1, ...QP);
  c.fill(rx + 5, B + 1, rz - 1, rx + 5, B + 6, rz + 1, ...QP);
  c.fill(rx - 3, B + 9, rz - 1, rx + 3, B + 9, rz + 1, GOLD);
  c.fill(rx - 1, B + 10, rz, rx + 1, B + 10, rz, GOLD);
  c.set(rx, B + 11, rz, "minecraft:sea_lantern");
  for (const sx of [-5, 5]) c.set(rx + sx, B + 7, rz, "minecraft:sea_lantern");
  // Portal surface, 5 wide and 6 tall.
  c.fill(rx - 2, B + 1, rz, rx + 2, B + 6, rz, "agartha:portal");
  c.fill(rx - 2, B + 1, rz - 1, rx + 2, B + 6, rz - 1, "minecraft:air");
  c.fill(rx - 2, B + 1, rz + 1, rx + 2, B + 6, rz + 1, "minecraft:air");
}

function heavensGate(c) {
  const gz = LAYOUT.gate.z;
  const top = B + 44;
  for (const sx of [-1, 1]) {
    const cx = 14 * sx;
    // Pillar: quartz core, ice corner ribs, chiseled bands.
    c.fill(cx - 3, B - 2, gz - 3, cx + 3, top, gz + 3, QB);
    for (let y = B + 1; y <= top; y += 8) c.fill(cx - 3, y, gz - 3, cx + 3, y, gz + 3, CQ);
    for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) c.fill(cx + ox, B + 1, gz + oz, cx + ox, top - 6, gz + oz, BI);
    c.fill(cx - 4, B + 1, gz - 4, cx + 4, B + 3, gz + 4, QB);
    // Stepped cap and beacon of light.
    c.fill(cx - 4, top + 1, gz - 4, cx + 4, top + 1, gz + 4, CQ);
    c.fill(cx - 2, top + 2, gz - 2, cx + 2, top + 2, gz + 2, QB);
    beacon(c, cx, top + 4, gz);
    c.fill(cx - 1, top + 3, gz - 1, cx + 1, top + 3, gz + 1, "minecraft:iron_block");
  }
  // Lintel and crest spanning the gate.
  c.fill(-10, B + 32, gz - 2, 10, B + 36, gz + 2, QB);
  c.fill(-10, B + 32, gz - 2, 10, B + 32, gz + 2, CQ);
  for (let k = 0; k < 8; k++) c.fill(-8 + k, B + 37 + k, gz - 1, 8 - k, B + 37 + k, gz + 1, k === 7 ? GOLD : SQ);
  // Golden sun disc on the face of the lintel.
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
    const d = Math.hypot(dx, dy);
    if (d <= 4.2) c.set(dx, B + 34 + dy, gz + 3, d < 2 ? "minecraft:glowstone" : GOLD);
  }
  // Icicles hanging from the lintel.
  for (let x = -9; x <= 9; x += 2) {
    const len = 1 + Math.floor(hash2(x, gz, 301) * 4);
    c.fill(x, B + 32 - len, gz, x, B + 31, gz, PI);
  }
}

function avenue(c) {
  const { x1, x2, z1, z2 } = LAYOUT.avenue;
  for (let z = z1; z <= z2; z++) {
    c.fill(x1, B - 1, z, x2, B, z, z % 6 === 0 ? CQ : (z % 2 ? SQ : QB));
    c.fill(x1 - 1, B - 1, z, x1 - 1, B, z, PI);
    c.fill(x2 + 1, B - 1, z, x2 + 1, B, z, PI);
    c.fill(x1 - 2, B + 1, z, x2 + 2, B + 8, z, "minecraft:air");
  }
  for (let z = z1 + 4; z <= z2; z += 9) {
    lampPost(c, x1 - 3, B + 1, z);
    lampPost(c, x2 + 3, B + 1, z);
  }
}

// ---------------------------------------------------------------------------
// Colossal All-Father statues
// ---------------------------------------------------------------------------

function capsule(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

function statue(c, cx, baseY, cz, s, facing = "south") {
  const P = Math.round(7 * s); // pedestal height
  const R = (k) => k * s;
  const robeTop = P + R(30);
  const torsoTop = P + R(44);
  const head = [0, P + R(49), R(0.3)];
  const staffU = R(8.6);
  const staffV = R(3.2);
  const rArm = [[R(6), P + R(42), 0], [R(8), P + R(33), R(1.5)], [staffU, P + R(27), staffV]];
  const lArm = [[R(-6), P + R(42), 0], [R(-7.5), P + R(33), R(1.8)], [R(-3.5), P + R(30.5), R(4.2)]];
  const horn = (sg) => Array.from({ length: 11 }, (_, k) => [sg * R(3.3 + 0.5 * k), P + R(51) + R(k * 0.95 - Math.max(0, k - 7) * 0.4), R(0.3)]);
  const horns = [horn(1), horn(-1)];
  const QPY = QP;

  const blockAt = (u, y, v) => {
    const ly = y - baseY;
    if (ly < 0) return null;
    // Pedestal.
    if (ly < P) {
      if (Math.abs(u) <= R(12) && Math.abs(v) <= R(10)) {
        if (ly === P - 1 || ly === 0) return [CQ];
        if ((Math.abs(u) === Math.round(R(12)) || Math.abs(v) === Math.round(R(10))) && (u + v) % 4 === 0) return [BI];
        return [QB];
      }
      return null;
    }
    const p = [u, ly, v];
    // Staff and its glowing orb.
    const orbY = P + R(61);
    const od = Math.hypot(u - staffU, ly - orbY, v - staffV);
    if (od <= R(2.2) + 0.4) return od <= R(1.2) + 0.3 ? ["minecraft:sea_lantern"] : [GLASS];
    if (Math.hypot(u - staffU, v - staffV) <= Math.max(0.5, R(0.7)) && ly < orbY) return [GOLD];
    // Crown with spikes.
    const hr = Math.hypot(u, v - head[2]);
    if (ly >= P + R(52) && ly < P + R(54.5) && hr >= R(2.9) && hr <= R(3.9) + 0.3) return [GOLD];
    if (ly >= P + R(54.5) && ly < P + R(57.5) && hr >= R(2.4) && hr <= R(3.9) + 0.3) {
      const a = (Math.atan2(v - head[2], u) / (Math.PI / 4)) % 1;
      if (Math.abs(a) < 0.18 || Math.abs(a) > 0.82) return [GOLD];
    }
    // Horns.
    for (const pts of horns) {
      for (let k = 0; k < pts.length - 1; k++) if (capsule(p, pts[k], pts[k + 1]) <= R(1.0 - k * 0.06) + 0.35) return ["minecraft:bone_block", { pillar_axis: "y" }];
    }
    // Head: glowing eyes, white hair and face.
    const hd = Math.hypot(u / R(3.4), (ly - head[1]) / R(3.8), (v - head[2]) / R(3.4));
    if (hd <= 1.05) {
      if (v > head[2] + R(2.4) && Math.abs(Math.abs(u) - R(1.3)) < 0.6 + R(0.2) && Math.abs(ly - (head[1] + R(0.6))) < 0.6) return ["minecraft:sea_lantern"];
      if (v < head[2] - R(0.8) || ly > head[1] + R(2.6)) return [SNOW];
      return [SQ];
    }
    // Long white beard.
    if (ly >= P + R(33) && ly < P + R(48) && v >= R(1.2) && v <= R(4.8)) {
      const t = (ly - (P + R(33))) / R(15);
      if (Math.abs(u) <= R(0.8) + R(2.6) * Math.pow(t, 0.7)) return [SNOW];
    }
    // Arms.
    for (const [arm, end] of [[rArm, "minecraft:calcite"], [lArm, "minecraft:calcite"]]) {
      if (capsule(p, arm[0], arm[1]) <= R(2.0) + 0.3 || capsule(p, arm[1], arm[2]) <= R(1.7) + 0.3) return [SQ];
      if (Math.hypot(u - arm[2][0], ly - arm[2][1], v - arm[2][2]) <= R(1.9) + 0.3) return [end];
    }
    // Neck.
    if (ly >= torsoTop && ly < P + R(46) && Math.hypot(u, v) <= R(2.2)) return [SQ];
    // Torso.
    if (ly >= robeTop && ly < torsoTop) {
      const t = (ly - robeTop) / R(14);
      const ru = R(5 + 1.8 * t);
      const rv = R(3.6);
      if ((u / ru) ** 2 + (v / rv) ** 2 <= 1) return [SQ];
      if (v < 0 && (u / (ru + R(1))) ** 2 + (v / (rv + R(1.3))) ** 2 <= 1) return ["minecraft:light_blue_concrete"];
    }
    // Golden belt.
    if (ly >= robeTop - R(1) && ly < robeTop + R(1)) {
      if ((u / R(5.4)) ** 2 + (v / R(4.2)) ** 2 <= 1) return [GOLD];
    }
    // Flowing robe with folds, and the cape behind it.
    if (ly >= P && ly < robeTop) {
      const t = (ly - P) / R(30);
      const ru = R(8.5 - 3.5 * t);
      const rv = R(6 - 2.2 * t);
      if ((u / ru) ** 2 + (v / rv) ** 2 <= 1) {
        const fold = Math.floor((Math.atan2(v, u) + Math.PI) / (Math.PI / 9)) % 2;
        return fold ? QPY : [SQ];
      }
      if (v < 0 && (u / (ru + R(1))) ** 2 + (v / (rv + R(1.4))) ** 2 <= 1) return ["minecraft:light_blue_concrete"];
    }
    return null;
  };

  const ext = Math.ceil(R(13));
  c.voxels(-ext, ext, -ext, ext, baseY, baseY + Math.ceil(P + R(64)), orient(cx, cz, facing), blockAt);
}

function statueBounds(x, z, s) {
  const e = Math.ceil(13 * s) + 1;
  return bounds(x - e, x + e, z - e, z + e);
}

// ---------------------------------------------------------------------------
// The Temple of Agartha: terraced platform, colonnaded ice-glass hall,
// beacon of light, and a skyline of ice spires
// ---------------------------------------------------------------------------

function temple(c) {
  const { x: tx, z: tz } = LAYOUT.temple;
  const tiers = [
    { hx: 40, z1: tz - 34, z2: tz + 34, y1: B + 1, y2: B + 4 },
    { hx: 30, z1: tz - 28, z2: tz + 26, y1: B + 5, y2: B + 10 },
    { hx: 20, z1: tz - 22, z2: tz + 18, y1: B + 11, y2: B + 16 },
  ];
  c.fill(tx - 40, B - 3, tz - 34, tx + 40, B, tz + 34, QB);
  for (const t of tiers) {
    c.fill(tx - t.hx, t.y1, t.z1, tx + t.hx, t.y2, t.z2, QB);
    c.fill(tx - t.hx, t.y2, t.z1, tx + t.hx, t.y2, t.z2, SQ);
    // Ice trim and lamp posts on each tier edge.
    for (const x of [tx - t.hx, tx + t.hx]) c.fill(x, t.y1, t.z1, x, t.y2 - 1, t.z2, PI);
    c.fill(tx - t.hx, t.y1, t.z2, tx + t.hx, t.y2 - 1, t.z2, PI);
    for (let x = tx - t.hx + 2; x <= tx + t.hx - 2; x += 8) {
      if (Math.abs(x - tx) > 9) lampPost(c, x, t.y2 + 1, t.z2 - 1);
    }
  }
  // Grand stairs up the south face of each tier.
  stairFlight(c, tx - 8, tx + 8, tz + 38, B + 1, 4, "north");
  stairFlight(c, tx - 7, tx + 7, tz + 32, B + 5, 6, "north");
  stairFlight(c, tx - 6, tx + 6, tz + 24, B + 11, 6, "north");

  // The hall.
  const F = B + 17; // stylobate
  const x1 = tx - 16, x2 = tx + 16, z1 = tz - 18, z2 = tz + 14;
  c.fill(x1, F, z1, x2, F, z2, SQ);
  c.fill(x1 + 1, F + 1, z1 + 1, x2 - 1, F + 16, z2 - 1, "minecraft:air");
  // Peristyle columns.
  const colTop = F + 14;
  const columns = [];
  for (let x = x1; x <= x2; x += 4) columns.push([x, z1], [x, z2]);
  for (let z = z1 + 4; z < z2; z += 4) columns.push([x1, z], [x2, z]);
  for (const [x, z] of columns) {
    c.set(x, F + 1, z, CQ);
    c.fill(x, F + 2, z, x, colTop - 1, z, ...QP);
    c.set(x, colTop, z, CQ);
  }
  // Cella of ice-glass with quartz frames.
  const cx1 = tx - 10, cx2 = tx + 10, cz1 = tz - 14, cz2 = tz + 9;
  for (let y = F + 1; y <= colTop; y++) {
    for (let x = cx1; x <= cx2; x++) {
      for (const z of [cz1, cz2]) c.set(x, y, z, (x - cx1) % 4 === 0 || y === F + 1 || y === colTop ? QB : GLASS);
    }
    for (let z = cz1; z <= cz2; z++) {
      for (const x of [cx1, cx2]) c.set(x, y, z, (z - cz1) % 4 === 0 || y === F + 1 || y === colTop ? QB : GLASS);
    }
  }
  c.fill(tx - 2, F + 1, cz2, tx + 2, F + 8, cz2, "minecraft:air");
  c.fill(tx - 3, F + 9, cz2, tx + 3, F + 9, cz2, CQ);
  // Entablature.
  c.fill(x1 - 1, colTop + 1, z1 - 1, x2 + 1, colTop + 2, z2 + 1, QB);
  c.fill(x1 - 1, colTop + 1, z1 - 1, x2 + 1, colTop + 1, z2 + 1, CQ);
  // Low gabled roof with pediments front and back.
  for (let k = 0; k <= 9; k++) {
    const y = colTop + 3 + k;
    const a = x1 - 2 + 2 * k;
    const b = x2 + 2 - 2 * k;
    if (a > b) break;
    c.fill(a, y, z1 - 2, b, y, z2 + 2, SQ);
    c.fill(a, y, z1 - 2, a, y, z2 + 2, ...stairs("minecraft:quartz_stairs", "east"));
    c.fill(b, y, z1 - 2, b, y, z2 + 2, ...stairs("minecraft:quartz_stairs", "west"));
    c.fill(a + 1, y + 1, z1 - 2, b - 1, y + 1, z2 + 2, SNOW);
  }
  // Golden sun in the front pediment.
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) {
    if (Math.hypot(dx, dy - 0.5) <= 2.3) c.set(tx + dx, colTop + 5 + dy, z2 + 3, GOLD);
  }
  // Sacred beacon inside, its beam rising through glass.
  const bz = tz - 8;
  c.fill(tx - 2, F, bz - 2, tx + 2, F, bz + 2, GOLD);
  beacon(c, tx, F + 1, bz, null);
  c.fill(tx, colTop + 1, bz, tx, colTop + 14, bz, GLASS);
  // Throne of the All-Father and the altar.
  c.fill(tx - 3, F + 1, bz - 4, tx + 3, F + 1, bz - 3, CQ);
  c.set(tx, F + 2, bz - 4, ...stairs("minecraft:quartz_stairs", "north"));
  c.fill(tx, F + 3, bz - 5, tx, F + 5, bz - 5, GOLD);
  c.set(tx - 6, F + 1, bz + 4, "agartha:runestone");
  c.chest(tx + 6, F + 1, bz + 4, "south", "agartha/viking_hoard");
  for (const [x, z] of [[cx1 + 2, cz1 + 2], [cx2 - 2, cz1 + 2], [cx1 + 2, cz2 - 2], [cx2 - 2, cz2 - 2]]) lampPost(c, x, F + 1, z);
}

function spire(c, x, z, baseY, height, radius) {
  const towerTop = baseY + Math.round(height * 0.55);
  const tip = baseY + height;
  c.voxels(-radius - 1, radius + 1, -radius - 1, radius + 1, baseY, tip + 1, (u, v) => [x + u, z + v], (u, y, v) => {
    const r = Math.hypot(u, v);
    if (y <= towerTop) {
      const rr = radius + (y < baseY + 3 ? 1 : 0);
      if (r > rr + 0.3) return null;
      if (r < rr - 0.8) return y === baseY ? [QB] : null;
      if ((y - baseY) % 9 === 0) return [CQ];
      if ((y - baseY) % 9 >= 3 && (y - baseY) % 9 <= 5 && Math.abs(u) <= 0 && Math.abs(v) > 0) return [GLASS];
      if ((y - baseY) % 9 >= 3 && (y - baseY) % 9 <= 5 && Math.abs(v) <= 0 && Math.abs(u) > 0) return [GLASS];
      return [(y - baseY) % 9 === 7 ? BI : PI];
    }
    const t = (y - towerTop) / (tip - towerTop);
    const rr = (radius + 0.6) * (1 - t);
    if (r > rr + 0.35) return null;
    if (y >= tip - 1) return ["minecraft:sea_lantern"];
    return [t > 0.6 ? GLASS : r < rr - 1 ? BI : PI];
  });
  c.set(x, tip + 2, z, "minecraft:end_rod");
  c.set(x, towerTop + 1, z, "minecraft:sea_lantern");
}

const SPIRES = [
  [-36, -126, 70, 4], [36, -126, 70, 4],
  [-24, -131, 56, 3], [24, -131, 56, 3],
  [-45, -96, 46, 3], [45, -96, 46, 3],
  [-45, -70, 34, 3], [45, -70, 34, 3],
  [-12, -133, 44, 2], [12, -133, 44, 2],
];

function spires(c) {
  for (const [sx, sz, h, r] of SPIRES) {
    const g = Math.abs(sx) <= 40 && sz >= -134 && sz <= -66 ? B + 5 : groundY(sx, sz) ?? B + 1;
    spire(c, LAYOUT.temple.x + sx, sz, g, h, r);
  }
}

// ---------------------------------------------------------------------------
// The great bridge across the frozen lake
// ---------------------------------------------------------------------------

function bridge(c) {
  const { z1, z2, half } = LAYOUT.bridge;
  const zc = (z1 + z2) / 2;
  const L2 = (z1 - z2) / 2;
  const ice = B - 1;
  const piers = [];
  for (let z = z2; z <= z1; z += 16) piers.push(z);
  for (let z = z2; z <= z1; z++) {
    const t = (z - zc) / L2;
    const S = Math.round((B + 1 + 9 * (1 - t * t)) * 2) / 2; // walking surface, half-block steps
    const full = Math.floor(S);
    const top = full - 1;
    const hasSlab = S !== full;
    // Spandrels with arches between piers.
    const near = piers.reduce((m, p) => Math.min(m, Math.abs(z - p)), 99);
    const gap = Math.max(0, Math.round(Math.sqrt(Math.max(0, 1 - ((8 - near) / 8) ** 2)) * Math.max(0, top - ice - 3)));
    const archBottom = near <= 1 ? ice - 4 : ice + 1 + gap;
    if (archBottom <= top - 2) c.fill(-half, archBottom, z, half, top - 2, z, "minecraft:stone_bricks");
    c.fill(-half, top - 1, z, half, top, z, QB);
    c.fill(-half + 1, top, z, half - 1, top, z, z % 2 ? SQ : "minecraft:spruce_planks");
    c.fill(-half, top + 1, z, half, top + 6, z, "minecraft:air");
    if (hasSlab) c.fill(-half + 1, full, z, half - 1, full, z, ...slab("minecraft:quartz_slab"));
    // Railings.
    c.fill(-half, full, z, -half, full, z, QB);
    c.fill(half, full, z, half, full, z, QB);
    if ((z - z2) % 8 === 0) {
      lampPost(c, -half, full + 1, z, "minecraft:sea_lantern");
      lampPost(c, half, full + 1, z, "minecraft:sea_lantern");
    }
  }
  // Pier footings breaking through the ice.
  for (const p of piers) c.fill(-half - 1, ice - 6, p - 2, half + 1, ice + 1, p + 2, "minecraft:stone_bricks");
}

// ---------------------------------------------------------------------------
// Longships frozen into the lake
// ---------------------------------------------------------------------------

const SHIPS = [
  { x: -46, z: 16, facing: "east" },
  { x: 42, z: 18, facing: "south" },
  { x: -32, z: -36, facing: "west" },
];
const SHIELD = ["minecraft:yellow_wool", "minecraft:red_wool", "minecraft:white_wool", "minecraft:blue_wool"];

function longship(c, sx, sz, facing) {
  const w = orient(sx, sz, facing);
  const ice = B - 1;
  const halfW = (v) => 4 * Math.sqrt(Math.max(0, 1 - (v / 14) ** 2));
  const put = (u, y, v, id, st) => {
    const [x, z] = w(u, v);
    c.set(x, y, z, id, st);
  };
  const col = (u, v, y1, y2, id) => {
    const [x, z] = w(u, v);
    c.fill(x, y1, z, x, y2, z, id);
  };
  // u = across the ship, v = along it (bow at +v).
  for (let v = -13; v <= 13; v++) {
    const hw = halfW(v);
    const hwi = Math.floor(hw + 0.3);
    for (let u = -hwi; u <= hwi; u++) {
      const edge = Math.abs(u) >= hwi || Math.abs(v) >= 12;
      if (edge) col(u, v, ice - 2, B + 2, "minecraft:dark_oak_planks");
      else {
        col(u, v, ice - 2, ice, "minecraft:dark_oak_planks");
        put(u, B, v, "minecraft:spruce_planks");
        col(u, v, B + 1, B + 3, "minecraft:air");
        if (hash2(u, v + sx, 401) < 0.25) put(u, B + 1, v, "minecraft:snow_layer", { height: 0 });
      }
    }
    // Shields along the gunwales.
    if (Math.abs(v) <= 9 && v % 2 === 0) {
      const sh = SHIELD[(v / 2 + 10) % SHIELD.length];
      put(hwi + 1, B + 1, v, sh);
      put(-hwi - 1, B + 1, v, sh);
    }
    // Oars resting on the ice.
    if (Math.abs(v) <= 8 && v % 3 === 1) {
      for (let k = 1; k <= 3; k++) {
        put(hwi + k, B, v, "minecraft:stripped_spruce_log", { pillar_axis: facing === "east" || facing === "west" ? "z" : "x" });
        put(-hwi - k, B, v, "minecraft:stripped_spruce_log", { pillar_axis: facing === "east" || facing === "west" ? "z" : "x" });
      }
    }
  }
  // Curling dragon prow and stern.
  const curl = [[13, B + 2], [14, B + 3], [15, B + 4], [15, B + 5], [16, B + 6], [16, B + 7], [16, B + 8], [15, B + 9], [14, B + 9]];
  for (const [v, y] of curl) {
    put(0, y, v, "minecraft:dark_oak_planks");
    put(0, y, -v, "minecraft:dark_oak_planks");
  }
  put(0, B + 10, 15, "minecraft:dark_oak_planks");
  put(0, B + 9, 13, "minecraft:dark_oak_fence");
  // Mast, yard and striped sail.
  col(0, 0, B + 1, B + 15, "minecraft:spruce_log");
  for (let u = -6; u <= 6; u++) put(u, B + 14, 0, "minecraft:spruce_log", { pillar_axis: facing === "east" || facing === "west" ? "z" : "x" });
  for (let u = -5; u <= 5; u++) {
    for (let y = B + 6; y <= B + 13; y++) put(u, y, 1, (Math.floor((u + 5) / 2) % 2) ? "minecraft:red_wool" : "minecraft:white_wool");
  }
}

// ---------------------------------------------------------------------------
// Stepped ice pyramids crowned with beams of light
// ---------------------------------------------------------------------------

function pyramid(c, p, withChamber) {
  const n = p.half;
  for (let k = 0; k < n; k++) {
    const hs = p.half - k;
    const y = B + 1 + k;
    const id = k % 4 === 3 ? PI : k % 4 === 1 ? QB : "minecraft:calcite";
    c.fill(p.x - hs, y, p.z - hs, p.x + hs, y, p.z + hs, id);
    // Snow dusting on the exposed step.
    if (k > 0) {
      for (let d = -hs - 1; d <= hs + 1; d++) {
        for (const [x, z] of [[p.x + d, p.z - hs - 1], [p.x + d, p.z + hs + 1], [p.x - hs - 1, p.z + d], [p.x + hs + 1, p.z + d]]) {
          if (hash2(x, z, 501 + k) < 0.55) c.set(x, y, z, "minecraft:snow_layer", { height: 0 });
        }
      }
    }
  }
  c.fill(p.x - p.half - 1, B - 2, p.z - p.half - 1, p.x + p.half + 1, B, p.z + p.half + 1, QB);
  // Stairway up the south face.
  for (let k = 0; k < n; k++) {
    c.fill(p.x - 2, B + 1 + k, p.z + p.half - k, p.x + 2, B + 1 + k, p.z + p.half - k, ...stairs("minecraft:quartz_stairs", "north"));
  }
  // Summit shrine and beacon.
  const top = B + n;
  beacon(c, p.x, top + 1, p.z);
  for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    c.fill(p.x + ox, top + 1, p.z + oz, p.x + ox, top + 3, p.z + oz, ...QP);
    c.set(p.x + ox, top + 4, p.z + oz, "minecraft:sea_lantern");
  }
  if (withChamber) {
    // Burial chamber of a great jarl, reached by a passage from the south.
    c.fill(p.x - 6, B + 1, p.z - 6, p.x + 6, B + 8, p.z + 6, "minecraft:air");
    c.fill(p.x - 6, B, p.z - 6, p.x + 6, B, p.z + 6, SQ);
    // Entrance passage from the east face (the stairway climbs the south face).
    c.fill(p.x + 6, B + 1, p.z - 1, p.x + p.half + 1, B + 3, p.z + 1, "minecraft:air");
    c.fill(p.x + 6, B, p.z - 1, p.x + p.half + 1, B, p.z + 1, BI);
    for (const dz of [-2, 2]) c.fill(p.x + p.half + 1, B + 1, p.z + dz, p.x + p.half + 1, B + 4, p.z + dz, ...QP);
    for (const [ox, oz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      c.fill(p.x + ox, B + 1, p.z + oz, p.x + ox, B + 7, p.z + oz, ...QP);
      c.set(p.x + ox, B + 4, p.z + oz, "minecraft:sea_lantern");
    }
    c.fill(p.x - 2, B + 1, p.z - 3, p.x + 2, B + 1, p.z - 1, CQ);
    c.chest(p.x - 1, B + 2, p.z - 2, "south", "agartha/viking_hoard");
    c.chest(p.x + 1, B + 2, p.z - 2, "south", "agartha/viking_hoard");
    c.set(p.x, B + 2, p.z - 3, GOLD);
    c.set(p.x - 4, B + 1, p.z + 3, "agartha:runestone");
  }
}

// ---------------------------------------------------------------------------
// Giant ice crystals
// ---------------------------------------------------------------------------

function crystal(c, x, z, baseY, h, r, tx, tz) {
  const top = [x + tx * h, baseY + h, z + tz * h];
  const base = [x, baseY - 3, z];
  const e = Math.ceil(r + Math.abs(tx * h) + Math.abs(tz * h)) + 1;
  c.voxels(-e, e, -e, e, baseY - 3, baseY + h + 1, (u, v) => [x + u, z + v], (u, y, v) => {
    const p = [x + u, y, z + v];
    const ax = top[0] - base[0], ay = top[1] - base[1], az = top[2] - base[2];
    const t = Math.max(0, Math.min(1, ((p[0] - base[0]) * ax + (p[1] - base[1]) * ay + (p[2] - base[2]) * az) / (ax * ax + ay * ay + az * az)));
    const d = Math.hypot(p[0] - base[0] - ax * t, p[1] - base[1] - ay * t, p[2] - base[2] - az * t);
    const rr = r * Math.pow(1 - t, 0.7);
    if (d > rr + 0.35) return null;
    if (t > 0.85) return [GLASS];
    return [d < rr - 1.2 ? BI : PI];
  });
}

function crystalSites() {
  const sites = [];
  const { lake } = LAYOUT;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + hash2(i, 0, 601) * 0.2;
    const s = 1.1 + hash2(i, 1, 601) * 0.12;
    const x = Math.round(lake.x + Math.cos(a) * lake.rx * s);
    const z = Math.round(lake.z + Math.sin(a) * lake.rz * s);
    if (Math.abs(x) < 24 || isReserved(x, z, -6) && lakeValue(x, z) >= 1.12) continue;
    sites.push([x, z, 10 + Math.floor(hash2(i, 2, 601) * 22), 2 + hash2(i, 3, 601) * 2.2]);
  }
  // Around the gate plaza.
  for (const [x, z, h, r] of [[-30, 168, 24, 3.5], [30, 168, 24, 3.5], [-38, 182, 15, 2.5], [38, 182, 15, 2.5], [-24, 188, 10, 2], [24, 188, 10, 2]]) sites.push([x, z, h, r]);
  return sites;
}

function crystals(c) {
  for (const [x, z, h, r] of crystalSites()) {
    const g = groundY(x, z);
    if (g === undefined) continue;
    const tx = (hash2(x, z, 602) - 0.5) * 0.5;
    const tz = (hash2(x, z, 603) - 0.5) * 0.5;
    crystal(c, x, z, g, h, r, tx, tz);
    for (let k = 0; k < 3; k++) {
      const ox = Math.round((hash2(x, z, 610 + k) - 0.5) * 8);
      const oz = Math.round((hash2(x, z, 620 + k) - 0.5) * 8);
      const gg = groundY(x + ox, z + oz);
      if (gg !== undefined) crystal(c, x + ox, z + oz, gg, Math.round(h * 0.4), Math.max(1.2, r * 0.5), ox * 0.08, oz * 0.08);
    }
  }
}

// ---------------------------------------------------------------------------
// Viking village: snow-roofed longhouses, smoking chimneys, a bonfire
// ---------------------------------------------------------------------------

function longhouse(c, hx, hz, width, length, axis, idx) {
  const hw = Math.floor(width / 2);
  const hl = Math.floor(length / 2);
  // Local frame: u across (width), v along (length); door at +v.
  const w = axis === "x" ? (u, v) => [hx + v, hz + u] : (u, v) => [hx + u, hz + v];
  const fillL = (u1, y1, v1, u2, y2, v2, id, st) => {
    const [ax, az] = w(u1, v1);
    const [bx, bz] = w(u2, v2);
    c.fill(ax, y1, az, bx, y2, bz, id, st);
  };
  const put = (u, y, v, id, st) => {
    const [x, z] = w(u, v);
    c.set(x, y, z, id, st);
  };
  const wallTop = B + 4;
  fillL(-hw, B - 2, -hl, hw, B, hl, "minecraft:cobblestone");
  fillL(-hw + 1, B, -hl + 1, hw - 1, B, hl - 1, "minecraft:spruce_planks");
  fillL(-hw, B + 1, -hl, hw, wallTop, hl, "minecraft:spruce_planks");
  fillL(-hw + 1, B + 1, -hl + 1, hw - 1, wallTop + hw + 2, hl - 1, "minecraft:air");
  const logAxis = { pillar_axis: "y" };
  for (const u of [-hw, hw]) for (let v = -hl; v <= hl; v += 4) fillL(u, B + 1, v, u, wallTop, v, "minecraft:stripped_spruce_log", logAxis);
  for (const v of [-hl, hl]) for (const u of [-hw, hw]) fillL(u, B + 1, v, u, wallTop, v, "minecraft:stripped_spruce_log", logAxis);
  // Steep roof thick with snow.
  for (let k = 0; k <= hw + 1; k++) {
    const y = wallTop + 1 + k;
    const a = -hw - 1 + k;
    const b = hw + 1 - k;
    if (a > b) break;
    fillL(a, y, -hl - 1, a, y, hl + 1, SNOW);
    fillL(b, y, -hl - 1, b, y, hl + 1, SNOW);
    if (a + 1 <= b - 1) {
      fillL(a + 1, y, -hl - 1, a + 1, y, hl + 1, "minecraft:spruce_planks");
      fillL(b - 1, y, -hl - 1, b - 1, y, hl + 1, "minecraft:spruce_planks");
      fillL(a + 1, y, -hl, b - 1, y, -hl, "minecraft:spruce_planks");
      fillL(a + 1, y, hl, b - 1, y, hl, "minecraft:spruce_planks");
    }
  }
  // Crossed gable beams.
  const ridgeY = wallTop + 1 + hw + 1;
  for (const v of [-hl - 1, hl + 1]) {
    put(-1, ridgeY + 1, v, "minecraft:spruce_fence");
    put(1, ridgeY + 1, v, "minecraft:spruce_fence");
    put(-2, ridgeY + 2, v, "minecraft:spruce_fence");
    put(2, ridgeY + 2, v, "minecraft:spruce_fence");
  }
  // Door, lanterns, chimney with smoke.
  fillL(-1, B + 1, hl, 1, B + 3, hl, "minecraft:air");
  for (const u of [-2, 2]) {
    put(u, B + 1, hl + 1, "minecraft:spruce_fence");
    put(u, B + 2, hl + 1, ...lantern());
  }
  const cv = -Math.floor(hl / 2);
  fillL(0, B + 1, cv, 0, ridgeY + 2, cv, "minecraft:cobblestone");
  put(0, B + 1, cv + 1, "minecraft:campfire", { extinguished: false });
  put(0, ridgeY + 3, cv, "minecraft:campfire", { extinguished: false });
  // Furnishings.
  for (let v = -hl + 3; v <= hl - 3; v += 5) {
    put(-hw + 1, B + 2, v, ...lantern());
    put(-hw + 1, B + 1, v, "minecraft:spruce_fence");
    put(hw - 1, B + 2, v, ...lantern());
    put(hw - 1, B + 1, v, "minecraft:spruce_fence");
  }
  put(hw - 1, B + 1, -hl + 2, "minecraft:barrel", { facing_direction: 1 });
  put(-hw + 1, B + 1, -hl + 2, "minecraft:crafting_table");
  const [chx, chz] = w(-hw + 1, -hl + 1);
  c.chest(chx, B + 1, chz, axis === "x" ? "east" : "south", "agartha/great_hall");
  if (idx === 0) {
    // The mead hall: long tables and a high seat.
    for (let v = -hl + 4; v <= hl - 5; v++) {
      put(-3, B + 1, v, ...slab("minecraft:spruce_slab", true));
      put(3, B + 1, v, ...slab("minecraft:spruce_slab", true));
    }
    for (let v = -hl + 4; v <= hl - 5; v += 3) {
      put(0, B, v, "minecraft:stone_bricks");
      put(0, B + 1, v, "minecraft:campfire", { extinguished: false });
    }
    put(0, B + 1, -hl + 2, GOLD);
    put(0, B + 2, -hl + 2, GOLD);
    put(2, B + 1, -hl + 2, "agartha:runestone");
  }
}

function village(c) {
  LAYOUT.houses.forEach(([x, z, wd, ln, axis], i) => longhouse(c, x, z, wd, ln, axis, i));
  const { x: vx, z: vz } = LAYOUT.village;
  // Bonfire ring in the square.
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    const d = Math.hypot(dx, dz);
    if (d <= 8.5) c.set(vx + dx, B, vz + dz, d < 3 ? "minecraft:stone_bricks" : (hash2(dx, dz, 701) < 0.5 ? "minecraft:cobblestone" : "minecraft:gravel"));
  }
  c.fill(vx - 1, B + 1, vz - 1, vx + 1, B + 1, vz + 1, "minecraft:campfire", { extinguished: false });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.round(vx + Math.cos(a) * 6);
    const z = Math.round(vz + Math.sin(a) * 6);
    c.set(x, B + 1, z, "minecraft:spruce_log", { pillar_axis: "x" });
  }
  // Torch-lit road from the avenue to the square.
  for (let x = LAYOUT.avenue.x2 + 4; x <= vx - 9; x++) {
    for (let dz = -1; dz <= 1; dz++) {
      const g = groundY(x, vz + dz);
      if (g === undefined) continue;
      c.fill(x, g - 1, vz + dz, x, g + 3, vz + dz, "minecraft:air");
      c.set(x, g - 1, vz + dz, hash2(x, dz, 702) < 0.4 ? "minecraft:cobblestone" : "minecraft:gravel");
      c.fill(x, g - 3, vz + dz, x, g - 2, vz + dz, "minecraft:stone");
    }
    if (x % 10 === 0) {
      for (const dz of [-3, 3]) {
        const g = groundY(x, vz + dz);
        if (g === undefined) continue;
        c.fill(x, g, vz + dz, x, g + 1, vz + dz, "minecraft:spruce_fence");
        c.set(x, g + 2, vz + dz, ...lantern());
      }
    }
  }
  // Hay, barrels, weapon racks scattered between the houses.
  for (const [x, z] of [[90, 72], [118, 80], [92, 112], [122, 116], [86, 50], [124, 46]]) {
    const g = groundY(x, z);
    if (g === undefined) continue;
    c.fill(x, g, z, x + 1, g, z + 1, "minecraft:hay_block");
    c.set(x + 2, g, z, "minecraft:barrel", { facing_direction: 1 });
    c.set(x, g + 1, z, "minecraft:hay_block");
  }
}

// ---------------------------------------------------------------------------
// Floating islets drifting around the continent
// ---------------------------------------------------------------------------

export const ISLETS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.35 + hash2(i, 0, 801) * 0.4;
  const d = 236 + hash2(i, 1, 801) * 34;
  return {
    x: Math.round(Math.cos(a) * d),
    z: Math.round(Math.sin(a) * d),
    y: 170 + Math.round(hash2(i, 2, 801) * 60),
    r: 6 + Math.round(hash2(i, 3, 801) * 9),
  };
});

function islet(c, it, i) {
  const { x, z, y, r } = it;
  c.voxels(-r - 1, r + 1, -r - 1, r + 1, y - r * 2 - 4, y, (u, v) => [x + u, z + v], (u, yy, v) => {
    const d = Math.hypot(u, v);
    const edge = r + (hash2(x + u, z + v, 811) - 0.5) * 2;
    if (d > edge) return null;
    const depth = (r * 2 + 4) * Math.pow(1 - d / (edge + 0.5), 0.8);
    if (yy < y - depth) return null;
    if (yy === y) return [SNOW];
    if (yy > y - 3) return [SNOW];
    return [yy < y - depth + 3 ? PI : "minecraft:stone"];
  });
  if (i % 3 === 0) crystal(c, x, z, y + 1, 8 + r, 1.8, 0.1, -0.1);
  else spruce(c, x, y + 1, z, 7 + (i % 4), false);
}

// ---------------------------------------------------------------------------
// Trees (shared with nature.js)
// ---------------------------------------------------------------------------

const LEAVES = ["minecraft:spruce_leaves", { persistent_bit: true }];

export function spruce(c, x, base, z, h, mega) {
  const trunk = mega ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0]];
  const maxR = mega ? 6 : 3;
  const tops = new Map();
  for (let y = base + (mega ? 4 : 2); y <= base + h; y++) {
    const t = (y - (base + (mega ? 4 : 2))) / Math.max(1, h - (mega ? 4 : 2));
    let r = Math.round((1 - t) * maxR);
    if ((y - base) % 2 === 1) r = Math.max(0, r - 1);
    for (let dx = -r; dx <= r + (mega ? 1 : 0); dx++) {
      for (let dz = -r; dz <= r + (mega ? 1 : 0); dz++) {
        const ex = mega ? Math.max(0, Math.abs(dx - 0.5) - 0.5) : dx;
        const ez = mega ? Math.max(0, Math.abs(dz - 0.5) - 0.5) : dz;
        if (ex * ex + ez * ez > r * r + 0.5) continue;
        c.set(x + dx, y, z + dz, ...LEAVES);
        tops.set(`${dx},${dz}`, Math.max(tops.get(`${dx},${dz}`) ?? 0, y));
      }
    }
  }
  for (const [dx, dz] of trunk) {
    c.set(x + dx, base + h + 1, z + dz, ...LEAVES);
    tops.set(`${dx},${dz}`, base + h + 1);
    c.fill(x + dx, base, z + dz, x + dx, base + h - 1, z + dz, "minecraft:spruce_log");
  }
  for (const [k, y] of tops) {
    const [dx, dz] = k.split(",").map(Number);
    if (hash2(x + dx, z + dz, 901) < 0.7) c.set(x + dx, y + 1, z + dz, "minecraft:snow_layer", { height: 0 });
  }
}

// ---------------------------------------------------------------------------

const L = LAYOUT;
const tz = L.temple.z;

export const STRUCTURES = [
  { name: "plaza", bounds: bounds(-22, 22, 156, 196), build: plaza },
  { name: "gate", bounds: bounds(-20, 20, 148, 160), build: heavensGate },
  { name: "avenue", bounds: bounds(-12, 12, L.avenue.z1, L.avenue.z2), build: avenue },
  { name: "bridge", bounds: bounds(-8, 8, L.bridge.z2 - 4, L.bridge.z1 + 4), build: bridge },
  { name: "temple", bounds: bounds(-44, 44, tz - 40, tz + 42), build: temple },
  { name: "spires", bounds: bounds(-52, 52, -140, -60), build: spires },
  { name: "colossus", bounds: statueBounds(L.colossus.x, L.colossus.z, 1.15), build: (c) => statue(c, L.colossus.x, L.colossus.y + 1, L.colossus.z, 1.15, "south") },
  ...L.guardians.map((g, i) => ({
    name: `guardian${i}`,
    bounds: statueBounds(g.x, g.z, 0.75),
    build: (c) => statue(c, g.x, B + 1, g.z, 0.75, g.x < 0 ? "east" : "west"),
  })),
  ...SHIPS.map((s, i) => ({ name: `ship${i}`, bounds: bounds(s.x - 18, s.x + 18, s.z - 18, s.z + 18), build: (c) => longship(c, s.x, s.z, s.facing) })),
  ...L.pyramids.map((p, i) => ({
    name: `pyramid${i}`,
    bounds: bounds(p.x - p.half - 2, p.x + p.half + 2, p.z - p.half - 2, p.z + p.half + 2),
    build: (c) => pyramid(c, p, i === 0),
  })),
  { name: "village", bounds: bounds(20, 170, 0, 150), build: village },
  { name: "citadel", bounds: CITADEL_BOUNDS, build: buildCitadel },
  { name: "crystals", bounds: bounds(-130, 130, -90, 200), build: crystals },
  ...ISLETS.map((it, i) => ({ name: `islet${i}`, bounds: bounds(it.x - it.r - 2, it.x + it.r + 2, it.z - it.r - 2, it.z + it.r + 2), build: (c) => islet(c, it, i) })),
];

export { slopeAt, islandColumn };
