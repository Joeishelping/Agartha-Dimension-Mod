// Collects block operations for one tile. Everything written through a Canvas
// is clipped to the tile (and the reserved region), so structures can be
// described in full and simply re-run for each tile they overlap.
//
// Operation formats:
//   ["fill", x1, y1, z1, x2, y2, z2, blockId, mode, states?]
//   ["set",  x, y, z, blockId, states?]
//   ["loot", x, y, z, lootTablePath]
//   ["spawn", x, y, z, entityId]

import { REGION } from "./config.js";

const MAX_FILL = 32768;

export class Canvas {
  constructor(tile) {
    this.tile = tile;
    this.ops = [];
  }

  has(x, z) {
    const t = this.tile;
    return x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ;
  }

  set(x, y, z, id, states) {
    if (!this.has(x, z) || y < REGION.minY || y > REGION.maxY) return;
    this.ops.push(["set", x, y, z, id, states]);
  }

  fill(x1, y1, z1, x2, y2, z2, id, states, mode = "replace") {
    const t = this.tile;
    const ax = Math.max(Math.min(x1, x2), t.minX);
    const bx = Math.min(Math.max(x1, x2), t.maxX);
    const az = Math.max(Math.min(z1, z2), t.minZ);
    const bz = Math.min(Math.max(z1, z2), t.maxZ);
    const ay = Math.max(Math.min(y1, y2), REGION.minY);
    const by = Math.min(Math.max(y1, y2), REGION.maxY);
    if (ax > bx || az > bz || ay > by) return;
    const area = (bx - ax + 1) * (bz - az + 1);
    const step = Math.max(1, Math.floor(MAX_FILL / area));
    for (let y = ay; y <= by; y += step) {
      this.ops.push(["fill", ax, y, az, bx, Math.min(by, y + step - 1), bz, id, mode, states]);
    }
  }

  loot(x, y, z, table) {
    if (this.has(x, z)) this.ops.push(["loot", x, y, z, table]);
  }

  spawn(x, y, z, entity) {
    if (this.has(x, z)) this.ops.push(["spawn", x, y, z, entity]);
  }

  chest(x, y, z, facing, table) {
    this.set(x, y, z, "minecraft:chest", { "minecraft:cardinal_direction": facing });
    this.loot(x, y, z, table);
  }

  /**
   * Fills a voxel shape. blockAt(u, y, v) returns [id, states?] or null, in
   * local coordinates; toWorld(u, v) maps to world [x, z]. Vertical runs of
   * the same block become single fill commands.
   */
  voxels(u1, u2, v1, v2, y1, y2, toWorld, blockAt) {
    for (let u = u1; u <= u2; u++) {
      for (let v = v1; v <= v2; v++) {
        const [x, z] = toWorld(u, v);
        if (!this.has(x, z)) continue;
        let runStart = y1;
        let runBlock = null;
        let runKey = "";
        for (let y = y1; y <= y2 + 1; y++) {
          const b = y <= y2 ? blockAt(u, y, v) : null;
          const key = b ? b[0] + (b[1] ? JSON.stringify(b[1]) : "") : "";
          if (key !== runKey) {
            if (runBlock) this.fill(x, runStart, z, x, y - 1, z, runBlock[0], runBlock[1]);
            runBlock = b;
            runKey = key;
            runStart = y;
          }
        }
      }
    }
  }
}

/** Maps local (u = right, v = forward) to world (x, z) for a facing. */
export function orient(cx, cz, facing) {
  switch (facing) {
    case "north": return (u, v) => [cx - u, cz - v];
    case "east": return (u, v) => [cx + v, cz - u];
    case "west": return (u, v) => [cx - v, cz + u];
    default: return (u, v) => [cx + u, cz + v];
  }
}

// Bedrock stairs: weirdo_direction is the side the tall back faces.
export const STAIR_DIR = { east: 0, west: 1, south: 2, north: 3 };
export const stairs = (id, tallSide, upsideDown = false) => [id, { weirdo_direction: STAIR_DIR[tallSide], upside_down_bit: upsideDown }];
export const slab = (id, top = false) => [id, { "minecraft:vertical_half": top ? "top" : "bottom" }];
export const pillar = (id, axis = "y") => [id, { pillar_axis: axis }];
export const lantern = (hanging = false) => ["minecraft:lantern", { hanging }];

export function boxesIntersect(a, t) {
  return a.minX <= t.maxX && a.maxX >= t.minX && a.minZ <= t.maxZ && a.maxZ >= t.minZ;
}
