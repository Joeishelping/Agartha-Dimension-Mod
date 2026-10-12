// Hell: the underworld beneath Agartha.
//
//  * Forging: /scriptevent agartha:forge_hell (in person, like Agartha), then
//    the forger receives the Heart Scarab.
//  * The one entrance: the Hellmouth, raised in the mortal world with the
//    Heart Scarab. Every soul arrives at the bottom of the pit.
//  * Layer 1, the Oubliette of Entropic Recurrence: climb the spiral while the
//    lava rises. A button at each Gate of the Hours flushes the lava, but the
//    noise wakes the damned. Spikes, crumbling steps, waves, climbing souls.
//  * Dying anywhere in Hell sends you back to the very bottom. Hell remembers:
//    how many times you climbed, where you died, what you learned.
//  * Layer 2, the Spire of Absolute Contract: no combat. The Devil waits in
//    the Hall of Thrones; the only way out is a Deal (see devil.js).
//
// Operator commands (/scriptevent):
//   agartha:forge_hell     forge Hell in person
//   agartha:rebuild_hell   forge Hell again from scratch
//   agartha:erase_hell     put solid rock back where Hell was
//   agartha:scarab         receive the Heart Scarab (only if no Hellmouth stands)
//   agartha:hellmouth_reset  forget the Hellmouth
//   agartha:hell_release   release yourself from Hell

import { world, system, GameMode, EquipmentSlot, ItemStack, BlockPermutation } from "@minecraft/server";
import { HELL, IDS, isInsideHell, REGION, REALM } from "./config.js";
import { SITES, ensureBuilt, eraseSite, isBuilt, isBuilding, markUnbuilt, isBuilderBusy } from "./builder.js";
import { readJson, liftForger, restoreForger } from "./forger.js";
import { buildHellmouth } from "./hellmouth.js";
import {
  PIT, HOURS, ARRIVAL, TRAPS, GLYPHS, TRUE_NAME, CLOCK, SCALE, SPIRE, DEVIL_SPOT,
  stepAngle, stepSurface, stepBlock, stepPerm, stepUnder, laneOf, stepKind, trapIndex, hourButton, pathCells, hellZone,
} from "./hell_layout.js";
import { clockFace } from "./hell_blueprint.js";
import { hellAmbience, forgetHellAmbience } from "./hell_ambience.js";
import { openDevil } from "./devil.js";

export const HELL_TAG = "agartha_in_hell";
const MOB_TAG = "agartha_hell_mob";
const SOUL_TAG = "agartha_soul";
const HELLMOUTH_KEY = "agartha:hellmouth";
const P = {
  ret: "agartha:hell_return",
  loops: "agartha:hell_loops",
  runDeaths: "agartha:hell_run_deaths",
  glyphs: "agartha:hell_glyphs",
  best: "agartha:hell_best",
  dead: "agartha:hell_dead",
  wager: "agartha:hell_wager",
  weighed: "agartha:hell_weighed",
  feather: "agartha:hell_feather_used",
  scars: "agartha:hell_scars",
};
const FOG_USER = "agartha_hell";
const ox = HELL.originX;
const oz = HELL.originZ;
const abs = (x, y, z) => ({ x: ox + x, y, z: oz + z });
const rel = (l) => ({ x: l.x - ox, y: l.y, z: l.z - oz });

function run(target, cmd) {
  try {
    target.runCommand(cmd);
  } catch {
    // command unavailable on this version; cosmetic
  }
}

function dim() {
  return world.getDimension("overworld");
}

function cmd(c) {
  try {
    return dim().runCommand(c);
  } catch {
    return undefined;
  }
}

function num(player, key) {
  return Number(player.getDynamicProperty(key) ?? 0);
}

export function isHellBuilt() {
  return isBuilt(SITES.hell);
}

/** True if the player is inside Hell's volume. */
function inHellVolume(entity) {
  if (entity.dimension.id !== "minecraft:overworld") return false;
  const r = rel(entity.location);
  return isInsideHell(Math.floor(r.x), Math.floor(r.y), Math.floor(r.z));
}

function zoneOf(player) {
  const r = rel(player.location);
  return hellZone(r.x, r.y, r.z);
}

// ---------------------------------------------------------------------------
// Entering, the loop, and release
// ---------------------------------------------------------------------------

function arrivalLoc() {
  return abs(ARRIVAL.x, ARRIVAL.y, ARRIVAL.z);
}

const zoneOfPlayer = new Map();
function applyAtmosphere(player, zone) {
  if (zoneOfPlayer.get(player.id) === zone) return;
  zoneOfPlayer.set(player.id, zone);
  run(player, `fog @s remove ${FOG_USER}`);
  run(player, `fog @s push ${zone === "pit" ? "agartha:hell_fog" : "agartha:abyss_fog"} ${FOG_USER}`);
}

function clearAtmosphere(player) {
  zoneOfPlayer.delete(player.id);
  run(player, `fog @s remove ${FOG_USER}`);
  for (const s of ["hell_drone", "abyss_bed", "hell_wail", "hell_whisper"]) run(player, `stopsound @s agartha.${s}`);
  forgetHellAmbience(player.id);
}

const runHours = new Map(); // playerId -> highest hour seen this ascent
const returning = new Map(); // playerId -> tick they were last sent to the bottom

/** Drops a soul at the bottom of the pit. `again` = this is a recurrence. */
function toBottom(player, again, line) {
  returning.set(player.id, system.currentTick);
  player.teleport(arrivalLoc(), { dimension: dim(), facingLocation: abs(ARRIVAL.face.x + 0.5, ARRIVAL.face.y + 1, ARRIVAL.face.z + 0.5) });
  runHours.set(player.id, 0);
  player.removeEffect("levitation");
  if (again) {
    const loops = num(player, P.loops) + 1;
    player.setDynamicProperty(P.loops, loops);
    player.addEffect("darkness", 20 * 5, { showParticles: false });
    player.addEffect("nausea", 20 * 8, { showParticles: false });
    player.addEffect("slowness", 20 * 3, { showParticles: false });
    run(player, "camerashake add @s 0.6 1.5 rotational");
    system.runTimeout(() => {
      if (!player.isValid) return;
      player.onScreenDisplay.setTitle("§4AGAIN", { subtitle: `§7ascent ${loops + 1}`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 30 });
      player.playSound("agartha.hell_again");
      if (line) player.sendMessage(`§8§o${line}`);
    }, 10);
  }
}

export function enterHell(player, from) {
  if (!isHellBuilt()) {
    player.sendMessage("§7The Hellmouth groans, but Hell has not been forged.");
    return false;
  }
  if (!player.hasTag(HELL_TAG)) {
    const l = player.location;
    player.setDynamicProperty(P.ret, JSON.stringify(from ?? { x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  player.addTag(HELL_TAG);
  player.setDynamicProperty(P.runDeaths, 0);
  player.setDynamicProperty(P.weighed, undefined);
  player.setDynamicProperty(P.wager, undefined);
  toBottom(player, false);
  player.addEffect("darkness", 20 * 4, { showParticles: false });
  player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (!player.isValid) return;
    applyAtmosphere(player, "pit");
    const loops = num(player, P.loops);
    player.onScreenDisplay.setTitle("§4The Oubliette", { subtitle: loops ? `§7you have been here before (${loops})` : "§7of Entropic Recurrence", fadeInDuration: 20, stayDuration: 70, fadeOutDuration: 30 });
    player.playSound("agartha.hell_again");
  }, 5);
  return true;
}

/** Lets a soul go: back to where they came from (or the Hellmouth, or spawn). */
export function releaseFromHell(player, how) {
  let target = readJson(player.getDynamicProperty(P.ret));
  player.removeTag(HELL_TAG);
  player.setDynamicProperty(P.ret, undefined);
  player.setDynamicProperty(P.wager, undefined);
  clearAtmosphere(player);
  const g = hellmouth();
  if (!target && g) {
    const front = g.axis === "z" ? { x: g.x + 0.5, z: g.z + 6.5 } : { x: g.x + 6.5, z: g.z + 0.5 };
    target = { x: front.x, y: g.y, z: front.z, dim: g.dim };
  }
  let d = world.getDimension(target?.dim ?? "minecraft:overworld");
  let loc = target ? { x: target.x, y: target.y, z: target.z } : undefined;
  if (!loc) {
    const sp = player.getSpawnPoint();
    if (sp) {
      d = sp.dimension;
      loc = { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5 };
    } else {
      const ds = world.getDefaultSpawnLocation();
      loc = { x: ds.x + 0.5, y: ds.y > 320 ? 120 : ds.y, z: ds.z + 0.5 };
      if (ds.y > 320) player.addEffect("slow_falling", 20 * 20, { showParticles: false });
    }
  }
  player.teleport(loc, { dimension: d });
  player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (!player.isValid) return;
    player.onScreenDisplay.setTitle("§7Released", { subtitle: `§8${how ?? "the Contract is sealed"}`, fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 30 });
    player.playSound("mob.endermen.portal");
  }, 4);
}

/** Refusing the Devil, or losing a wager: back to the bottom. */
export function sendToBottom(player, line) {
  toBottom(player, true, line);
}

export function hellState(player) {
  return {
    loops: num(player, P.loops),
    runDeaths: num(player, P.runDeaths),
    glyphs: num(player, P.glyphs),
    best: num(player, P.best),
    wager: !!player.getDynamicProperty(P.wager),
    weighed: player.getDynamicProperty(P.weighed),
    featherUsed: !!player.getDynamicProperty(P.feather),
  };
}

export function setHellState(player, key, value) {
  player.setDynamicProperty(P[key], value);
}

// Death in Hell: back to the bottom, remembering how and where.
const CAUSE_LINES = {
  lava: "You remember the burning.",
  fire: "You remember the burning.",
  fireTick: "You remember the burning.",
  stalagmite: "You remember the spikes. Which side were they on?",
  fall: "You remember falling. You always remember falling.",
  entityAttack: "You remember their hands.",
  projectile: "You remember the arrows in the dark.",
  magic: "You remember the cold teeth.",
};

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  try {
    if (deadEntity?.typeId !== "minecraft:player" || !deadEntity.hasTag(HELL_TAG)) return;
    deadEntity.setDynamicProperty(P.dead, damageSource?.cause ?? "none");
    deadEntity.setDynamicProperty(P.runDeaths, num(deadEntity, P.runDeaths) + 1);
    const r = rel(deadEntity.location);
    const scars = readJson(deadEntity.getDynamicProperty(P.scars)) ?? [];
    scars.push([Math.floor(r.x), Math.floor(r.y), Math.floor(r.z)]);
    deadEntity.setDynamicProperty(P.scars, JSON.stringify(scars.slice(-6)));
  } catch {
    // player gone
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!player?.hasTag(HELL_TAG)) return;
  returning.set(player.id, system.currentTick);
  if (initialSpawn) {
    zoneOfPlayer.delete(player.id);
    if (!inHellVolume(player)) system.runTimeout(() => player.isValid && toBottom(player, false), 20);
    return;
  }
  const cause = player.getDynamicProperty(P.dead);
  player.setDynamicProperty(P.dead, undefined);
  const lostWager = !!player.getDynamicProperty(P.wager);
  player.setDynamicProperty(P.wager, undefined);
  system.runTimeout(() => {
    if (!player.isValid) return;
    zoneOfPlayer.delete(player.id);
    toBottom(player, true, (lostWager ? "The wager is lost. " : "") + (CAUSE_LINES[cause] ?? "You remember dying here. Not the first time."));
  }, 2);
});

// ---------------------------------------------------------------------------
// The Hellmouth (the one entrance)
// ---------------------------------------------------------------------------

function hellmouth() {
  return readJson(world.getDynamicProperty(HELLMOUTH_KEY));
}

function blockAt(d, loc) {
  try {
    return d.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
  } catch {
    return undefined;
  }
}

function inAgartha(entity) {
  if (entity.dimension.id !== "minecraft:overworld") return false;
  const r = rel(entity.location);
  return r.x >= REGION.minX && r.x <= REGION.maxX + 1 && r.z >= REGION.minZ && r.z <= REGION.maxZ + 1 && entity.location.y > REALM.clearFromY - 8;
}

export function giveScarab(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const left = inv?.addItem(new ItemStack(IDS.scarab, 1));
  if (left || !inv) player.dimension.spawnItem(new ItemStack(IDS.scarab, 1), player.location);
}

function raiseHellmouth(player, block) {
  const g = hellmouth();
  if (g) {
    player.sendMessage(`§cThe Hellmouth already gapes at ${g.x} ${g.y} ${g.z}.`);
    return;
  }
  if (!isHellBuilt()) {
    player.sendMessage("§cHell must be forged before its mouth can open (/scriptevent agartha:forge_hell).");
    return;
  }
  if (inHellVolume(player) || inAgartha(player)) {
    player.sendMessage("§cThe Hellmouth must open in the mortal world.");
    return;
  }
  const v = player.getViewDirection();
  const axis = Math.abs(v.x) > Math.abs(v.z) ? "x" : "z";
  const base = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
  let portal;
  try {
    portal = buildHellmouth(player.dimension, base, axis);
  } catch (e) {
    player.sendMessage(`§cThe Hellmouth could not open: ${e.message ?? e}`);
    return;
  }
  if (!portal.some((p) => blockAt(player.dimension, p)?.typeId === IDS.hellPortal)) {
    player.sendMessage("§cThe ground here would not open. Try somewhere with more room.");
    return;
  }
  world.setDynamicProperty(HELLMOUTH_KEY, JSON.stringify({ ...base, dim: player.dimension.id, axis, portal }));
  const equip = player.getComponent("minecraft:equippable");
  if (equip?.getEquipment(EquipmentSlot.Mainhand)?.typeId === IDS.scarab) equip.setEquipment(EquipmentSlot.Mainhand, undefined);
  player.playSound("mob.wither.spawn", { volume: 0.6, pitch: 0.6 });
  run(player, "camerashake add @s 0.5 1.2 positional");
  world.sendMessage("§4The Hellmouth has opened. §7It is the one way down.");
}

const scarabUsed = new Map();
function useScarab(player, block) {
  const last = scarabUsed.get(player.id) ?? -Infinity;
  if (system.currentTick - last < 20) return;
  scarabUsed.set(player.id, system.currentTick);
  if (!block) {
    player.sendMessage("§7Look at the ground where the Hellmouth shall open, then use the Heart Scarab.");
    return;
  }
  raiseHellmouth(player, block);
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.block?.typeId === IDS.hellPortal) {
    ev.cancel = true;
    const { player } = ev;
    system.run(() => useHellPortal(player));
    return;
  }
  if (ev.itemStack?.typeId !== IDS.scarab) return;
  ev.cancel = true;
  const { player, block } = ev;
  system.run(() => useScarab(player, block));
});

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== IDS.scarab) return;
  let hit;
  try {
    hit = source.getBlockFromViewDirection({ maxDistance: 12 })?.block;
  } catch {
    hit = undefined;
  }
  useScarab(source, hit);
});

// If the Hellmouth is torn down completely, its Scarab returns.
world.afterEvents.playerBreakBlock.subscribe(({ player, brokenBlockPermutation, dimension }) => {
  if (brokenBlockPermutation?.type?.id !== IDS.hellPortal) return;
  const g = hellmouth();
  if (!g || g.dim !== dimension.id) return;
  const d = world.getDimension(g.dim);
  if ((g.portal ?? []).some((p) => !blockAt(d, p) || blockAt(d, p)?.typeId === IDS.hellPortal)) return;
  world.setDynamicProperty(HELLMOUTH_KEY, undefined);
  giveScarab(player);
  world.sendMessage("§7The Hellmouth has closed. §4Its Scarab returns to the one who sealed it.");
});

const lastTravel = new Map();
const lastSafe = new Map();
function useHellPortal(player) {
  if (player.hasTag(HELL_TAG) || inHellVolume(player)) return;
  const last = lastTravel.get(player.id) ?? -Infinity;
  if (system.currentTick - last < 40) return;
  lastTravel.set(player.id, system.currentTick);
  const safe = lastSafe.get(player.id) ?? player.location;
  if (!enterHell(player, { x: safe.x, y: safe.y, z: safe.z, dim: player.dimension.id })) player.teleport(safe);
}

function touchingHellPortal(player) {
  const l = player.location;
  for (const dy of [0.2, 1.0, 1.6]) {
    if (blockAt(player.dimension, { x: l.x, y: l.y + dy, z: l.z })?.typeId === IDS.hellPortal) return true;
  }
  return false;
}

// No digging or building your way out of Hell (except through cracked bricks).
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const { player, block } = ev;
  if (!player.hasTag(HELL_TAG)) return;
  if (block.typeId === "minecraft:cracked_deepslate_bricks") return;
  if (player.getGameMode() === GameMode.Creative) return;
  ev.cancel = true;
});

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  if (!player.hasTag(HELL_TAG) || player.getGameMode() === GameMode.Creative) return;
  const id = block.typeId;
  system.run(() => {
    try {
      block.setType("minecraft:air");
      player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(id, 1));
    } catch {
      // not an item; it is simply gone
    }
    player.onScreenDisplay.setActionBar("§8§oNothing you build here stays.");
  });
});

// ---------------------------------------------------------------------------
// The lava engine
// ---------------------------------------------------------------------------

const LAVA_START_DELAY = 20 * 12;
const LAVA_RISE_TICKS = 34;
const LAVA_MAX_Y = PIT.floorY + 74;
// `stale`: lava may have been left standing when the world was last closed
// (it is not remembered across restarts), so the pit is flushed top to
// bottom before anyone climbs it after a load.
const lava = { level: null, nextRise: 0, draining: false, emptySince: null, stale: true };

// Rows of the shaft (relative x ranges per z), and a wider set for draining.
function discRows(radius) {
  const rows = [];
  const R = Math.ceil(radius);
  for (let z = -R; z <= R; z++) {
    let a = null, b = null;
    for (let x = -R; x <= R; x++) {
      if (Math.hypot(x + 0.5, z + 0.5) < radius) {
        if (a === null) a = x;
        b = x;
      }
    }
    if (a !== null) rows.push([z, a, b]);
  }
  return rows;
}
const LAVA_ROWS = discRows(PIT.airR);
const DRAIN_ROWS = discRows(15.5);

function riseLava() {
  lava.level = lava.level === null ? PIT.floorY : lava.level + 1;
  const y = lava.level;
  for (const [z, a, b] of LAVA_ROWS) cmd(`fill ${ox + a} ${y} ${oz + z} ${ox + b} ${y} ${oz + z} lava replace air`);
}

function* drainJob(top) {
  for (let y = top; y >= PIT.floorY - 1; y--) {
    for (const [z, a, b] of DRAIN_ROWS) {
      cmd(`fill ${ox + a} ${y} ${oz + z} ${ox + b} ${y} ${oz + z} air replace lava`);
      cmd(`fill ${ox + a} ${y} ${oz + z} ${ox + b} ${y} ${oz + z} air replace flowing_lava`);
    }
    yield;
  }
  lava.draining = false;
}

function drainLava(restartDelay, full = false) {
  if (lava.draining) return;
  const top = full ? LAVA_MAX_Y + 3 : Math.max(lava.level ?? PIT.floorY, PIT.floorY) + 2;
  lava.level = null;
  lava.draining = true;
  lava.nextRise = system.currentTick + (restartDelay ?? LAVA_START_DELAY);
  system.runJob(drainJob(top));
}

function lavaTick(tick, pitPlayers) {
  if (lava.stale && pitPlayers.length) {
    lava.stale = false;
    drainLava(LAVA_START_DELAY, true);
    return;
  }
  if (!pitPlayers.length) {
    lava.emptySince ??= tick;
    if (lava.level !== null && tick - lava.emptySince > 20 * 10) drainLava();
    return;
  }
  if (lava.emptySince !== null) {
    lava.emptySince = null;
    if (lava.level === null && !lava.draining) lava.nextRise = Math.max(lava.nextRise, tick + LAVA_START_DELAY);
  }
  if (lava.draining || tick < lava.nextRise) return;
  if ((lava.level ?? PIT.floorY - 1) >= LAVA_MAX_Y) return;
  if (lava.level === null) {
    for (const p of pitPlayers) {
      p.onScreenDisplay.setActionBar("§6§oThe floor begins to burn.");
      run(p, "camerashake add @s 0.25 2 positional");
    }
  }
  riseLava();
  lava.nextRise = tick + LAVA_RISE_TICKS;
}

// The buttons at the Gates of the Hours flush the lava. It costs something.
const BUTTONS = new Map(HOURS.filter((h) => h.n < 12).map((h) => {
  const b = hourButton(h);
  return [`${ox + b.x},${b.y},${oz + b.z}`, h];
}));
let lastFlush = -Infinity;
world.afterEvents.buttonPush.subscribe(({ block, source }) => {
  const key = `${block.location.x},${block.location.y},${block.location.z}`;
  const h = BUTTONS.get(key);
  if (!h) return;
  const tick = system.currentTick;
  if (tick - lastFlush < 20 * 20) {
    if (source?.typeId === "minecraft:player") source.onScreenDisplay.setActionBar("§8§oThe mechanism is still grinding.");
    return;
  }
  lastFlush = tick;
  drainLava(20 * 8);
  for (const p of playersIn("pit")) {
    p.sendMessage(`§6The lava drains away at ${h.name}... §4and the noise wakes the damned.`);
    p.playSound("random.anvil_use", { volume: 0.6, pitch: 0.5 });
    run(p, "camerashake add @s 0.3 1 positional");
  }
  system.runTimeout(() => spawnWave(2), 20 * 2);
});

// Lava washes away buttons and inscriptions; put them back once it has gone down.
const SIGN_FACING = { north: 2, south: 3, west: 4, east: 5 };
function mendGates() {
  for (const h of HOURS) {
    if (h.n === 12) continue;
    const b = hourButton(h);
    if (lava.level !== null && lava.level >= b.y - 1) continue;
    if (!typeRel(b.x, b.y, b.z)?.includes("button")) setRel(b.x, b.y, b.z, "minecraft:polished_blackstone_button", { facing_direction: SIGN_FACING[b.facing] });
    if (!typeRel(b.x, b.y + 1, b.z)?.includes("sign")) {
      if (setRel(b.x, b.y + 1, b.z, "minecraft:crimson_wall_sign", { facing_direction: SIGN_FACING[b.facing] })) {
        try {
          const s = dim().getBlock(abs(b.x, b.y + 1, b.z))?.getComponent("minecraft:sign");
          s?.setText(`§4${h.name.toUpperCase()}\n§8—\n§7${h.epithet}`);
          s?.setWaxed(true);
        } catch {
          // cosmetic
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spikes and crumbling steps
// ---------------------------------------------------------------------------

const CELLS = pathCells();
const CELL_AT = new Map(); // "x,z,k" -> cell
for (const c of CELLS) CELL_AT.set(`${c.x},${c.z},${c.k}`, c);
const TRAP_CELLS = TRAPS.map((t, i) => CELLS.filter((c) => c.kind === "trap" && trapIndex(c.k, c.lane) === i));

const traps = TRAPS.map(() => ({ state: "idle", at: 0 }));

function setRel(x, y, z, id, states) {
  try {
    const b = dim().getBlock(abs(x, y, z));
    if (!b) return false;
    b.setPermutation(BlockPermutation.resolve(id, states));
    return true;
  } catch {
    return false;
  }
}

function typeRel(x, y, z) {
  try {
    return dim().getBlock(abs(x, y, z))?.typeId;
  } catch {
    return undefined;
  }
}

function trapTick(tick, pitPlayers, mobs) {
  for (let i = 0; i < traps.length; i++) {
    const t = traps[i];
    if (t.state === "armed" && tick >= t.at) {
      // Spikes!
      t.state = "up";
      t.at = tick + 30;
      const cells = TRAP_CELLS[i];
      for (const c of cells) setRel(c.x, stepBlock(c.k).y + 1, c.z, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: false });
      const keys = new Set(cells.map((c) => `${c.x},${c.z}`));
      for (const e of [...pitPlayers, ...mobs]) {
        const r = rel(e.location);
        if (!keys.has(`${Math.floor(r.x)},${Math.floor(r.z)}`)) continue;
        const k = stepUnder(r.x, r.y, r.z);
        if (k === null || trapIndex(k, laneOf(Math.hypot(r.x, r.z))) !== i) continue;
        try {
          e.applyDamage(40, { cause: "stalagmite" });
        } catch {
          // gone
        }
      }
      const c0 = cells[0];
      if (c0) dim().playSound("random.anvil_land", abs(c0.x, stepSurface(c0.k), c0.z), { volume: 0.7, pitch: 1.8 });
    } else if (t.state === "up" && tick >= t.at) {
      t.state = "cool";
      t.at = tick + 40;
      for (const c of TRAP_CELLS[i]) {
        const y = stepBlock(c.k).y + 1;
        if (typeRel(c.x, y, c.z) === "minecraft:pointed_dripstone") setRel(c.x, y, c.z, "minecraft:air");
      }
    } else if (t.state === "cool" && tick >= t.at) {
      t.state = "idle";
    }
  }
}

function armTrap(i, tick) {
  const t = traps[i];
  if (t.state !== "idle") return;
  t.state = "armed";
  t.at = tick + 8;
  const c0 = TRAP_CELLS[i][0];
  if (c0) dim().playSound("random.click", abs(c0.x, stepSurface(c0.k), c0.z), { volume: 1, pitch: 0.5 });
}

const crumbling = new Map(); // "x,z,k" -> { state, at }
function crumbleTick(tick, pitPlayers) {
  for (const [key, c] of crumbling) {
    if (tick < c.at) continue;
    const cell = CELL_AT.get(key);
    const y = stepBlock(cell.k).y;
    if (c.state === "shaking") {
      setRel(cell.x, y, cell.z, "minecraft:air");
      dim().playSound("dig.stone", abs(cell.x, y, cell.z), { volume: 0.8, pitch: 0.6 });
      try {
        dim().spawnParticle("agartha:hell_ash", abs(cell.x + 0.5, y, cell.z + 0.5));
      } catch {
        // cosmetic
      }
      c.state = "gone";
      c.at = tick + 20 * 10;
    } else if (c.state === "gone") {
      const occupied = pitPlayers.some((p) => {
        const r = rel(p.location);
        return Math.floor(r.x) === cell.x && Math.floor(r.z) === cell.z && Math.abs(r.y - y) < 2;
      });
      if (occupied) {
        c.at = tick + 20;
        continue;
      }
      if (typeRel(cell.x, y, cell.z) === "minecraft:air") {
        const [id, states] = stepPerm("crumble", cell.k);
        setRel(cell.x, y, cell.z, id, states);
      }
      crumbling.delete(key);
    }
  }
}

function stepTick(tick, player) {
  const r = rel(player.location);
  const k = stepUnder(r.x, r.y, r.z);
  if (k === null) return;
  const lane = laneOf(Math.hypot(r.x, r.z));
  const kind = stepKind(k, lane);
  if (kind === "trap") armTrap(trapIndex(k, lane), tick);
  else if (kind === "crumble") {
    const key = `${Math.floor(r.x)},${Math.floor(r.z)},${k}`;
    if (CELL_AT.has(key) && !crumbling.has(key)) {
      crumbling.set(key, { state: "shaking", at: tick + 9 });
      dim().playSound("dig.gravel", player.location, { volume: 0.6, pitch: 0.5 });
    }
  }
  // Which Hour has this soul reached?
  let hour = 0;
  for (const h of HOURS) if (k >= h.k - 2) hour = h.n;
  if (hour > (runHours.get(player.id) ?? 0)) {
    runHours.set(player.id, hour);
    if (hour > 0) player.onScreenDisplay.setActionBar(`§4${HOURS[hour - 1].name} §8— §7${HOURS[hour - 1].epithet}`);
    if (hour > num(player, P.best)) player.setDynamicProperty(P.best, hour);
  }
}

// ---------------------------------------------------------------------------
// Waves of the damned
// ---------------------------------------------------------------------------

const WAVE_TICKS = 20 * 45;
const MOB_CAP = 12;
let nextWave = 0;
const ourMobs = new Set();

function hellMobs() {
  try {
    return dim().getEntities({ tags: [MOB_TAG] });
  } catch {
    return [];
  }
}

function waveTypes(hour) {
  if (hour < 4) return ["minecraft:zombie", "minecraft:husk", "minecraft:skeleton"];
  if (hour < 8) return ["minecraft:wither_skeleton", "minecraft:skeleton", "minecraft:husk", "minecraft:vex"];
  return ["minecraft:wither_skeleton", "minecraft:blaze", "minecraft:vex", "minecraft:wither_skeleton"];
}

function spawnWave(extra = 0) {
  const pit = playersIn("pit");
  if (!pit.length) return;
  const alive = hellMobs().length;
  let room = MOB_CAP - alive;
  if (room <= 0) return;
  for (const p of pit) {
    const r = rel(p.location);
    // Where on the spiral is this soul? (Off the path, e.g. at a button: judge by height.)
    const k = stepUnder(r.x, r.y, r.z) ?? Math.max(0, Math.min(PIT.steps, Math.round((r.y - PIT.floorY) * 2)));
    const floor = (lava.level ?? PIT.floorY - 1) + 3; // never spawn into the lava
    const hour = runHours.get(p.id) ?? 0;
    const loops = num(p, P.loops);
    const n = Math.min(room, 2 + Math.floor(hour / 3) + Math.min(3, Math.floor(loops / 4)) + extra);
    const types = waveTypes(hour);
    for (let i = 0; i < n; i++) {
      let sk = Math.max(3, Math.min(PIT.steps - 4, k + (i % 3 === 2 ? -6 : 8 + i * 3)));
      if (stepSurface(sk) < floor) sk = Math.min(PIT.steps - 4, k + 6 + i * 2);
      const a = stepAngle(sk);
      const loc = abs(9 * Math.cos(a) + 0.5, stepSurface(sk) + 0.2, 9 * Math.sin(a) + 0.5);
      try {
        const m = dim().spawnEntity(types[i % types.length], loc);
        ourMobs.add(m.id);
        m.addTag(MOB_TAG);
        dim().spawnParticle("agartha:soul_wisp", loc);
      } catch {
        // spot unloaded
      }
      room--;
    }
    p.playSound("mob.wither.ambient", { volume: 0.5, pitch: 0.6 });
  }
}

function clearMobs() {
  for (const m of hellMobs()) {
    try {
      m.remove();
    } catch {
      // gone
    }
  }
  ourMobs.clear();
}

// Only the damned we send come to Hell. Nothing else spawns there.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (!entity?.isValid || entity.typeId === "minecraft:player" || ourMobs.has(entity.id)) return;
    if (entity.typeId === IDS.devil || entity.typeId === IDS.soul || entity.typeId === "minecraft:item" || entity.typeId === "minecraft:xp_orb") return;
    if (!inHellVolume(entity)) return;
    if (entity.matches({ families: ["monster"] }) || entity.matches({ families: ["mob"] })) entity.remove();
  } catch {
    // vanished
  }
});

// ---------------------------------------------------------------------------
// The climbing souls
// ---------------------------------------------------------------------------

const SOUL_COUNT = 8;
const souls = new Map(); // entity id -> { k, speed, lane, giveUp, fall }

function soulPos(s) {
  const a = stepAngle(s.k);
  return abs(s.lane * Math.cos(a) + 0.5, stepSurface(s.k), s.lane * Math.sin(a) + 0.5);
}

function newSoul(i) {
  return { k: 2 + ((i * 19) % 120), speed: 0.05 + Math.random() * 0.06, lane: 8 + (i % 2) * 0.8, giveUp: 40 + Math.random() * 118, fall: null };
}

function soulTick(tick, pitPlayers) {
  let ents;
  try {
    ents = dim().getEntities({ type: IDS.soul });
  } catch {
    return;
  }
  if (!pitPlayers.length) {
    for (const e of ents) e.remove();
    souls.clear();
    return;
  }
  for (const e of ents) if (!souls.has(e.id)) souls.set(e.id, newSoul(souls.size));
  for (let i = ents.length; i < SOUL_COUNT; i++) {
    const s = newSoul(i);
    try {
      const e = dim().spawnEntity(IDS.soul, soulPos(s));
      e.addTag(SOUL_TAG);
      souls.set(e.id, s);
      ents.push(e);
    } catch {
      break;
    }
  }
  for (const e of ents) {
    const s = souls.get(e.id);
    if (!s) continue;
    if (s.fall) {
      // Falling back into the dark, wailing.
      s.fall.y -= 1.1;
      s.fall.r = Math.max(2.5, s.fall.r - 0.25);
      const a = s.fall.a;
      if (s.fall.y <= PIT.floorY) {
        Object.assign(s, newSoul(Math.floor(Math.random() * 8)), { k: 1 });
        continue;
      }
      try {
        e.teleport(abs(s.fall.r * Math.cos(a) + 0.5, s.fall.y, s.fall.r * Math.sin(a) + 0.5));
      } catch {
        // gone
      }
      continue;
    }
    s.k += s.speed * (0.6 + 0.8 * Math.abs(Math.sin(tick / 40 + s.giveUp)));
    if (s.k >= s.giveUp || s.k >= PIT.steps - 1) {
      s.fall = { y: stepSurface(s.k), r: s.lane, a: stepAngle(s.k) };
      try {
        dim().playSound("agartha.hell_wail", e.location, { volume: 1, pitch: 0.8 + Math.random() * 0.3 });
      } catch {
        // cosmetic
      }
      continue;
    }
    try {
      const ahead = soulPos({ ...s, k: s.k + 3 });
      e.teleport(soulPos(s), { facingLocation: { x: ahead.x, y: ahead.y + 1.4, z: ahead.z } });
    } catch {
      // gone
    }
  }
}

const SOUL_WHISPERS = [
  "...you have been here before...",
  "...don't look down. you looked down last time...",
  "...the top is not the end...",
  "...he keeps a ledger. your name is in it...",
  "...we forgot his name. find his name...",
  "...the buttons. the buttons wake them...",
  "...again. again. again...",
  "...the spikes are never on both sides...",
];
const whispered = new Map();
function whisperTick(tick, pitPlayers) {
  let ents;
  try {
    ents = dim().getEntities({ type: IDS.soul });
  } catch {
    return;
  }
  for (const p of pitPlayers) {
    if (tick - (whispered.get(p.id) ?? -Infinity) < 20 * 25) continue;
    const near = ents.find((e) => Math.hypot(e.location.x - p.location.x, e.location.y - p.location.y, e.location.z - p.location.z) < 4);
    if (!near) continue;
    whispered.set(p.id, tick);
    const loops = num(p, P.loops);
    const lines = loops > 1 ? [...SOUL_WHISPERS, `...${loops} times... ${loops} times...`] : SOUL_WHISPERS;
    p.onScreenDisplay.setActionBar(`§8§o${lines[Math.floor(Math.random() * lines.length)]}`);
    p.playSound("agartha.hell_whisper", { volume: 0.8 });
  }
}

// ---------------------------------------------------------------------------
// Memory: glyphs of the true name, scars where you died
// ---------------------------------------------------------------------------

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];
export function knownName(bits) {
  return TRUE_NAME.map((s, i) => (bits & (1 << i) ? s : "?")).join(" · ");
}

function memoryTick(tick, players) {
  for (const p of players) {
    const r = rel(p.location);
    let bits = num(p, P.glyphs);
    GLYPHS.forEach((g, i) => {
      if (bits & (1 << i)) return;
      if (Math.hypot(r.x - (g.x + 0.5), r.y - g.y, r.z - (g.z + 0.5)) > 2.8) return;
      bits |= 1 << i;
      p.setDynamicProperty(P.glyphs, bits);
      p.onScreenDisplay.setTitle(`§5${TRUE_NAME[i]}`, { subtitle: `§7the ${ORDINALS[i]} syllable of his true name`, fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 30 });
      p.sendMessage(`§5You remember: §d${knownName(bits)}`);
      p.playSound("agartha.hell_whisper", { volume: 1, pitch: 0.7 });
    });
    // Scars: the places you died before.
    const scars = readJson(p.getDynamicProperty(P.scars)) ?? [];
    if (scars.some(([x, y, z]) => Math.hypot(r.x - x - 0.5, r.y - y, r.z - z - 0.5) < 1.6)) {
      p.onScreenDisplay.setActionBar("§8§oYou died here.");
    }
  }
  // Glyphs glimmer faintly for anyone nearby.
  for (const g of GLYPHS) {
    const at = abs(g.x + 0.5, g.y + 1.2, g.z + 0.5);
    if (!players.some((p) => Math.hypot(p.location.x - at.x, p.location.z - at.z) < 24)) continue;
    try {
      dim().spawnParticle("agartha:soul_wisp", at);
    } catch {
      // cosmetic
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 2: the weighing, the clock, the Devil
// ---------------------------------------------------------------------------

function weighTick(players) {
  for (const p of players) {
    if (p.getDynamicProperty(P.weighed)) continue;
    const r = rel(p.location);
    if (Math.hypot(r.x - SCALE.x - 0.5, r.z - SCALE.z - 0.5) > 3.5 || Math.abs(r.y - SPIRE.hallY - 1) > 2) continue;
    const light = num(p, P.runDeaths) <= 1;
    p.setDynamicProperty(P.weighed, light ? "light" : "heavy");
    p.onScreenDisplay.setTitle("§6Your heart is weighed", {
      subtitle: light ? "§7against the Feather. It does not sink." : "§4against the Feather. It sinks. Ammit stirs.",
      fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 30,
    });
    p.playSound(light ? "random.orb" : "mob.ravager.roar", { volume: 0.8, pitch: light ? 0.5 : 0.6 });
  }
}

const clock = { minute: Math.PI / 2, hour: Math.PI * 0.15, cells: new Map() };
function clockTick() {
  clock.minute += (Math.PI * 2) / 60; // backwards: the Clocktower of Reversion
  clock.hour += (Math.PI * 2) / 720;
  for (const [x, y, z, id] of clockFace(clock.minute, clock.hour)) {
    const key = `${x},${y},${z}`;
    if (clock.cells.get(key) === id) continue;
    if (setRel(x, y, z, id)) clock.cells.set(key, id);
  }
  try {
    dim().playSound("agartha.hell_tick", abs(CLOCK.x, CLOCK.cy, CLOCK.cz), { volume: 4 });
  } catch {
    // cosmetic
  }
}

function devil() {
  const at = abs(DEVIL_SPOT.x, DEVIL_SPOT.y, DEVIL_SPOT.z);
  let found;
  try {
    found = dim().getEntities({ type: IDS.devil, location: at, maxDistance: 40 });
  } catch {
    return undefined;
  }
  if (found.length) {
    for (const extra of found.slice(1)) extra.remove();
    return found[0];
  }
  try {
    return dim().spawnEntity(IDS.devil, at);
  } catch {
    return undefined;
  }
}

function devilTick(players) {
  const d = devil();
  if (!d) return;
  const at = abs(DEVIL_SPOT.x, DEVIL_SPOT.y, DEVIL_SPOT.z);
  let nearest;
  let best = 20;
  for (const p of players) {
    const dist = Math.hypot(p.location.x - d.location.x, p.location.z - d.location.z);
    if (dist < best) {
      best = dist;
      nearest = p;
    }
  }
  const drift = Math.hypot(d.location.x - at.x, d.location.z - at.z);
  try {
    d.teleport(drift > 1.5 ? at : d.location, { facingLocation: nearest ? { x: nearest.location.x, y: nearest.location.y + 1.6, z: nearest.location.z } : abs(0.5, SPIRE.hallY + 2, SPIRE.minZ) });
  } catch {
    // busy
  }
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target?.typeId === IDS.soul) {
    ev.cancel = true;
    return;
  }
  if (ev.target?.typeId !== IDS.devil) return;
  ev.cancel = true;
  const { player, target } = ev;
  system.run(() => {
    if (player.isValid && target.isValid) openDevil(player, target);
  });
});

// ---------------------------------------------------------------------------
// The tick
// ---------------------------------------------------------------------------

function playersIn(zone) {
  return world.getAllPlayers().filter((p) => p?.isValid && p.hasTag(HELL_TAG) && zoneOf(p) === zone);
}

let hellDebug = false;
export function setHellDebug(on) {
  hellDebug = on;
}

function hellTick() {
  const tick = system.currentTick - (system.currentTick % 2);
  const pit = [];
  const spire = [];
  for (const p of world.getAllPlayers()) {
    if (!p?.isValid) continue;
    if (!p.hasTag(HELL_TAG)) {
      if (p.getGameMode() !== GameMode.Spectator && touchingHellPortal(p) && !inHellVolume(p)) useHellPortal(p);
      else lastSafe.set(p.id, p.location);
      continue;
    }
    if (!inHellVolume(p)) {
      // Tagged but somewhere else (an operator moved them?): only the respawn
      // handler may bring them back; otherwise let them go.
      const recent = tick - (returning.get(p.id) ?? -Infinity) < 100;
      if (!recent && !p.getDynamicProperty(P.dead) && tick % 100 === 0) releaseFromHell(p, "carried out by other means");
      continue;
    }
    const zone = zoneOf(p) ?? "spire";
    applyAtmosphere(p, zone);
    (zone === "pit" ? pit : spire).push(p);
    if (zone === "pit") stepTick(tick, p);
    hellAmbience(p, tick, zone, lava.level);
  }
  if (isBuilding(SITES.hell)) return;
  const mobs = pit.length ? hellMobs() : [];
  lavaTick(tick, pit);
  trapTick(tick, pit, mobs);
  crumbleTick(tick, pit);
  if (pit.length) {
    if (tick % 100 === 0) mendGates();
    soulTick(tick, pit);
    if (tick % 20 === 0) whisperTick(tick, pit);
    if (lava.level !== null && tick >= nextWave) {
      if (nextWave) spawnWave();
      nextWave = tick + WAVE_TICKS;
    }
  } else if (tick % 40 === 0) {
    if (souls.size) soulTick(tick, pit);
    if (mobs.length || ourMobs.size) clearMobs();
    nextWave = 0;
  }
  if (tick % 10 === 0 && (pit.length || spire.length)) memoryTick(tick, [...pit, ...spire]);
  if (spire.length) {
    weighTick(spire);
    if (tick % 40 === 0) clockTick();
    if (tick % 10 === 0) devilTick(spire);
  }
  if (hellDebug && tick % 400 === 0) {
    console.warn(`[Agartha debug] hell tick ${tick}: pit ${pit.length}, spire ${spire.length}, lava ${lava.level ?? "none"}, mobs ${mobs.length}, souls ${souls.size}, traps ${traps.map((t) => t.state[0]).join("")}`);
  }
}

let ticking = false;
function startTicking() {
  if (ticking) return;
  ticking = true;
  system.runInterval(hellTick, 2);
}
world.afterEvents.worldLoad.subscribe(startTicking);
system.runTimeout(startTicking, 40);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function forgeHell(player) {
  if (isHellBuilt()) {
    player?.sendMessage("§7Hell is already forged.");
    return;
  }
  if (isBuilderBusy() && !isBuilding(SITES.hell)) {
    player?.sendMessage("§7Agartha is being forged or erased right now; forge Hell when it finishes.");
    return;
  }
  if (player) {
    liftForger(player);
    player.sendMessage("§4You descend to forge Hell. §7You will be carried through the deep while it is carved; stay in the game. When it is done you will be returned here.");
  }
  world.sendMessage("§4Hell is being carved out beneath Agartha...");
  let lastStep = -1;
  ensureBuilt(
    SITES.hell,
    () => {
      world.sendMessage("§4Hell is forged. §7Its mouth awaits the Heart Scarab.");
      if (player?.isValid) {
        restoreForger(player);
        if (!hellmouth()) {
          giveScarab(player);
          player.sendMessage("§4You receive the Heart Scarab. §7Use it on the ground where the Hellmouth shall open.");
        }
      }
    },
    (pct) => {
      if (player?.isValid) player.onScreenDisplay.setActionBar(`§4Forging Hell... §f${pct}%`);
      const step = Math.floor(pct / 20) * 20;
      if (step > lastStep) {
        lastStep = step;
        world.sendMessage(`§7Forging Hell... §f${step}%`);
      }
    },
    (err) => {
      world.sendMessage(`§cThe forging of Hell paused: ${err}`);
      if (player?.isValid) restoreForger(player);
    },
    player
  );
}

function eraseHell(player) {
  if (world.getAllPlayers().some((p) => p.hasTag(HELL_TAG))) {
    player?.sendMessage("§cEveryone must leave Hell before it can be erased.");
    return;
  }
  if (player) liftForger(player);
  world.sendMessage("§7Hell is being filled in with rock...");
  eraseSite(
    SITES.hell,
    () => {
      world.sendMessage("§7Hell has been erased (solid rock fills its place).");
      if (player?.isValid) restoreForger(player);
    },
    (pct) => player?.isValid && player.onScreenDisplay.setActionBar(`§7Erasing Hell... §f${pct}%`),
    (err) => {
      world.sendMessage(`§cErasing Hell paused: ${err}`);
      if (player?.isValid) restoreForger(player);
    },
    player
  );
}

export function hellStatusLines() {
  const g = hellmouth();
  const lines = [`§4Hell: §f${isHellBuilt() ? "forged" : isBuilding(SITES.hell) ? "being forged/erased" : "not forged — run /scriptevent agartha:forge_hell"}`];
  if (g) {
    const d = world.getDimension(g.dim);
    const ok = (g.portal ?? []).filter((p) => blockAt(d, p)?.typeId === IDS.hellPortal).length;
    lines.push(`§4Hellmouth: §f${g.x} ${g.y} ${g.z} — ${ok}/${(g.portal ?? []).length} portal blocks present`);
  } else lines.push("§4Hellmouth: §fnone — use the Heart Scarab (or /scriptevent agartha:scarab)");
  const souls = world.getAllPlayers().filter((p) => p.hasTag(HELL_TAG)).length;
  lines.push(`§4Souls in Hell: §f${souls}${lava.level !== null ? `, lava at Y ${lava.level}` : ""}`);
  return lines;
}

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  const player = sourceEntity?.typeId === "minecraft:player" ? sourceEntity : undefined;
  const reply = (m) => (player ? player.sendMessage(m) : world.sendMessage(m));
  switch (id) {
    case "agartha:forge_hell":
      forgeHell(player);
      break;
    case "agartha:rebuild_hell":
      if (world.getAllPlayers().some((p) => p.hasTag(HELL_TAG))) reply("§cEveryone must leave Hell before it can be rebuilt.");
      else if (!isBuilderBusy()) {
        markUnbuilt(SITES.hell);
        forgeHell(player);
      }
      break;
    case "agartha:erase_hell":
      eraseHell(player);
      break;
    case "agartha:scarab":
      if (!player) break;
      if (hellmouth()) reply("§cThe Hellmouth already stands. Seal it (or use agartha:hellmouth_reset) first.");
      else if (!isHellBuilt()) reply("§cForge Hell first (/scriptevent agartha:forge_hell).");
      else giveScarab(player);
      break;
    case "agartha:hellmouth_reset":
      world.setDynamicProperty(HELLMOUTH_KEY, undefined);
      reply("§7The Hellmouth has been forgotten. Use §f/scriptevent agartha:scarab§7 to open a new one.");
      break;
    case "agartha:hell_release":
      if (player?.hasTag(HELL_TAG)) releaseFromHell(player, "by decree");
      else reply("§7You are not in Hell.");
      break;
    case "agartha:hell_enter":
      // For testing: go straight to the bottom of the pit.
      if (player && !player.hasTag(HELL_TAG)) enterHell(player);
      break;
  }
});
