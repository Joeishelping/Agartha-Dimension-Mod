// Agartha - the frozen Hyperborean heaven of this world, for Minecraft Bedrock.
//
//  * Forging: an operator runs /scriptevent agartha:forge. They are flown
//    over the site in spectator mode while it builds (so the chunks load),
//    then returned home and handed the Keystone of the Heavenly Gate.
//  * One entrance: using the Keystone raises the Heavenly Gate in the mortal
//    world. Walking through it takes you to Agartha.
//  * One exit: the return portal behind the arrival plaza brings you back to
//    the spot you stepped into the Gate from.
//  * The All-Father greets every arrival at the Gates of Agartha.
//  * Every block in Agartha can be broken. The exit portal mends itself so
//    nobody is ever trapped. Falling through the clouds is instant death.
//  * The realm lives inside a reserved pocket of the Overworld sky
//    (see config.js). Nothing outside that pocket is modified, except the
//    Gate you raise yourself.
//
// Operator commands (/scriptevent):
//   agartha:forge        forge (or finish forging) the realm, in person
//   agartha:rebuild      rebuild the realm from scratch
//   agartha:erase        remove everything Agartha built (in person)
//   agartha:keystone     receive the Keystone again (only if no Gate stands)
//   agartha:gate_reset   forget the Gate so a new one can be raised
//   agartha:status       report whether Agartha, the Gate and its portal are working
//   agartha:fx_test      play Agartha's sounds and effects where you stand

import { world, system, GameMode, EquipmentSlot, ItemStack, BlockPermutation } from "@minecraft/server";
import { REALM, REGION, B, IDS } from "./config.js";
import { LAYOUT } from "./terrain.js";
import { ensureRealmBuilt, eraseRealm, isRealmBuilt, isRealmBuilding, markRealmUnbuilt, setBuilderDebug } from "./builder.js";
import { buildGate } from "./gate.js";
import { ambientTick, forgetPlayer, setAmbienceDebug, ambienceReport } from "./ambience.js";
import { allFatherTick, talk, welcomeArrival, setAllFatherDebug } from "./allfather.js";

const TAG = "agartha_in_realm";
const RETURN_KEY = "agartha:return";
const GATE_KEY = "agartha:gate";
const FORGER_KEY = "agartha:forger_restore";
const FOG_ID = "agartha:heaven_fog";
const FOG_USER = "agartha_realm";
const ALLFATHER = "agartha:allfather";
const ARRIVAL_GRACE_TICKS = 60;
const TRAVEL_COOLDOWN_TICKS = 40;

const lastTravel = new Map();
const arrivedAt = new Map();
const lastSafe = new Map();



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rel(loc) {
  return { x: loc.x - REALM.originX, z: loc.z - REALM.originZ };
}

/** True if the entity is in the Overworld above/below the pocket's footprint. */
function overRealmFootprint(entity) {
  if (entity.dimension.id !== "minecraft:overworld") return false;
  const { x, z } = rel(entity.location);
  return x >= REGION.minX && x <= REGION.maxX + 1 && z >= REGION.minZ && z <= REGION.maxZ + 1;
}

function inRealmVolume(entity) {
  return overRealmFootprint(entity) && entity.location.y > REALM.killY - 48;
}

function readJson(v) {
  try {
    return JSON.parse(v ?? "null");
  } catch {
    return null;
  }
}

/** The Heavenly Gate in the mortal world: { x, y, z, dim, axis, portal } or null. */
function gate() {
  return readJson(world.getDynamicProperty(GATE_KEY));
}

function blockAt(dim, loc) {
  try {
    return dim.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
  } catch {
    return undefined;
  }
}

/** True if any part of the player's body is inside a portal block. */
function inPortal(player) {
  const l = player.location;
  for (const dy of [0.1, 0.9, 1.6]) {
    for (const [dx, dz] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      if (blockAt(player.dimension, { x: l.x + dx, y: l.y + dy, z: l.z + dz })?.typeId === IDS.portal) return true;
    }
  }
  return false;
}

function run(player, cmd) {
  try {
    player.runCommand(cmd);
  } catch {
    // command not available on this version; purely cosmetic
  }
}

function abs(x, y, z) {
  return { x: REALM.originX + x, y, z: REALM.originZ + z };
}

function arrivalLocation() {
  return abs(REALM.arrival.x, B + 1, REALM.arrival.z);
}

function applyRealmAtmosphere(player) {
  run(player, `fog @s remove ${FOG_USER}`);
  run(player, `fog @s push ${FOG_ID} ${FOG_USER}`);
  player.addEffect("night_vision", 20 * 30, { showParticles: false });
}

function clearRealmState(player) {
  player.removeTag(TAG);
  run(player, `fog @s remove ${FOG_USER}`);
  run(player, "stopsound @s agartha.ambience");
  run(player, "stopsound @s agartha.wind");
  forgetPlayer(player.id);
  player.removeEffect("night_vision");
  arrivedAt.delete(player.id);
}

function canTravel(player) {
  const last = lastTravel.get(player.id) ?? -Infinity;
  if (system.currentTick - last < TRAVEL_COOLDOWN_TICKS) return false;
  lastTravel.set(player.id, system.currentTick);
  return true;
}

function giveKeystone(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const left = inv?.addItem(new ItemStack(IDS.keystone, 1));
  if (left || !inv) player.dimension.spawnItem(new ItemStack(IDS.keystone, 1), player.location);
}

// ---------------------------------------------------------------------------
// Forging the realm (in person)
// ---------------------------------------------------------------------------

function restoreForger(player) {
  const saved = readJson(player.getDynamicProperty(FORGER_KEY));
  if (!saved) return;
  player.setDynamicProperty(FORGER_KEY, undefined);
  try {
    player.setGameMode(saved.mode);
    player.teleport({ x: saved.x, y: saved.y, z: saved.z }, { dimension: world.getDimension(saved.dim) });
  } catch (e) {
    console.warn(`[Agartha] could not restore forger: ${e}`);
  }
}

/** Puts the operator in spectator mode so they can be carried over the site. */
function liftForger(player) {
  if (!player.getDynamicProperty(FORGER_KEY)) {
    const l = player.location;
    player.setDynamicProperty(FORGER_KEY, JSON.stringify({ mode: player.getGameMode(), x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  player.setGameMode(GameMode.Spectator);
}

function erase(player) {
  if (world.getAllPlayers().some((p) => p.hasTag(TAG))) {
    player?.sendMessage("§cEveryone must leave Agartha before it can be erased.");
    return;
  }
  if (player) {
    liftForger(player);
    player.sendMessage("§7You rise to unmake Agartha. §7You will be carried over the site; stay in the game.");
  }
  world.sendMessage("§7Agartha is being erased...");
  let lastStep = -1;
  eraseRealm(
    () => {
      world.sendMessage("§7Agartha has been erased. §fForge it again with /scriptevent agartha:forge.");
      if (player?.isValid) restoreForger(player);
    },
    (pct) => {
      if (player?.isValid) player.onScreenDisplay.setActionBar(`§7Erasing Agartha... §f${pct}%`);
      const step = Math.floor(pct / 25) * 25;
      if (step > lastStep) {
        lastStep = step;
        world.sendMessage(`§7Erasing Agartha... §f${step}%`);
      }
    },
    (err) => {
      world.sendMessage(`§cErasing paused: ${err}`);
      if (player?.isValid) restoreForger(player);
    },
    player
  );
}

function forge(player) {
  if (isRealmBuilt()) {
    player?.sendMessage("§7Agartha is already forged.");
    return;
  }
  if (isRealmBuilding()) {
    player?.sendMessage("§7Agartha is already being forged.");
    return;
  }
  if (player) {
    liftForger(player);
    player.sendMessage("§bYou rise to forge Agartha. §7You will be carried over the site while it is built; stay in the game. When it is done you will be returned here.");
  }
  world.sendMessage("§bAgartha is being forged in the heavens...");
  let lastStep = -1;
  ensureRealmBuilt(
    () => {
      world.sendMessage("§bAgartha is forged. §7The Heavenly Gate awaits its keystone.");
      if (player?.isValid) {
        restoreForger(player);
        if (!gate()) {
          giveKeystone(player);
          player.sendMessage("§6You receive the Keystone of the Heavenly Gate. §7Use it on the ground where the one entrance to Agartha shall stand.");
        }
      }
    },
    (pct) => {
      if (player?.isValid) player.onScreenDisplay.setActionBar(`§bForging Agartha... §f${pct}%`);
      const step = Math.floor(pct / 10) * 10;
      if (step > lastStep) {
        lastStep = step;
        world.sendMessage(`§7Forging Agartha... §f${step}%`);
      }
    },
    (err) => {
      world.sendMessage(`§cThe forging paused: ${err}`);
      if (player?.isValid) restoreForger(player);
    },
    player
  );
}

// ---------------------------------------------------------------------------
// The Heavenly Gate (the one entrance)
// ---------------------------------------------------------------------------

function raiseGate(player, block) {
  if (gate()) {
    const g = gate();
    player.sendMessage(`§cThe Heavenly Gate already stands at ${g.x} ${g.y} ${g.z}.`);
    return;
  }
  if (!isRealmBuilt()) {
    player.sendMessage("§cAgartha must be forged before its Gate can be raised.");
    return;
  }
  if (overRealmFootprint(player)) {
    player.sendMessage("§cThe Gate must stand in the mortal world.");
    return;
  }
  const v = player.getViewDirection();
  const axis = Math.abs(v.x) > Math.abs(v.z) ? "x" : "z"; // the portal faces the player
  const base = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
  let portal;
  try {
    portal = buildGate(player.dimension, base, axis);
  } catch (e) {
    player.sendMessage(`§cThe Heavenly Gate could not be raised: ${e.message ?? e}`);
    return;
  }
  const placed = portal.filter((p) => blockAt(player.dimension, p)?.typeId === IDS.portal).length;
  if (!placed) {
    player.sendMessage("§cThe Gate's frame rose, but its portal did not take hold here. Try another spot with open sky around it.");
    return;
  }
  world.setDynamicProperty(GATE_KEY, JSON.stringify({ ...base, dim: player.dimension.id, axis, portal }));
  const equip = player.getComponent("minecraft:equippable");
  const held = equip?.getEquipment(EquipmentSlot.Mainhand);
  if (held?.typeId === IDS.keystone) equip.setEquipment(EquipmentSlot.Mainhand, undefined);
  player.playSound("beacon.activate");
  try {
    player.dimension.spawnParticle("agartha:holy_motes", { x: base.x + 0.5, y: base.y + 3, z: base.z + 0.5 });
  } catch {
    // cosmetic
  }
  world.sendMessage("§6The Heavenly Gate has been raised. §7It is the one way into Agartha.");
}

function gatePortalRemains(g) {
  const dim = world.getDimension(g.dim);
  let unknown = false;
  for (const p of g.portal ?? []) {
    const b = blockAt(dim, p);
    if (!b) unknown = true;
    else if (b.typeId === IDS.portal) return true;
  }
  return unknown;
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

function teleportIn(player, from) {
  if (!player.hasTag(TAG) && !overRealmFootprint(player)) {
    const l = player.location;
    player.setDynamicProperty(RETURN_KEY, JSON.stringify(from ?? { x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  player.teleport(arrivalLocation(), {
    dimension: world.getDimension("overworld"),
    facingLocation: abs(0.5, B + 30, 60),
  });
  player.addTag(TAG);
  arrivedAt.set(player.id, system.currentTick);
  player.addEffect("slow_falling", 100, { showParticles: false });
  player.addEffect("resistance", 100, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (!player.isValid) return;
    applyRealmAtmosphere(player);
    player.onScreenDisplay.setTitle("§fAgartha", {
      subtitle: "§bthe Heavenly Gates",
      fadeInDuration: 20,
      stayDuration: 70,
      fadeOutDuration: 30,
    });
    player.playSound("beacon.activate");
  }, 5);
  system.runTimeout(() => welcome(player), 50);
}

/** The All-Father stands before Heaven's Gate; make sure he is there. */
function allFather() {
  const dim = world.getDimension("overworld");
  const at = abs(LAYOUT.allFather.x + 0.5, B + 1, LAYOUT.allFather.z + 0.5);
  let found;
  try {
    found = dim.getEntities({ type: ALLFATHER, location: at, maxDistance: 40 });
  } catch {
    return undefined;
  }
  if (found.length) {
    for (const extra of found.slice(1)) extra.remove();
    return found[0];
  }
  try {
    return dim.spawnEntity(ALLFATHER, at);
  } catch {
    return undefined;
  }
}

function welcome(player) {
  if (!player.isValid || !player.hasTag(TAG)) return;
  welcomeArrival(player, allFather(), system.currentTick);
}

function leaveRealm(player) {
  let target = readJson(player.getDynamicProperty(RETURN_KEY));
  clearRealmState(player);
  player.setDynamicProperty(RETURN_KEY, undefined);
  lastTravel.set(player.id, system.currentTick);

  // No remembered spot: step out in front of the Gate.
  const g = gate();
  if (!target && g) {
    const front = g.axis === "z" ? { x: g.x + 0.5, z: g.z + 3.5 } : { x: g.x + 3.5, z: g.z + 0.5 };
    target = { x: front.x, y: g.y, z: front.z, dim: g.dim, face: { x: front.x + (front.x - g.x), z: front.z + (front.z - g.z) } };
  }

  let dim = world.getDimension(target?.dim ?? "minecraft:overworld");
  let loc = target ? { x: target.x, y: target.y, z: target.z } : undefined;
  if (!loc) {
    const sp = player.getSpawnPoint();
    if (sp) {
      dim = sp.dimension;
      loc = { x: sp.x + 0.5, y: sp.y, z: sp.z + 0.5 };
    } else {
      const ds = world.getDefaultSpawnLocation();
      dim = world.getDimension("overworld");
      loc = { x: ds.x + 0.5, y: ds.y > 320 ? 200 : ds.y, z: ds.z + 0.5 };
      if (ds.y > 320) player.addEffect("slow_falling", 20 * 20, { showParticles: false });
    }
  }
  const opts = { dimension: dim };
  if (target?.face) opts.facingLocation = { x: target.face.x, y: loc.y + 1.6, z: target.face.z };
  player.teleport(loc, opts);
  player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (player.isValid) player.playSound("mob.endermen.portal");
  }, 3);
}

/** A player stepped into (or tapped) a portal block. */
function usePortal(player, portalLoc) {
  if (!canTravel(player)) return;
  if (overRealmFootprint(player)) {
    // The one exit.
    if (player.hasTag(TAG)) leaveRealm(player);
    return;
  }
  // The one entrance: only the Heavenly Gate leads to Agartha.
  const safe = lastSafe.get(player.id) ?? player.location;
  if (!isRealmBuilt()) {
    player.teleport(safe);
    player.sendMessage("§7The Gate shimmers, but Agartha has not yet been forged.");
    return;
  }
  const pl = portalLoc ? { x: portalLoc.x + 0.5, z: portalLoc.z + 0.5 } : player.location;
  const face = { x: safe.x + (safe.x - pl.x) * 4, z: safe.z + (safe.z - pl.z) * 4 };
  teleportIn(player, { x: safe.x, y: safe.y, z: safe.z, dim: player.dimension.id, face });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

// The Keystone: tap a block with it, or use it while looking at the ground.
// (Before-events fire for every attempt, even on blocks that do nothing.)
const keystoneUsed = new Map();
function useKeystone(player, block) {
  const last = keystoneUsed.get(player.id) ?? -Infinity;
  if (system.currentTick - last < 20) return;
  keystoneUsed.set(player.id, system.currentTick);
  if (!block) {
    player.sendMessage("§7Look at the ground where the Heavenly Gate shall stand, then use the Keystone.");
    return;
  }
  raiseGate(player, block);
}

// Talking to the All-Father.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target?.typeId !== ALLFATHER) return;
  ev.cancel = true;
  const { player, target } = ev;
  system.run(() => {
    if (player.isValid && target.isValid) talk(player, target);
  });
});

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.block?.typeId === IDS.portal) {
    // Tapping the shimmering surface also takes you through.
    ev.cancel = true;
    const { player, block } = ev;
    const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
    system.run(() => usePortal(player, loc));
    return;
  }
  if (ev.itemStack?.typeId !== IDS.keystone) return;
  ev.cancel = true;
  const { player, block } = ev;
  system.run(() => useKeystone(player, block));
});

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== IDS.keystone) return;
  let hit;
  try {
    hit = source.getBlockFromViewDirection({ maxDistance: 12 })?.block;
  } catch {
    hit = undefined;
  }
  useKeystone(source, hit);
});

// Portal blocks: the first one placed in the mortal world founds the one
// Heavenly Gate; more within reach of it extend it; anywhere else is refused.
const GATE_REACH = 12;
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (block.typeId !== IDS.portal) return;
  if (overRealmFootprint({ dimension, location: block.location })) return; // mending the exit is fine
  const loc = { x: block.location.x, y: block.location.y, z: block.location.z };
  const g = gate();
  if (!g) {
    world.setDynamicProperty(GATE_KEY, JSON.stringify({ ...loc, dim: dimension.id, axis: "z", portal: [loc] }));
    player.sendMessage("§6The Heavenly Gate has been founded here. §7Fill its frame with portal blocks; walk through to reach Agartha.");
    return;
  }
  const near = g.dim === dimension.id && Math.max(Math.abs(g.x - loc.x), Math.abs(g.y - loc.y), Math.abs(g.z - loc.z)) <= GATE_REACH;
  if (near) {
    g.portal = [...(g.portal ?? []), loc];
    world.setDynamicProperty(GATE_KEY, JSON.stringify(g));
    return;
  }
  block.setType("minecraft:air");
  player.sendMessage(`§cThere is only one way into Agartha: the Heavenly Gate at ${g.x} ${g.y} ${g.z}.`);
});

// If the Gate is torn down completely, its Keystone returns to whoever did it.
world.afterEvents.playerBreakBlock.subscribe(({ player, brokenBlockPermutation, dimension }) => {
  if (brokenBlockPermutation?.type?.id !== IDS.portal || overRealmFootprint({ dimension, location: player.location })) return;
  const g = gate();
  if (!g || g.dim !== dimension.id || gatePortalRemains(g)) return;
  world.setDynamicProperty(GATE_KEY, undefined);
  giveKeystone(player);
  world.sendMessage("§7The Heavenly Gate has fallen. §6Its Keystone returns to the one who unmade it.");
});

world.afterEvents.itemCompleteUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== IDS.mead) return;
  source.addEffect("strength", 20 * 90, { amplifier: 0 });
  source.addEffect("regeneration", 20 * 8, { amplifier: 1 });
  source.addEffect("fire_resistance", 20 * 90, { amplifier: 0 });
  source.sendMessage("§6Skál! §7The mead warms you against the cold.");
});

// Jarl's Axe: hits inflict frostbite.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity?.typeId !== "minecraft:player" || !hitEntity?.isValid) return;
  const held = damagingEntity.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
  if (held?.typeId !== IDS.axe) return;
  hitEntity.addEffect("slowness", 20 * 3, { amplifier: 2 });
  hitEntity.addEffect("weakness", 20 * 3, { amplifier: 0 });
  try {
    const l = hitEntity.location;
    hitEntity.dimension.spawnParticle("agartha:frost_burst", { x: l.x, y: l.y + 1, z: l.z });
  } catch {
    // particle missing; cosmetic only
  }
});

// Heaven is peaceful: no hostile mobs spawn inside the pocket.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (!entity.isValid || entity.typeId === "minecraft:player") return;
    if (!inRealmVolume(entity)) return;
    if (entity.matches({ families: ["monster"] })) entity.remove();
  } catch {
    // entity vanished
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!player) return;
  if (initialSpawn && !isRealmBuilding()) restoreForger(player);
  if (!player.hasTag(TAG)) return;
  if (initialSpawn && inRealmVolume(player)) {
    arrivedAt.set(player.id, system.currentTick);
    applyRealmAtmosphere(player);
    return;
  }
  // Died in Agartha (or left some other way): back to normal life.
  clearRealmState(player);
  player.setDynamicProperty(RETURN_KEY, undefined);
});

let debugOn = false;

system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!id.startsWith("agartha:")) return;
  const player = sourceEntity?.typeId === "minecraft:player" ? sourceEntity : undefined;
  const reply = (m) => {
    if (player) player.sendMessage(m);
    else world.sendMessage(m);
    if (debugOn || id === "agartha:debug") console.warn(`[Agartha] ${m.replace(/§./g, "")}`);
  };
  switch (id) {
    case "agartha:forge":
      forge(player);
      break;
    case "agartha:rebuild":
      if (world.getAllPlayers().some((p) => p.hasTag(TAG))) {
        reply("§cEveryone must leave Agartha before it can be rebuilt.");
      } else if (!isRealmBuilding()) {
        markRealmUnbuilt();
        forge(player);
      }
      break;
    case "agartha:erase":
      erase(player);
      break;
    case "agartha:keystone":
      if (!player) break;
      if (gate()) reply("§cThe Heavenly Gate already stands. Tear it down (or use agartha:gate_reset) first.");
      else if (!isRealmBuilt()) reply("§cForge Agartha first.");
      else giveKeystone(player);
      break;
    case "agartha:status": {
      const g = gate();
      const lines = [`§bAgartha: §f${isRealmBuilt() ? "forged" : isRealmBuilding() ? "being forged/erased" : "not forged — run /scriptevent agartha:forge"}`];
      lines.push(`§bWatcher: §f${ticking ? "running" : "NOT running"}`);
      if (g) {
        const dim = world.getDimension(g.dim);
        const list = g.portal ?? [];
        const ok = list.filter((p) => blockAt(dim, p)?.typeId === IDS.portal).length;
        const unloaded = list.filter((p) => !blockAt(dim, p)).length;
        lines.push(`§bGate: §f${g.x} ${g.y} ${g.z} (${g.dim.replace("minecraft:", "")}) — ${ok}/${list.length} portal blocks present${unloaded ? `, ${unloaded} not loaded` : ""}`);
      } else {
        lines.push("§bGate: §fnone — use the Keystone (or /scriptevent agartha:keystone) or place portal blocks");
      }
      let portalOk = true;
      try {
        BlockPermutation.resolve(IDS.portal);
      } catch {
        portalOk = false;
      }
      lines.push(`§bPortal block: §f${portalOk ? "loaded" : "MISSING — activate both Agartha packs"}`);
      for (const l of lines) reply(l);
      break;
    }
    case "agartha:debug": {
      debugOn = message.trim().toLowerCase() !== "off";
      setAmbienceDebug(debugOn);
      setAllFatherDebug(debugOn);
      setBuilderDebug(debugOn);
      reply(`§7Agartha debug logging ${debugOn ? "on (see the content log)" : "off"}.`);
      break;
    }
    case "agartha:fx_test": {
      // Plays Agartha's sounds and effects right where you stand, anywhere.
      if (!player) break;
      player.playSound("agartha.chime");
      system.runTimeout(() => player.isValid && player.playSound("agartha.welcome"), 30);
      for (const [id, dy] of [["agartha:snowfall", 6], ["agartha:holy_motes", 1], ["agartha:spirit_lights", 1], ["agartha:god_rays", 25], ["agartha:aurora", 30], ["agartha:mist", -1]]) {
        spawnFx(player, id, 0, dy, -6);
      }
      reply("§bPlaying Agartha's chime and arrival choir, with snow, lights, god rays, aurora and mist in front of you. §7If you see/hear nothing, check both Agartha packs are active and your Ambient/Environment volume is up.");
      break;
    }
    case "agartha:gate_reset":
      world.setDynamicProperty(GATE_KEY, undefined);
      reply("§7The Heavenly Gate has been forgotten. Use §f/scriptevent agartha:keystone§7 to raise a new one.");
      break;
  }
});

// ---------------------------------------------------------------------------
// Realm tick: portals, kill plane, atmosphere, mending the exit
// ---------------------------------------------------------------------------

function spawnFx(player, id, dx, dy, dz) {
  try {
    const l = player.location;
    player.dimension.spawnParticle(id, { x: l.x + dx, y: l.y + dy, z: l.z + dz });
  } catch {
    // chunk not ready
  }
}

/** The exit portal can be broken, but it always mends itself. */
function mendExit() {
  const dim = world.getDimension("overworld");
  const { x: rx, z: rz } = LAYOUT.returnPortal;
  for (let x = rx - 2; x <= rx + 2; x++) {
    for (let y = B + 1; y <= B + 6; y++) {
      const b = blockAt(dim, abs(x, y, rz));
      if (b && b.typeId !== IDS.portal) b.setType(IDS.portal);
    }
  }
}

/** Both portals hum softly to anyone standing near them. */
function portalHum() {
  const spots = [];
  const g = gate();
  if (g) spots.push({ dim: g.dim, loc: { x: g.x + 0.5, y: g.y + 3, z: g.z + 0.5 } });
  spots.push({ dim: "minecraft:overworld", loc: abs(LAYOUT.returnPortal.x + 0.5, B + 4, LAYOUT.returnPortal.z + 0.5) });
  for (const s of spots) {
    try {
      const dim = world.getDimension(s.dim);
      if (dim.getPlayers({ location: s.loc, maxDistance: 20 }).length) {
        dim.playSound("agartha.portal", s.loc);
        dim.spawnParticle("agartha:holy_motes", s.loc);
      }
    } catch {
      // not loaded
    }
  }
}

function realmTick() {
  // Runs every 2 ticks; round down so `tick % N === 0` checks still fire when
  // the interval happened to start on an odd tick.
  const tick = system.currentTick - (system.currentTick % 2);
  let anyoneHere = false;
  const inRealm = [];
  for (const player of world.getAllPlayers()) {
    if (!player?.isValid) continue;
    if (player.getGameMode() !== GameMode.Spectator && inPortal(player)) {
      usePortal(player);
      continue;
    }
    lastSafe.set(player.id, player.location);
    if (!player.hasTag(TAG)) continue;
    const graceOver = tick - (arrivedAt.get(player.id) ?? 0) > ARRIVAL_GRACE_TICKS;
    if (!overRealmFootprint(player)) {
      if (graceOver) clearRealmState(player);
      continue;
    }
    anyoneHere = true;
    if (player.location.y < REALM.killY && graceOver && !isRealmBuilding()) {
      const mode = player.getGameMode();
      if (mode === GameMode.Creative || mode === GameMode.Spectator) {
        player.teleport(arrivalLocation());
      } else {
        player.sendMessage("§7You fell through the clouds of Agartha...");
        player.kill();
      }
      continue;
    }
    if (tick % 200 === 0) player.addEffect("night_vision", 20 * 30, { showParticles: false });
    inRealm.push(player);
    ambientTick(player, tick);
  }

  if (anyoneHere && tick % 200 === 0 && !isRealmBuilding()) mendExit();
  if (tick % 110 === 0 && !isRealmBuilding()) portalHum();
  if (debugOn && tick % 400 === 0) {
    console.warn(`[Agartha debug] tick ${tick}: ${inRealm.length} player(s) in Agartha; ambience in last 20 s: ${ambienceReport()}`);
  }
  if (anyoneHere && tick % 20 === 0 && !isRealmBuilding()) {
    try {
      const t = world.getTimeOfDay();
      allFatherTick(allFather(), inRealm, tick, t > 12800 && t < 23200);
    } catch {
      // cosmetic
    }
  }


  // Anything else that falls through the clouds is gone too.
  if (anyoneHere && tick % 10 === 0 && !isRealmBuilding()) {
    try {
      const dim = world.getDimension("overworld");
      const fallen = dim.getEntities({
        location: { x: REALM.originX + REGION.minX, y: REALM.killY - 40, z: REALM.originZ + REGION.minZ },
        volume: { x: REGION.maxX - REGION.minX, y: 39, z: REGION.maxZ - REGION.minZ },
        excludeTypes: ["minecraft:player"],
      });
      for (const e of fallen) {
        try {
          if (!e.kill()) e.remove();
        } catch {
          // already gone
        }
      }
    } catch {
      // area unloaded
    }
  }
}

let ticking = false;
function startTicking() {
  if (ticking) return;
  ticking = true;
  system.runInterval(realmTick, 2);
}
world.afterEvents.worldLoad.subscribe(startTicking);
// If the scripts were (re)loaded into an already-running world, worldLoad never
// fires; start anyway a moment later.
system.runTimeout(startTicking, 40);
