// Builds a site (Agartha, or Hell beneath it) in the world from its
// blueprint, one tile at a time.
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
import { REALM, HELL, listTiles, listHellTiles, isInsideRegion, isInsideHell } from "./config.js";
import { tileOps, eraseOps } from "./blueprint.js";
import { hellTileOps, hellEraseOps } from "./hell_blueprint.js";

// The places this builder can forge. Both share one origin (Hell lies beneath
// Agartha) and one chunk-aligned tile grid.
export const SITES = {
  agartha: {
    id: "agartha",
    name: "Agartha",
    builtKey: "agartha:built_version",
    progressKey: "agartha:build_progress",
    version: REALM.buildVersion,
    tiles: listTiles,
    ops: { forge: tileOps, erase: eraseOps },
    inside: isInsideRegion,
    probeY: REALM.baseY,
    hoverY: REALM.baseY + 40,
    entityY: [REALM.clearFromY, REALM.clearToY],
  },
  hell: {
    id: "hell",
    name: "Hell",
    builtKey: "agartha:hell_built_version",
    progressKey: "agartha:hell_build_progress",
    version: HELL.buildVersion,
    tiles: listHellTiles,
    ops: { forge: hellTileOps, erase: hellEraseOps },
    inside: isInsideHell,
    probeY: 0,
    hoverY: -10,
    entityY: [HELL.minY, HELL.maxY],
  },
};

const TICKING_AREA = "agartha_build";
const LOAD_WAIT_TICKS = 20 * 15;
const LOAD_ATTEMPTS = 4;

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
  "minecraft:chain": [["minecraft:iron_chain", {}]],
  "minecraft:skeleton_skull": [["minecraft:skull", {}]],
  "minecraft:crimson_wall_sign": [["minecraft:wall_sign", {}]],
};
/** Older engines used one block id with a colour/wood state for these. */
function colourAlias(id) {
  const m = id.match(/^minecraft:(\w+?)_(stained_glass|concrete|wool)$/);
  if (m) return [[`minecraft:${m[2]}`, { color: m[1] }]];
  const w = id.match(/^minecraft:(\w+?)_(wood|leaves)$/);
  if (w) return [[w[2] === "wood" ? "minecraft:wood" : "minecraft:leaves", { wood_type: w[1], old_leaf_type: w[1], persistent_bit: true, pillar_axis: "y" }]];
  return [];
}

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
  for (const [aid, astates] of perm ? [] : ALIASES[id] ?? colourAlias(id)) {
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

export function isBuilt(site) {
  return world.getDynamicProperty(site.builtKey) === site.version;
}

export function isRealmBuilt() {
  return isBuilt(SITES.agartha);
}

function tileLoaded(dim, tile) {
  const ox = REALM.originX;
  const oz = REALM.originZ;
  const pts = [
    [tile.minX, tile.minZ], [tile.maxX, tile.minZ], [tile.minX, tile.maxZ],
    [tile.maxX, tile.maxZ], [(tile.minX + tile.maxX) >> 1, (tile.minZ + tile.maxZ) >> 1],
  ];
  try {
    return pts.every(([x, z]) => dim.getBlock({ x: ox + x, y: site.probeY, z: oz + z }) !== undefined);
  } catch {
    return false;
  }
}

function removeTickingArea(dim, name = TICKING_AREA) {
  try {
    dim.runCommand(`tickingarea remove ${name}`);
  } catch {
    // not present
  }
}

// Each section gets its own ticking area name: re-adding a just-removed name
// in the same tick silently fails, which made sections wait far too long.
let currentArea;

let building = false;
let mode = "forge";
let site = SITES.agartha;
let builderDebug = false;
export function setBuilderDebug(on) {
  builderDebug = on;
}
const waiters = [];
let forger;

/** True while the given site (default: Agartha) is being forged or erased. */
export function isBuilding(which = SITES.agartha) {
  return building && site === which;
}

export function isRealmBuilding() {
  return isBuilding(SITES.agartha);
}

/** True while anything at all is being forged or erased. */
export function isBuilderBusy() {
  return building;
}

/** Forgets a built site so the next ensureBuilt() rebuilds it. */
export function markUnbuilt(which) {
  world.setDynamicProperty(which.builtKey, undefined);
  world.setDynamicProperty(which.progressKey, undefined);
}

export function markRealmUnbuilt() {
  markUnbuilt(SITES.agartha);
}

/**
 * Builds the realm if needed and calls onReady() when it is safe to enter.
 * onProgress(percent) is called as tiles complete. If `player` is given they
 * are flown over the site while it builds (the caller sets spectator mode).
 */
export function ensureBuilt(which, onReady, onProgress, onError, player) {
  if (isBuilt(which)) {
    onReady?.();
    return;
  }
  if (building && (mode !== "forge" || site !== which)) {
    onError?.(`${site.name} is being ${mode === "erase" ? "erased" : "forged"} right now; try again when it finishes.`);
    return;
  }
  waiters.push({ onReady, onProgress, onError });
  if (player) forger = player;
  if (building) return;
  building = true;
  mode = "forge";
  site = which;
  system.runJob(buildJob("forge"));
}

export function ensureRealmBuilt(onReady, onProgress, onError, player) {
  ensureBuilt(SITES.agartha, onReady, onProgress, onError, player);
}

/** Wipes everything the forge built for a site and forgets it. */
export function eraseSite(which, onDone, onProgress, onError, player) {
  if (building) {
    onError?.(`${site.name} is busy being forged or erased; try again when it finishes.`);
    return;
  }
  waiters.push({ onReady: onDone, onProgress, onError });
  forger = player;
  building = true;
  mode = "erase";
  site = which;
  world.setDynamicProperty(which.builtKey, undefined);
  system.runJob(buildJob("erase"));
}

export function eraseRealm(onDone, onProgress, onError, player) {
  eraseSite(SITES.agartha, onDone, onProgress, onError, player);
}

function removeEntities(dim, tile) {
  try {
    const found = dim.getEntities({
      location: { x: REALM.originX + tile.minX, y: site.entityY[0], z: REALM.originZ + tile.minZ },
      volume: { x: tile.maxX - tile.minX + 1, y: site.entityY[1] - site.entityY[0], z: tile.maxZ - tile.minZ + 1 },
      excludeTypes: ["minecraft:player"],
    });
    for (const e of found) e.remove();
  } catch {
    // nothing loaded there
  }
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
    forger.teleport({ x, y: site.hoverY, z }, { dimension: dim, rotation: { x: 89, y: 0 } });
  } catch {
    // player busy (e.g. respawning); the ticking area still works
  }
}

/** Loads a tile; returns true when every corner is readable. */
function* loadTile(dim, tile) {
  const ox = REALM.originX;
  const oz = REALM.originZ;
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    if (currentArea) removeTickingArea(dim, currentArea);
    currentArea = `${TICKING_AREA}_${site.id}_${tile.i + 9}_${tile.j + 9}_${attempt}`;
    try {
      dim.runCommand(`tickingarea add ${ox + tile.minX} ${site.probeY} ${oz + tile.minZ} ${ox + tile.maxX} ${site.probeY} ${oz + tile.maxZ} ${currentArea} true`);
    } catch (e) {
      if (attempt === 0) console.warn(`[Agartha] ticking area unavailable (${e}); relying on the forging player.`);
    }
    const start = system.currentTick;
    while (system.currentTick - start < LOAD_WAIT_TICKS) {
      if ((system.currentTick - start) % 60 === 0) hover(dim, tile);
      if (tileLoaded(dim, tile)) {
        yield* waitTicks(2);
        return true;
      }
      yield* waitTicks(1);
    }
  }
  return false;
}

function readProgress(key) {
  try {
    const p = JSON.parse(world.getDynamicProperty(key) ?? "null");
    if (p?.v === site.version) return p;
  } catch {
    // corrupt; start over
  }
  return { v: site.version, done: [] };
}

function* buildJob(kind) {
  const PROGRESS_KEY = site.progressKey;
  const key = kind === "erase" ? `${PROGRESS_KEY}_erase` : PROGRESS_KEY;
  const opsFor = site.ops[kind];
  const dim = overworld();
  const ox = REALM.originX;
  const oz = REALM.originZ;
  const tiles = site.tiles();
  const cmdBlocks = new Map();
  let failures = 0;

  const cmdId = (id, states) => {
    const key = states ? `${id}|${JSON.stringify(states)}` : id;
    if (!cmdBlocks.has(key)) cmdBlocks.set(key, commandBlock(id, states));
    return cmdBlocks.get(key);
  };

  try {
    const progress = readProgress(key);
    const done = new Set(progress.done);
    for (let pass = 0; pass < 2; pass++) {
      for (let t = 0; t < tiles.length; t++) {
        if (done.has(t)) continue;
        const tile = tiles[t];
        notify("onProgress", Math.round((done.size / tiles.length) * 100));
        const t0 = system.currentTick;
        if (!(yield* loadTile(dim, tile))) continue; // retried on the next pass
        const t1 = system.currentTick;
        if (kind === "erase") removeEntities(dim, tile);
        let n = 0;
        for (const op of opsFor(tile)) {
          try {
            applyOp(dim, op, ox, oz, cmdId, site.inside);
          } catch (e) {
            if (failures++ < 5) console.warn(`[Agartha] op failed ${JSON.stringify(op)}: ${e}`);
          }
          n++;
          yield;
        }
        if (builderDebug) console.warn(`[Agartha debug] ${kind} tile ${t + 1}/${tiles.length}: load ${t1 - t0} ticks, ${n} ops in ${system.currentTick - t1} ticks`);
        done.add(t);
        world.setDynamicProperty(key, JSON.stringify({ v: site.version, done: [...done] }));
      }
    }
    removeTickingArea(dim);
    const missing = tiles.length - done.size;
    if (missing > 0) {
      const cmd = `agartha:${kind}${site.id === "hell" ? "_hell" : ""}`;
      throw new Error(`${missing} sections could not be loaded. Run /scriptevent ${cmd} again to finish them (progress is saved).`);
    }
    if (kind === "forge") world.setDynamicProperty(site.builtKey, site.version);
    world.setDynamicProperty(key, undefined);
    // A finished erase means the next forge starts fresh, and vice versa.
    world.setDynamicProperty(kind === "erase" ? PROGRESS_KEY : `${PROGRESS_KEY}_erase`, undefined);
    if (failures) console.warn(`[Agartha] ${site.name} built with ${failures} failed operations.`);
    finish("onReady");
  } catch (e) {
    removeTickingArea(dim);
    console.error(`[Agartha] ${site.name} build failed: ${e}`);
    finish("onError", String(e.message ?? e));
  }
}

function finish(kind, arg) {
  if (currentArea) {
    removeTickingArea(world.getDimension("overworld"), currentArea);
    currentArea = undefined;
  }
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

const SIGN_FACING = { north: 2, south: 3, west: 4, east: 5 };

function applyOp(dim, op, ox, oz, cmdId, inside) {
  const kind = op[0];
  if (kind === "fill") {
    const [, x1, y1, z1, x2, y2, z2, id, mode, states] = op;
    if (!inside(x1, y1, z1) || !inside(x2, y2, z2)) return;
    const block = cmdId(id, states);
    if (!block) return;
    dim.runCommand(`fill ${ox + x1} ${y1} ${oz + z1} ${ox + x2} ${y2} ${oz + z2} ${block} ${mode ?? "replace"}`);
    return;
  }
  const [, x, y, z] = op;
  if (!inside(x, y, z)) return;
  const loc = { x: ox + x, y, z: oz + z };
  if (kind === "set") {
    const perm = permutationFor(op[4], op[5]);
    if (perm) dim.getBlock(loc)?.setPermutation(perm);
  } else if (kind === "loot") {
    dim.runCommand(`loot insert ${loc.x} ${loc.y} ${loc.z} loot "${op[4]}"`);
  } else if (kind === "spawn") {
    dim.spawnEntity(op[4], { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
  } else if (kind === "sign") {
    const block = dim.getBlock(loc);
    const perm = permutationFor("minecraft:crimson_wall_sign", { facing_direction: SIGN_FACING[op[4]] ?? 2 }) ?? permutationFor("minecraft:wall_sign", { facing_direction: SIGN_FACING[op[4]] ?? 2 });
    if (!block || !perm) return;
    block.setPermutation(perm);
    const sign = block.getComponent("minecraft:sign");
    sign?.setText(op[5]);
    try {
      sign?.setWaxed(true);
    } catch {
      // older engines
    }
  }
}
