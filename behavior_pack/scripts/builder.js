// Builds the realm in the world from the blueprint, one tile at a time.
//
// Minecraft only lets scripts write into loaded chunks, and far-away chunks
// can be slow to load. So each 64x64 tile is loaded two ways at once: the
// forging player is flown (in spectator mode) to hover above it, and a small
// ticking area is placed over it. Tiles that still fail to load are retried
// later, and progress is saved so an interrupted forge resumes where it left
// off. All work runs inside system.runJob so the game never freezes. Every
// coordinate is validated against the reserved region before anything is
// written.

import { world, system, BlockPermutation } from "@minecraft/server";
import { REALM, listTiles, isInsideRegion } from "./config.js";
import { tileOps } from "./blueprint.js";

const TICKING_AREA = "agartha_build";
const BUILT_KEY = "agartha:built_version";
const PROGRESS_KEY = "agartha:build_progress";
const LOAD_WAIT_TICKS = 20 * 45;
const LOAD_ATTEMPTS = 3;

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
  "minecraft:quartz_slab": [["minecraft:stone_block_slab", { stone_slab_type: "quartz" }]],
  "minecraft:quartz_pillar": [["minecraft:quartz_block", { chisel_type: "lines", pillar_axis: "y" }]],
  "minecraft:smooth_quartz": [["minecraft:quartz_block", { chisel_type: "smooth" }]],
  "minecraft:chiseled_quartz_block": [["minecraft:quartz_block", { chisel_type: "chiseled" }]],
  "minecraft:light_blue_stained_glass": [["minecraft:stained_glass", { color: "light_blue" }]],
  "minecraft:white_wool": [["minecraft:wool", { color: "white" }]],
  "minecraft:red_wool": [["minecraft:wool", { color: "red" }]],
  "minecraft:yellow_wool": [["minecraft:wool", { color: "yellow" }]],
  "minecraft:blue_wool": [["minecraft:wool", { color: "blue" }]],
  "minecraft:dark_oak_fence": [["minecraft:fence", { wood_type: "dark_oak" }]],
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

function stateString(states) {
  const parts = Object.entries(states).map(([k, v]) => `"${k}"=${typeof v === "string" ? `"${v}"` : v}`);
  return `[${parts.join(",")}]`;
}

/**
 * The block argument for a fill command: id plus states, adjusted for the
 * running engine version, or undefined if the block doesn't exist at all.
 */
function commandBlock(id, states) {
  const perm = permutationFor(id, states);
  if (!perm) return undefined;
  const all = perm.getAllStates();
  return Object.keys(all).length ? `${perm.type.id} ${stateString(all)}` : perm.type.id;
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
    return pts.every(([x, z]) => dim.getBlock({ x: ox + x, y: REALM.baseY, z: oz + z }) !== undefined);
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
let forger;

export function isRealmBuilding() {
  return building;
}

/** Forgets the built realm so the next ensureRealmBuilt() rebuilds it. */
export function markRealmUnbuilt() {
  world.setDynamicProperty(BUILT_KEY, undefined);
  world.setDynamicProperty(PROGRESS_KEY, undefined);
}

/**
 * Builds the realm if needed and calls onReady() when it is safe to enter.
 * onProgress(percent) is called as tiles complete. If `player` is given they
 * are flown over the site while it builds (the caller sets spectator mode).
 */
export function ensureRealmBuilt(onReady, onProgress, onError, player) {
  if (isRealmBuilt()) {
    onReady?.();
    return;
  }
  waiters.push({ onReady, onProgress, onError });
  if (player) forger = player;
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

function* waitTicks(n) {
  const until = system.currentTick + n;
  while (system.currentTick < until) yield;
}

function hover(dim, tile) {
  if (!forger?.isValid) return;
  const x = REALM.originX + (tile.minX + tile.maxX + 1) / 2;
  const z = REALM.originZ + (tile.minZ + tile.maxZ + 1) / 2;
  try {
    forger.teleport({ x, y: 300, z }, { dimension: dim, rotation: { x: 89, y: 0 } });
  } catch {
    // player busy (e.g. respawning); the ticking area still works
  }
}

/** Loads a tile; returns true when every corner is readable. */
function* loadTile(dim, tile) {
  const ox = REALM.originX;
  const oz = REALM.originZ;
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    removeTickingArea(dim);
    try {
      dim.runCommand(`tickingarea add ${ox + tile.minX} ${REALM.baseY} ${oz + tile.minZ} ${ox + tile.maxX} ${REALM.baseY} ${oz + tile.maxZ} ${TICKING_AREA} true`);
    } catch (e) {
      if (attempt === 0) console.warn(`[Agartha] ticking area unavailable (${e}); relying on the forging player.`);
    }
    const start = system.currentTick;
    while (system.currentTick - start < LOAD_WAIT_TICKS) {
      if ((system.currentTick - start) % 100 === 0) hover(dim, tile);
      if (tileLoaded(dim, tile)) {
        yield* waitTicks(2);
        return true;
      }
      yield* waitTicks(1);
    }
  }
  return false;
}

function readProgress() {
  try {
    const p = JSON.parse(world.getDynamicProperty(PROGRESS_KEY) ?? "null");
    if (p?.v === REALM.buildVersion) return p;
  } catch {
    // corrupt; start over
  }
  return { v: REALM.buildVersion, done: [] };
}

function* buildJob() {
  const dim = overworld();
  const ox = REALM.originX;
  const oz = REALM.originZ;
  const tiles = listTiles();
  const cmdBlocks = new Map();
  let failures = 0;

  const cmdId = (id, states) => {
    const key = states ? `${id}|${JSON.stringify(states)}` : id;
    if (!cmdBlocks.has(key)) cmdBlocks.set(key, commandBlock(id, states));
    return cmdBlocks.get(key);
  };

  try {
    const progress = readProgress();
    const done = new Set(progress.done);
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t < tiles.length; t++) {
        if (done.has(t)) continue;
        const tile = tiles[t];
        notify("onProgress", Math.round((done.size / tiles.length) * 100));
        if (!(yield* loadTile(dim, tile))) continue; // retried on the next pass
        for (const op of tileOps(tile)) {
          try {
            applyOp(dim, op, ox, oz, cmdId);
          } catch (e) {
            if (failures++ < 5) console.warn(`[Agartha] op failed ${JSON.stringify(op)}: ${e}`);
          }
          yield;
        }
        done.add(t);
        world.setDynamicProperty(PROGRESS_KEY, JSON.stringify({ v: REALM.buildVersion, done: [...done] }));
      }
    }
    removeTickingArea(dim);
    const missing = tiles.length - done.size;
    if (missing > 0) {
      throw new Error(`${missing} sections could not be loaded. Run /scriptevent agartha:forge again to finish them (progress is saved).`);
    }
    world.setDynamicProperty(BUILT_KEY, REALM.buildVersion);
    world.setDynamicProperty(PROGRESS_KEY, undefined);
    if (failures) console.warn(`[Agartha] Realm built with ${failures} failed operations.`);
    finish("onReady");
  } catch (e) {
    removeTickingArea(dim);
    console.error(`[Agartha] Realm build failed: ${e}`);
    finish("onError", String(e.message ?? e));
  }
}

function finish(kind, arg) {
  building = false;
  forger = undefined;
  const list = waiters.splice(0);
  for (const w of list) {
    try {
      w[kind]?.(arg);
    } catch (e) {
      console.warn(`[Agartha] ${e}`);
    }
  }
}

function applyOp(dim, op, ox, oz, cmdId) {
  const kind = op[0];
  if (kind === "fill") {
    const [, x1, y1, z1, x2, y2, z2, id, mode, states] = op;
    if (!isInsideRegion(x1, y1, z1) || !isInsideRegion(x2, y2, z2)) return;
    const block = cmdId(id, states);
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
  } else if (kind === "spawn") {
    dim.spawnEntity(op[4], { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
  }
}
