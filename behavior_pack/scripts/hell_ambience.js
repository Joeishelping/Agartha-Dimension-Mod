// The sound and air of Hell, around each soul in it.
//
//  * The pit: a groaning drone that never stops, wails echoing across the
//    shaft, whispers, distant moans; a heartbeat when the lava is close below;
//    ash falling, embers rising off the lava, soul-wisps drifting.
//  * The Spire: almost silence. A low, cold breath of sound; the clock
//    ticking backwards across the lake; the odd sound from the deep caves.
//    Ash falls slowly; cold mist creeps over the black ice.

import { HELL } from "./config.js";
import { PIT, CAVERN } from "./hell_layout.js";

const next = new Map(); // `${playerId}:${kind}` -> tick
function due(player, kind, tick, every, firstAfter = 0) {
  const key = `${player.id}:${kind}`;
  if (firstAfter && !next.has(key)) next.set(key, tick + firstAfter);
  if (tick < (next.get(key) ?? 0)) return false;
  next.set(key, tick + Math.max(1, Math.round(every)));
  return true;
}

export function forgetHellAmbience(playerId) {
  for (const k of [...next.keys()]) if (k.startsWith(`${playerId}:`)) next.delete(k);
}

const rnd = (a, b) => a + Math.random() * (b - a);

function fx(dim, id, loc) {
  try {
    dim.spawnParticle(id, loc);
  } catch {
    // cosmetic
  }
}

function sound(dim, id, loc, opts) {
  try {
    dim.playSound(id, loc, opts);
  } catch {
    // cosmetic
  }
}

const BED_TICKS = 20 * 58; // 60 s beds, overlapped by 2 s

/** Called every 2 ticks for each player in Hell. */
export function hellAmbience(player, tick, zone, lavaLevel) {
  const dim = player.dimension;
  const l = player.location;
  const at = (dx, dy, dz) => ({ x: l.x + dx, y: l.y + dy, z: l.z + dz });
  const rx = l.x - HELL.originX;
  const rz = l.z - HELL.originZ;

  if (zone === "pit") {
    if (due(player, "bed", tick, BED_TICKS)) player.playSound("agartha.hell_drone", { volume: 1 });
    if (due(player, "wail", tick, rnd(8, 16) * 20, 20 * 4)) {
      // From somewhere across the shaft.
      const a = Math.atan2(rz, rx) + Math.PI + rnd(-0.8, 0.8);
      sound(dim, "agartha.hell_wail", { x: HELL.originX + 9 * Math.cos(a), y: l.y + rnd(-15, 10), z: HELL.originZ + 9 * Math.sin(a) }, { volume: rnd(0.6, 1), pitch: rnd(0.75, 1.1) });
    }
    if (due(player, "whisper", tick, rnd(30, 60) * 20, 20 * 15)) player.playSound("agartha.hell_whisper", { volume: 0.6, pitch: rnd(0.85, 1.05) });
    if (due(player, "moan", tick, rnd(30, 55) * 20, 20 * 10)) player.playSound("mob.ghast.moan", { volume: 0.25, pitch: 0.5 });
    // The heartbeat quickens as the lava closes in.
    if (lavaLevel !== null && lavaLevel !== undefined) {
      const gap = l.y - lavaLevel;
      if (gap < 10 && due(player, "heart", tick, gap < 4 ? 14 : 22)) player.playSound("mob.warden.heartbeat", { volume: 1, pitch: gap < 4 ? 1.2 : 1 });
      if (gap < 40 && due(player, "embers", tick, 6)) {
        const a = rnd(0, Math.PI * 2);
        const r = rnd(1, PIT.airR - 1);
        fx(dim, "agartha:hell_embers", { x: HELL.originX + r * Math.cos(a), y: lavaLevel + 1, z: HELL.originZ + r * Math.sin(a) });
      }
    }
    if (due(player, "ash", tick, 8)) fx(dim, "agartha:hell_ash", at(rnd(-5, 5), 10, rnd(-5, 5)));
    if (due(player, "wisp", tick, 30)) fx(dim, "agartha:soul_wisp", at(rnd(-6, 6), rnd(-4, 2), rnd(-6, 6)));
    return;
  }

  // The Spire: chilling silence, broken only by the clock and the deep.
  if (due(player, "bed", tick, BED_TICKS)) player.playSound("agartha.abyss_bed", { volume: 0.9 });
  if (due(player, "cave", tick, rnd(45, 90) * 20, 20 * 30)) player.playSound("ambient.cave", { volume: 0.5, pitch: 0.7 });
  if (due(player, "whisper", tick, rnd(60, 120) * 20, 20 * 40)) player.playSound("agartha.hell_whisper", { volume: 0.4, pitch: 0.8 });
  if (due(player, "ash", tick, 14)) fx(dim, "agartha:hell_ash", at(rnd(-6, 6), 12, rnd(-6, 6)));
  if (l.y < CAVERN.lakeY + 6 && due(player, "mist", tick, 30)) fx(dim, "agartha:mist", at(rnd(-10, 10), -0.4, rnd(-10, 10)));
  if (due(player, "wisp", tick, 50)) fx(dim, "agartha:soul_wisp", at(rnd(-10, 10), rnd(0, 4), rnd(-10, 10)));
}
