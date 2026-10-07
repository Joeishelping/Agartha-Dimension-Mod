// Agartha - the frozen Viking heaven of this world, for Minecraft Bedrock.
//
//  * The afterlife: players who die in the mortal world awaken at the Gates of
//    Agartha. Dying in Agartha (falling through the clouds) returns them to
//    the mortal world at their spawn point.
//  * Frost Rune (crafted item): travel to Agartha while alive, and back.
//    Runestones in the realm also return you to the mortal world.
//  * The realm is built once inside a reserved pocket of the Overworld sky
//    (see config.js). Nothing outside that pocket is ever modified.
//
// Operator commands (/scriptevent):
//   agartha:afterlife on|off   send the dead to Agartha (default: on)
//   agartha:forge              build the realm now
//   agartha:rebuild            rebuild the realm from scratch
//   agartha:visit              travel there yourself

import { world, system, GameMode, EquipmentSlot } from "@minecraft/server";
import { REALM, REGION, B, IDS } from "./config.js";
import { ensureRealmBuilt, isRealmBuilt, isRealmBuilding, markRealmUnbuilt } from "./builder.js";

const TAG = "agartha_in_realm";
const RETURN_KEY = "agartha:return";
const AFTERLIFE_KEY = "agartha:afterlife_off";
const FOG_ID = "agartha:heaven_fog";
const FOG_USER = "agartha_realm";
const ARRIVAL_GRACE_TICKS = 60;
const TRAVEL_COOLDOWN_TICKS = 40;

const lastTravel = new Map();
const arrivedAt = new Map();
const diedInRealm = new Map();

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

function afterlifeEnabled() {
  return world.getDynamicProperty(AFTERLIFE_KEY) !== true;
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

function enterRealm(player, ascended = false) {
  forge(() => {
    if (player.isValid) teleportIn(player, ascended);
  }, player);
}

function teleportIn(player, ascended) {
  if (!player.hasTag(TAG) && !overRealmFootprint(player)) {
    const l = player.location;
    player.setDynamicProperty(RETURN_KEY, JSON.stringify({ x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
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
    player.onScreenDisplay.setTitle(ascended ? "§fYou have ascended" : "§bAgartha", {
      subtitle: ascended ? "§bWelcome to Agartha, the frozen heaven" : "§fthe frozen heaven",
      fadeInDuration: 20,
      stayDuration: 80,
      fadeOutDuration: 30,
    });
    player.playSound("beacon.activate");
    if (ascended) {
      player.sendMessage("§7Your soul has crossed into Agartha. Use a §bRunestone§7 to be reborn in the mortal world.");
    }
  }, 5);
}

function leaveRealm(player) {
  let target;
  try {
    target = JSON.parse(player.getDynamicProperty(RETURN_KEY) ?? "null");
  } catch {
    target = null;
  }
  clearRealmState(player);
  player.setDynamicProperty(RETURN_KEY, undefined);

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
  player.teleport(loc, { dimension: dim });
  player.addEffect("resistance", 60, { amplifier: 4, showParticles: false });
  system.runTimeout(() => {
    if (player.isValid) player.playSound("mob.endermen.portal");
  }, 3);
}

function useRune(player) {
  if (!canTravel(player)) return;
  if (player.hasTag(TAG) && inRealmVolume(player)) leaveRealm(player);
  else enterRealm(player);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId === IDS.rune) useRune(source);
});

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, itemStack }) => {
  if (block?.typeId === IDS.runestone) {
    if (player.hasTag(TAG) && canTravel(player)) leaveRealm(player);
  } else if (itemStack?.typeId === IDS.rune) {
    useRune(player);
  }
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

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity?.typeId !== "minecraft:player") return;
  diedInRealm.set(deadEntity.id, deadEntity.hasTag(TAG));
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) {
    if (!player.hasTag(TAG)) return;
    if (inRealmVolume(player)) {
      arrivedAt.set(player.id, system.currentTick);
      applyRealmAtmosphere(player);
    } else {
      clearRealmState(player);
    }
    return;
  }
  // Respawn after death.
  const fromRealm = diedInRealm.get(player.id) ?? player.hasTag(TAG);
  diedInRealm.delete(player.id);
  clearRealmState(player);
  player.setDynamicProperty(RETURN_KEY, undefined);
  if (fromRealm) {
    player.onScreenDisplay.setTitle("§fReborn", { subtitle: "§7You have returned to the mortal world", fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20 });
  } else if (afterlifeEnabled()) {
    // The dead ascend: their respawn point becomes where they return to.
    lastTravel.set(player.id, system.currentTick);
    enterRealm(player, true);
  }
});

system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!id.startsWith("agartha:")) return;
  const reply = (m) => (sourceEntity?.typeId === "minecraft:player" ? sourceEntity.sendMessage(m) : world.sendMessage(m));
  switch (id) {
    case "agartha:afterlife": {
      const off = message.trim().toLowerCase() === "off";
      world.setDynamicProperty(AFTERLIFE_KEY, off ? true : undefined);
      reply(off ? "§7Afterlife disabled: the dead respawn normally." : "§bAfterlife enabled: the dead ascend to Agartha.");
      break;
    }
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
