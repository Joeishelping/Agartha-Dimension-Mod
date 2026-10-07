// The Jarl's Citadel: a stone-walled Viking stronghold on a cliff terrace in
// the north-eastern mountains, with a longhouse great hall, four towers, and
// an ice-veined tunnel into the mountain that leads to the treasure vault.
//
// Written in coordinates local to LAYOUT.citadel (x/z), with absolute y.

import { LAYOUT, B, islandColumn } from "./terrain.js";
import { hash2, hash3 } from "./noise.js";

const OX = LAYOUT.citadel.x;
const OZ = LAYOUT.citadel.z;
const SURF = LAYOUT.citadel.y;
const G = SURF + 1;

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

let caveCache = null;

function caveOps(c) {
  caveCache ??= computeCave();
  const { carved, shell } = caveCache;
  for (const [x, y, z] of carved) c.put(x, y, z, "minecraft:air");
  for (const [x, y, z] of shell) {
    if (z >= 3) continue; // the hall + gateway handle the entrance
    const col = islandColumn(OX + x, OZ + z);
    if (!col || y > col.top || y < col.bottom) continue;
    const h = hash3(OX + x, y, OZ + z, 51);
    if (h < 0.03) c.put(x, y, z, "minecraft:sea_lantern");
    else if (h < 0.13) c.put(x, y, z, "minecraft:packed_ice");
    else if (h < 0.19) c.put(x, y, z, "minecraft:blue_ice");
  }
}

// ---------------------------------------------------------------------------
// The castle: stone curtain wall, four round towers, Viking longhouse hall,
// courtyard workshops, gateway into the mountain and the treasure vault.
// ---------------------------------------------------------------------------

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

  // Light and the hall's supply chests.
  c.put(-7, G, 10, "minecraft:sea_lantern");
  chest(c, -8, G, 26, "east", "agartha/great_hall");
  chest(c, 8, G, 26, "west", "agartha/great_hall");
}

function chest(c, x, y, z, facing, table) {
  c.chest(x, y, z, facing, table);
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

function terraceStairs(c) {
  // Landing at the top, then a grand stair down the terrace's south cliff.
  c.box(-6, SURF, 44, 6, SURF, 60, "minecraft:stone_bricks");
  c.put(3, G, 50, "minecraft:sea_lantern");
  for (let i = 1; i <= SURF - B; i++) {
    const z = 60 + i;
    const y = SURF - i + 1;
    c.box(-5, B - 3, z, 5, y - 1, z, "minecraft:stone_bricks");
    c.box(-4, y, z, 4, y, z, ...stairs("minecraft:stone_brick_stairs", 3));
    c.box(-5, y, z, -5, y + 1, z, "minecraft:stone_bricks");
    c.box(5, y, z, 5, y + 1, z, "minecraft:stone_bricks");
    if (i % 6 === 0) {
      lanternPost(c, -5, z, y + 2);
      lanternPost(c, 5, z, y + 2);
    }
  }
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
  c.put(vx - 4, floorY + 1, vz + 2, "minecraft:sea_lantern");
  c.put(vx + 5, floorY + 1, vz, "minecraft:lantern", { hanging: false });
  c.put(vx - 5, floorY + 1, vz, "minecraft:lantern", { hanging: false });
}

export const CITADEL_BOUNDS = { minX: OX - 34, maxX: OX + 34, minZ: OZ - 50, maxZ: OZ + 88 };

/** Builds the citadel (castle, cave, vault, terrace stairs) onto a Canvas. */
export function buildCitadel(canvas) {
  const c = {
    put: (x, y, z, id, states) => canvas.set(OX + x, y, OZ + z, id, states),
    box: (x1, y1, z1, x2, y2, z2, id, states) => canvas.fill(OX + x1, y1, OZ + z1, OX + x2, y2, OZ + z2, id, states),
    chest: (x, y, z, facing, table) => canvas.chest(OX + x, y, OZ + z, facing, table),
  };
  caveOps(c);
  curtainWall(c);
  for (const [tx, tz] of [[-24, 8], [24, 8], [-24, 42], [24, 42]]) tower(c, tx, tz);
  greatHall(c);
  mountainGate(c);
  courtyard(c);
  terraceStairs(c);
  vault(c);
}

