// The living atmosphere of Agartha: sounds and effects that never stop while
// a player is in the realm, and that change with where they are and the time
// of day.
//
//  * Everywhere: falling snow, drifting spirit lights, golden motes, rolling
//    mist. Never-ending sound beds (choir, high wind) with chimes, frost
//    sparkles, spirit-choir swells, gusts and a far-off horn layered on top.
//  * Night: the aurora blazes and sings, spirit lights multiply.
//  * Day: soft god rays fall through the haze.
//  * High up (mountains, the summit): the wind grows louder.
//  * Near landmarks: each one has its own effect, e.g. light rising from the
//    Pole, glowing leaves under Yggdrasil, spray at the icefalls.
//
// Particles only render within a few dozen blocks of the viewer, so effects
// are spawned around each player and at landmarks close to them.

import { world } from "@minecraft/server";
import { REALM, B } from "./config.js";
import { LAYOUT } from "./terrain.js";

// Bed lengths minus a 2 s overlap, so they never drop out.
const CHOIR_TICKS = 20 * 38; // 40 s choir
const WIND_BED_TICKS = 20 * 28; // 30 s wind
const AURORA_BED_TICKS = 20 * 28; // 30 s aurora song

const next = new Map(); // `${playerId}:${kind}` -> tick

// /scriptevent agartha:debug — logs what the ambience does to the content log.
let debug = false;
const counts = {};
export function setAmbienceDebug(on) {
  debug = on;
}
function count(kind) {
  if (debug) counts[kind] = (counts[kind] ?? 0) + 1;
}
export function ambienceReport() {
  const r = JSON.stringify(counts);
  for (const k of Object.keys(counts)) delete counts[k];
  return r;
}

function due(player, kind, tick, everyTicks, firstAfter = 0) {
  const key = `${player.id}:${kind}`;
  if (firstAfter && !next.has(key)) next.set(key, tick + firstAfter);
  if (tick < (next.get(key) ?? 0)) return false;
  next.set(key, tick + Math.max(1, Math.round(everyTicks)));
  return true;
}

export function forgetPlayer(playerId) {
  for (const k of [...next.keys()]) if (k.startsWith(`${playerId}:`)) next.delete(k);
}

function fx(dim, id, loc) {
  count(id);
  try {
    dim.spawnParticle(id, loc);
  } catch {
    // unloaded or unknown: cosmetic only
  }
}

function sound(dim, id, loc, opts) {
  count(id);
  try {
    dim.playSound(id, loc, opts);
  } catch {
    // cosmetic only
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const abs = (x, y, z) => ({ x: REALM.originX + x, y, z: REALM.originZ + z });

function isNight() {
  const t = world.getTimeOfDay();
  return t > 12800 && t < 23200;
}

// Landmarks with their own effects: [x, y, z, radius, effect(dim, tick)].
const M = LAYOUT.mythic;
const LANDMARKS = [
  // Light rising through the Pole's halos.
  { at: [LAYOUT.pole.x, B + 50, LAYOUT.pole.z], r: 90, every: 15, run: (dim) => {
    fx(dim, "agartha:holy_motes", abs(LAYOUT.pole.x + rnd(-10, 10), B + rnd(20, 80), LAYOUT.pole.z + rnd(-10, 10)));
  } },
  // Glowing leaves and lights beneath Yggdrasil.
  { at: [M.yggdrasil.x, B + 30, M.yggdrasil.z], r: 70, every: 12, run: (dim) => {
    fx(dim, "agartha:spirit_lights", abs(M.yggdrasil.x + rnd(-14, 14), B + rnd(12, 30), M.yggdrasil.z + rnd(-14, 14)));
    fx(dim, "agartha:holy_motes", abs(M.yggdrasil.x + rnd(-6, 6), B + rnd(4, 10), M.yggdrasil.z + rnd(-6, 6)));
  } },
  // Holy light over the temple and the colossus.
  { at: [LAYOUT.temple.x, B + 25, LAYOUT.temple.z], r: 90, every: 20, run: (dim) => {
    fx(dim, "agartha:holy_motes", abs(LAYOUT.temple.x + rnd(-14, 14), B + rnd(18, 34), LAYOUT.temple.z + rnd(-14, 10)));
    if (Math.random() < 0.3) fx(dim, "agartha:god_rays", abs(LAYOUT.temple.x + rnd(-6, 6), B + 60, LAYOUT.temple.z - 8));
  } },
  // The Heavenly Gates.
  { at: [0, B + 10, LAYOUT.gate.z], r: 70, every: 20, run: (dim) => {
    for (const sx of [-14, 14]) fx(dim, "agartha:holy_motes", abs(sx, B + rnd(30, 46), LAYOUT.gate.z));
  } },
  // Mist rolling over the frozen lake.
  { at: [LAYOUT.lake.x, B, LAYOUT.lake.z], r: 110, every: 25, run: (dim) => {
    fx(dim, "agartha:mist", abs(LAYOUT.lake.x + rnd(-60, 60), B, LAYOUT.lake.z + rnd(-40, 40)));
  } },
  // The summit shrine: aurora close overhead.
  { at: [LAYOUT.summit.x, LAYOUT.summit.y, LAYOUT.summit.z], r: 80, every: 30, run: (dim) => {
    fx(dim, "agartha:aurora", abs(LAYOUT.summit.x + rnd(-20, 20), LAYOUT.summit.y + rnd(20, 30), LAYOUT.summit.z + rnd(-20, 20)));
  } },
  // Heimdall's isle and the Bifröst.
  { at: [M.heimdall.x, M.heimdall.y + 20, M.heimdall.z], r: 80, every: 25, run: (dim) => {
    fx(dim, "agartha:holy_motes", abs(M.heimdall.x + rnd(-3, 3), M.heimdall.y + 30, M.heimdall.z + rnd(-3, 3)));
  } },
];

function near(loc, lm) {
  const p = abs(lm.at[0], lm.at[1], lm.at[2]);
  return Math.hypot(loc.x - p.x, loc.z - p.z) <= lm.r;
}

/** Called every tick for each player inside Agartha. */
export function ambientTick(player, tick) {
  const dim = player.dimension;
  const l = player.location;
  const night = isNight();
  const height = Math.max(0, l.y - B); // 0 on the snowfield, ~100 on the peaks
  const at = (dx, dy, dz) => ({ x: l.x + dx, y: l.y + dy, z: l.z + dz });

  // --- Effects all around the player ------------------------------------
  if (due(player, "snow", tick, 8)) fx(dim, "agartha:snowfall", at(rnd(-4, 4), 8, rnd(-4, 4)));
  if (due(player, "lights", tick, night ? 12 : 26)) fx(dim, "agartha:spirit_lights", at(0, 1.5, 0));
  if (due(player, "motes", tick, 40)) fx(dim, "agartha:holy_motes", at(rnd(-12, 12), rnd(0, 3), rnd(-12, 12)));
  if (due(player, "mist", tick, 35)) fx(dim, "agartha:mist", at(rnd(-14, 14), -0.5, rnd(-14, 14)));
  if (due(player, "aurora", tick, night ? 14 : 34)) {
    // Mostly toward the northern mountains, sometimes overhead.
    const a = (Math.random() < 0.7 ? -Math.PI / 2 : 0) + rnd(-0.7, 0.7) * Math.PI;
    const d = rnd(16, 40);
    fx(dim, "agartha:aurora", at(Math.cos(a) * d, rnd(28, 46), Math.sin(a) * d));
  }
  if (!night && due(player, "rays", tick, rnd(60, 140))) fx(dim, "agartha:god_rays", at(rnd(-35, 35), 32, rnd(-35, 35)));

  // --- Landmarks nearby ---------------------------------------------------
  for (let i = 0; i < LANDMARKS.length; i++) {
    const lm = LANDMARKS[i];
    if (near(l, lm) && due(player, `lm${i}`, tick, lm.every)) lm.run(dim);
  }

  // --- Sound --------------------------------------------------------------
  // Continuous beds, each replayed 2 s before it ends so the copies overlap
  // and there is never silence: the choir always, the high wind always (louder
  // up on the peaks), the aurora's song at night.
  if (due(player, "choir", tick, CHOIR_TICKS)) {
    count("agartha.ambience");
    player.playSound("agartha.ambience", { volume: 1 });
  }
  if (due(player, "windbed", tick, WIND_BED_TICKS)) {
    count("agartha.wind_bed");
    player.playSound("agartha.wind_bed", { volume: Math.min(1, 0.55 + height / 150) });
  }
  if (night && due(player, "aurorabed", tick, AURORA_BED_TICKS)) {
    count("agartha.aurora_bed");
    player.playSound("agartha.aurora_bed", { volume: 0.9 });
  }
  // Layers on top, so there is always something happening.
  if (due(player, "gust", tick, rnd(8, 16) * 20 * (height > 50 ? 0.6 : 1))) {
    count("agartha.wind");
    player.playSound("agartha.wind", { volume: Math.min(1, 0.45 + height / 120 + Math.random() * 0.2) });
  }
  const chimeRate = LANDMARKS.slice(0, 2).some((lm) => near(l, lm)) ? 0.6 : 1; // more chimes by the Pole and Yggdrasil
  if (due(player, "chime", tick, rnd(3, 7) * 20 * chimeRate)) {
    const a = Math.random() * Math.PI * 2;
    sound(dim, "agartha.chime", at(Math.cos(a) * rnd(3, 8), rnd(1, 4), Math.sin(a) * rnd(3, 8)), { pitch: rnd(0.85, 1.15) });
  }
  if (due(player, "sparkle", tick, rnd(2, 5) * 20 * (night ? 0.7 : 1))) {
    const a = Math.random() * Math.PI * 2;
    sound(dim, "agartha.sparkle", at(Math.cos(a) * rnd(2, 6), rnd(0, 3), Math.sin(a) * rnd(2, 6)), { pitch: rnd(0.9, 1.2) });
  }
  if (due(player, "swell", tick, rnd(18, 35) * 20)) {
    count("agartha.swell");
    player.playSound("agartha.swell", { volume: 0.8, pitch: rnd(0.95, 1.05) });
  }
  if (due(player, "horn", tick, rnd(90, 180) * 20, 20 * 60)) {
    // A far-off horn from the halls in the mountains.
    count("agartha.horn");
    player.playSound("agartha.horn", { volume: 0.7, pitch: rnd(0.9, 1.05) });
  }
  if (night && due(player, "nightbell", tick, rnd(30, 60) * 20)) {
    // A deep, distant bell from the temple in the night.
    sound(dim, "agartha.chime", at(rnd(-20, 20), 10, rnd(-20, 20)), { pitch: 0.5, volume: 1 });
  }
}
