// The Agartha blueprint: turns the realm description (terrain.js,
// structures.js, citadel.js, nature.js) into block operations, one tile at a
// time. Pure JavaScript with no Minecraft imports, so it can be tested in Node
// (tools/test_blueprint.mjs).

import { REALM, B } from "./config.js";
import { fbm, hash2 } from "./noise.js";
import { islandColumn, slopeAt, edgeRadius } from "./terrain.js";
import { Canvas, boxesIntersect } from "./canvas.js";
import { STRUCTURES } from "./structures.js";
import { forest, wildlife } from "./nature.js";

export { islandColumn };

const STRATA = ["minecraft:calcite", "minecraft:stone", "minecraft:packed_ice", "minecraft:calcite"];

function terrain(c) {
  const t = c.tile;
  for (let x = t.minX; x <= t.maxX; x++) {
    for (let z = t.minZ; z <= t.maxZ; z++) {
      const col = islandColumn(x, z);
      if (!col) continue;
      const { top, bottom } = col;
      // Ice underside (all of the hanging spikes are ice).
      const iceTop = Math.min(top - 1, Math.max(bottom + 3, B - 58));
      c.fill(x, bottom, z, x, iceTop, z, "minecraft:packed_ice");
      if (col.lake) {
        if (top - 3 > iceTop) c.fill(x, iceTop + 1, z, x, top - 3, z, "minecraft:stone");
        let surface = "minecraft:packed_ice";
        if (Math.abs(fbm(x / 9, z / 9, 15, 2) - 0.5) < 0.02) surface = "minecraft:blue_ice";
        else if (fbm(x / 25, z / 25, 16) > 0.66) surface = "minecraft:snow";
        c.fill(x, Math.max(iceTop + 1, top - 2), z, x, top - 1, z, "minecraft:blue_ice");
        c.set(x, top, z, surface);
        continue;
      }
      const steep = slopeAt(x, z) >= 3;
      // Exposed cliff faces get banded white/stone/ice strata.
      let lowNeighbor = top;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = islandColumn(x + dx, z + dz);
        lowNeighbor = Math.min(lowNeighbor, n ? n.top : iceTop);
      }
      const faceFrom = Math.max(iceTop + 1, lowNeighbor - 1);
      const coreTop = Math.min(top - 4, faceFrom - 1);
      if (coreTop > iceTop) c.fill(x, iceTop + 1, z, x, coreTop, z, "minecraft:stone");
      const off = Math.floor(fbm(x / 30, z / 30, 19) * 12);
      for (let y = Math.max(iceTop + 1, coreTop + 1); y <= top - 4; ) {
        const band = Math.floor((y + off) / 5);
        const end = Math.min(top - 4, band * 5 + 4 - off);
        c.fill(x, y, z, x, end, z, STRATA[band & 3]);
        y = end + 1;
      }
      let cap = "minecraft:snow";
      if (steep) {
        const h = hash2(x, z, 31);
        cap = h < 0.4 ? "minecraft:stone" : h < 0.75 ? "minecraft:calcite" : "minecraft:packed_ice";
      }
      c.fill(x, Math.max(iceTop + 1, top - 3), z, x, top, z, cap);
      if (!steep && !col.padded && hash2(x, z, 32) < 0.12) {
        c.set(x, top + 1, z, "minecraft:snow_layer", { height: hash2(x, z, 33) < 0.6 ? 0 : 1 });
      }
    }
  }
}

function clouds(c) {
  const t = c.tile;
  const CR = REALM.cloudRadius;
  for (let x = t.minX; x <= t.maxX; x++) {
    for (let z = t.minZ; z <= t.maxZ; z++) {
      const d = Math.hypot(x, z);
      if (d > CR) continue;
      // The sea of clouds below.
      const edge = Math.max(0, (d - CR * 0.8) / (CR * 0.2));
      const thr = 0.4 + 0.25 * edge;
      const n = fbm(x / 26, z / 26, 11, 4);
      if (n >= thr) {
        const th = Math.min(7, 1 + Math.floor((n - thr) * 18));
        const base = REALM.cloudBaseY + Math.floor(fbm(x / 40, z / 40, 12) * 4);
        c.fill(x, base - Math.floor(th / 2), z, x, base + th - 1, z, "agartha:cloud", undefined, "keep");
      }
      // Drifting cloud banks at island height, just beyond the edge.
      if (d > edgeRadius(x, z) + 10) {
        const m = fbm(x / 18, z / 18, 17, 3);
        if (m > 0.66) {
          const th = 1 + Math.floor((m - 0.66) * 25);
          const base = 172 + Math.floor(fbm(x / 60, z / 60, 18) * 40);
          c.fill(x, base, z, x, base + th, z, "agartha:cloud", undefined, "keep");
        }
      }
    }
  }
}

/** Wipes the pocket's air space for a tile (fills of 16x16 columns). */
function clear(c) {
  const t = c.tile;
  for (let x = t.minX; x <= t.maxX; x += 16) {
    for (let z = t.minZ; z <= t.maxZ; z += 16) {
      c.fill(x, REALM.clearFromY, z, x + 15, REALM.clearToY, z + 15, "minecraft:air");
    }
  }
}

/**
 * Every operation needed to build one tile, in order. Yields batches (arrays)
 * so callers can interleave work.
 */
export function* tileOps(tile) {
  const steps = [clear, terrain, forest];
  for (const s of STRUCTURES) if (boxesIntersect(s.bounds, tile)) steps.push(s.build);
  steps.push(clouds, wildlife);
  for (const step of steps) {
    const c = new Canvas(tile);
    step(c);
    yield* c.ops;
  }
}
