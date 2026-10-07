// The Agartha blueprint: turns the realm description (terrain.js,
// structures.js, citadel.js, nature.js) into block operations, one tile at a
// time. Pure JavaScript with no Minecraft imports, so it can be tested in Node
// (tools/test_blueprint.mjs).

import { REALM, B } from "./config.js";
import { fbm, hash2 } from "./noise.js";
import { islandColumn, slopeAt, edgeRadius } from "./terrain.js";
import { Canvas, boxesIntersect } from "./canvas.js";
import { STRUCTURES } from "./structures.js";
import { MYTHIC, nearBifrost } from "./mythic.js";
import { forest, wildlife } from "./nature.js";

export { islandColumn };

const STRATA = ["minecraft:calcite", "minecraft:packed_ice", "minecraft:calcite", "minecraft:stone"];

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
      if (col.river || col.glacier) {
        if (top - 4 > iceTop) c.fill(x, iceTop + 1, z, x, top - 4, z, "minecraft:stone");
        c.fill(x, Math.max(iceTop + 1, top - 3), z, x, top - 1, z, "minecraft:packed_ice");
        const crev = Math.abs(fbm(x / 7, z / 7, 23, 2) - 0.5) < 0.03;
        c.set(x, top, z, crev ? "minecraft:blue_ice" : col.glacier && hash2(x, z, 24) < 0.25 ? "minecraft:snow" : col.glacier ? "minecraft:packed_ice" : "minecraft:blue_ice");
        continue;
      }
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
      // Steep faces show continuous strata right up to the top; gentle slopes keep a snow cap.
      const strataTop = steep ? top - 1 : top - 4;
      const coreTop = Math.min(strataTop, faceFrom - 1);
      if (coreTop > iceTop) c.fill(x, iceTop + 1, z, x, coreTop, z, "minecraft:stone");
      const off = Math.floor(fbm(x / 30, z / 30, 19) * 12);
      for (let y = Math.max(iceTop + 1, coreTop + 1); y <= strataTop; ) {
        const band = Math.floor((y + off) / 5);
        const end = Math.min(strataTop, band * 5 + 4 - off);
        c.fill(x, y, z, x, end, z, STRATA[band & 3]);
        y = end + 1;
      }
      if (steep) {
        // Snow clings to ledges; the steepest faces stay bare.
        const band = Math.floor((top + off) / 5);
        c.set(x, top, z, slopeAt(x, z) <= 5 ? "minecraft:snow" : STRATA[band & 3]);
      } else {
        c.fill(x, Math.max(iceTop + 1, top - 3), z, x, top, z, "minecraft:snow");
      }
      if (!steep && !col.padded && hash2(x, z, 32) < 0.12) {
        c.set(x, top + 1, z, "minecraft:snow_layer", { height: hash2(x, z, 33) < 0.6 ? 0 : 1 });
      }
    }
  }
}

function clouds(c) {
  const t = c.tile;
  const base = REALM.cloudBaseY;
  // An unbroken floor of cloud under the whole pocket: nothing below shows.
  for (let x = t.minX; x <= t.maxX; x += 16) {
    for (let z = t.minZ; z <= t.maxZ; z += 16) {
      c.fill(x, base - 1, z, x + 15, base + 1, z + 15, "agartha:cloud", undefined, "keep");
    }
  }
  for (let x = t.minX; x <= t.maxX; x++) {
    for (let z = t.minZ; z <= t.maxZ; z++) {
      const d = Math.hypot(x, z);
      const edgeR = edgeRadius(x, z);
      // Billowing tops on the cloud sea.
      const n = fbm(x / 26, z / 26, 11, 4);
      let top = base + 1;
      if (n > 0.42) top = base + 1 + Math.min(9, Math.floor((n - 0.42) * 30));
      // Towering cloud walls around the rim of the world, with gaps to look through.
      if (d > edgeR + 4 && !nearBifrost(x, z, 12)) {
        const k = (d - edgeR - 38) / 48;
        const bump = Math.max(0, 1 - k * k);
        const wall = Math.floor(bump * 85 * (0.25 + fbm(x / 32, z / 32, 29, 3) * 1.1) - 8);
        if (wall > 0) top = Math.max(top, base + 1 + wall);
      }
      const dip = n > 0.5 ? Math.floor((n - 0.5) * 12) : 0;
      if (top > base + 1 || dip > 0) c.fill(x, base - 1 - dip, z, x, top, z, "agartha:cloud", undefined, "keep");
      // Cloud belts drifting between the mountain peaks.
      const col = islandColumn(x, z);
      if (z < -110 || (d > 130 && z < 20)) {
        const m = fbm(x / 24, z / 24, 27, 3);
        const beltY = 258 + Math.floor(fbm(x / 50, z / 50, 28) * 14);
        if (m > 0.58 && (!col || col.top < beltY + 2)) {
          const th = 1 + Math.floor((m - 0.58) * 22);
          c.fill(x, beltY, z, x, beltY + th, z, "agartha:cloud", undefined, "keep");
        }
      }
      // Drifting cloud banks at island height, just beyond the edge.
      if (d > edgeR + 10 && !nearBifrost(x, z, 8)) {
        const m = fbm(x / 18, z / 18, 17, 3);
        if (m > 0.66) {
          const th = 1 + Math.floor((m - 0.66) * 25);
          const by = 172 + Math.floor(fbm(x / 60, z / 60, 18) * 40);
          c.fill(x, by, z, x, by + th, z, "agartha:cloud", undefined, "keep");
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

/** Operations that wipe one tile of the pocket back to empty sky. */
export function* eraseOps(tile) {
  const c = new Canvas(tile);
  clear(c);
  yield* c.ops;
}

/**
 * Every operation needed to build one tile, in order. Yields batches (arrays)
 * so callers can interleave work.
 */
export function* tileOps(tile) {
  const steps = [clear, terrain, forest];
  for (const s of [...STRUCTURES, ...MYTHIC]) if (boxesIntersect(s.bounds, tile)) steps.push(s.build);
  steps.push(clouds, wildlife);
  for (const step of steps) {
    const c = new Canvas(tile);
    step(c);
    yield* c.ops;
  }
}
