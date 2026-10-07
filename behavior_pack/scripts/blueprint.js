// The Agartha blueprint: a pure description of the realm as a stream of block
// operations in coordinates relative to REALM.origin (y is absolute).
//
// This file deliberately has no Minecraft imports so it can be unit-tested in
// plain Node (see tools/test_blueprint.mjs).
//
// Operation formats:
//   ["fill", x1, y1, z1, x2, y2, z2, blockId, mode]   mode: "replace" | "keep"
//   ["set",  x, y, z, blockId, states?]
//   ["loot", x, y, z, lootTablePath]

import { REALM, G } from "./config.js";
import { fbm, hash2, hash3 } from "./noise.js";

const SURF = REALM.surfaceY;
const R = REALM.islandRadius;

// ---------------------------------------------------------------------------
// Island shape
// ---------------------------------------------------------------------------

const PEAK = { x: 0, z: -26, radius: 32, height: 44 };
const CASTLE_ZONE = { minX: -30, maxX: 30, minZ: 4, maxZ: 52 };

function inCastleZone(x, z) {
  return x >= CASTLE_ZONE.minX && x <= CASTLE_ZONE.maxX && z >= CASTLE_ZONE.minZ && z <= CASTLE_ZONE.maxZ;
}

const shapeCache = new Map();

/** Returns { top, bottom } for a column, or null if the column is open sky. */
export function islandColumn(x, z) {
  const key = x * 4096 + z;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const res = computeColumn(x, z);
  shapeCache.set(key, res);
  return res;
}

function computeColumn(x, z) {
  const d = Math.hypot(x, z);
  const edgeR = R + (fbm(x / 16, z / 16, 1) - 0.5) * 6;
  if (d > edgeR) return null;

  // Mountain peak behind the castle.
  const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
  let m = 0;
  if (dp < PEAK.radius) {
    m = PEAK.height * Math.pow(1 - dp / PEAK.radius, 1.3);
    m += (fbm(x / 7, z / 7, 3) - 0.5) * 10 * Math.min(1, m / 8);
  }

  // Steep cliff wall rising directly behind the great hall.
  let c = 0;
  if (z < 8) {
    const ax = Math.abs(x);
    const fade = ax < 24 ? 1 : Math.max(0, 1 - (ax - 24) / 12);
    c = Math.min(30, (8 - z) * 2.5) * fade + (fbm(x / 5, z / 5, 4) - 0.5) * 4 * fade;
  }

  let h = Math.max(m, c, 0);
  if (inCastleZone(x, z) && z >= 8) h = 0;

  const rim = Math.max(0, d - (edgeR - 3)) * 1.4;
  const top = Math.min(REALM.clearToY - 1, SURF + Math.round(h) - Math.floor(rim));

  let depth = 3 + 40 * Math.pow(Math.max(0, 1 - d / edgeR), 0.75) + (fbm(x / 10, z / 10, 5) - 0.5) * 8;

  // Hanging icicle spikes beneath the island, poking into the clouds.
  const cx = Math.floor(x / 6);
  const cz = Math.floor(z / 6);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const gx = cx + ox;
      const gz = cz + oz;
      if (hash2(gx, gz, 21) > 0.45) continue;
      const sx = gx * 6 + 1 + hash2(gx, gz, 22) * 4;
      const sz = gz * 6 + 1 + hash2(gx, gz, 23) * 4;
      const sd = Math.hypot(x - sx, z - sz);
      if (sd > 2.6 || Math.hypot(sx, sz) > edgeR - 4) continue;
      const len = 5 + hash2(gx, gz, 24) * 12;
      depth = Math.max(depth, depth + len * (1 - sd / 2.6));
    }
  }

  const bottom = Math.min(top - 1, SURF - Math.round(depth));
  return { top, bottom };
}

function slopeAt(x, z, top) {
  let s = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const n = islandColumn(x + dx, z + dz);
    s = Math.max(s, n ? Math.abs(n.top - top) : 4);
  }
  return s;
}

function* terrainOps(tile) {
  for (let x = tile.minX; x <= tile.maxX; x++) {
    for (let z = tile.minZ; z <= tile.maxZ; z++) {
      const col = islandColumn(x, z);
      if (!col) continue;
      const { top, bottom } = col;
      const steep = slopeAt(x, z, top) >= 3;

      // Underside: packed ice (and the icicle spikes).
      const iceTop = Math.min(top - 1, bottom + 2 + Math.max(0, SURF - 30 - bottom));
      yield ["fill", x, bottom, z, x, iceTop, z, "minecraft:packed_ice", "replace"];
      // Stone core.
      if (top - 4 > iceTop) yield ["fill", x, iceTop + 1, z, x, top - 4, z, "minecraft:stone", "replace"];
      // Snow cap, or bare rock and ice on steep faces.
      const capFrom = Math.max(iceTop + 1, top - 3);
      let cap = "minecraft:snow";
      if (steep) cap = hash2(x, z, 31) < 0.55 ? "minecraft:stone" : "minecraft:packed_ice";
      yield ["fill", x, capFrom, z, x, top, z, cap, "replace"];

      if (!steep && !inCastleZone(x, z) && hash2(x, z, 32) < 0.35) {
        yield ["set", x, top + 1, z, "minecraft:snow_layer", { height: hash2(x, z, 33) < 0.5 ? 0 : 1 }];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spruce trees
// ---------------------------------------------------------------------------

const TREE_SPOTS = [[-40, 24], [-44, 8], [-36, 38], [40, 22], [45, 6], [37, 37], [-46, -12], [46, -14]];

function* treeOps(tile) {
  const LEAVES = ["minecraft:spruce_leaves", { persistent_bit: true }];
  for (const [tx, tz] of TREE_SPOTS) {
    if (tx < tile.minX || tx > tile.maxX || tz < tile.minZ || tz > tile.maxZ) continue;
    const col = islandColumn(tx, tz);
    if (!col || col.top > SURF + 3 || slopeAt(tx, tz, col.top) >= 3) continue;
    const base = col.top + 1;
    const h = 6 + Math.floor(hash2(tx, tz, 41) * 4);
    for (let y = base + 2; y <= base + h; y++) {
      const t = (y - (base + 2)) / Math.max(1, h - 2);
      let r = Math.round((1 - t) * 3);
      if ((y - base) % 2 === 1) r = Math.max(0, r - 1);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 0.5) continue;
          if (dx === 0 && dz === 0 && y < base + h) continue;
          yield ["set", tx + dx, y, tz + dz, ...LEAVES];
        }
      }
    }
    yield ["set", tx, base + h + 1, tz, ...LEAVES];
    yield ["fill", tx, base, tz, tx, base + h - 1, tz, "minecraft:spruce_log", "replace"];
  }
}

// ---------------------------------------------------------------------------
// Cave system + treasure vault inside the mountain
// ---------------------------------------------------------------------------

// Waypoints are [x, feetY, z]: the y the player stands at.
const TUNNEL = [
  [7, G, 7], [7, G, 1], [5, G + 1, -5], [0, G + 2, -11],
  [-6, G + 3, -16], [-10, G + 4, -22], [-10, G + 5, -28], [-9, G + 6, -31],
];
export const VAULT = { x: -9, z: -36, floorY: G + 5, radius: 7.5 };

function vaultCeiling(r) {
  return Math.floor(5.5 * Math.sqrt(Math.max(0, 1 - (r / 8) ** 2))) + 1;
}

function computeCave() {
  const carved = new Set();
  const shell = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;
  const samples = [];
  for (let i = 0; i < TUNNEL.length - 1; i++) {
    const [ax, ay, az] = TUNNEL[i];
    const [bx, by, bz] = TUNNEL[i + 1];
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      samples.push([ax + (bx - ax) * t + 0.5, ay + (by - ay) * t + 2, az + (bz - az) * t + 0.5]);
    }
  }
  const RAD = 2.3;
  const SHELL = 3.4;
  for (const [cx, cy, cz] of samples) {
    for (let x = Math.floor(cx - SHELL); x <= Math.ceil(cx + SHELL); x++) {
      for (let y = Math.floor(cy - SHELL); y <= Math.ceil(cy + SHELL); y++) {
        for (let z = Math.floor(cz - SHELL); z <= Math.ceil(cz + SHELL); z++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
          if (d <= RAD) carved.add(key(x, y, z));
          else if (d <= SHELL) shell.add(key(x, y, z));
        }
      }
    }
  }
  // Vault dome.
  const vr = Math.ceil(VAULT.radius) + 1;
  for (let dx = -vr; dx <= vr; dx++) {
    for (let dz = -vr; dz <= vr; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > VAULT.radius) continue;
      const ceil = vaultCeiling(r);
      for (let y = VAULT.floorY + 1; y <= VAULT.floorY + ceil; y++) carved.add(key(VAULT.x + dx, y, VAULT.z + dz));
      shell.add(key(VAULT.x + dx, VAULT.floorY + ceil + 1, VAULT.z + dz));
    }
  }
  for (const k of carved) shell.delete(k);
  const parse = (k) => k.split(",").map(Number);
  return { carved: [...carved].map(parse), shell: [...shell].map(parse) };
}

function* caveOps() {
  const { carved, shell } = computeCave();
  for (const [x, y, z] of carved) yield ["set", x, y, z, "minecraft:air"];
  for (const [x, y, z] of shell) {
    if (z >= 3) continue; // the hall + gateway handle the entrance
    const col = islandColumn(x, z);
    if (!col || y > col.top || y < col.bottom) continue;
    const h = hash3(x, y, z, 51);
    if (h < 0.03) yield ["set", x, y, z, "minecraft:sea_lantern"];
    else if (h < 0.13) yield ["set", x, y, z, "minecraft:packed_ice"];
    else if (h < 0.19) yield ["set", x, y, z, "minecraft:blue_ice"];
  }
}

// ---------------------------------------------------------------------------
// The castle: stone curtain wall, four round towers, Viking longhouse hall,
// courtyard workshops, gateway into the mountain and the treasure vault.
// ---------------------------------------------------------------------------

class Canvas {
  constructor() {
    this.blocks = new Map();
  }
  put(x, y, z, id, states) {
    this.blocks.set(`${x},${y},${z}`, [x, y, z, id, states]);
  }
  box(x1, y1, z1, x2, y2, z2, id, states) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) this.put(x, y, z, id, states);
  }
  *ops() {
    for (const [x, y, z, id, states] of this.blocks.values()) yield ["set", x, y, z, id, states];
  }
}

function masonry(x, y, z) {
  const h = hash3(x, y, z, 61);
  if (h < 0.14) return "minecraft:cracked_stone_bricks";
  if (h < 0.22) return "minecraft:cobblestone";
  return "minecraft:stone_bricks";
}

// Bedrock stair facing: 0 = east, 1 = west, 2 = south, 3 = north (tall side).
const stairs = (id, dir, upside = false) => [id, { weirdo_direction: dir, upside_down_bit: upside }];
const slabTop = (id) => [id, { "minecraft:vertical_half": "top" }];
const slabBottom = (id) => [id, { "minecraft:vertical_half": "bottom" }];
const logY = ["minecraft:spruce_log", { pillar_axis: "y" }];
const strippedY = ["minecraft:stripped_spruce_log", { pillar_axis: "y" }];

function lanternPost(c, x, z, y = G) {
  c.put(x, y, z, "minecraft:spruce_fence");
  c.put(x, y + 1, z, "minecraft:spruce_fence");
  c.put(x, y + 2, z, "minecraft:lantern", { hanging: false });
}

function curtainWall(c) {
  const top = G + 6;
  const wallCell = (x, z, outer) => {
    for (let y = SURF - 2; y <= top; y++) c.put(x, y, z, masonry(x, y, z));
    if (outer && (x + z) % 2 === 0) c.put(x, top + 1, z, masonry(x, top + 1, z));
  };
  for (let x = -24; x <= 24; x++) {
    wallCell(x, 42, true);
    wallCell(x, 41, false);
  }
  for (let z = 8; z <= 42; z++) {
    wallCell(-24, z, true);
    wallCell(-23, z, false);
    wallCell(24, z, true);
    wallCell(23, z, false);
  }
  // Gate.
  c.box(-2, G, 41, 2, G + 3, 42, "minecraft:air");
  c.box(-2, G + 4, 41, 2, G + 4, 42, "minecraft:spruce_planks");
  c.put(-2, G + 3, 41, "minecraft:stone_bricks");
  c.put(2, G + 3, 41, "minecraft:stone_bricks");
  c.put(-2, G + 3, 42, "minecraft:stone_bricks");
  c.put(2, G + 3, 42, "minecraft:stone_bricks");
  lanternPost(c, -4, 44);
  lanternPost(c, 4, 44);

  // Stairway up to the wall-walk.
  for (let i = 0; i <= 6; i++) {
    for (let y = G; y < G + i; y++) c.put(8 + i, y, 40, "minecraft:stone_bricks");
    c.put(8 + i, G + i, 40, ...stairs("minecraft:stone_brick_stairs", 0));
  }
}

function tower(c, cx, cz) {
  const dirX = cx > 0 ? -1 : 1;
  const dirZ = cz < 20 ? 1 : -1;
  for (let dx = -5; dx <= 5; dx++) {
    for (let dz = -5; dz <= 5; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > 4.5) continue;
      const x = cx + dx;
      const z = cz + dz;
      if (r >= 3.5) {
        for (let y = SURF - 3; y <= G + 11; y++) c.put(x, y, z, masonry(x, y, z));
        if ((dx + dz) % 2 === 0) c.put(x, G + 13, z, masonry(x, G + 13, z));
        const isDoor = dx * dirX >= 2 && dz * dirZ >= 2 && Math.abs(Math.abs(dx) - Math.abs(dz)) <= 1 && Math.abs(dx) + Math.abs(dz) <= 6;
        if (isDoor) c.box(x, G, z, x, G + 2, z, "minecraft:air");
      } else {
        c.put(x, SURF, z, "minecraft:stone_bricks");
        for (let y = G; y <= G + 11; y++) c.put(x, y, z, "minecraft:air");
      }
      c.put(x, G + 12, z, "minecraft:stone_bricks");
      if (r < 3.5) c.box(x, G + 13, z, x, G + 15, z, "minecraft:air");
    }
  }
  // Ladder to the lookout.
  const lx = cx - dirX * 3;
  for (let y = G; y <= G + 12; y++) c.put(lx, y, cz, "minecraft:ladder", { facing_direction: dirX > 0 ? 5 : 4 });
  // Roof posts and a timber cone roof.
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) c.box(cx + px, G + 13, cz + pz, cx + px, G + 15, cz + pz, ...logY);
  for (let j = 0; j <= 5; j++) {
    const rr = 5.5 - j;
    const id = j % 2 === 0 ? "minecraft:dark_oak_planks" : "minecraft:spruce_planks";
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++) if (Math.hypot(dx, dz) <= rr) c.put(cx + dx, G + 16 + j, cz + dz, id);
  }
  c.put(cx, G + 22, cz, "minecraft:spruce_fence");
  c.put(cx, G + 23, cz, "minecraft:soul_lantern", { hanging: false });
  c.put(cx, G + 15, cz, "minecraft:lantern", { hanging: true });
}

const HALL = { minX: -10, maxX: 10, minZ: 8, maxZ: 28 };

function greatHall(c) {
  const { minX, maxX, minZ, maxZ } = HALL;
  // Foundation and floor.
  c.box(minX, SURF - 1, minZ, maxX, SURF, maxZ, "minecraft:stone_bricks");
  c.box(minX + 1, SURF, minZ + 1, maxX - 1, SURF, maxZ - 1, "minecraft:spruce_planks");
  c.box(minX + 1, G, minZ + 1, maxX - 1, G + 16, maxZ - 1, "minecraft:air");

  // Timber-framed walls.
  const pillarX = new Set([minX, -4, 4, maxX]);
  for (let y = G; y <= G + 5; y++) {
    for (let x = minX; x <= maxX; x++) {
      for (const z of [minZ, maxZ]) {
        if (y === G) c.put(x, y, z, "minecraft:cobblestone");
        else if (pillarX.has(x)) c.put(x, y, z, ...strippedY);
        else c.put(x, y, z, "minecraft:spruce_planks");
      }
    }
    for (let z = minZ; z <= maxZ; z++) {
      for (const x of [minX, maxX]) {
        if (y === G) c.put(x, y, z, "minecraft:cobblestone");
        else if ((z - minZ) % 4 === 0) c.put(x, y, z, ...strippedY);
        else if ((y === G + 2 || y === G + 3) && (z - minZ) % 4 === 2) c.put(x, y, z, "minecraft:spruce_fence");
        else c.put(x, y, z, "minecraft:spruce_planks");
      }
    }
  }
  // Doors: south to the courtyard, north into the mountain.
  c.box(-1, G, maxZ, 1, G + 3, maxZ, "minecraft:air");
  c.box(6, G, minZ, 8, G + 2, minZ, "minecraft:air");

  // Steep A-frame roof with overhang.
  for (let k = 0; k <= 10; k++) {
    const y = G + 5 + k;
    for (let z = minZ - 1; z <= maxZ + 1; z++) {
      c.put(-11 + k, y, z, ...stairs("minecraft:dark_oak_stairs", 0));
      c.put(11 - k, y, z, ...stairs("minecraft:dark_oak_stairs", 1));
    }
    if (k >= 1) {
      for (let x = -10 + k; x <= 10 - k; x++) {
        c.put(x, y, minZ, "minecraft:spruce_planks");
        c.put(x, y, maxZ, "minecraft:spruce_planks");
      }
    }
  }
  c.box(0, G + 16, minZ - 1, 0, G + 16, maxZ + 1, "minecraft:dark_oak_planks");
  // Crossed gable beams ("dragon heads").
  for (const z of [minZ - 1, maxZ + 1]) {
    c.put(-1, G + 17, z, "minecraft:spruce_fence");
    c.put(1, G + 17, z, "minecraft:spruce_fence");
    c.put(-2, G + 18, z, "minecraft:spruce_fence");
    c.put(2, G + 18, z, "minecraft:spruce_fence");
  }
  // Round window in each gable.
  for (const z of [minZ, maxZ]) c.box(-1, G + 9, z, 1, G + 10, z, "minecraft:glass_pane");

  // Long hearth.
  c.box(-1, SURF, 13, 1, SURF, 23, "minecraft:stone_bricks");
  for (const z of [14, 17, 20, 23]) c.put(0, G, z, "minecraft:campfire", { extinguished: false });

  // Feasting tables and benches.
  for (let z = 12; z <= 24; z++) {
    c.put(-5, G, z, ...slabTop("minecraft:spruce_slab"));
    c.put(5, G, z, ...slabTop("minecraft:spruce_slab"));
    c.put(-6, G, z, ...stairs("minecraft:spruce_stairs", 1));
    c.put(-4, G, z, ...stairs("minecraft:spruce_stairs", 0));
    c.put(4, G, z, ...stairs("minecraft:spruce_stairs", 1));
    c.put(6, G, z, ...stairs("minecraft:spruce_stairs", 0));
  }
  for (const [x, z] of [[-5, 15], [5, 21]]) c.put(x, G + 1, z, "minecraft:cake");
  for (const [x, z] of [[-5, 18], [5, 13], [5, 24], [-5, 23]]) c.put(x, G + 1, z, "minecraft:lantern", { hanging: false });

  // Throne dais.
  c.box(-3, G, 9, 3, G, 11, "minecraft:stone_bricks");
  for (let x = -3; x <= 3; x++) c.put(x, G, 12, ...stairs("minecraft:stone_brick_stairs", 3));
  c.put(0, G + 1, 10, ...stairs("minecraft:spruce_stairs", 3));
  c.put(-1, G + 1, 10, ...slabBottom("minecraft:spruce_slab"));
  c.put(1, G + 1, 10, ...slabBottom("minecraft:spruce_slab"));
  c.box(0, G + 1, 9, 0, G + 3, 9, "minecraft:gold_block");
  c.box(-1, G + 1, 9, -1, G + 2, 9, "minecraft:spruce_planks");
  c.box(1, G + 1, 9, 1, G + 2, 9, "minecraft:spruce_planks");
  lanternPost(c, -3, 10, G + 1);
  lanternPost(c, 3, 10, G + 1);

  // Wall lanterns.
  for (const z of [12, 16, 20, 24]) {
    lanternPost(c, -9, z);
    lanternPost(c, 9, z);
  }

  // Return runestone and the hall's supply chests.
  c.put(-7, G, 10, "agartha:runestone");
  chest(c, -8, G, 26, "east", "agartha/great_hall");
  chest(c, 8, G, 26, "west", "agartha/great_hall");
}

const lootPlacements = [];
function chest(c, x, y, z, facing, table) {
  c.put(x, y, z, "minecraft:chest", { "minecraft:cardinal_direction": facing });
  lootPlacements.push([x, y, z, table]);
}

function mountainGate(c) {
  // Stone-lined passage from the hall's back door into the cliff.
  for (let z = 3; z <= 7; z++) {
    c.put(6, SURF, z, "minecraft:stone_bricks");
    c.put(7, SURF, z, "minecraft:stone_bricks");
    c.put(8, SURF, z, "minecraft:stone_bricks");
    for (let y = G; y <= G + 3; y++) {
      c.put(5, y, z, masonry(5, y, z));
      c.put(9, y, z, masonry(9, y, z));
    }
    for (let x = 5; x <= 9; x++) c.put(x, G + 3, z, masonry(x, G + 3, z));
    c.box(6, G, z, 8, G + 2, z, "minecraft:air");
  }
  c.put(6, G + 2, 5, "minecraft:lantern", { hanging: true });
}

function courtyard(c) {
  // Path from the hall door, through the gate, to the landing pad.
  for (let z = 29; z <= 46; z++) {
    for (let x = -1; x <= 1; x++) c.put(x, SURF, z, hash2(x, z, 71) < 0.3 ? "minecraft:cobblestone" : "minecraft:stone_bricks");
  }
  for (const [x, z] of [[-3, 32], [3, 32], [-3, 38], [3, 38]]) {
    c.put(x, G, z, "minecraft:cobblestone_wall");
    c.put(x, G + 1, z, "minecraft:campfire", { extinguished: false });
  }

  // Smithy (east) and stores (west) under lean-to roofs.
  for (const side of [1, -1]) {
    const x0 = 14 * side;
    const x1 = 21 * side;
    for (const [px, pz] of [[x0, 31], [x1, 31], [x0, 38], [x1, 38]]) c.box(px, G, pz, px, G + 3, pz, ...logY);
    c.box(13 * side, G + 4, 30, 22 * side, G + 4, 39, ...slabBottom("minecraft:spruce_slab"));
    c.box(x0, SURF, 31, x1, SURF, 38, "minecraft:spruce_planks");
  }
  c.put(21, G, 32, "minecraft:anvil");
  c.put(21, G, 33, "minecraft:smithing_table");
  c.put(21, G, 34, "minecraft:crafting_table");
  c.put(21, G, 36, "minecraft:barrel", { facing_direction: 1 });
  c.put(21, G, 37, "minecraft:barrel", { facing_direction: 1 });
  c.put(17, G + 3, 34, "minecraft:lantern", { hanging: true });
  c.box(-21, G, 32, -20, G + 1, 34, "minecraft:hay_block");
  c.put(-21, G, 36, "minecraft:fletching_table");
  c.put(-21, G, 37, "minecraft:barrel", { facing_direction: 1 });
  c.put(-17, G, 38, "minecraft:target");
  c.put(-17, G + 3, 34, "minecraft:lantern", { hanging: true });
}

function landingPad(c) {
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const r = Math.hypot(dx, dz);
      if (r <= 2.5) c.put(dx, SURF, 48 + dz, "minecraft:quartz_block");
      else if (r <= 3.5) c.put(dx, SURF, 48 + dz, "minecraft:light_blue_concrete");
    }
  }
  c.put(3, G, 50, "agartha:runestone");
}

function vault(c) {
  const { x: vx, z: vz, floorY } = VAULT;
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const r = Math.hypot(dx, dz);
      if (r > VAULT.radius) continue;
      c.put(vx + dx, floorY, vz + dz, r < 2 ? "minecraft:gold_block" : (r > 6.5 ? "minecraft:packed_ice" : "minecraft:stone_bricks"));
    }
  }
  for (const [px, pz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const ceil = vaultCeiling(Math.hypot(px, pz));
    for (let y = floorY + 1; y <= floorY + ceil; y++) {
      c.put(vx + px, y, vz + pz, y === floorY + 3 ? "minecraft:sea_lantern" : "minecraft:stone_bricks");
    }
  }
  chest(c, vx - 2, floorY + 1, vz - 4, "south", "agartha/viking_hoard");
  chest(c, vx, floorY + 1, vz - 5, "south", "agartha/viking_hoard");
  chest(c, vx + 2, floorY + 1, vz - 4, "south", "agartha/viking_hoard");
  c.put(vx - 3, floorY + 1, vz - 5, "minecraft:gold_block");
  c.put(vx + 3, floorY + 1, vz - 5, "minecraft:gold_block");
  c.put(vx - 1, floorY + 1, vz - 6, "minecraft:raw_gold_block");
  c.put(vx + 1, floorY + 1, vz - 6, "minecraft:emerald_block");
  c.put(vx - 4, floorY + 1, vz + 2, "agartha:runestone");
  c.put(vx + 5, floorY + 1, vz, "minecraft:lantern", { hanging: false });
  c.put(vx - 5, floorY + 1, vz, "minecraft:lantern", { hanging: false });
}

function* castleOps() {
  lootPlacements.length = 0;
  const c = new Canvas();
  curtainWall(c);
  for (const [tx, tz] of [[-24, 8], [24, 8], [-24, 42], [24, 42]]) tower(c, tx, tz);
  greatHall(c);
  mountainGate(c);
  courtyard(c);
  landingPad(c);
  vault(c);
  yield* c.ops();
  for (const [x, y, z, table] of lootPlacements) yield ["loot", x, y, z, table];
}

// ---------------------------------------------------------------------------
// Sea of clouds
// ---------------------------------------------------------------------------

function* cloudOps(tile) {
  const CR = REALM.cloudRadius;
  for (let x = tile.minX; x <= tile.maxX; x++) {
    for (let z = tile.minZ; z <= tile.maxZ; z++) {
      const d = Math.hypot(x, z);
      if (d > CR) continue;
      const edge = Math.max(0, (d - CR * 0.75) / (CR * 0.25));
      const thr = 0.4 + 0.25 * edge;
      const n = fbm(x / 22, z / 22, 11, 4);
      if (n < thr) continue;
      const t = Math.min(6, 1 + Math.floor((n - thr) * 16));
      const base = REALM.cloudBaseY + Math.floor(fbm(x / 40, z / 40, 12) * 3);
      const y1 = base - Math.floor(t / 2);
      yield ["fill", x, y1, z, x, base + t - 1, z, "agartha:cloud", "keep"];
    }
  }
}

// ---------------------------------------------------------------------------

export function tileHasIsland(tile) {
  return tile.minX <= 0 && tile.maxX >= 0 && tile.minZ <= 0 && tile.maxZ >= 0;
}

/** Wipes the pocket's air space for a tile (one fill per chunk column). */
export function* clearOps(tile) {
  for (let x = tile.minX; x <= tile.maxX; x += 16) {
    for (let z = tile.minZ; z <= tile.maxZ; z += 16) {
      yield ["fill", x, REALM.clearFromY, z, x + 15, REALM.clearToY, z + 15, "minecraft:air", "replace"];
    }
  }
}

/** Every operation needed to build one tile, in order. */
export function* tileOps(tile) {
  yield* clearOps(tile);
  if (tileHasIsland(tile)) {
    yield* terrainOps(tile);
    yield* treeOps(tile);
    yield* caveOps();
    yield* castleOps();
  }
  yield* cloudOps(tile);
}
