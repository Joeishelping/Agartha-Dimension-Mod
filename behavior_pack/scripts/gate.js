// The Heavenly Gate: the one entrance to Agartha, raised in the mortal world
// where the Keystone is used. A quartz-and-ice archway with golden gates
// thrown open around a 5x7 portal.

import { BlockPermutation } from "@minecraft/server";

const PERMS = new Map();
function perm(id, states) {
  const key = id + JSON.stringify(states ?? {});
  if (!PERMS.has(key)) {
    let p;
    try {
      p = BlockPermutation.resolve(id, states);
    } catch {
      try {
        p = BlockPermutation.resolve(id);
      } catch {
        p = BlockPermutation.resolve("minecraft:quartz_block");
      }
    }
    PERMS.set(key, p);
  }
  return PERMS.get(key);
}

/**
 * Builds the Gate centred on `base` (its bottom-middle block), with the
 * portal plane facing `facing` ("x": plane runs along z, "z": along x).
 * Returns the list of portal block locations.
 */
export function buildGate(dim, base, axis) {
  // Local frame: a = along the gate's width, d = through it.
  const at = (a, y, d) => (axis === "z" ? { x: base.x + a, y: base.y + y, z: base.z + d } : { x: base.x + d, y: base.y + y, z: base.z + a });
  const put = (a, y, d, id, states) => {
    try {
      dim.getBlock(at(a, y, d))?.setPermutation(perm(id, states));
    } catch {
      // unloaded edge; ignore
    }
  };
  const portal = [];

  // Clear the space and lay a stepped quartz platform.
  for (let a = -8; a <= 8; a++) for (let d = -4; d <= 4; d++) for (let y = 0; y <= 16; y++) put(a, y, d, "minecraft:air");
  for (let a = -8; a <= 8; a++) {
    for (let d = -4; d <= 4; d++) {
      const edge = Math.abs(a) === 8 || Math.abs(d) === 4;
      put(a, -1, d, edge ? "minecraft:chiseled_quartz_block" : (Math.abs(a) + Math.abs(d)) % 3 === 0 ? "minecraft:light_blue_concrete" : "minecraft:smooth_quartz");
    }
  }
  // Pillars of quartz with ice ribs and sea lantern crowns.
  for (const s of [-1, 1]) {
    for (let y = 0; y <= 12; y++) {
      for (const d of [-1, 0, 1]) {
        put(s * 4, y, d, y % 4 === 0 ? "minecraft:chiseled_quartz_block" : "minecraft:quartz_pillar", { pillar_axis: "y" });
        put(s * 5, y, d, "minecraft:quartz_bricks");
      }
      put(s * 6, y, 0, y > 9 ? "minecraft:air" : "minecraft:packed_ice");
    }
    put(s * 5, 13, 0, "minecraft:sea_lantern");
    put(s * 5, 14, 0, "minecraft:end_rod");
    // Golden gate leaves, thrown open.
    for (let y = 0; y <= 6; y++) for (let k = 1; k <= 3; k++) put(s * (6 + k), y, 2, k === 3 || y === 0 || y === 6 ? "minecraft:gold_block" : "minecraft:iron_bars");
  }
  // Arch, crest and golden sun.
  for (let a = -5; a <= 5; a++) {
    for (const d of [-1, 0, 1]) {
      put(a, 8, d, "minecraft:quartz_bricks");
      put(a, 9, d, "minecraft:chiseled_quartz_block");
    }
  }
  for (let k = 0; k < 4; k++) for (let a = -4 + k; a <= 4 - k; a++) put(a, 10 + k, 0, k === 3 ? "minecraft:gold_block" : "minecraft:smooth_quartz");
  for (const d of [-2, 2]) for (let a = -1; a <= 1; a++) for (let y = 10; y <= 12; y++) put(a, y, d, Math.abs(a) + Math.abs(y - 11) <= 1 ? "minecraft:gold_block" : "minecraft:air");
  // The portal itself: 5 wide, 7 tall (rounded top).
  for (let a = -3; a <= 3; a++) {
    for (let y = 0; y <= 7; y++) {
      const inside = Math.abs(a) <= 2 || (Math.abs(a) === 3 && y <= 5);
      if (!inside || (y === 7 && Math.abs(a) === 2)) {
        if (Math.abs(a) === 3 || y === 7) put(a, y, 0, "minecraft:quartz_bricks");
        continue;
      }
      put(a, y, 0, "agartha:portal");
      portal.push(at(a, y, 0));
    }
  }
  return portal;
}
