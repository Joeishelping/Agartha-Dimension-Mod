// The Hell blueprint: turns hell_layout.js into block operations, one tile at
// a time. Pure JavaScript (tested in Node, like Agartha's blueprint).
//
// Everything is carved out of a solid deepslate shell, so no natural cave,
// water or lava can ever leak in, and nothing outside the shell is touched.

import { HELL, HELL_REGION } from "./config.js";
import { fbm, hash2, hash3 } from "./noise.js";
import { Canvas, stairs, slab } from "./canvas.js";
import {
  PIT, HOURS, hourFrame, hourButton, pathCells, stepBlock, stepPerm,
  STONES, CRACK_LEDGE, HIDDEN_TUNNEL, HIDDEN_PROFILE, CAVERN, cavernCeil,
  TOP_TUNNEL, BRIDGE, SPIRE, SCALE, CLOCKTOWER, CLOCK, CATHEDRAL, SERPENT, SERPENT_HEAD, GLYPHS, ARRIVAL,
} from "./hell_layout.js";

const DEEP = "minecraft:deepslate";
const PBB = "minecraft:polished_blackstone_bricks";
const PB = "minecraft:polished_blackstone";
const BLACK = "minecraft:blackstone";
const TILES = "minecraft:deepslate_tiles";
const DBRICK = "minecraft:deepslate_bricks";
const CHISELED = "minecraft:chiseled_polished_blackstone";
const GILDED = "minecraft:gilded_blackstone";
const BASALT = "minecraft:polished_basalt";
const MATTE = "minecraft:black_concrete";
const CHAIN = ["minecraft:chain", { pillar_axis: "y" }];

const put = (c, x, y, z, b) => c.set(x, y, z, b[0], b[1]);
const box = (c, x1, y1, z1, x2, y2, z2, b, mode) => c.fill(x1, y1, z1, x2, y2, z2, b[0], b[1], mode);

/** Calls f(x, z) for every cell of the tile inside the given box. */
function cells(c, minX, maxX, minZ, maxZ, f) {
  const t = c.tile;
  for (let x = Math.max(minX, t.minX); x <= Math.min(maxX, t.maxX); x++) {
    for (let z = Math.max(minZ, t.minZ); z <= Math.min(maxZ, t.maxZ); z++) f(x, z);
  }
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

function shell(c) {
  const s = HELL.shell;
  for (let x = s.minX; x <= s.maxX; x += 16) {
    for (let z = s.minZ; z <= s.maxZ; z += 16) {
      c.fill(x, HELL.minY, z, Math.min(s.maxX, x + 15), HELL.maxY, Math.min(s.maxZ, z + 15), DEEP);
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 1: the Oubliette
// ---------------------------------------------------------------------------

const WALL = [DBRICK, PBB, TILES, BLACK, "minecraft:cracked_polished_blackstone_bricks", "minecraft:polished_deepslate", DBRICK, BLACK];

function pitWallBlock(x, y, z) {
  const h = hash3(x, y, z, 13);
  if (h < 0.025) return ["minecraft:crying_obsidian"]; // the weeping walls
  if (h < 0.04) return [GILDED];
  const band = Math.floor((y + Math.floor(hash2(x, z, 7) * 3)) / 4);
  const sector = Math.floor((Math.atan2(z, x) + Math.PI) * 2);
  return [WALL[Math.floor(hash2(band, sector, 11) * WALL.length)]];
}

function pit(c) {
  const R = PIT.wallR;
  cells(c, PIT.x - R, PIT.x + R, PIT.z - R, PIT.z + R, (x, z) => {
    const r = Math.hypot(x + 0.5 - PIT.x, z + 0.5 - PIT.z);
    if (r < PIT.airR) {
      c.fill(x, PIT.floorY, z, x, PIT.ceilY - 1, z, "minecraft:air");
      // The floor: soul soil and bone, burning at the heart.
      const h = hash2(x, z, 21);
      const floor = r < 3.5 ? "minecraft:magma" : h < 0.55 ? "minecraft:soul_soil" : h < 0.8 ? "minecraft:soul_sand" : h < 0.9 ? "minecraft:bone_block" : BLACK;
      c.set(x, PIT.floorY - 1, z, floor);
      // The ceiling, ribbed with blackstone.
      c.set(x, PIT.ceilY, z, hash2(x, z, 22) < 0.5 ? BLACK : PBB);
    } else if (r < PIT.airR + 1.3) {
      c.voxels(0, 0, 0, 0, PIT.floorY - 1, PIT.ceilY, () => [x, z], (u, y) => pitWallBlock(x, y, z));
    }
  });

  // The spiral path.
  for (const p of pathCells()) {
    if (!c.has(p.x, p.z) || p.kind === "gap") continue;
    const b = stepBlock(p.k);
    put(c, p.x, b.y, p.z, stepPerm(p.kind, p.k));
    // Crumbling steps are thin, with nothing beneath: they give way.
    if (p.kind !== "crumble") c.fill(p.x, b.y - 2, p.z, p.x, b.y - 1, p.z, BLACK);
  }

  for (const h of HOURS) hourGate(c, h);

  // The hidden way: stepping stones over the void, a ledge, a cracked wall.
  for (const s of STONES) {
    c.set(s.x, s.y, s.z, PB);
    c.set(s.x, s.y - 1, s.z, "minecraft:polished_blackstone_wall");
  }
  cells(c, -12, 12, -12, 12, (x, z) => {
    const r = Math.hypot(x + 0.5, z + 0.5);
    const a = Math.atan2(z + 0.5, x + 0.5);
    let da = a - CRACK_LEDGE.a;
    da = Math.atan2(Math.sin(da), Math.cos(da)) * r;
    if (r >= 8.6 && r < PIT.airR + 0.6 && Math.abs(da) <= 1.6) {
      c.set(x, CRACK_LEDGE.y - 1, z, PBB);
      c.fill(x, CRACK_LEDGE.y, z, x, CRACK_LEDGE.y + 2, z, "minecraft:air");
    }
  });

  // An obelisk on the burning heart of the floor, with the old warning.
  const F = PIT.floorY;
  for (let y = 0; y < 12; y++) {
    const w = y < 2 ? 1 : y < 9 ? 1 : 0;
    c.fill(PIT.x - w, F + y, PIT.z - w, PIT.x + w, F + y, PIT.z + w, y < 2 ? PBB : y === 8 ? GILDED : y > 8 ? CHISELED : PB);
  }
  c.set(PIT.x, F + 12, PIT.z, "minecraft:soul_campfire");
  const facing = { "2,0": "east", "-2,0": "west", "0,2": "south", "0,-2": "north" };
  for (const [key, dir] of Object.entries(facing)) {
    const [dx, dz] = key.split(",").map(Number);
    c.sign(PIT.x + dx, F + 3, PIT.z + dz, dir, "§4ABANDON\n§4ALL HOPE,\n§7ye who\n§7enter here");
  }

  // Chains hang from the dark, with cages at their ends.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const x = Math.round(PIT.x + 5 * Math.cos(a));
    const z = Math.round(PIT.z + 5 * Math.sin(a));
    const end = PIT.ceilY - 14 - ((i * 9) % 30);
    if (c.has(x, z)) c.fill(x, end + 3, z, x, PIT.ceilY - 1, z, CHAIN[0], CHAIN[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const edge = dx || dz;
        for (let y = end; y <= end + 2; y++) {
          if (edge) c.set(x + dx, y, z + dz, "minecraft:iron_bars");
        }
        c.set(x + dx, end - 1, z + dz, PB);
      }
    }
    c.set(x, end, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    c.set(x, end - 2, z, "minecraft:soul_lantern", { hanging: true });
  }

  // Bones and fires on the floor (away from where souls arrive).
  cells(c, -10, 10, -10, 10, (x, z) => {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r < 4 || r >= PIT.airR - 0.5) return;
    if (Math.hypot(x + 0.5 - ARRIVAL.x, z + 0.5 - ARRIVAL.z) < 3) return;
    const h = hash2(x, z, 23);
    if (h < 0.05) c.set(x, F, z, "minecraft:bone_block", { pillar_axis: hash2(x, z, 24) < 0.5 ? "x" : "z" });
    else if (h < 0.08) c.set(x, F, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    else if (h < 0.1) c.set(x, F, z, "minecraft:soul_fire");
  });
}

/** One of the twelve Gates of the Hours: an alcove with a pylon gate. */
function hourGate(c, h) {
  const f = hourFrame(h);
  const F = f.floor;
  const cx = PIT.x + f.out[0] * 12.5;
  const cz = PIT.z + f.out[1] * 12.5;
  cells(c, Math.floor(cx - 5), Math.ceil(cx + 5), Math.floor(cz - 5), Math.ceil(cz + 5), (x, z) => {
    const px = x + 0.5 - PIT.x;
    const pz = z + 0.5 - PIT.z;
    const d = px * f.out[0] + pz * f.out[1];
    const a = px * f.tan[0] + pz * f.tan[1];
    if (d < PIT.airR || d > 14.6 || Math.abs(a) > 2.6) return;
    const front = d < PIT.airR + 1;
    if (front && Math.abs(a) > 1.5) {
      // Pylon pillars.
      c.fill(x, F, z, x, F + 3, z, BASALT, { pillar_axis: "y" });
      c.set(x, F + 4, z, CHISELED);
      return;
    }
    c.set(x, F - 1, z, front ? GILDED : PBB);
    c.fill(x, F, z, x, F + (front ? 3 : 4), z, "minecraft:air");
    if (front) c.set(x, F + 4, z, Math.abs(a) < 0.6 ? GILDED : PBB);
    c.set(x, F + 5, z, TILES);
  });
  const lx = Math.round(PIT.x + f.out[0] * 12.5 - 0.5);
  const lz = Math.round(PIT.z + f.out[1] * 12.5 - 0.5);
  c.set(lx, F + 4, lz, "minecraft:soul_lantern", { hanging: true });
  if (h.n === 12) return; // the top: the tunnel goes on from here
  const b = hourButton(h);
  const back = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] }[b.facing];
  c.fill(b.x, b.y - 1, b.z, b.x, b.y + 2, b.z, "minecraft:air");
  for (let y = b.y - 1; y <= b.y + 2; y++) c.set(b.x + back[0], y, b.z + back[1], PBB);
  c.set(b.x, b.y - 1, b.z, PBB);
  c.set(b.x, b.y, b.z, "minecraft:polished_blackstone_button", { facing_direction: { north: 2, south: 3, west: 4, east: 5 }[b.facing] });
  c.sign(b.x, b.y + 1, b.z, b.facing, `§4${h.name.toUpperCase()}\n§8—\n§7${h.epithet}`);
}

// ---------------------------------------------------------------------------
// Tunnels: the Twelfth Gate's road, and the hidden way
// ---------------------------------------------------------------------------

function tunnelCells(points, f) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const n = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    const dx = Math.sign(x2 - x1), dz = Math.sign(z2 - z1);
    for (let s = 0; s <= n; s++) for (let w = -1; w <= 1; w++) f(x1 + dx * s + (dz ? w : 0), z1 + dz * s + (dx ? w : 0), s, w);
  }
}

function tunnels(c) {
  // The road from the Twelfth Gate: 3 wide, 4 tall, level.
  const Y = TOP_TUNNEL.y;
  tunnelCells(TOP_TUNNEL.points, (x, z, s, w) => {
    c.set(x, Y - 1, z, w ? PBB : MATTE);
    c.fill(x, Y, z, x, Y + 3, z, "minecraft:air");
    c.set(x, Y + 4, z, TILES);
    if (!w && s % 6 === 3) c.set(x, Y + 3, z, "minecraft:soul_lantern", { hanging: true });
  });

  // The hidden way: narrow, dark, descending, with pools of lava to leap.
  const LAVA_AT = new Set([24, 25, 58, 59, 84, 85]);
  for (const p of HIDDEN_PROFILE) {
    for (let w = -1; w <= 1; w++) {
      const x = p.x + (p.dz ? w : 0);
      const z = p.z + (p.dx ? w : 0);
      const half = p.y % 1 !== 0;
      const fy = Math.floor(p.y);
      if (LAVA_AT.has(p.t)) {
        c.fill(x, fy - 2, z, x, fy - 1, z, "minecraft:lava");
        c.fill(x, fy - 3, z, x, fy - 3, z, DEEP);
      } else if (half) c.set(x, fy, z, ...slab("minecraft:cobbled_deepslate_slab"));
      else c.set(x, fy - 1, z, "minecraft:cobbled_deepslate");
      c.fill(x, Math.ceil(p.y), z, x, Math.ceil(p.y) + 2, z, "minecraft:air");
      if (w === 0 && hash2(p.t, 0, 61) < 0.18) {
        c.set(x, Math.ceil(p.y) + 2, z, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: true });
      }
    }
  }
  // The cracked bricks that hide its mouth.
  const { crack } = HIDDEN_TUNNEL;
  c.fill(crack.x, CRACK_LEDGE.y, crack.z - 1, crack.x, CRACK_LEDGE.y + 2, crack.z + 1, "minecraft:cracked_deepslate_bricks");
}

// ---------------------------------------------------------------------------
// Layer 2: the cavern of the Spire
// ---------------------------------------------------------------------------

function cavernShape(x, z) {
  const dn = ((x + 0.5 - CAVERN.x) / CAVERN.rx) ** 2 + ((z + 0.5 - CAVERN.z) / CAVERN.rz) ** 2;
  const wobble = (fbm(x / 9, z / 9, 41) - 0.5) * 0.14;
  if (dn > 1 + wobble) return null;
  const d = Math.sqrt(Math.max(0, dn));
  let floor = CAVERN.lakeY;
  if (d > 0.86) floor += Math.round(((d - 0.86) / 0.14) * 8 * (0.6 + 0.8 * fbm(x / 6, z / 6, 42)));
  const ceil = cavernCeil(x, z) - Math.floor(fbm(x / 7, z / 7, 43) * 3);
  return { floor: Math.min(floor, ceil - 6), ceil, lake: floor === CAVERN.lakeY, d };
}

function nearStructure(x, z, m = 0) {
  return (
    (x >= SPIRE.minX - 4 - m && x <= SPIRE.maxX + 4 + m && z >= SPIRE.minZ - 4 - m && z <= SPIRE.maxZ + 4 + m) ||
    (x >= CLOCKTOWER.minX - 3 - m && x <= CLOCKTOWER.maxX + 3 + m && z >= CLOCKTOWER.minZ - 3 - m && z <= CLOCKTOWER.maxZ + 3 + m) ||
    (x >= CATHEDRAL.minX - 6 - m && x <= CATHEDRAL.maxX + 6 + m && z >= CATHEDRAL.minZ - 3 - m && z <= CATHEDRAL.maxZ + 9 + m) ||
    (Math.abs(x - BRIDGE.x) <= 3 + m && z >= BRIDGE.fromZ - 4 && z <= BRIDGE.toZ)
  );
}

function cavern(c) {
  cells(c, CAVERN.x - CAVERN.rx - 4, CAVERN.x + CAVERN.rx + 4, CAVERN.z - CAVERN.rz - 4, CAVERN.z + CAVERN.rz + 4, (x, z) => {
    const s = cavernShape(x, z);
    if (!s) return;
    c.fill(x, s.floor, z, x, s.ceil - 1, z, "minecraft:air");
    if (s.lake) {
      // Cocytus: black ice veined with frost, over packed ice.
      const vein = Math.abs(fbm(x / 8, z / 8, 44) - 0.5) < 0.025;
      c.set(x, s.floor - 1, z, vein ? "minecraft:packed_ice" : "minecraft:black_stained_glass");
      c.set(x, s.floor - 2, z, "minecraft:packed_ice");
    } else {
      const h = hash2(x, z, 45);
      c.set(x, s.floor - 1, z, h < 0.4 ? BLACK : h < 0.7 ? "minecraft:basalt" : h < 0.85 ? "minecraft:soul_soil" : DEEP);
    }
    c.set(x, s.ceil, z, hash2(x, z, 46) < 0.6 ? DEEP : BLACK);
    // Stalactites of dripstone, and great fangs of deepslate.
    if (nearStructure(x, z)) return;
    const h = hash2(x, z, 47);
    if (h < 0.05) {
      const len = 1 + Math.floor(hash2(x, z, 48) * 4);
      for (let i = 0; i < len; i++) {
        // From the bottom up: tip, frustum, middle..., base.
        const part = i === 0 ? "tip" : i === 1 ? "frustum" : i === len - 1 ? "base" : "middle";
        c.set(x, s.ceil - len + i, z, "minecraft:pointed_dripstone", { dripstone_thickness: part, hanging: true });
      }
    }
  });
  // Great fangs: cones of deepslate hanging from the dark.
  for (let i = 0; i < 26; i++) {
    const a = hash2(i, 1, 49) * Math.PI * 2;
    const rr = 0.2 + 0.7 * Math.sqrt(hash2(i, 2, 49));
    const fx = Math.round(CAVERN.x + Math.cos(a) * CAVERN.rx * rr);
    const fz = Math.round(CAVERN.z + Math.sin(a) * CAVERN.rz * rr);
    if (nearStructure(fx, fz, 3)) continue;
    const top = cavernCeil(fx, fz);
    const len = 8 + Math.floor(hash2(i, 3, 49) * 12);
    const rad = 2 + hash2(i, 4, 49) * 1.5;
    cells(c, fx - 4, fx + 4, fz - 4, fz + 4, (x, z) => {
      const r = Math.hypot(x - fx, z - fz);
      if (r > rad) return;
      const depth = Math.round(len * (1 - r / rad));
      if (depth > 0) c.fill(x, top - depth, z, x, top, z, hash2(x, z, 50) < 0.7 ? DEEP : "minecraft:dripstone_block");
    });
  }
}

/** Apep: coils of the serpent arch out of the black ice around the Spire. */
function serpent(c) {
  const R = SERPENT.r;
  cells(c, CAVERN.x - R - 4, CAVERN.x + R + 4, CAVERN.z - R - 4, CAVERN.z + R + 4, (x, z) => {
    const dx = x + 0.5 - CAVERN.x, dz = z + 0.5 - CAVERN.z;
    const r = Math.hypot(dx, dz);
    if (Math.abs(r - R) > 3) return;
    const a = Math.atan2(dz, dx);
    const cy = CAVERN.lakeY - 2 + 6.5 * Math.sin(4 * a + 0.6);
    for (let y = CAVERN.lakeY - 3; y <= cy + 3; y++) {
      if ((r - R) ** 2 + (y + 0.5 - cy) ** 2 > 6.5) continue;
      const scale = hash3(x, y, z, 51);
      c.set(x, y, z, scale < 0.12 ? GILDED : (Math.floor(a * 12) + y) % 3 === 0 ? PB : BLACK);
    }
  });
  // The head rears out of the ice, jaws open.
  const H = SERPENT_HEAD;
  const [ux, uz] = H.dir;
  cells(c, Math.floor(H.x - 9), Math.ceil(H.x + 9), Math.floor(H.z - 9), Math.ceil(H.z + 9), (x, z) => {
    const px = x + 0.5 - H.x, pz = z + 0.5 - H.z;
    const along = px * ux + pz * uz;
    const side = -px * uz + pz * ux;
    for (let y = CAVERN.lakeY - 2; y <= H.y + 4; y++) {
      const py = y + 0.5 - H.y;
      // Neck: from the coil up to the back of the head.
      const t = Math.min(1, Math.max(0, (y - CAVERN.lakeY + 2) / (H.y - CAVERN.lakeY + 2)));
      const neckAlong = -3 + 1.5 * t;
      const inNeck = y <= H.y && (along - neckAlong) ** 2 + side ** 2 <= 5.5;
      const inHead = (along / 5.5) ** 2 + (side / 3) ** 2 + (py / 2.6) ** 2 <= 1;
      if (!inNeck && !inHead) continue;
      if (inHead && along > 0.5 && Math.abs(py) < 0.7) continue; // the open jaws
      const eye = inHead && Math.abs(Math.abs(side) - 2) < 0.6 && py > 0.5 && py < 1.6 && along > 0.5 && along < 2;
      c.set(x, y, z, eye ? "minecraft:shroomlight" : hash3(x, y, z, 52) < 0.1 ? GILDED : BLACK);
    }
    // Fangs.
    if (Math.abs(along - 4) < 0.6 && Math.abs(Math.abs(side) - 1.2) < 0.6) {
      c.set(x, H.y, z, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: true });
    }
  });
}

// ---------------------------------------------------------------------------
// The Spire of Absolute Contract
// ---------------------------------------------------------------------------

/** A square spiral stair along the inside of a rectangle, half a block per step. */
export function wallStair(minX, maxX, minZ, maxZ, fromY, toY, width, f) {
  const lanes = [];
  for (let z = minZ; z <= maxZ; z++) lanes.push([minX, z, 1, 0]);
  for (let x = minX + 1; x <= maxX; x++) lanes.push([x, maxZ, 0, -1]);
  for (let z = maxZ - 1; z >= minZ; z--) lanes.push([maxX, z, -1, 0]);
  for (let x = maxX - 1; x > minX; x--) lanes.push([x, minZ, 0, 1]);
  let t = 0;
  for (let loop = 0; fromY + t * 0.5 < toY; loop++) {
    for (const [x, z, ix, iz] of lanes) {
      const y = fromY + t * 0.5;
      if (y > toY) return;
      for (let w = 0; w < width; w++) f(x + ix * w, z + iz * w, y, t);
      t++;
    }
  }
}

function spire(c) {
  const S = SPIRE;
  const L = CAVERN.lakeY;
  const H = S.hallY;
  // Plinth.
  c.fill(S.minX - 2, L - 2, S.minZ - 2, S.maxX + 2, L - 1, S.maxZ + 2, TILES);
  c.fill(S.minX - 2, L, S.minZ - 2, S.maxX + 2, L, S.maxZ + 2, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  c.fill(S.minX - 1, L, S.minZ - 1, S.maxX + 1, L, S.maxZ + 1, PBB);
  // The tower: matte black walls banded with deepslate tiles.
  cells(c, S.minX, S.maxX, S.minZ, S.maxZ, (x, z) => {
    const wall = x <= S.minX + 1 || x >= S.maxX - 1 || z <= S.minZ + 1 || z >= S.maxZ - 1;
    if (wall) {
      c.voxels(0, 0, 0, 0, L + 1, S.roofY - 4, () => [x, z], (u, y) => {
        if (y % 12 === 0) return [TILES];
        const corner = (x <= S.minX + 1 || x >= S.maxX - 1) && (z <= S.minZ + 1 || z >= S.maxZ - 1);
        return [corner ? BASALT : (z + x) % 7 === 0 ? MATTE : PBB, corner ? { pillar_axis: "y" } : undefined];
      });
    } else {
      c.fill(x, L + 1, z, x, H - 1, z, "minecraft:air");
      c.set(x, L, z, Math.abs(x) < 3 && Math.abs(z - 91) < 3 ? "minecraft:soul_soil" : TILES);
    }
  });
  // Slit windows down the base, soul light behind them.
  for (let y = L + 6; y < H - 4; y += 12) {
    for (let z = S.minZ + 5; z < S.maxZ - 3; z += 6) {
      for (const x of [S.minX, S.minX + 1, S.maxX - 1, S.maxX]) c.fill(x, y, z, x, y + 5, z, "minecraft:iron_bars");
    }
  }
  // A well of soul fire at the bottom of the hollow tower.
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(dx, L + 1, 91 + dz, "minecraft:soul_campfire");
  // The base door (south), facing the lake.
  c.fill(-1, L + 1, S.minZ, 1, L + 4, S.minZ + 1, "minecraft:air");
  c.fill(-2, L + 5, S.minZ, 2, L + 5, S.minZ, GILDED);
  // The stair inside, from the lake up to the Hall of Thrones.
  wallStair(S.minX + 2, S.maxX - 2, S.minZ + 2, S.maxZ - 2, L + 0.5, H + 0.01, 2, (x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });

  // Buttresses on the long sides.
  for (let z = S.minZ + 4; z <= S.maxZ - 4; z += 8) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x0 = side < 0 ? S.minX - 1 - k : S.maxX + 1 + k;
        const top = H + 12 - k * 9;
        c.fill(x0, L + 1, z, x0, top, z + 1, k ? PBB : BASALT, k ? undefined : { pillar_axis: "y" });
      }
    }
  }

  // --- The Hall of Thrones ---
  const hx1 = S.minX + 2, hx2 = S.maxX - 2, hz1 = S.minZ + 2, hz2 = S.maxZ - 2;
  cells(c, hx1, hx2, hz1, hz2, (x, z) => {
    const aisle = Math.abs(x) <= 2;
    c.set(x, H - 1, z, aisle ? MATTE : Math.abs(x) === 3 ? PBB : TILES);
    const vault = S.vaultY - Math.floor((x * x) / 14);
    c.fill(x, H, z, x, vault - 1, z, "minecraft:air");
    c.set(x, vault, z, z % 6 === 2 ? TILES : PBB);
  });
  // Where the inner stair comes up through the floor: clear its headroom.
  wallStair(S.minX + 2, S.maxX - 2, S.minZ + 2, S.maxZ - 2, L + 0.5, H + 0.01, 2, (x, z, y) => {
    if (Math.ceil(y) + 2 < H - 1) return;
    c.fill(x, Math.ceil(y), z, x, Math.min(H + 2, Math.ceil(y) + 2), z, "minecraft:air");
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  // Pointed windows of tinted glass in the long walls.
  for (let z = hz1 + 3; z <= hz2 - 3; z += 4) {
    for (const x of [S.minX, S.minX + 1, S.maxX - 1, S.maxX]) {
      c.fill(x, H + 5, z, x, H + 10, z, "minecraft:tinted_glass");
      c.set(x, H + 11, z, "minecraft:tinted_glass");
    }
  }
  // The south door, where the bridge arrives.
  c.fill(-1, H, S.minZ, 1, H + 4, S.minZ + 1, "minecraft:air");
  c.fill(-2, H + 5, S.minZ, 2, H + 6, S.minZ, CHISELED);
  c.set(0, H + 6, S.minZ, GILDED);
  // Galleries along both long walls, with the upper thrones.
  for (const side of [-1, 1]) {
    const xg = side < 0 ? hx1 : hx2;
    const xr = side < 0 ? hx1 + 2 : hx2 - 2;
    c.fill(xg, H + 5, hz1 + 4, xg + side * -1, H + 5, hz2 - 2, PBB);
    c.fill(xr, H + 6, hz1 + 4, xr, H + 6, hz2 - 2, "minecraft:polished_blackstone_wall");
  }
  // Forty-two thrones of the assessors, all empty.
  let thrones = 0;
  for (const tier of [0, 1]) {
    for (let z = hz1 + 5; z <= hz2 - 3 && thrones < 42; z += 3) {
      for (const side of [-1, 1]) {
        if (thrones >= 42) break;
        const y = tier ? H + 6 : H;
        const seatX = side < 0 ? hx1 + (tier ? 0 : 1) : hx2 - (tier ? 0 : 1);
        const backX = seatX + side;
        c.set(seatX, y, z, ...stairs("minecraft:polished_blackstone_stairs", side < 0 ? "west" : "east"));
        c.fill(backX, y, z, backX, y + 2, z, PB);
        c.set(backX, y + 3, z, CHISELED);
        c.set(seatX, y, z - 1, "minecraft:polished_blackstone_wall");
        c.set(seatX, y, z + 1, "minecraft:polished_blackstone_wall");
        if (!tier) c.set(seatX, H + 4, z, "minecraft:soul_lantern", { hanging: true });
        thrones++;
      }
    }
  }
  // Braziers of cold soul fire down the aisle.
  for (let z = hz1 + 6; z <= hz2 - 12; z += 8) {
    for (const x of [-3, 3]) {
      c.set(x, H, z, "minecraft:polished_blackstone_wall");
      c.set(x, H + 1, z, "minecraft:soul_campfire");
    }
  }
  // Lanterns hung on long chains from the vault.
  for (let z = hz1 + 8; z <= hz2 - 6; z += 12) {
    c.fill(0, H + 8, z, 0, S.vaultY - 1, z, CHAIN[0], CHAIN[1]);
    c.set(0, H + 7, z, "minecraft:soul_lantern", { hanging: true });
  }

  // The dais and the Devil's throne at the north end.
  c.fill(-6, H, hz2 - 7, 6, H, hz2, PBB);
  c.fill(-6, H, hz2 - 8, 6, H, hz2 - 8, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  c.fill(-2, H + 1, hz2 - 1, 2, H + 9, hz2, PB);
  c.set(0, H + 1, hz2 - 2, ...stairs("minecraft:polished_blackstone_stairs", "north"));
  for (const sx of [-2, 2]) c.fill(sx, H + 1, hz2 - 3, sx, H + 2, hz2 - 2, PBB);
  c.fill(-1, H + 10, hz2, 1, H + 11, hz2, CHISELED);
  for (const sx of [-1, 1]) {
    // Horns.
    for (let k = 0; k < 6; k++) c.set(sx * (3 + (k > 3 ? 1 : 0)), H + 8 + k, hz2 - (k > 4 ? 1 : 0), k === 5 ? GILDED : BLACK);
  }
  // A rose window of tinted glass behind it.
  for (let x = -5; x <= 5; x++) {
    for (let y = -5; y <= 5; y++) {
      const r = Math.hypot(x, y);
      if (r > 5.2) continue;
      const spoke = x === 0 || y === 0 || Math.abs(x) === Math.abs(y);
      for (const z of [S.maxZ - 1, S.maxZ]) c.set(x, H + 12 + y, z, r > 4.3 || spoke ? GILDED : "minecraft:tinted_glass");
    }
  }

  // The Scale of Two Truths, the heart against the feather; Ammit waits.
  const sz = SCALE.z;
  c.fill(SCALE.x, H, sz, SCALE.x, H + 4, sz, "minecraft:polished_blackstone_wall");
  c.fill(SCALE.x - 4, H + 5, sz, SCALE.x + 4, H + 5, sz, PB);
  c.set(SCALE.x, H + 6, sz, GILDED);
  for (const sx of [-4, 4]) {
    c.fill(SCALE.x + sx, H + 3, sz, SCALE.x + sx, H + 4, sz, CHAIN[0], CHAIN[1]);
    c.fill(SCALE.x + sx - 1, H + 2, sz, SCALE.x + sx + 1, H + 2, sz, "minecraft:gold_block");
  }
  c.set(SCALE.x - 4, H + 3, sz, "minecraft:redstone_block"); // the heart
  c.set(SCALE.x + 4, H + 3, sz, "minecraft:white_wool"); // the feather of Ma'at
  // Ammit, the Devourer: crocodile head, lion's mane, crouched.
  c.fill(5, H, sz - 3, 6, H + 1, sz + 1, BLACK);
  c.fill(4, H + 1, sz - 4, 7, H + 3, sz - 3, GILDED);
  c.fill(5, H + 2, sz - 5, 6, H + 2, sz - 9, "minecraft:polished_deepslate");
  c.fill(5, H + 1, sz - 5, 6, H + 1, sz - 8, "minecraft:polished_deepslate");
  c.set(5, H + 3, sz - 5, "minecraft:shroomlight");
  c.set(6, H + 3, sz - 5, "minecraft:shroomlight");

  // Roof and the spire itself, reaching for the roof of the world.
  cells(c, S.minX, S.maxX, S.minZ, S.maxZ, (x, z) => {
    const roof = S.roofY - Math.floor(Math.abs(x) / 2.2);
    const vault = S.vaultY - Math.floor((x * x) / 14);
    const from = x <= S.minX + 1 || x >= S.maxX - 1 || z <= S.minZ + 1 || z >= S.maxZ - 1 ? S.roofY - 3 : vault + 1;
    if (roof >= from) c.fill(x, from, z, x, roof, z, PBB);
    c.set(x, roof + 1, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  });
  for (let k = 0; k <= S.tipY - S.roofY; k++) {
    const w = Math.max(0, 3 - k);
    c.fill(-w, S.roofY + 1 + k, 91 - w, w, S.roofY + 1 + k, 91 + w, k === S.tipY - S.roofY ? GILDED : MATTE);
  }
}

/** The bridge of the contract: from the Twelfth Gate's road down to the hall. */
function bridge(c) {
  for (let z = BRIDGE.fromZ; z < BRIDGE.toZ; z++) {
    const k = z - BRIDGE.fromZ;
    const y = BRIDGE.fromY - 0.5 * k;
    const half = y % 1 !== 0;
    const by = half ? Math.floor(y) : y - 1; // the walking block
    for (let x = BRIDGE.x - 1; x <= BRIDGE.x + 1; x++) {
      c.fill(x, by + 1, z, x, by + 4, z, "minecraft:air");
      c.fill(x, by - 2, z, x, by - 1, z, PB);
      if (half) c.set(x, by, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
      else c.set(x, by, z, x === BRIDGE.x ? MATTE : PBB);
    }
    if (k % 8 === 4) c.set(BRIDGE.x, by - 3, z, "minecraft:soul_lantern", { hanging: true });
  }
  // Slender piers down to the ice (none where the serpent coils).
  for (const z of [46, 54]) {
    const y = BRIDGE.fromY - 0.5 * (z - BRIDGE.fromZ);
    const top = (y % 1 ? Math.floor(y) : y - 1) - 3;
    c.fill(BRIDGE.x, CAVERN.lakeY, z, BRIDGE.x, top, z, BASALT, { pillar_axis: "y" });
  }
  // The gate where the road meets the cavern.
  const gz = BRIDGE.fromZ - 1;
  for (const sx of [-2, 2]) c.fill(BRIDGE.x + sx, BRIDGE.fromY - 1, gz, BRIDGE.x + sx, BRIDGE.fromY + 3, gz, BASALT, { pillar_axis: "y" });
  c.fill(BRIDGE.x - 2, BRIDGE.fromY + 4, gz, BRIDGE.x + 2, BRIDGE.fromY + 4, gz, CHISELED);
}

// ---------------------------------------------------------------------------
// The Clocktower of Reversion
// ---------------------------------------------------------------------------

/** Relative cells of the clock face: [x, y, z] → block, for hands at the given angles. */
export function clockFace(minuteAngle, hourAngle) {
  const out = [];
  const { x, cy, cz, r } = CLOCK;
  const hands = new Set();
  for (const [ang, len] of [[minuteAngle, CLOCK.minute], [hourAngle, CLOCK.hour]]) {
    for (let s = 0; s <= len; s += 0.5) hands.add(`${Math.round(cy + s * Math.cos(ang))},${Math.round(cz - s * Math.sin(ang))}`);
  }
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.hypot(dy, dz);
      if (d > r + 1.2) continue;
      let b = "minecraft:calcite";
      if (d > r + 0.2) b = GILDED;
      else if (hands.has(`${cy + dy},${cz + dz}`)) b = PB;
      else if (Math.abs(d - (r - 0.6)) < 0.5) {
        const a = Math.atan2(dz, dy);
        if (Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.36) b = BLACK;
      }
      out.push([x, cy + dy, cz + dz, b]);
    }
  }
  return out;
}

function clocktower(c) {
  const T = CLOCKTOWER;
  const L = CAVERN.lakeY;
  cells(c, T.minX, T.maxX, T.minZ, T.maxZ, (x, z) => {
    const wall = x === T.minX || x === T.maxX || z === T.minZ || z === T.maxZ;
    const corner = (x === T.minX || x === T.maxX) && (z === T.minZ || z === T.maxZ);
    if (wall) c.fill(x, L, z, x, T.topY, z, corner ? BASALT : PBB, corner ? { pillar_axis: "y" } : undefined);
    else {
      c.set(x, L, z, TILES);
      c.fill(x, L + 1, z, x, T.topY - 1, z, "minecraft:air");
      c.set(x, T.topY, z, TILES);
    }
  });
  for (let k = 0; k <= 4; k++) c.fill(T.minX + k, T.topY + 1 + k, T.minZ + k, T.maxX - k, T.topY + 1 + k, T.maxZ - k, k === 4 ? GILDED : MATTE);
  // Door (west, toward the Spire).
  c.fill(T.minX, L + 1, 89, T.minX, L + 4, 91, "minecraft:air");
  // Stair up inside to the clock room behind the face.
  const roomY = CLOCK.cy - 5;
  wallStair(T.minX + 1, T.maxX - 1, T.minZ + 1, T.maxZ - 1, L + 0.5, roomY + 1, 1, (x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  c.fill(T.minX + 2, roomY, T.minZ + 2, T.maxX - 2, roomY, T.maxZ - 2, TILES);
  c.set(40, roomY + 4, 90, "minecraft:soul_lantern", { hanging: false });
  c.set(40, roomY + 3, 90, PBB);
  // Slit windows.
  for (let y = L + 6; y < T.topY - 2; y += 10) for (const z of [88, 92]) c.fill(T.maxX, y, z, T.maxX, y + 4, z, "minecraft:iron_bars");
  // The face, hands set at a quarter past the hour (they will turn backwards).
  for (const [x, y, z, b] of clockFace(Math.PI / 2, Math.PI * 0.15)) c.set(x, y, z, b);
}

// ---------------------------------------------------------------------------
// The Inverse Cathedral
// ---------------------------------------------------------------------------

function cathedral(c) {
  const C = CATHEDRAL;
  const cx = (C.minX + C.maxX) / 2;
  const top = C.topY;
  const bottom = top - 12; // walls hang down to here
  // Fused into the roof of the cavern.
  c.fill(C.minX - 2, top, C.minZ - 2, C.maxX + 2, HELL.maxY, C.maxZ + 8, TILES);
  cells(c, C.minX, C.maxX, C.minZ, C.maxZ, (x, z) => {
    const wall = x === C.minX || x === C.maxX || z === C.minZ || z === C.maxZ;
    const dx = Math.abs(x - cx);
    const ridge = bottom - 1 - Math.round((C.maxX - C.minX) / 2 - dx);
    if (wall) {
      c.voxels(0, 0, 0, 0, bottom, top - 1, () => [x, z], (u, y) => {
        const window = (x === C.minX || x === C.maxX) && z % 4 === 0 && y > bottom + 2 && y < top - 3;
        if (window) return [y === bottom + 3 ? GILDED : "minecraft:gray_stained_glass"];
        return [y % 6 === 0 ? TILES : PBB];
      });
    } else c.fill(x, bottom, z, x, top - 1, z, "minecraft:air");
    // The roof, hanging upside down: its ridge points at the lake.
    c.fill(x, ridge, z, x, bottom - 1, z, dx < 0.6 ? GILDED : z % 3 === 0 ? MATTE : TILES);
    if (dx < 0.6 && z % 4 === 2) c.set(x, ridge - 1, z, "minecraft:soul_lantern", { hanging: true });
  });
  // Rose window at the north end.
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const r = Math.hypot(dx, dy);
      if (r > 4.3) continue;
      const spoke = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
      c.set(Math.round(cx + dx), bottom + 6 + dy, C.minZ, spoke || r > 3.5 ? BLACK : "minecraft:red_stained_glass");
    }
  }
  // The bell tower, inverted, ending in a spire that points down at the ice.
  const bx1 = Math.round(cx) - 3, bx2 = Math.round(cx) + 3, bz1 = C.maxZ + 1, bz2 = C.maxZ + 7;
  const towerBottom = bottom - 18;
  cells(c, bx1, bx2, bz1, bz2, (x, z) => {
    const wall = x === bx1 || x === bx2 || z === bz1 || z === bz2;
    const open = !((x - bx1) % 3 === 0 || (z - bz1) % 3 === 0);
    c.voxels(0, 0, 0, 0, towerBottom, top - 1, () => [x, z], (u, y) => {
      if (!wall) return y === towerBottom ? [TILES] : ["minecraft:air"];
      if (open && y > towerBottom + 1 && y < towerBottom + 6) return ["minecraft:air"]; // the belfry
      return [y % 5 === 0 ? MATTE : PBB];
    });
  });
  for (let k = 1; k <= 4; k++) {
    c.fill(bx1 + k - 1, towerBottom - k, bz1 + k - 1, bx2 - k + 1, towerBottom - k, bz2 - k + 1, k === 4 ? GILDED : MATTE);
  }
  c.set(Math.round(cx), towerBottom + 1, Math.round((bz1 + bz2) / 2), "minecraft:soul_lantern", { hanging: false });
  // Flying buttresses, flying upwards into the rock.
  for (let z = C.minZ + 3; z <= C.maxZ - 3; z += 6) {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? C.minX : C.maxX;
      for (let k = 1; k <= 6; k++) c.fill(x0 + side * k, bottom + 2 + k, z, x0 + side * k, bottom + 3 + k, z, PBB);
    }
  }
}

// ---------------------------------------------------------------------------
// The lake: the frozen damned, cold fires, and the path from the hidden way
// ---------------------------------------------------------------------------

function lake(c) {
  cells(c, CAVERN.x - CAVERN.rx, CAVERN.x + CAVERN.rx, CAVERN.z - CAVERN.rz, CAVERN.z + CAVERN.rz, (x, z) => {
    const s = cavernShape(x, z);
    if (!s?.lake || nearStructure(x, z, 1)) return;
    const r = Math.hypot(x + 0.5 - CAVERN.x, z + 0.5 - CAVERN.z);
    if (Math.abs(r - SERPENT.r) < 4) return;
    const h = hash2(x, z, 55);
    const y = CAVERN.lakeY;
    if (h < 0.014) c.set(x, y, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    else if (h < 0.02) c.set(x, y, z, "minecraft:bone_block", { pillar_axis: "y" });
    else if (h < 0.0235) c.set(x, y, z, "minecraft:soul_campfire");
  });
  // Lantern posts from where the hidden way comes out toward the Spire's door.
  const [ex, ez] = HIDDEN_TUNNEL.points[HIDDEN_TUNNEL.points.length - 1];
  const tx = 0, tz = SPIRE.minZ - 2;
  const n = Math.round(Math.hypot(tx - ex, tz - ez) / 6);
  for (let i = 1; i < n; i++) {
    const x = Math.round(ex + ((tx - ex) * i) / n) + 2;
    const z = Math.round(ez + ((tz - ez) * i) / n);
    if (Math.abs(Math.hypot(x - CAVERN.x, z - CAVERN.z) - SERPENT.r) < 4) continue;
    c.fill(x, CAVERN.lakeY, z, x, CAVERN.lakeY + 1, z, "minecraft:polished_blackstone_wall");
    c.set(x, CAVERN.lakeY + 2, z, "minecraft:soul_lantern", { hanging: false });
  }
}

/** Pedestals for the five syllables of the true name. */
function glyphs(c) {
  for (const g of GLYPHS) {
    c.set(g.x, g.y, g.z, CHISELED);
    c.set(g.x, g.y + 1, g.z, "minecraft:soul_torch");
  }
}

// ---------------------------------------------------------------------------

/** Every operation needed to build one tile of Hell, in order. */
export function* hellTileOps(tile) {
  const steps = [shell, cavern, pit, tunnels, serpent, spire, bridge, clocktower, cathedral, lake, glyphs];
  for (const step of steps) {
    const c = new Canvas(tile, HELL_REGION);
    step(c);
    yield* c.ops;
  }
}

/** Operations that put back solid rock where Hell was. */
export function* hellEraseOps(tile) {
  const c = new Canvas(tile, HELL_REGION);
  const s = HELL.shell;
  for (let x = s.minX; x <= s.maxX; x += 16) {
    for (let z = s.minZ; z <= s.maxZ; z += 16) {
      c.fill(x, HELL.minY, z, Math.min(s.maxX, x + 15), 0, Math.min(s.maxZ, z + 15), DEEP);
      c.fill(x, 1, z, Math.min(s.maxX, x + 15), HELL.maxY, Math.min(s.maxZ, z + 15), "minecraft:stone");
    }
  }
  yield* c.ops;
}

