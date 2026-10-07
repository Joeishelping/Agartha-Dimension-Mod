// Agartha - the frozen Viking heaven of this world, for Minecraft Bedrock.
//
//  * One portal: the Gate of Agartha (agartha:portal) is built in the mortal
//    world. Walking into it takes you to Agartha; the return portal or a
//    Runestone there brings you back to the spot you stepped in from.
//    Only one Gate may exist; portal blocks placed elsewhere are refused.
//  * Falling through the clouds below Agartha is instant death (you respawn
//    normally in the mortal world).
//  * The realm is built once inside a reserved pocket of the Overworld sky
//    (see config.js). Nothing outside that pocket is ever modified.
//
// Operator commands (/scriptevent):
//   agartha:forge              build the realm now
//   agartha:rebuild            rebuild the realm from scratch
//   agartha:visit              travel there yourself
//   agartha:portal_reset       forget the Gate's location (to build a new one)

import { world, system, GameMode, EquipmentSlot } from "@minecraft/server";
import { REALM, REGION, B, IDS } from "./config.js";
import { ensureRealmBuilt, isRealmBuilt, isRealmBuilding, markRealmUnbuilt } from "./builder.js";

const TAG = "agartha_in_realm";
const RETURN_KEY = "agartha:return";
const PORTAL_KEY = "agartha:portal";
const PORTAL_CLUSTER = 12; // portal blocks within this range belong to the one Gate
const FOG_ID = "agartha:heaven_fog";
const FOG_USER = "agartha_realm";
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

/** The single Gate in the mortal world: { x, y, z, dim } or null. */
function gate() {
  return readJson(world.getDynamicProperty(PORTAL_KEY));
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

function arrivalLocation() {
  return { x: REALM.originX + REALM.arrival.x, y: B + 1, z: REALM.originZ + REALM.arrival.z };
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

// ---------------------------------------------------------------------------
// Forging the realm
// ---------------------------------------------------------------------------

let lastBroadcast = -1;

function forge(onReady, requester) {
  if (!isRealmBuilt() && !isRealmBuilding()) {
    world.sendMessage("§bAgartha is being forged in the heavens... §7(one time only; this can take a few minutes)");
    lastBroadcast = -1;
  }
  ensureRealmBuilt(
    () => {
      if (lastBroadcast !== 100) world.sendMessage("§bThe Gates of Agartha stand open.");
      lastBroadcast = 100;
      onReady?.();
    },
    (pct) => {
      const step = Math.floor(pct / 25) * 25;
      if (step > lastBroadcast && step < 100) {
        lastBroadcast = step;
        world.sendMessage(`§7Forging Agartha... §f${step}%`);
      }
      if (requester?.isValid) requester.onScreenDisplay.setActionBar(`§bForging Agartha... §f${pct}%`);
    },
    (err) => world.sendMessage(`§cAgartha could not be forged: ${err}`)
  );
}

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

function enterRealm(player, from) {
  forge(() => {
    if (player.isValid) teleportIn(player, from);
  }, player);
}

/** from: where to send the player back to ({ x, y, z, dim, face? }). */
function teleportIn(player, from) {
  if (!player.hasTag(TAG) && !overRealmFootprint(player)) {
    const l = player.location;
    player.setDynamicProperty(RETURN_KEY, JSON.stringify(from ?? { x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  player.teleport(arrivalLocation(), {
    dimension: world.getDimension("overworld"),
    facingLocation: { x: REALM.originX + 0.5, y: B + 30, z: REALM.originZ + 60 },
  });
  player.addTag(TAG);
  arrivedAt.set(player.id, system.currentTick);
  player.addEffect("slow_falling", 100, { showParticles: false });
  player.addEffect("resistance", 100, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (!player.isValid) return;
    applyRealmAtmosphere(player);
    player.onScreenDisplay.setTitle("§bAgartha", {
      subtitle: "§fthe frozen heaven",
      fadeInDuration: 20,
      stayDuration: 80,
      fadeOutDuration: 30,
    });
    player.playSound("beacon.activate");
  }, 5);
}

function leaveRealm(player) {
  let target = readJson(player.getDynamicProperty(RETURN_KEY));
  clearRealmState(player);
  player.setDynamicProperty(RETURN_KEY, undefined);
  lastTravel.set(player.id, system.currentTick);

  // No remembered spot (e.g. arrived by command): step out in front of the Gate.
  const g = gate();
  if (!target && g) target = { x: g.x + 0.5, y: g.y, z: g.z + 2.5, dim: g.dim, face: { x: g.x + 0.5, z: g.z + 5 } };

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
  if (player.hasTag(TAG) && overRealmFootprint(player)) {
    leaveRealm(player);
    return;
  }
  // Remember the spot just outside the Gate, facing away from it.
  const safe = lastSafe.get(player.id) ?? player.location;
  const pl = player.location;
  const face = { x: safe.x + (safe.x - pl.x) * 4, z: safe.z + (safe.z - pl.z) * 4 };
  const from = { x: safe.x, y: safe.y, z: safe.z, dim: player.dimension.id, face };
  if (!isRealmBuilt()) {
    // Still forging: nudge them back out so they don't stand in the portal.
    player.teleport(safe);
    player.sendMessage("§7The Gate shimmers, but Agartha is still being forged. Try again soon.");
  }
  enterRealm(player, from);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block }) => {
  if (block?.typeId === IDS.runestone && player.hasTag(TAG) && canTravel(player)) leaveRealm(player);
});

// There is only one Gate of Agartha in the mortal world.
world.afterEvents.playerPlaceBlock.subscribe(({ player, block, dimension }) => {
  if (block.typeId !== IDS.portal) return;
  const loc = block.location;
  if (dimension.id === "minecraft:overworld" && overRealmFootprint({ dimension, location: loc })) return;
  const g = gate();
  const near = g && g.dim === dimension.id && Math.max(Math.abs(g.x - loc.x), Math.abs(g.y - loc.y), Math.abs(g.z - loc.z)) <= PORTAL_CLUSTER;
  if (!g || near || !gateStillStands(g)) {
    if (!near) {
      world.setDynamicProperty(PORTAL_KEY, JSON.stringify({ x: loc.x, y: loc.y, z: loc.z, dim: dimension.id }));
      player.sendMessage("§bThe Gate of Agartha has been founded here. §7Walk through it to reach the frozen heaven.");
    }
    return;
  }
  block.setType("minecraft:air");
  player.sendMessage(`§cThere can be only one Gate of Agartha. §7It stands at ${g.x} ${g.y} ${g.z}. Use §f/scriptevent agartha:portal_reset§7 to move it.`);
});

/** False only if we can see the Gate's area and no portal blocks remain. */
function gateStillStands(g) {
  const dim = world.getDimension(g.dim);
  if (!blockAt(dim, g)) return true; // not loaded; assume it still stands
  for (let dx = -PORTAL_CLUSTER; dx <= PORTAL_CLUSTER; dx++)
    for (let dy = -PORTAL_CLUSTER; dy <= PORTAL_CLUSTER; dy++)
      for (let dz = -PORTAL_CLUSTER; dz <= PORTAL_CLUSTER; dz++)
        if (blockAt(dim, { x: g.x + dx, y: g.y + dy, z: g.z + dz })?.typeId === IDS.portal) return true;
  return false;
}

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

system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!id.startsWith("agartha:")) return;
  const reply = (m) => (sourceEntity?.typeId === "minecraft:player" ? sourceEntity.sendMessage(m) : world.sendMessage(m));
  switch (id) {
    case "agartha:forge":
      forge();
      break;
    case "agartha:rebuild":
      if (world.getAllPlayers().some((p) => p.hasTag(TAG))) {
        reply("§cEveryone must leave Agartha before it can be rebuilt.");
      } else if (!isRealmBuilding()) {
        markRealmUnbuilt();
        forge();
      }
      break;
    case "agartha:visit":
      if (sourceEntity?.typeId === "minecraft:player") enterRealm(sourceEntity);
      break;
    case "agartha:portal_reset":
      world.setDynamicProperty(PORTAL_KEY, undefined);
      reply("§7The Gate of Agartha has been forgotten. The next portal block placed founds a new one.");
      break;
  }
});

// ---------------------------------------------------------------------------
// Realm tick: kill plane, atmosphere, cleanup
// ---------------------------------------------------------------------------

function spawnFx(player, id, dx, dy, dz) {
  try {
    const l = player.location;
    player.dimension.spawnParticle(id, { x: l.x + dx, y: l.y + dy, z: l.z + dz });
  } catch {
    // chunk not ready
  }
}

function realmTick() {
  const tick = system.currentTick;
  let anyoneHere = false;
  for (const player of world.getAllPlayers()) {
    if (inPortal(player)) {
      usePortal(player);
      continue;
    }
    lastSafe.set(player.id, player.location);
    if (!player.hasTag(TAG)) continue;
    const graceOver = tick - (arrivedAt.get(player.id) ?? 0) > ARRIVAL_GRACE_TICKS;
    if (!overRealmFootprint(player)) {
      // Left by some other means (command, death elsewhere, ...).
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
    if (tick % 100 === 0) {
      // Aurora curtains drifting high overhead (they glow at night).
      const a = Math.random() * Math.PI * 2;
      spawnFx(player, "agartha:aurora", Math.cos(a) * 60, 70, Math.sin(a) * 60);
    }
    if (tick % 200 === 0) player.addEffect("night_vision", 20 * 30, { showParticles: false });
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

world.afterEvents.worldLoad.subscribe(() => {
  system.runInterval(realmTick, 2);
  // Forge heaven in the background so it is ready before anyone dies.
  system.runTimeout(() => {
    if (!isRealmBuilt()) forge();
  }, 20 * 15);
});
