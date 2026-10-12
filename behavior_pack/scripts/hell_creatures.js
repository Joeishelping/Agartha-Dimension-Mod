// The things that hunt in Hell. They are custom creatures, so they attack on
// any difficulty (even Peaceful).
//
//  * The Damned walk, climb and claw; their grip slows you. Champions are
//    bigger and harder to kill.
//  * Hellhounds run in packs, leap, and their bite sets you alight. Garm, the
//    hound of Hel, is their giant alpha.
//  * Furies fly. They circle above you, shriek, and dive through walls; a
//    Fury's touch wounds and blinds. Kill them as they come.
//  * The Watcher only watches. It stands at the edge of sight and is gone
//    when you look too long, or come too near.

import { world } from "@minecraft/server";

export const CREATURE_TAG = "agartha_hell_mob";
export const FURY = "agartha:fury";
export const DAMNED = "agartha:damned";
export const HOUND = "agartha:hellhound";
export const WATCHER = "agartha:watcher";
export const GAOLER = "agartha:gaoler";
export const FERRYMAN = "agartha:ferryman";

// Everything we spawn on purpose (so the "nothing spawns in Hell" rule lets it be).
const ours = new Set();
export const isOurs = (id) => ours.has(id);

function dim() {
  return world.getDimension("overworld");
}

/** Spawns a creature. `zone` tags it ("pit"/"dis") so each layer can clear its own. */
export function spawnCreature(type, loc, zone, variant) {
  try {
    const e = dim().spawnEntity(type, loc);
    ours.add(e.id);
    e.addTag(CREATURE_TAG);
    if (zone) e.addTag(`agartha_${zone}`);
    if (variant) e.triggerEvent(variant);
    try {
      dim().spawnParticle("agartha:soul_wisp", loc);
    } catch {
      // cosmetic
    }
    return e;
  } catch {
    return undefined;
  }
}

export function creatures(zone) {
  try {
    return dim().getEntities({ tags: zone ? [CREATURE_TAG, `agartha_${zone}`] : [CREATURE_TAG] });
  } catch {
    return [];
  }
}

export function clearCreatures(zone) {
  for (const e of creatures(zone)) {
    try {
      e.remove();
    } catch {
      // gone
    }
  }
  if (!zone) ours.clear();
}

// ---------------------------------------------------------------------------
// Furies
// ---------------------------------------------------------------------------

const furies = new Map(); // id -> { phase, t, angle, next }
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function spawnFury(loc, zone) {
  const f = spawnCreature(FURY, loc, zone);
  if (f) furies.set(f.id, { phase: "circle", t: 0, angle: Math.random() * Math.PI * 2, next: 40 + Math.random() * 60 });
  return f;
}

/** Moves every Fury. Called every 2 ticks with the players they may hunt. */
export function furyTick(tick, players) {
  let list;
  try {
    list = dim().getEntities({ type: FURY });
  } catch {
    return;
  }
  for (const f of list) {
    let s = furies.get(f.id);
    if (!s) {
      s = { phase: "circle", t: 0, angle: Math.random() * Math.PI * 2, next: 60 };
      furies.set(f.id, s);
    }
    let target;
    let best = 48;
    for (const p of players) {
      const d = dist3(p.location, f.location);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    s.t += 2;
    const l = f.location;
    if (!target) {
      // Drifting, waiting.
      move(f, { x: l.x + Math.cos(tick / 30) * 0.2, y: l.y + Math.sin(tick / 20) * 0.1, z: l.z + Math.sin(tick / 30) * 0.2 });
      continue;
    }
    const head = { x: target.location.x, y: target.location.y + 1.3, z: target.location.z };
    if (s.phase === "circle") {
      s.angle += 0.07;
      const goal = { x: head.x + Math.cos(s.angle) * 7, y: head.y + 5 + Math.sin(s.t / 15) * 1.5, z: head.z + Math.sin(s.angle) * 7 };
      move(f, step(l, goal, 0.9), head);
      if (s.t >= s.next) {
        s.phase = "dive";
        s.t = 0;
        shriek(f);
      }
    } else if (s.phase === "dive") {
      move(f, step(l, head, 1.7), head);
      if (dist3(l, head) < 1.6) {
        try {
          target.applyDamage(5, { cause: "entityAttack", damagingEntity: f });
          target.addEffect("darkness", 60, { showParticles: false });
          target.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
        } catch {
          // gone
        }
        s.phase = "rise";
        s.t = 0;
      } else if (s.t > 60) {
        s.phase = "rise";
        s.t = 0;
      }
    } else {
      // Rise away, then circle again.
      move(f, { x: l.x + (l.x - head.x) * 0.08, y: l.y + 0.7, z: l.z + (l.z - head.z) * 0.08 }, head);
      if (s.t > 24) {
        s.phase = "circle";
        s.t = 0;
        s.next = 50 + Math.random() * 90;
      }
    }
  }
  for (const id of [...furies.keys()]) if (!list.some((f) => f.id === id)) furies.delete(id);
}

function step(from, to, speed) {
  const d = dist3(from, to);
  if (d <= speed) return to;
  const k = speed / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
}

function move(e, loc, look) {
  try {
    e.teleport(loc, look ? { facingLocation: look } : undefined);
  } catch {
    // unloaded
  }
}

export function shriek(e) {
  try {
    dim().playSound("agartha.fury_shriek", e.location, { volume: 3, pitch: 0.9 + Math.random() * 0.3 });
  } catch {
    // cosmetic
  }
}

// ---------------------------------------------------------------------------
// The Watcher
// ---------------------------------------------------------------------------

const watcher = { entity: undefined, player: undefined, born: 0, seen: 0 };

/** Puts the Watcher somewhere ahead of a player, if `place(dir)` finds a spot. */
export function summonWatcher(player, loc, tick) {
  if (watcher.entity?.isValid) return false;
  try {
    const e = dim().spawnEntity(WATCHER, loc);
    ours.add(e.id);
    e.addTag(CREATURE_TAG);
    e.teleport(loc, { facingLocation: player.location });
    Object.assign(watcher, { entity: e, player, born: tick, seen: 0 });
    return true;
  } catch {
    return false;
  }
}

export function watcherTick(tick) {
  const e = watcher.entity;
  if (!e) return;
  const p = watcher.player;
  if (!e.isValid || !p?.isValid) {
    watcher.entity = undefined;
    return;
  }
  const dx = e.location.x - p.location.x, dy = e.location.y + 3 - (p.location.y + 1.6), dz = e.location.z - p.location.z;
  const d = Math.hypot(dx, dy, dz);
  const v = p.getViewDirection();
  const looking = (v.x * dx + v.y * dy + v.z * dz) / d > 0.96;
  if (looking) watcher.seen += 2;
  try {
    e.teleport(e.location, { facingLocation: { x: p.location.x, y: p.location.y + 1.6, z: p.location.z } });
  } catch {
    // busy
  }
  if (d < 14 || watcher.seen > 30 || tick - watcher.born > 20 * 12) {
    try {
      dim().playSound("agartha.dread", e.location, { volume: 2, pitch: 0.7 });
      p.addEffect("darkness", 40, { showParticles: false });
      dim().spawnParticle("agartha:soul_wisp", e.location);
      e.remove();
    } catch {
      // gone
    }
    watcher.entity = undefined;
  }
}

// ---------------------------------------------------------------------------
// Bites and grips
// ---------------------------------------------------------------------------

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (hitEntity?.typeId !== "minecraft:player" || !damagingEntity?.isValid) return;
  try {
    if (damagingEntity.typeId === HOUND) hitEntity.setOnFire(4, true);
    else if (damagingEntity.typeId === DAMNED) hitEntity.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
    else if (damagingEntity.typeId === GAOLER) {
      hitEntity.addEffect("slowness", 60, { amplifier: 2, showParticles: false });
      hitEntity.addEffect("nausea", 100, { showParticles: false });
    }
  } catch {
    // gone
  }
});

// A Fury killed by a player dissolves with a last shriek.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity?.typeId === FURY) {
    try {
      shriek(deadEntity);
      dim().spawnParticle("agartha:soul_wisp", deadEntity.location);
    } catch {
      // gone
    }
  }
});

