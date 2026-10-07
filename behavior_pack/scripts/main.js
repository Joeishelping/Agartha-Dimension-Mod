// Agartha - a sealed, floating Viking sky-realm for Minecraft Bedrock.
//
//  * Frost Rune (crafted item): use it to travel to Agartha, use it again to
//    go home. Runestones in the realm also send you home.
//  * The realm is built once, on first visit, inside a reserved pocket of the
//    Overworld sky (see config.js). Nothing outside that pocket is modified.
//  * Fall off the island and through the clouds: instant death.

import { world, system, GameMode, EquipmentSlot } from "@minecraft/server";
import { REALM, REGION, G, IDS } from "./config.js";
import { ensureRealmBuilt, isRealmBuilt } from "./builder.js";

const TAG = "agartha_in_realm";
const RETURN_KEY = "agartha:return";
const FOG_ID = "agartha:heaven_fog";
const FOG_USER = "agartha_realm";
const ARRIVAL_GRACE_TICKS = 60;
const TRAVEL_COOLDOWN_TICKS = 40;

const lastTravel = new Map();
const arrivedAt = new Map();

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

function run(player, cmd) {
  try {
    player.runCommand(cmd);
  } catch {
    // command not available on this version; purely cosmetic
  }
}

function arrivalLocation() {
  return { x: REALM.originX + REALM.arrival.x, y: G, z: REALM.originZ + REALM.arrival.z };
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
// Travel
// ---------------------------------------------------------------------------

function enterRealm(player) {
  if (!isRealmBuilt()) {
    player.sendMessage("§bThe Frost Rune hums... §7Agartha is being forged from the clouds for the first time. This happens only once.");
  }
  ensureRealmBuilt(
    () => {
      if (!player.isValid) return;
      teleportIn(player);
    },
    (text) => {
      if (player.isValid) player.onScreenDisplay.setActionBar(text);
    },
    (err) => {
      if (player.isValid) player.sendMessage(`§cAgartha could not be forged: ${err}`);
    }
  );
}

function teleportIn(player) {
  if (!player.hasTag(TAG) && !overRealmFootprint(player)) {
    const l = player.location;
    player.setDynamicProperty(RETURN_KEY, JSON.stringify({ x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  const overworld = world.getDimension("overworld");
  player.teleport(arrivalLocation(), {
    dimension: overworld,
    facingLocation: { x: REALM.originX + 0.5, y: G + 4, z: REALM.originZ + 20 },
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
      fadeInDuration: 10,
      stayDuration: 60,
      fadeOutDuration: 20,
    });
    player.playSound("beacon.activate");
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

// Keep the heaven peaceful: no hostile mobs spawn inside the pocket.
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
  if (!initialSpawn) {
    // Died in the realm and respawned at home.
    clearRealmState(player);
    player.setDynamicProperty(RETURN_KEY, undefined);
  } else if (inRealmVolume(player)) {
    arrivedAt.set(player.id, system.currentTick);
    applyRealmAtmosphere(player);
  } else {
    clearRealmState(player);
  }
});

// ---------------------------------------------------------------------------
// Realm tick: kill plane, atmosphere, cleanup
// ---------------------------------------------------------------------------

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
    const y = player.location.y;
    if (y < REALM.killY && graceOver) {
      const mode = player.getGameMode();
      if (mode === GameMode.Creative || mode === GameMode.Spectator) {
        player.teleport(arrivalLocation());
      } else {
        player.sendMessage("§7You fell through the clouds of Agartha...");
        player.kill();
      }
      continue;
    }
    if (tick % 20 === 0) {
      try {
        const l = player.location;
        player.dimension.spawnParticle("agartha:snowfall", { x: l.x, y: l.y + 7, z: l.z });
      } catch {
        // chunk not ready
      }
    }
    if (tick % 200 === 0) player.addEffect("night_vision", 20 * 30, { showParticles: false });
  }

  // Anything else that falls through the clouds is gone too.
  if (anyoneHere && tick % 10 === 0) {
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
