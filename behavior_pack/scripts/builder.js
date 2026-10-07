// Builds the realm in the world from the blueprint, one tile at a time.
//
// Each tile is loaded with a temporary ticking area, built inside a
// system.runJob generator (so the game never freezes), then the ticking area
// is removed. Every coordinate is validated against the reserved region
// before anything is written.

import { world, system, BlockPermutation } from "@minecraft/server";
import { REALM, listTiles, isInsideRegion } from "./config.js";
import { tileOps } from "./blueprint.js";

const TICKING_AREA = "agartha_build";
const BUILT_KEY = "agartha:built_version";

// Fallbacks for ids/states that differ between Bedrock versions.
const ALIASES = {
  "minecraft:spruce_leaves": [["minecraft:leaves", { old_leaf_type: "spruce", persistent_bit: true }]],
  "minecraft:spruce_log": [["minecraft:log", { old_log_type: "spruce", pillar_axis: "y" }]],
  "minecraft:spruce_planks": [["minecraft:planks", { wood_type: "spruce" }]],
  "minecraft:dark_oak_planks": [["minecraft:planks", { wood_type: "dark_oak" }]],
  "minecraft:stone_bricks": [["minecraft:stonebrick", {}]],
  "minecraft:cracked_stone_bricks": [["minecraft:stonebrick", { stone_brick_type: "cracked" }]],
  "minecraft:spruce_fence": [["minecraft:fence", { wood_type: "spruce" }]],
  "minecraft:light_blue_concrete": [["minecraft:concrete", { color: "light_blue" }]],
  "minecraft:spruce_slab": [["minecraft:wooden_slab", { wood_type: "spruce" }]],
};
const STATE_ALTERNATES = {
  "minecraft:vertical_half": (v) => ({ top_slot_bit: v === "top" }),
};

const permCache = new Map();

function tryResolve(id, states) {
  try {
    return BlockPermutation.resolve(id, states);
  } catch {
    return undefined;
  }
}

function permutationFor(id, states) {
  const key = states ? `${id}|${JSON.stringify(states)}` : id;
  if (permCache.has(key)) return permCache.get(key);
  // Older engines name some states differently (e.g. slab halves).
  const alt = {};
  for (const [k, v] of Object.entries(states ?? {})) {
    if (STATE_ALTERNATES[k]) Object.assign(alt, STATE_ALTERNATES[k](v));
    else alt[k] = v;
  }
  let perm = tryResolve(id, states) ?? tryResolve(id, alt) ?? tryResolve(id, undefined);
  for (const [aid, astates] of perm ? [] : ALIASES[id] ?? []) {
    perm = tryResolve(aid, { ...astates, ...alt }) ?? tryResolve(aid, astates);
    if (perm) break;
  }
  if (!perm) console.warn(`[Agartha] Unknown block ${id}; skipping.`);
  permCache.set(key, perm ?? null);
  return perm;
}

/** The single id used in fill commands must exist; fall back to an alias. */
function commandBlockId(id) {
  if (tryResolve(id, undefined)) return id;
  for (const [aid] of ALIASES[id] ?? []) if (tryResolve(aid, undefined)) return aid;
  return undefined;
}

function overworld() {
  return world.getDimension("overworld");
}

export function isRealmBuilt() {
  return world.getDynamicProperty(BUILT_KEY) === REALM.buildVersion;
}

function tileLoaded(dim, tile) {
  const ox = REALM.originX;
  const oz = REALM.originZ;
  const pts = [
    [tile.minX, tile.minZ], [tile.maxX, tile.minZ], [tile.minX, tile.maxZ],
    [tile.maxX, tile.maxZ], [(tile.minX + tile.maxX) >> 1, (tile.minZ + tile.maxZ) >> 1],
  ];
  try {
    return pts.every(([x, z]) => dim.getBlock({ x: ox + x, y: REALM.surfaceY, z: oz + z }) !== undefined);
  } catch {
    return false;
  }
}

function removeTickingArea(dim) {
  try {
    dim.runCommand(`tickingarea remove ${TICKING_AREA}`);
  } catch {
    // not present
  }
}

let building = false;
const waiters = [];

/**
 * Builds the realm if needed and calls onReady() when it is safe to enter.
 * onProgress(text) is called with human-readable progress updates.
 */
export function ensureRealmBuilt(onReady, onProgress, onError) {
  if (isRealmBuilt()) {
    onReady();
    return;
  }
  waiters.push({ onReady, onProgress, onError });
  if (building) return;
  building = true;
  system.runJob(buildJob());
}

function notify(kind, arg) {
  for (const w of waiters) {
    try {
      w[kind]?.(arg);
    } catch (e) {
      console.warn(`[Agartha] ${e}`);
    }
  }
}

function* buildJob() {
  const dim = overworld();
  const ox = REALM.originX;
  const oz = REALM.originZ;
  const tiles = listTiles();
  const cmdIds = new Map();
  let failures = 0;

  const cmdId = (id) => {
    if (!cmdIds.has(id)) cmdIds.set(id, commandBlockId(id));
    return cmdIds.get(id);
  };

  try {
    for (let t = 0; t < tiles.length; t++) {
      const tile = tiles[t];
      notify("onProgress", `§bForging Agartha... §f${Math.round((t / tiles.length) * 100)}%`);

      removeTickingArea(dim);
      dim.runCommand(
        `tickingarea add ${ox + tile.minX} ${REALM.surfaceY} ${oz + tile.minZ} ${ox + tile.maxX} ${REALM.surfaceY} ${oz + tile.maxZ} ${TICKING_AREA} true`
      );
      const start = system.currentTick;
      while (!tileLoaded(dim, tile)) {
        if (system.currentTick - start > 20 * 60) throw new Error("Timed out waiting for realm chunks to load.");
        yield;
      }

      for (const op of tileOps(tile)) {
        try {
          applyOp(dim, op, ox, oz, cmdId);
        } catch (e) {
          if (failures++ < 5) console.warn(`[Agartha] op failed ${JSON.stringify(op)}: ${e}`);
        }
        yield;
      }
    }
    removeTickingArea(dim);
    world.setDynamicProperty(BUILT_KEY, REALM.buildVersion);
    if (failures) console.warn(`[Agartha] Realm built with ${failures} failed operations.`);
    building = false;
    const ready = waiters.splice(0);
    for (const w of ready) w.onReady();
  } catch (e) {
    removeTickingArea(dim);
    building = false;
    console.error(`[Agartha] Realm build failed: ${e}`);
    const failed = waiters.splice(0);
    for (const w of failed) w.onError?.(String(e));
  }
}

function applyOp(dim, op, ox, oz, cmdId) {
  const kind = op[0];
  if (kind === "fill") {
    const [, x1, y1, z1, x2, y2, z2, id, mode] = op;
    if (!isInsideRegion(x1, y1, z1) || !isInsideRegion(x2, y2, z2)) return;
    const block = cmdId(id);
    if (!block) return;
    dim.runCommand(`fill ${ox + x1} ${y1} ${oz + z1} ${ox + x2} ${y2} ${oz + z2} ${block} ${mode ?? "replace"}`);
    return;
  }
  const [, x, y, z] = op;
  if (!isInsideRegion(x, y, z)) return;
  const loc = { x: ox + x, y, z: oz + z };
  if (kind === "set") {
    const perm = permutationFor(op[4], op[5]);
    if (perm) dim.getBlock(loc)?.setPermutation(perm);
  } else if (kind === "loot") {
    dim.runCommand(`loot insert ${loc.x} ${loc.y} ${loc.z} loot "${op[4]}"`);
  }
}
