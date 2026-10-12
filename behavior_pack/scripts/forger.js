// Forging in person: the operator is put in spectator mode and carried over
// the site while it builds (so its chunks load), then put back exactly where
// and how they were. Shared by Agartha and Hell.

import { world, GameMode } from "@minecraft/server";

const FORGER_KEY = "agartha:forger_restore";

export function readJson(v) {
  try {
    return JSON.parse(v ?? "null");
  } catch {
    return null;
  }
}

export function restoreForger(player) {
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
export function liftForger(player) {
  if (!player.getDynamicProperty(FORGER_KEY)) {
    const l = player.location;
    player.setDynamicProperty(FORGER_KEY, JSON.stringify({ mode: player.getGameMode(), x: l.x, y: l.y, z: l.z, dim: player.dimension.id }));
  }
  player.setGameMode(GameMode.Spectator);
}
