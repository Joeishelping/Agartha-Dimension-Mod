// Layer II: the City of Dis.
//
//  * Three Seals bind the inner Gate of Dis, and each is won differently:
//      - the Seal of Ash: the crypt under the Mausoleum. Nine tombs, one
//        riddle. Press the button of the right tomb; the wrong ones wake.
//      - the Seal of Wind: race the lava up the Tower of the Furies while the
//        stair crumbles beneath you, and touch the Seal at the top.
//      - the Seal of Teeth: kill Garm, the Hound of Hel, in his kennel.
//    Each broken Seal shatters a lock on the Gate; with all three, it opens.
//  * The Ferryman's raft of bones crosses the river of fire (hounds wait on
//    the far bank); the Bridge of Sighs crumbles behind whoever runs it.
//  * The Gaoler walks the streets. He cannot be hurt, and he only hears you
//    when you run.
//  * The damned and the hounds roam; Furies circle; the river spits; dread
//    falls now and then; the Watcher stands where you will see it.
// The Seals stay broken while anyone is in Hell; when Hell empties, the Gate
// shuts, the tombs close, and the Seals are whole again.

import { world, system, BlockPermutation } from "@minecraft/server";
import { HELL } from "./config.js";
import { DIS, SEALS, innerGateCells, BRIDGES, bridgeCells, riverX, RIVER_HALF, MAUSOLEUM, DEN, KENNEL, CRYPT, FURY_TOWER, FERRY } from "./hell_layout.js";
import { cryptTomb, towerStair } from "./hell_blueprint.js";
import { spawnCreature, spawnFury, creatures, clearCreatures, summonWatcher, DAMNED, HOUND, FURY, GAOLER, FERRYMAN } from "./hell_creatures.js";

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

const GATE = innerGateCells();

function hellPlayers() {
  return world.getAllPlayers().filter((p) => p?.isValid && p.hasTag("agartha_in_hell"));
}

function near(p, x, z, r) {
  const q = rel(p.location);
  return Math.hypot(q.x - x, q.z - z) < r;
}

/** Sets blocks through the blueprint's own drawing code (only what differs). */
const live = {
  set(x, y, z, id, states) {
    if (!states && typeRel(x, y, z) === id) return;
    setRel(x, y, z, id, states);
  },
  fill(x1, y1, z1, x2, y2, z2, id, states) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) this.set(x, y, z, id, states);
  },
};

function cmd(c) {
  try {
    dim().runCommand(c);
  } catch {
    // unloaded
  }
}

function lockCells(i) {
  return GATE.filter((g) => g.kind === i);
}

function breakSeal(i, players = hellPlayers()) {
  if (sealBits() & (1 << i)) return;
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

/** Hell is empty: the Seals mend, the Gate shuts, the tombs close, the tower drains. */
export function resetDis() {
  world.setDynamicProperty(SEALS_KEY, undefined);
  world.setDynamicProperty(CRYPT_KEY, undefined);
  closeGate();
  mendBridge();
  if (race.state !== "draining") race.state = "idle"; // any lava left in the tower drains when someone next comes near
  garm.id = undefined;
  clearCreatures("dis");
}

/** Whether anything in Dis needs putting back once Hell is empty. */
export function disNeedsReset() {
  return !!sealBits() || world.getDynamicProperty(CRYPT_KEY) !== undefined || creatures("dis").length > 0;
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
  if (bridge.state === "whole" && tick % 100 === 0 && players.some((p) => near(p, riverX(SIGHS.z), SIGHS.z, 40))) mendBridge();
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
// The Seal of Ash: the crypt of nine tombs
// ---------------------------------------------------------------------------

const CRYPT_KEY = "agartha:dis_crypt"; // { answer, open } (open: bits of opened tombs)
const TOMB_AT = new Map(CRYPT.tombs.map((t, i) => [`${ox + t.button.x},${t.button.y},${oz + t.button.z}`, i]));

function cryptState() {
  let st;
  try {
    st = JSON.parse(String(world.getDynamicProperty(CRYPT_KEY) ?? ""));
  } catch {
    st = undefined;
  }
  if (!st || typeof st.answer !== "number") {
    st = { answer: Math.floor(Math.random() * CRYPT.tombs.length), open: 0 };
    world.setDynamicProperty(CRYPT_KEY, JSON.stringify(st));
  }
  return st;
}

function inCrypt(p) {
  const r = rel(p.location);
  return r.x >= CRYPT.minX && r.x < CRYPT.maxX + 1 && r.z >= CRYPT.minZ && r.z < CRYPT.maxZ + 1 && r.y < DIS.floorY - 1 && r.y >= CRYPT.floorY - 1;
}

function riddleLines(text) {
  const words = text.split(" ");
  const lines = [""];
  for (const w of words) {
    if ((lines[lines.length - 1] + " " + w).trim().length > 15) lines.push(w);
    else lines[lines.length - 1] = (lines[lines.length - 1] + " " + w).trim();
  }
  return lines.slice(0, 3);
}

// Tombs, sign and lids follow the stored state whenever someone is near.
function syncCrypt() {
  const st = cryptState();
  CRYPT.tombs.forEach((t, i) => {
    const open = !!(st.open & (1 << i));
    const hasButton = typeRel(t.button.x, t.button.y, t.button.z) === "minecraft:polished_blackstone_button";
    if (typeRel(t.button.x, t.button.y, t.button.z) === undefined) return;
    if (open === hasButton) cryptTomb(live, t, open);
  });
  try {
    const sign = dim().getBlock(abs(CRYPT.sign.x, CRYPT.sign.y, CRYPT.sign.z))?.getComponent("minecraft:sign");
    const text = ["§8Which is the true one?", ...riddleLines(CRYPT.tombs[st.answer].riddle).map((l) => `§7${l}`)].join("\n");
    if (sign && sign.getText() !== text) sign.setText(text);
  } catch {
    // unloaded
  }
}

const toldInCrypt = new Map();
function cryptTick(tick, players) {
  if (tick % 40 === 0 && players.some((p) => near(p, MAUSOLEUM.x, MAUSOLEUM.z, 26))) syncCrypt();
  if (sealBits() & 1) return;
  for (const p of players) {
    if (!inCrypt(p) || tick - (toldInCrypt.get(p.id) ?? -Infinity) < 20 * 40) continue;
    toldInCrypt.set(p.id, tick);
    const st = cryptState();
    p.sendMessage(`§8Nine lie here. One holds the Seal of Ash. §7"${CRYPT.tombs[st.answer].riddle}" §8Press the button of the true one. Wake the wrong one and it wakes you.`);
    p.playSound("agartha.hell_whisper", { volume: 0.8 });
  }
}

world.afterEvents.buttonPush.subscribe(({ block, source }) => {
  const i = TOMB_AT.get(`${block.location.x},${block.location.y},${block.location.z}`);
  if (i === undefined) return;
  system.run(() => pressTomb(i, source?.typeId === "minecraft:player" ? source : undefined));
});

function pressTomb(i, player) {
  if (sealBits() & 1) return;
  const st = cryptState();
  if (st.open & (1 << i)) return;
  st.open |= 1 << i;
  world.setDynamicProperty(CRYPT_KEY, JSON.stringify(st));
  const t = CRYPT.tombs[i];
  cryptTomb(live, t, true);
  const at = abs(t.x + 1, CRYPT.floorY + 1, t.z + 1.5);
  sound("random.door_open", at, { volume: 1, pitch: 0.4 });
  fx("agartha:soul_wisp", at);
  if (i === st.answer) {
    fx("agartha:fire_jet", at);
    player?.sendMessage("§6The true one gives up the Seal of Ash.");
    breakSeal(0);
    return;
  }
  // The wrong grave: its dead come out, and the fire with them.
  sound("agartha.damned_moan", at, { volume: 2, pitch: 0.6 });
  for (let k = 0; k < 3; k++) spawnCreature(DAMNED, { x: at.x + (k - 1) * 0.6, y: at.y, z: at.z }, "dis", k === 0 && Math.random() < 0.4 ? "agartha:as_champion" : undefined);
  if (player) {
    try {
      player.setOnFire(5, true);
      player.onScreenDisplay.setActionBar("§4Not that one.");
    } catch {
      // gone
    }
  }
}

// ---------------------------------------------------------------------------
// The Seal of Wind: the race up the Tower of the Furies
// ---------------------------------------------------------------------------

const TOWER_KEY = "agartha:dis_tower"; // set while the tower holds lava
const T = FURY_TOWER;
const T_IN = { minX: T.minX + 1, maxX: T.maxX - 1, minZ: T.minZ + 1, maxZ: T.maxZ - 1 };
const RACE_BASE = F + 4; // the lava's floor (above the door)
const RACE_TOP = T.topY - 2;
const RACE_DELAY = 50;
const RACE_RISE = 10;
// Every block of the stair, by height, so it can crumble just above the lava.
const STAIR_BY_Y = new Map();
towerStair({
  set(x, y, z, id) {
    if (id === "minecraft:air") return;
    if (!STAIR_BY_Y.has(y)) STAIR_BY_Y.set(y, []);
    STAIR_BY_Y.get(y).push([x, z]);
  },
  fill() {},
});
const race = { state: "idle", level: 0, at: 0, emptySince: 0, cooldown: 0 };

function inTower(p) {
  const r = rel(p.location);
  return r.x >= T_IN.minX && r.x < T_IN.maxX + 1 && r.z >= T_IN.minZ && r.z < T_IN.maxZ + 1 && r.y >= F - 1 && r.y < T.topY + 4;
}

function layer(y, id, replace) {
  cmd(`fill ${ox + T_IN.minX} ${y} ${oz + T_IN.minZ} ${ox + T_IN.maxX} ${y} ${oz + T_IN.maxZ} ${id} replace ${replace}`);
}

function startRace(tick, players) {
  race.state = "rising";
  race.level = RACE_BASE - 1;
  race.at = tick + RACE_DELAY;
  race.emptySince = 0;
  world.setDynamicProperty(TOWER_KEY, true);
  layer(RACE_BASE - 1, "minecraft:magma", "air"); // a false floor, so the lava cannot pour out of the door
  sound("mob.wither.spawn", abs(T.minX + 7, F + 10, T.minZ + 7), { volume: 1, pitch: 0.6 });
  for (const p of players) {
    p.onScreenDisplay.setTitle("§4Climb.", { subtitle: "§7the tower is filling with fire", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
    try {
      p.runCommand("camerashake add @s 0.3 2 positional");
    } catch {
      // cosmetic
    }
  }
  const s = SEALS[1];
  for (let k = 0; k < 2; k++) spawnFury(abs(s.x + (k ? 6 : -6), s.y + 4, s.z), "dis");
}

function* drainTower() {
  for (let y = RACE_TOP + 1; y >= RACE_BASE - 1; y--) {
    layer(y, "minecraft:air", "lava");
    layer(y, "minecraft:air", "flowing_lava");
    yield;
  }
  layer(RACE_BASE - 1, "minecraft:air", "magma");
  yield;
  towerStair(live);
  world.setDynamicProperty(TOWER_KEY, undefined);
  race.state = "idle";
}

function endRace() {
  if (race.state === "draining") return;
  race.state = "draining";
  race.cooldown = system.currentTick + 20 * 10;
  system.runJob(drainTower());
}

function raceTick(tick, players) {
  const won = !!(sealBits() & 2);
  const inside = players.filter(inTower);
  if (race.state === "idle") {
    if (world.getDynamicProperty(TOWER_KEY) && players.some((p) => near(p, T.minX + 7, T.minZ + 7, 30))) endRace(); // left over from before a restart
    else if (!won && tick >= race.cooldown && inside.some((p) => rel(p.location).y >= F + 5)) startRace(tick, inside);
    return;
  }
  if (race.state === "draining") return;
  if (race.state === "won") {
    if (tick >= race.at) endRace();
    return;
  }
  // Rising.
  if (!inside.length) {
    race.emptySince ||= tick;
    if (tick - race.emptySince > 60) endRace();
    return;
  }
  race.emptySince = 0;
  const s = SEALS[1];
  for (const p of inside) {
    const r = rel(p.location);
    if (r.y >= s.y - 0.2 && Math.hypot(r.x - s.x - 0.5, r.z - s.z - 0.5) < 2.2) {
      race.state = "won";
      race.at = tick + 60;
      breakSeal(1);
      return;
    }
  }
  if (tick < race.at || race.level >= RACE_TOP) return;
  race.at = tick + RACE_RISE;
  race.level++;
  layer(race.level, "minecraft:lava", "air");
  // The stair two steps above the fire gives way.
  const crumble = STAIR_BY_Y.get(race.level + 2) ?? [];
  for (const [x, z] of crumble) setRel(x, race.level + 2, z, "minecraft:air");
  if (crumble.length) {
    const [x, z] = crumble[0];
    sound("dig.stone", abs(x, race.level + 2, z), { volume: 1, pitch: 0.5 });
    fx("agartha:hell_ash", abs(x + 0.5, race.level + 2, z + 0.5));
  }
  if (race.level % 4 === 0) for (const p of inside) p.onScreenDisplay.setActionBar(`§6The fire rises... §7${Math.max(0, Math.floor(s.y - rel(p.location).y))} to the Seal`);
}

// ---------------------------------------------------------------------------
// The Seal of Teeth: Garm, the Hound of Hel
// ---------------------------------------------------------------------------

const GARM_TAG = "agartha_garm";
const garm = { id: undefined, nextCharge: 0, charging: 0, hit: false, nextHowl: 0, nextBreath: 0, breathing: 0, enraged: false, lonely: 0 };

function inKennel(p) {
  const r = rel(p.location);
  return r.x > KENNEL.minX && r.x < KENNEL.maxX && r.z > KENNEL.minZ && r.z < KENNEL.maxZ && Math.abs(r.y - F) < 4;
}

function garmEntity() {
  if (!garm.id) return undefined;
  const e = world.getEntity(garm.id);
  return e?.isValid ? e : undefined;
}

function wakeGarm(tick, players) {
  const e = spawnCreature(HOUND, abs(DEN.x - DEN.r - 2.5, F, DEN.z + 0.5), "dis", "agartha:as_garm");
  if (!e) return;
  e.addTag(GARM_TAG);
  e.nameTag = "Garm, Hound of Hel";
  Object.assign(garm, { id: e.id, nextCharge: tick + 60, charging: 0, nextHowl: tick + 20 * 12, nextBreath: tick + 20 * 6, breathing: 0, enraged: false, lonely: 0 });
  for (let k = 0; k < 2; k++) spawnCreature(HOUND, abs(DEN.x - DEN.r - 3.5, F, DEN.z + (k ? 3.5 : -2.5)), "dis");
  sound("agartha.hound_howl", e.location, { volume: 4, pitch: 0.5 });
  for (const p of players) {
    p.onScreenDisplay.setTitle("§4GARM", { subtitle: "§7the Hound of Hel. Kill him for the Seal of Teeth.", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 20 });
    try {
      p.runCommand("camerashake add @s 0.5 1.5 rotational");
    } catch {
      // cosmetic
    }
  }
}

function health(e) {
  const h = e.getComponent("minecraft:health");
  return h ? h.currentValue / h.effectiveMax : 1;
}

function garmTick(tick, players) {
  if (sealBits() & 4) return;
  const e = garmEntity();
  if (!e) {
    garm.id = undefined;
    if (players.some(inKennel)) wakeGarm(tick, players);
    return;
  }
  const l = e.location;
  let target, best = 28;
  for (const p of players) {
    const d = Math.hypot(p.location.x - l.x, p.location.z - l.z);
    if (d < best && Math.abs(p.location.y - l.y) < 8) {
      best = d;
      target = p;
    }
  }
  if (!target) {
    // Nobody to hunt: after a while he goes back to sleep (and wakes whole).
    garm.lonely ||= tick;
    if (tick - garm.lonely > 20 * 30) {
      try {
        e.remove();
      } catch {
        // gone
      }
      garm.id = undefined;
    }
    return;
  }
  garm.lonely = 0;
  const hp = health(e);
  if (!garm.enraged && hp < 0.5) {
    garm.enraged = true;
    sound("agartha.hound_howl", l, { volume: 4, pitch: 0.4 });
    for (const p of players) if (Math.hypot(p.location.x - l.x, p.location.z - l.z) < 40) p.onScreenDisplay.setActionBar("§4Garm's throat fills with fire.");
  }
  const tl = target.location;
  const dx = tl.x - l.x, dz = tl.z - l.z, d = Math.hypot(dx, dz) || 1;
  // The charge: a growl, a crouch, then he comes like a falling wall.
  if (!garm.charging && tick >= garm.nextCharge && d > 4 && d < 22) {
    garm.charging = tick + 16;
    garm.hit = false;
    sound("agartha.hound_growl", l, { volume: 3, pitch: 0.5 });
    fx("agartha:hell_ash", { x: l.x, y: l.y + 0.5, z: l.z });
  }
  if (garm.charging && tick === garm.charging) {
    try {
      e.applyImpulse({ x: (dx / d) * 2.4, y: 0.35, z: (dz / d) * 2.4 });
    } catch {
      // busy
    }
  }
  if (garm.charging && tick >= garm.charging && tick < garm.charging + 24) {
    if (!garm.hit) {
      for (const p of players) {
        if (Math.hypot(p.location.x - l.x, p.location.y - l.y, p.location.z - l.z) > 3.2) continue;
        garm.hit = true;
        try {
          p.applyDamage(9, { cause: "entityAttack", damagingEntity: e });
          p.applyKnockback({ x: (dx / d) * 2, z: (dz / d) * 2 }, 0.6);
        } catch {
          try {
            p.applyKnockback(dx / d, dz / d, 2, 0.6);
          } catch {
            // gone
          }
        }
      }
    }
  } else if (garm.charging && tick >= garm.charging + 24) {
    garm.charging = 0;
    garm.nextCharge = tick + 20 * (garm.enraged ? 5 : 7) + Math.floor(Math.random() * 40);
  }
  // The howl: the pack answers.
  if (tick >= garm.nextHowl) {
    garm.nextHowl = tick + 20 * 22;
    sound("agartha.hound_howl", l, { volume: 4, pitch: 0.6 });
    const pack = creatures("dis").filter((c) => c.typeId === HOUND).length;
    if (pack < 7) for (let k = 0; k < 2; k++) spawnCreature(HOUND, { x: l.x + (k ? 2 : -2), y: l.y, z: l.z + (k ? -2 : 2) }, "dis");
  }
  // Below half his blood, he breathes fire.
  if (garm.enraged && !garm.breathing && tick >= garm.nextBreath && d < 10) {
    garm.breathing = tick + 10;
    sound("mob.blaze.breathe", l, { volume: 3, pitch: 0.5 });
  }
  if (garm.breathing && tick >= garm.breathing) {
    const v = { x: dx / d, z: dz / d };
    try {
      e.teleport(l, { facingLocation: tl });
    } catch {
      // busy
    }
    if (tick % 4 === 0) {
      for (let k = 2; k <= 9; k += 2) fx("agartha:fire_jet", { x: l.x + v.x * k, y: l.y + 1.2, z: l.z + v.z * k });
      sound("mob.blaze.shoot", l, { volume: 2, pitch: 0.4 });
      for (const p of players) {
        const px = p.location.x - l.x, pz = p.location.z - l.z, pd = Math.hypot(px, pz);
        if (pd > 10 || pd < 0.1 || (px * v.x + pz * v.z) / pd < 0.8 || Math.abs(p.location.y - l.y) > 4) continue;
        try {
          p.setOnFire(5, true);
          p.applyDamage(3, { cause: "fire" });
        } catch {
          // gone
        }
      }
    }
    if (tick >= garm.breathing + 30) {
      garm.breathing = 0;
      garm.nextBreath = tick + 20 * 6;
    }
  }
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (!garm.id || deadEntity?.id !== garm.id) return;
  garm.id = undefined;
  system.run(() => {
    try {
      sound("agartha.hound_death", deadEntity.location, { volume: 4, pitch: 0.4 });
    } catch {
      // gone
    }
    breakSeal(2);
  });
});

// ---------------------------------------------------------------------------
// The Ferryman
// ---------------------------------------------------------------------------

const RAFT_W = 3;
const FERRY_STEP = 16;
const ferry = { x: FERRY.west, dir: 0, at: 0, wait: 0, entity: undefined, normal: false, call: 0, rest: 0 };

function raftCells(x) {
  const out = [];
  for (let dx = 0; dx < RAFT_W; dx++) for (let z = FERRY.z - 1; z <= FERRY.z + 1; z++) out.push([x + dx, z]);
  return out;
}

function onRaft(p) {
  const r = rel(p.location);
  return r.x >= ferry.x - 0.3 && r.x < ferry.x + RAFT_W + 0.3 && Math.abs(r.z - FERRY.z - 0.5) < 1.8 && r.y >= FERRY.y + 0.5 && r.y < FERRY.y + 3;
}

function ferrymanSpot() {
  return abs(ferry.x + 1.5, FERRY.y + 1, FERRY.z + 1.6);
}

function keepFerryman() {
  if (ferry.entity?.isValid) return;
  ferry.entity = undefined;
  const found = creatures("dis").find((e) => e.typeId === FERRYMAN);
  ferry.entity = found ?? spawnCreature(FERRYMAN, ferrymanSpot(), "dis");
}

/** After a load the raft may be anywhere on the river: put it back at the west dock. */
function normalizeRaft() {
  for (let x = FERRY.west; x <= FERRY.east + RAFT_W - 1; x++) {
    for (let z = FERRY.z - 1; z <= FERRY.z + 1; z++) {
      const want = x < FERRY.west + RAFT_W ? "minecraft:bone_block" : "minecraft:air";
      const t = typeRel(x, FERRY.y, z);
      if (t === undefined) return false;
      if (t !== want) setRel(x, FERRY.y, z, want, want === "minecraft:air" ? undefined : { pillar_axis: "x" });
    }
  }
  ferry.x = FERRY.west;
  ferry.dir = 0;
  return true;
}

function moveRaft(dx, riders) {
  const lead = dx > 0 ? ferry.x + RAFT_W : ferry.x - 1;
  const tail = dx > 0 ? ferry.x : ferry.x + RAFT_W - 1;
  for (let z = FERRY.z - 1; z <= FERRY.z + 1; z++) {
    setRel(lead, FERRY.y, z, "minecraft:bone_block", { pillar_axis: "x" });
    setRel(tail, FERRY.y, z, "minecraft:air");
  }
  ferry.x += dx;
  for (const p of riders) {
    try {
      const l = p.location;
      p.teleport({ x: l.x + dx, y: Math.max(l.y, FERRY.y + 1), z: l.z }, { rotation: p.getRotation() });
    } catch {
      // gone
    }
  }
  try {
    ferry.entity?.teleport(ferrymanSpot(), { facingLocation: abs(ferry.x + (dx > 0 ? 10 : -10), FERRY.y + 2, FERRY.z + 0.5) });
  } catch {
    // unloaded
  }
  sound("random.splash", abs(ferry.x + 1, FERRY.y, FERRY.z), { volume: 0.4, pitch: 0.4 });
  fx("agartha:hell_embers", abs(ferry.x + (dx > 0 ? 3 : 0), FERRY.y, FERRY.z + 0.5));
}

function ferryTick(tick, players) {
  const close = players.filter((p) => near(p, (FERRY.west + FERRY.east) / 2 + 1, FERRY.z, 26));
  if (!close.length) return;
  if (!ferry.normal) {
    ferry.normal = normalizeRaft();
    if (!ferry.normal) return;
  }
  if (tick % 40 === 0) keepFerryman();
  const atWest = ferry.x === FERRY.west, atEast = ferry.x === FERRY.east;
  if (ferry.dir === 0) {
    if (tick < ferry.rest) return; // he waits a while at the dock for you to step off
    const riders = close.filter(onRaft);
    if (riders.length) {
      ferry.wait += 2;
      if (ferry.wait === 2) for (const p of riders) p.onScreenDisplay.setActionBar("§7The Ferryman takes his pole. §8Hold still.");
      if (ferry.wait >= 20) {
        ferry.wait = 0;
        ferry.dir = atWest ? 1 : -1;
        ferry.at = tick + FERRY_STEP;
        // Hounds wait on the far bank.
        const bankX = atWest ? FERRY.dockE + 3 : FERRY.dockW - 3;
        for (let k = 0; k < 2; k++) {
          const at = floorSpot(bankX + (atWest ? k : -k), FERRY.z + (k ? 2 : -2));
          if (at) spawnCreature(HOUND, at, "dis");
        }
        sound("agartha.hound_howl", abs(bankX, F, FERRY.z), { volume: 2, pitch: 0.9 });
      }
      return;
    }
    ferry.wait = 0;
    // Calling him from the dock he is not at.
    const caller = close.find((p) => {
      const r = rel(p.location);
      if (Math.abs(r.z - FERRY.z - 0.5) > 2.5 || Math.abs(r.y - F) > 1.5) return false;
      return (atWest && Math.abs(r.x - FERRY.dockE - 0.5) < 2) || (atEast && Math.abs(r.x - FERRY.dockW - 0.5) < 2);
    });
    if (caller) {
      ferry.call += 2;
      if (ferry.call === 2) caller.onScreenDisplay.setActionBar("§7You call across the fire. §8The Ferryman turns.");
      if (ferry.call >= 30) {
        ferry.call = 0;
        ferry.dir = atWest ? 1 : -1;
        ferry.at = tick + FERRY_STEP;
      }
    } else ferry.call = 0;
    return;
  }
  if (tick < ferry.at) return;
  ferry.at = tick + FERRY_STEP;
  moveRaft(ferry.dir, close.filter(onRaft));
  if ((ferry.dir > 0 && ferry.x >= FERRY.east) || (ferry.dir < 0 && ferry.x <= FERRY.west)) {
    ferry.dir = 0;
    ferry.rest = tick + 20 * 8;
  }
}

// ---------------------------------------------------------------------------
// The Gaoler: he cannot be hurt, and he only hears you run
// ---------------------------------------------------------------------------

const gaoler = { id: undefined, hunting: false, lastSprint: 0, nextStep: 0, nextSpawn: 0 };

function gaolerEntity() {
  if (!gaoler.id) {
    const found = creatures("dis").find((e) => e.typeId === GAOLER);
    if (found) gaoler.id = found.id;
  }
  const e = gaoler.id ? world.getEntity(gaoler.id) : undefined;
  if (!e?.isValid) {
    gaoler.id = undefined;
    gaoler.hunting = false;
    return undefined;
  }
  return e;
}

function gaolerTick(tick, players) {
  let e = gaolerEntity();
  if (!e) {
    if (tick < gaoler.nextSpawn) return;
    gaoler.nextSpawn = tick + 20 * 20;
    const p = players[Math.floor(Math.random() * players.length)];
    const r = rel(p.location);
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 12;
      const x = Math.floor(r.x + Math.cos(a) * d), z = Math.floor(r.z + Math.sin(a) * d);
      if (Math.hypot(x - DIS.x, z - DIS.z) > DIS.wallR - 4) continue;
      const at = floorSpot(x, z);
      if (!at || typeRel(x, F + 2, z) !== "minecraft:air" || typeRel(x, F + 3, z) !== "minecraft:air") continue;
      e = spawnCreature(GAOLER, at, "dis");
      if (e) gaoler.id = e.id;
      break;
    }
    return;
  }
  const l = e.location;
  const sprinting = players.filter((p) => p.isSprinting && Math.hypot(p.location.x - l.x, p.location.z - l.z) < 36);
  if (sprinting.length) {
    gaoler.lastSprint = tick;
    if (!gaoler.hunting) {
      gaoler.hunting = true;
      try {
        e.triggerEvent("agartha:hunt");
      } catch {
        // busy
      }
      sound("agartha.ogre_roar", l, { volume: 4, pitch: 0.9 });
      for (const p of sprinting) {
        p.onScreenDisplay.setActionBar("§4§oSomething heavy heard you running.");
        try {
          p.runCommand("camerashake add @s 0.35 1 positional");
        } catch {
          // cosmetic
        }
      }
    }
  } else if (gaoler.hunting && tick - gaoler.lastSprint > 20 * 5) {
    gaoler.hunting = false;
    try {
      e.triggerEvent("agartha:calm");
    } catch {
      // busy
    }
    sound("agartha.ogre_step", l, { volume: 2, pitch: 0.6 });
  }
  // His footsteps carry through the city.
  if (tick >= gaoler.nextStep) {
    gaoler.nextStep = tick + (gaoler.hunting ? 8 : 16);
    sound("agartha.ogre_step", l, { volume: gaoler.hunting ? 3 : 1.6, pitch: 0.8 + Math.random() * 0.15 });
    if (gaoler.hunting) {
      for (const p of players) {
        if (Math.hypot(p.location.x - l.x, p.location.z - l.z) > 12) continue;
        try {
          p.runCommand("camerashake add @s 0.15 0.3 positional");
        } catch {
          // cosmetic
        }
      }
    }
  }
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
  const all = creatures("dis").filter((e) => e.typeId !== GAOLER && e.typeId !== FERRYMAN);
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
  for (const e of all) if (e.typeId === FURY) flying++;
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
  cryptTick(tick, players);
  raceTick(tick, players);
  garmTick(tick, players);
  ferryTick(tick, players);
  gaolerTick(tick, players);
  if (tick % 20 === 0) gateTick(tick, players);
  if (tick % 40 === 0) syncGate(players);
  bridgeTick(tick, players);
  huntTick(tick, players);
  geyserTick(tick, players);
  dreadTick(tick, players);
  watcherDue(tick, players);
}

