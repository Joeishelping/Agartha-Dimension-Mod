// The Hellmouth: the one entrance to Hell, raised in the mortal world where
// the Heart Scarab is used. A weeping beast's head of blackstone, horned and
// crowned, its jaws held open around the portal (as in the old paintings of
// the mouth of Hell). Both faces are the same, so it can be entered from
// either side.

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
        if (id === "agartha:hell_portal") throw new Error("the Hell portal block is not loaded (are both Agartha packs active?)");
        p = BlockPermutation.resolve("minecraft:blackstone");
      }
    }
    PERMS.set(key, p);
  }
  return PERMS.get(key);
}

/** Builds the Hellmouth on `base` (bottom-middle of the portal). Returns the portal block locations. */
export function buildHellmouth(dim, base, axis) {
  const at = (a, y, d) => (axis === "z" ? { x: base.x + a, y: base.y + y, z: base.z + d } : { x: base.x + d, y: base.y + y, z: base.z + a });
  const put = (a, y, d, id, states) => {
    const p = perm(id, states);
    try {
      dim.getBlock(at(a, y, d))?.setPermutation(p);
    } catch {
      // unloaded edge; ignore
    }
  };
  const portal = [];
  const mouth = (a, y) => Math.abs(a) <= 2 && y >= 0 && y <= 6 && !(y === 6 && Math.abs(a) === 2);

  for (let a = -10; a <= 10; a++) for (let d = -5; d <= 5; d++) for (let y = 0; y <= 18; y++) put(a, y, d, "minecraft:air");
  // A scorched platform, cracked with embers.
  for (let a = -8; a <= 8; a++) {
    for (let d = -5; d <= 5; d++) {
      const edge = Math.abs(a) === 8 || Math.abs(d) === 5;
      const ember = !edge && Math.abs(a) <= 3 && Math.abs(d) >= 3 && (a + d) % 2 === 0;
      put(a, -1, d, edge ? "minecraft:polished_blackstone_bricks" : ember ? "minecraft:magma" : "minecraft:blackstone");
    }
  }
  // The head: a rounded mass of blackstone around the jaws.
  for (let a = -8; a <= 8; a++) {
    for (let y = 0; y <= 14; y++) {
      const shape = Math.abs(a / 7.6) ** 2.4 + Math.abs((y - 5.5) / 8.4) ** 2.4;
      if (shape > 1) continue;
      for (let d = -3; d <= 3; d++) {
        if (mouth(a, y)) continue;
        const face = Math.abs(d) === 3;
        let id = face && (a + y) % 5 === 0 ? "minecraft:polished_blackstone_bricks" : "minecraft:blackstone";
        if (face && y >= 10 && y <= 10 && Math.abs(a) <= 5) id = "minecraft:gilded_blackstone"; // brow
        put(a, y, d, id);
      }
    }
  }
  // Eyes that burn, and tears of crying obsidian beneath them.
  for (const s of [-1, 1]) {
    for (const d of [-3, 3]) {
      put(s * 3, 8, d, "minecraft:shroomlight");
      put(s * 4, 8, d, "minecraft:shroomlight");
      put(s * 3, 7, d, "minecraft:crying_obsidian");
      put(s * 3, 6, d, "minecraft:crying_obsidian");
    }
    // Horns sweeping up and out.
    const horn = [[6, 12], [7, 13], [7, 14], [8, 15], [8, 16], [9, 17], [9, 18]];
    horn.forEach(([ha, hy], i) => {
      for (const d of [-1, 0, 1]) if (i < 5 || d === 0) put(s * ha, hy, d, i === horn.length - 1 ? "minecraft:gilded_blackstone" : "minecraft:blackstone");
    });
  }
  // Teeth: bone and dripstone fangs on both faces.
  for (const d of [-3, 3]) {
    for (const a of [-2, 0, 2]) put(a, 6, d, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: true });
    for (const a of [-1, 1]) put(a, 7, d, "minecraft:bone_block");
    for (const a of [-2, 2]) put(a, 0, d, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: false });
  }
  // The throat: the portal itself.
  for (let a = -2; a <= 2; a++) {
    for (let y = 0; y <= 6; y++) {
      if (!mouth(a, y)) continue;
      put(a, y, 0, "agartha:hell_portal");
      portal.push(at(a, y, 0));
    }
  }
  // Soul fire braziers either side.
  for (const s of [-1, 1]) {
    put(s * 7, 0, 4, "minecraft:polished_blackstone_wall");
    put(s * 7, 1, 4, "minecraft:soul_campfire");
    put(s * 7, 0, -4, "minecraft:polished_blackstone_wall");
    put(s * 7, 1, -4, "minecraft:soul_campfire");
  }
  return portal;
}
