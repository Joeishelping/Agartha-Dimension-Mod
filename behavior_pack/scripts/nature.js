// Snowy spruce forests and the realm's peaceful wildlife.

import { B, islandColumn, isReserved, slopeAt } from "./terrain.js";
import { spruce } from "./structures.js";
import { fbm, hash2 } from "./noise.js";

const CELL = 7;

/** Plants the trees whose canopy can reach into this tile. */
export function forest(c) {
  const t = c.tile;
  const pad = 8;
  for (let gx = Math.floor((t.minX - pad) / CELL); gx <= Math.floor((t.maxX + pad) / CELL); gx++) {
    for (let gz = Math.floor((t.minZ - pad) / CELL); gz <= Math.floor((t.maxZ + pad) / CELL); gz++) {
      const x = gx * CELL + Math.floor(hash2(gx, gz, 1001) * CELL);
      const z = gz * CELL + Math.floor(hash2(gx, gz, 1002) * CELL);
      const col = islandColumn(x, z);
      if (!col || col.lake || col.padded) continue;
      if (col.top > B + 60 || slopeAt(x, z) >= 3) continue;
      const density = fbm(x / 70, z / 70, 1003) + (col.top > B + 8 ? 0.08 : 0);
      if (density < 0.5 || hash2(gx, gz, 1004) > 0.35 + (density - 0.5) * 2.5) continue;
      if (isReserved(x, z, 4)) continue;
      const mega = hash2(gx, gz, 1005) < 0.18;
      const h = mega ? 16 + Math.floor(hash2(gx, gz, 1006) * 9) : 7 + Math.floor(hash2(gx, gz, 1006) * 6);
      spruce(c, x, col.top + 1, z, h, mega);
    }
  }
}

// Goats on the mountain shelves, polar bears by the lake, wolves in the woods.
const ANIMALS = [
  ["minecraft:goat", -60, -150], ["minecraft:goat", 40, -160], ["minecraft:goat", -120, -120],
  ["minecraft:goat", 150, -60], ["minecraft:polar_bear", -60, 50], ["minecraft:polar_bear", 70, -20],
  ["minecraft:polar_bear", -90, -60], ["minecraft:wolf", -80, 120], ["minecraft:wolf", -84, 124],
  ["minecraft:wolf", 60, 150], ["minecraft:fox", -150, 110], ["minecraft:fox", 160, 20],
  ["minecraft:rabbit", -40, 140], ["minecraft:rabbit", 40, 140], ["minecraft:rabbit", -100, 150],
];

export function wildlife(c) {
  for (const [id, x, z] of ANIMALS) {
    const col = islandColumn(x, z);
    if (col && !col.lake) c.spawn(x, col.top + 1, z, id);
  }
}
