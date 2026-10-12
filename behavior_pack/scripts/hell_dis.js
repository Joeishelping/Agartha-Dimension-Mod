// Layer II: the City of Dis.
//
//  * Three Seals bind the inner Gate of Dis: the Seal of Ash in the Mausoleum,
//    the Seal of Wind atop the Tower of the Furies, the Seal of Teeth in the
//    den of Garm. Stand at a Seal's altar to break it. It takes time, and its
//    guardians come for you while you hold your ground. Each broken Seal
//    shatters a lock on the Gate; when all three are broken, the Gate opens.
//  * The damned and the hounds roam the streets; Furies circle overhead.
//  * The Bridge of Sighs crumbles behind whoever runs across it.
//  * The river of fire spits; dread falls on the city now and then; the
//    Watcher stands where you will see it.
// The Seals stay broken while anyone is in Hell; when Hell empties, the Gate
// shuts and the Seals are whole again.

import { world, BlockPermutation } from "@minecraft/server";
import { HELL } from "./config.js";
import { DIS, SEALS, innerGateCells, BRIDGES, bridgeCells, riverX, RIVER_HALF, MAUSOLEUM, DEN, KENNEL } from "./hell_layout.js";
import { spawnCreature, spawnFury, creatures, clearCreatures, summonWatcher, DAMNED, HOUND } from "./hell_creatures.js";

const SEALS_KEY = "agartha:dis_seals";
const ox = HELL.originX;
const oz = HELL.originZ;
const abs = (x, y, z) => ({ x: ox + x, y, z: oz + z });
const rel = (l) => ({ x: l.x - ox, y: l.y, z: l.z - oz });
const F = DIS.floorY;

function dim() {
  return world.getDimension("overworld");
}

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

function fx(id, loc) {
  try {
    dim().spawnParticle(id, loc);
  } catch {
    // cosmetic
  }
}

function sound(id, loc, opts) {
  try {
    dim().playSound(id, loc, opts);
  } catch {
    // cosmetic
  }
}

export function sealBits() {
  return Number(world.getDynamicProperty(SEALS_KEY) ?? 0);
}

// ---------------------------------------------------------------------------
// The Seals and the Gate
// ---------------------------------------------------------------------------

const SEAL_TICKS = 120; // six seconds of holding your ground
const progress = SEALS.map(() => ({ ticks: 0, lastAmbush: -Infinity }));
const GATE = innerGateCells();

function ambush(i, tick) {
  const p = progress[i];
  if (tick - p.lastAmbush < 20 * 40) return;
  p.lastAmbush = tick;
  const s = SEALS[i];
  if (i === 0) {
    // The tombs burst open.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.random();
      const r = MAUSOLEUM.half + 2 + Math.random() * 4;
      spawnCreature(DAMNED, abs(s.x + Math.cos(a) * r + 0.5, F, s.z + Math.sin(a) * r + 0.5), "dis", k === 0 ? "agartha:as_champion" : undefined);
    }
  } else if (i === 1) {
    // The Furies come home to their nests.
    for (let k = 0; k < 3; k++) spawnFury(abs(s.x + (k - 1) * 10 + 0.5, s.y + 8, s.z + 12), "dis");
  } else {
    // Garm wakes, and the pack with him.
    spawnCreature(HOUND, abs(DEN.x - DEN.r - 2.5, F, DEN.z + 0.5), "dis", "agartha:as_garm");
    for (let k = 0; k < 4; k++) spawnCreature(HOUND, abs(KENNEL.minX + 4 + k * 6 + 0.5, F, KENNEL.minZ + 4.5), "dis");
  }
  for (const p2 of world.getAllPlayers()) {
    if (Math.hypot(p2.location.x - (ox + s.x), p2.location.z - (oz + s.z)) < 40) {
      p2.onScreenDisplay.setActionBar(`§4${["The tombs burst open!", "The Furies come home!", "Garm wakes!"][i]}`);
      p2.playSound("agartha.dread", { volume: 1 });
    }
  }
}

function lockCells(i) {
  return GATE.filter((g) => g.kind === i);
}

function breakSeal(i, players) {
  const bits = sealBits() | (1 << i);
  world.setDynamicProperty(SEALS_KEY, bits);
  const s = SEALS[i];
  setRel(s.x, s.y, s.z, "minecraft:obsidian");
  for (const g of lockCells(i)) setRel(g.x, g.y, g.z, "minecraft:iron_bars");
  const n = [0, 1, 2].filter((k) => bits & (1 << k)).length;
  for (const p of players) {
    p.onScreenDisplay.setTitle(`§6${s.name.replace(/^the /, "The ")} is broken`, { subtitle: n < 3 ? `§7${n} of 3. The Gate of Dis still holds.` : "§4The Gate of Dis is open.", fadeInDuration: 10, stayDuration: 60, fadeOutDuration: 20 });
    p.playSound(n < 3 ? "random.anvil_land" : "mob.wither.death", { volume: 0.8, pitch: 0.6 });
  }
  sound("random.explode", abs(s.x, s.y, s.z), { volume: 2, pitch: 0.5 });
  if (n === 3) openGate();
}

export function openGate() {
  for (const g of GATE) if (g.kind !== "frame") setRel(g.x, g.y, g.z, "minecraft:air");
  for (const p of world.getAllPlayers()) {
    if (!p.hasTag("agartha_in_hell")) continue;
    try {
      p.runCommand("camerashake add @s 0.4 2 rotational");
    } catch {
      // cosmetic
    }
  }
}

export function closeGate() {
  for (const g of GATE) {
    const id = g.kind === "frame" ? "minecraft:gilded_blackstone" : g.kind === "bars" ? "minecraft:iron_bars" : "minecraft:crying_obsidian";
    if (typeRel(g.x, g.y, g.z) !== id) setRel(g.x, g.y, g.z, id);
  }
  for (const s of SEALS) if (typeRel(s.x, s.y, s.z) !== "minecraft:crying_obsidian") setRel(s.x, s.y, s.z, "minecraft:crying_obsidian");
}

/** Hell is empty: the Seals mend and the Gate shuts. */
export function resetDis() {
  world.setDynamicProperty(SEALS_KEY, undefined);
  for (const p of progress) p.ticks = 0;
  closeGate();
  mendBridge();
  clearCreatures("dis");
}

function sealTick(tick, players) {
  const bits = sealBits();
  SEALS.forEach((s, i) => {
    if (bits & (1 << i)) return;
    const near = players.filter((p) => {
      const r = rel(p.location);
      return Math.hypot(r.x - s.x - 0.5, r.z - s.z - 0.5) < 3 && Math.abs(r.y - s.y) < 2.5;
    });
    const p = progress[i];
    if (!near.length) {
      p.ticks = Math.max(0, p.ticks - 4);
      return;
    }
    if (p.ticks === 0) ambush(i, tick);
    p.ticks += 2;
    const pct = Math.min(100, Math.round((p.ticks / SEAL_TICKS) * 100));
    for (const q of near) q.onScreenDisplay.setActionBar(`§6Breaking ${s.name}... §f${pct}%`);
    if (tick % 10 === 0) fx("agartha:soul_wisp", abs(s.x + 0.5, s.y + 1, s.z + 0.5));
    if (p.ticks >= SEAL_TICKS) {
      p.ticks = 0;
      breakSeal(i, players);
    }
  });
}

// The Gate follows the Seals. Blocks can only change where the world is
// loaded, so whenever someone comes near, the Gate (its locks and the
// altars) is put right: open once all three Seals are broken.
function syncGate(players) {
  const bits = sealBits();
  const g0 = GATE[Math.floor(GATE.length / 2)];
  const near = players.some((p) => {
    const r = rel(p.location);
    return Math.hypot(r.x - g0.x, r.z - g0.z) < 56;
  });
  if (near) {
    const open = bits === 7;
    for (const g of GATE) {
      let want;
      if (g.kind === "frame") want = "minecraft:gilded_blackstone";
      else if (open) want = "minecraft:air";
      else if (g.kind === "bars" || bits & (1 << g.kind)) want = "minecraft:iron_bars";
      else want = "minecraft:crying_obsidian";
      if (typeRel(g.x, g.y, g.z) !== want) setRel(g.x, g.y, g.z, want);
    }
  }
  SEALS.forEach((s, i) => {
    const want = bits & (1 << i) ? "minecraft:obsidian" : "minecraft:crying_obsidian";
    const t = typeRel(s.x, s.y, s.z);
    if (t && t !== want) setRel(s.x, s.y, s.z, want);
  });
}

// Telling players at the Gate what holds it.
const toldAtGate = new Map();
function gateTick(tick, players) {
  const g = GATE[Math.floor(GATE.length / 2)];
  const bits = sealBits();
  if (bits === 7) return;
  for (const p of players) {
    const r = rel(p.location);
    if (Math.hypot(r.x - g.x, r.z - g.z) > 9) continue;
    if (tick - (toldAtGate.get(p.id) ?? -Infinity) < 20 * 20) continue;
    toldAtGate.set(p.id, tick);
    const left = SEALS.filter((_, i) => !(bits & (1 << i))).map((s) => `${s.name} ${s.where}`);
    p.sendMessage(`§4The Gate of Dis is shut. §7Still unbroken: ${left.join("; ")}.`);
  }
}

// ---------------------------------------------------------------------------
// The Bridge of Sighs
// ---------------------------------------------------------------------------

const SIGHS = BRIDGES.find((b) => b.crumbling);
const SIGH_CELLS = bridgeCells(SIGHS);
const SIGH_XS = [...new Set(SIGH_CELLS.map((c) => c.x))].sort((a, b) => a - b);
const bridge = { state: "whole", from: 0, at: 0, i: 0 };

function bridgeTick(tick, players) {
  if (bridge.state === "whole") {
    for (const p of players) {
      const r = rel(p.location);
      if (Math.abs(r.z - SIGHS.z - 0.5) > 2 || Math.abs(r.y - F) > 1.5) continue;
      const x = Math.floor(r.x);
      if (x < SIGH_XS[0] || x > SIGH_XS[SIGH_XS.length - 1]) continue;
      // It starts to give way from the end they stepped on.
      bridge.state = "falling";
      bridge.from = x - SIGH_XS[0] < SIGH_XS[SIGH_XS.length - 1] - x ? 1 : -1;
      bridge.i = 0;
      bridge.at = tick + 10;
      sound("random.anvil_break", abs(x, F, SIGHS.z), { volume: 1, pitch: 0.5 });
      p.onScreenDisplay.setActionBar("§4§oThe bridge groans. Run.");
      break;
    }
  } else if (bridge.state === "falling" && tick >= bridge.at) {
    const x = bridge.from > 0 ? SIGH_XS[bridge.i] : SIGH_XS[SIGH_XS.length - 1 - bridge.i];
    for (const c of SIGH_CELLS) if (c.x === x) setRel(c.x, F - 1, c.z, "minecraft:air");
    sound("dig.stone", abs(x, F, SIGHS.z), { volume: 1, pitch: 0.6 });
    fx("agartha:hell_ash", abs(x + 0.5, F, SIGHS.z + 0.5));
    bridge.i++;
    bridge.at = tick + 4;
    if (bridge.i >= SIGH_XS.length) {
      bridge.state = "gone";
      bridge.at = tick + 20 * 25;
    }
  } else if (bridge.state === "gone" && tick >= bridge.at) {
    mendBridge();
  }
}

function mendBridge() {
  for (const c of SIGH_CELLS) {
    const id = c.edge ? "minecraft:cracked_deepslate_tiles" : "minecraft:cracked_deepslate_bricks";
    if (typeRel(c.x, F - 1, c.z) !== id) setRel(c.x, F - 1, c.z, id);
  }
  bridge.state = "whole";
}

// ---------------------------------------------------------------------------
// The city's own malice: hunters, geysers, dread, the Watcher
// ---------------------------------------------------------------------------

let nextHunt = 0;
let nextDread = 0;
let nextWatcher = 0;

function floorSpot(x, z) {
  const y = F;
  const ok = typeRel(x, y, z) === "minecraft:air" && typeRel(x, y + 1, z) === "minecraft:air" && typeRel(x, y - 1, z) !== "minecraft:air" && typeRel(x, y - 1, z) !== "minecraft:lava";
  return ok ? abs(x + 0.5, y, z + 0.5) : undefined;
}

function huntTick(tick, players) {
  if (tick < nextHunt) return;
  nextHunt = tick + 20 * 9;
  const all = creatures("dis");
  const cap = 6 + 3 * players.length;
  if (all.length >= cap) return;
  for (const p of players) {
    const r = rel(p.location);
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0, made = 0; k < 10 && made < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 16 + Math.random() * 12;
      const x = Math.floor(r.x + Math.cos(a) * d), z = Math.floor(r.z + Math.sin(a) * d);
      if (Math.hypot(x - DIS.x, z - DIS.z) > DIS.wallR - 2) continue;
      const at = floorSpot(x, z);
      if (!at) continue;
      spawnCreature(Math.random() < 0.6 ? DAMNED : HOUND, at, "dis", Math.random() < 0.12 ? "agartha:as_champion" : undefined);
      made++;
    }
  }
  // Furies keep watch over the city.
  let flying = 0;
  for (const e of all) if (e.typeId === "agartha:fury") flying++;
  if (flying < 2) {
    const p = players[Math.floor(Math.random() * players.length)];
    spawnFury({ x: p.location.x + 14, y: p.location.y + 14, z: p.location.z + 6 }, "dis");
  }
}

function geyserTick(tick, players) {
  if (tick % 30 !== 0) return;
  for (const p of players) {
    const r = rel(p.location);
    const z = Math.floor(r.z + (Math.random() - 0.5) * 30);
    const x = Math.floor(riverX(z) + (Math.random() - 0.5) * RIVER_HALF * 2);
    if (Math.hypot(x - r.x, z - r.z) > 30) continue;
    const at = abs(x + 0.5, F - 3, z + 0.5);
    fx("agartha:fire_jet", at);
    sound("mob.blaze.shoot", at, { volume: 1.2, pitch: 0.5 });
    for (const q of players) {
      const rq = rel(q.location);
      if (Math.hypot(rq.x - x - 0.5, rq.z - z - 0.5) < 2.5 && rq.y < F + 4) {
        try {
          q.setOnFire(4, true);
          q.applyDamage(3, { cause: "fire" });
        } catch {
          // gone
        }
      }
    }
  }
}

function dreadTick(tick, players) {
  if (!nextDread) nextDread = tick + 20 * (50 + Math.random() * 40);
  if (tick < nextDread) return;
  nextDread = tick + 20 * (70 + Math.random() * 60);
  for (const p of players) {
    p.addEffect("darkness", 20 * 8, { showParticles: false });
    p.playSound("agartha.dread", { volume: 1 });
    p.onScreenDisplay.setActionBar("§4§oSomething in the city has noticed you.");
    // They come from behind.
    const v = p.getViewDirection();
    const r = rel(p.location);
    for (let k = 0; k < 2; k++) {
      const x = Math.floor(r.x - v.x * (7 + k * 2) + (k ? 2 : -2)), z = Math.floor(r.z - v.z * (7 + k * 2));
      const at = floorSpot(x, z);
      if (at) spawnCreature(DAMNED, at, "dis");
    }
  }
}

function watcherDue(tick, players) {
  if (tick < nextWatcher) return;
  nextWatcher = tick + 20 * (60 + Math.random() * 60);
  const p = players[Math.floor(Math.random() * players.length)];
  const v = p.getViewDirection();
  const r = rel(p.location);
  const len = Math.hypot(v.x, v.z) || 1;
  for (const d of [26, 22, 30]) {
    const x = Math.floor(r.x + (v.x / len) * d), z = Math.floor(r.z + (v.z / len) * d);
    const at = floorSpot(x, z);
    if (at && summonWatcher(p, at, tick)) return;
  }
}

/** Called every 2 ticks with the players in Dis. */
export function disTick(tick, players) {
  if (!players.length) return;
  sealTick(tick, players);
  if (tick % 20 === 0) gateTick(tick, players);
  if (tick % 40 === 0) syncGate(players);
  bridgeTick(tick, players);
  huntTick(tick, players);
  geyserTick(tick, players);
  dreadTick(tick, players);
  watcherDue(tick, players);
}

