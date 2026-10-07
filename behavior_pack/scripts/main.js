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
//   agartha:keystone     receive the Keystone again (only if no Gate stands)
//   agartha:gate_reset   forget the Gate so a new one can be raised

import { world, system, GameMode, EquipmentSlot, ItemStack } from "@minecraft/server";
import { REALM, REGION, B, IDS } from "./config.js";
import { LAYOUT } from "./terrain.js";
import { ensureRealmBuilt, isRealmBuilt, isRealmBuilding, markRealmUnbuilt } from "./builder.js";
import { buildGate } from "./gate.js";

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

const WELCOMES = [
  ["Welcome home, my child.", "You did well."],
  ["At last you have come home.", "Rest now. You did well, my child."],
  ["The long road is behind you.", "Welcome to Agartha. You have earned your place here."],
  ["I have watched over you, child.", "Welcome home. You did well."],
];

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

function inPortal(player) {
  const l = player.location;
  return blockAt(player.dimension, l)?.typeId === IDS.portal || blockAt(player.dimension, { x: l.x, y: l.y + 1, z: l.z })?.typeId === IDS.portal;
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
    const l = player.location;
    player.setDynamicProperty(FORGER_KEY, JSON.stringify({ mode: player.getGameMode(), x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
    player.setGameMode(GameMode.Spectator);
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
  const portal = buildGate(player.dimension, base, axis);
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
  const af = allFather();
  if (af) {
    try {
      af.teleport(af.location, { facingLocation: player.location });
      af.playAnimation("animation.agartha.allfather.welcome", { blendOutTime: 0.4 });
      af.dimension.spawnParticle("agartha:holy_motes", { x: af.location.x, y: af.location.y + 3, z: af.location.z });
    } catch {
      // cosmetic
    }
  }
  const [a, b] = WELCOMES[Math.floor(Math.random() * WELCOMES.length)];
  player.playSound("random.orb", { pitch: 0.5 });
  player.sendMessage(`§6§oThe All-Father: §r§f${a}`);
  system.runTimeout(() => {
    if (!player.isValid) return;
    player.sendMessage(`§6§oThe All-Father: §r§f${b}`);
    player.onScreenDisplay.setActionBar(`§f§o"${b}"`);
  }, 50);
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

/** A player stepped into a portal block. */
function usePortal(player) {
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
  const pl = player.location;
  const face = { x: safe.x + (safe.x - pl.x) * 4, z: safe.z + (safe.z - pl.z) * 4 };
  teleportIn(player, { x: safe.x, y: safe.y, z: safe.z, dim: player.dimension.id, face });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, itemStack, isFirstEvent }) => {
  if (isFirstEvent === false) return;
  if (itemStack?.typeId === IDS.keystone) raiseGate(player, block);
});

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== IDS.keystone || gate()) return;
  source.sendMessage("§7Use the Keystone on the ground where the Heavenly Gate shall stand.");
});

// Portal blocks only belong to the Gate and the exit.
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (block.typeId !== IDS.portal) return;
  if (overRealmFootprint({ dimension, location: block.location })) return; // mending the exit is fine
  block.setType("minecraft:air");
  player.sendMessage("§cThere is only one way into Agartha: the Heavenly Gate.");
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

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  if (!id.startsWith("agartha:")) return;
  const player = sourceEntity?.typeId === "minecraft:player" ? sourceEntity : undefined;
  const reply = (m) => (player ? player.sendMessage(m) : world.sendMessage(m));
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
    case "agartha:keystone":
      if (!player) break;
      if (gate()) reply("§cThe Heavenly Gate already stands. Tear it down (or use agartha:gate_reset) first.");
      else if (!isRealmBuilt()) reply("§cForge Agartha first.");
      else giveKeystone(player);
      break;
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

function realmTick() {
  const tick = system.currentTick;
  let anyoneHere = false;
  for (const player of world.getAllPlayers()) {
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
    if (tick % 20 === 0) spawnFx(player, "agartha:snowfall", 0, 7, 0);
    if (tick % 30 === 0) spawnFx(player, "agartha:holy_motes", 0, 0, 0);
    if (tick % 40 === 0) {
      // Aurora curtains: mostly over the northern mountains, sometimes overhead.
      const a = (Math.random() < 0.7 ? -Math.PI / 2 : 0) + (Math.random() - 0.5) * Math.PI * 1.4;
      const d = 50 + Math.random() * 50;
      spawnFx(player, "agartha:aurora", Math.cos(a) * d, 55 + Math.random() * 35, Math.sin(a) * d);
    }
    if (tick % 50 === 0) spawnFx(player, "agartha:mist", (Math.random() - 0.5) * 30, -1, (Math.random() - 0.5) * 30);
    if (tick % 200 === 0) player.addEffect("night_vision", 20 * 30, { showParticles: false });
  }

  if (anyoneHere && tick % 200 === 0 && !isRealmBuilding()) mendExit();

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

world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(realmTick, 2);
});
