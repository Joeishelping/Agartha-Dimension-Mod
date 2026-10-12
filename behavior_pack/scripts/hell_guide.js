// The way through Hell, for the lost.
//
//  * A trail of cold wisps drifts ahead of every soul toward its next goal:
//    up the spiral of the pit, along the Road of Ashes, to the nearest
//    unbroken Seal of Dis (by the Bridge of Sighs or the Ferryman when the
//    river is in the way), through the Gate and down the Throat, across the
//    ice to the Spire, and up to the Keeper.
//  * Crouch, and the way is spoken: what to seek, how far, and which way.

import { world } from "@minecraft/server";
import { HELL } from "./config.js";
import {
  PIT, pathCell, stepUnder, ASCENT_PROFILE, HIDDEN_TUNNEL, DIS, riverX, RIVER_HALF, BRIDGES, FERRY, DIS_INNER_GATE, SEALS, CRYPT, FURY_TOWER,
  KENNEL, DEN, THROAT, THROAT_TUNNEL, CAVERN, SPIRE, DEVIL_SPOT,
} from "./hell_layout.js";

const ox = HELL.originX;
const oz = HELL.originZ;
const F = DIS.floorY;
const pt = (x, y, z) => ({ x, y, z });

function inBox(r, minX, maxX, minZ, maxZ) {
  return r.x >= minX && r.x < maxX + 1 && r.z >= minZ && r.z < maxZ + 1;
}

/** The seal's way in, or the seal itself once you are inside. */
function sealGoal(i, r) {
  const s = SEALS[i];
  if (i === 0) {
    if (r.y < F - 1 && inBox(r, CRYPT.minX, CRYPT.maxX, CRYPT.minZ, CRYPT.maxZ)) return { name: "the riddle of the tombs", at: pt(CRYPT.sign.x - 1, CRYPT.floorY, CRYPT.sign.z) };
    return { name: "the crypt (the Seal of Ash)", at: pt(CRYPT.stair.x + 1, F - 3, CRYPT.stair.z + 3) };
  }
  if (i === 1) {
    if (inBox(r, FURY_TOWER.minX + 1, FURY_TOWER.maxX - 1, FURY_TOWER.minZ + 1, FURY_TOWER.maxZ - 1)) return { name: "the Seal of Wind (climb!)", at: pt(s.x, s.y, s.z) };
    return { name: "the Tower of the Furies (the Seal of Wind)", at: pt(FURY_TOWER.minX, F, Math.floor((FURY_TOWER.minZ + FURY_TOWER.maxZ) / 2)) };
  }
  if (inBox(r, KENNEL.minX + 1, KENNEL.maxX - 1, KENNEL.minZ + 1, KENNEL.maxZ - 1)) return { name: "Garm (the Seal of Teeth)", at: pt(DEN.x - DEN.r - 2, F, DEN.z) };
  return { name: "the kennel of Garm (the Seal of Teeth)", at: pt(KENNEL.minX, F, KENNEL.gateZ) };
}

const eastOf = (x, z) => x > riverX(z);

/** If the river lies between, go by the nearer crossing first. */
function crossing(r, goal) {
  if (eastOf(r.x, r.z) === eastOf(goal.at.x, goal.at.z)) return goal;
  const east = eastOf(r.x, r.z);
  const bz = BRIDGES[0].z, bx = riverX(bz + 0.5);
  const options = [
    { name: "the Bridge of Sighs", near: pt(bx + (east ? 1 : -1) * (RIVER_HALF + 3), F, bz), far: pt(bx + (east ? -1 : 1) * (RIVER_HALF + 3), F, bz) },
    { name: "the Ferryman", near: pt(east ? FERRY.dockE : FERRY.dockW, F, FERRY.z), far: pt(east ? FERRY.dockW : FERRY.dockE, F, FERRY.z) },
  ];
  const cost = (o) => Math.abs(r.z - o.near.z) + Math.abs(goal.at.z - o.near.z);
  const o = options.sort((a, b) => cost(a) - cost(b))[0];
  const there = Math.hypot(r.x - o.near.x, r.z - o.near.z) < 3 || Math.abs(r.x - riverX(r.z)) < RIVER_HALF + 1;
  return { name: `${o.name}, then ${goal.name}`, at: there ? o.far : o.near };
}

function nearestProfile(profile, r) {
  let best = 0, bd = Infinity;
  profile.forEach((c, i) => {
    const d = Math.hypot(c.x - r.x, c.z - r.z) + Math.abs(c.y - r.y) * 0.5;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/**
 * Where a soul at relative position r (in `zone`) should go next.
 * Returns { name, at, trail? } — `trail` is a list of points to light.
 */
export function goalFor(r, zone, seals) {
  if (zone === "pit") {
    const k = stepUnder(r.x, r.y, r.z) ?? Math.max(0, Math.min(PIT.steps, Math.round((r.y - PIT.floorY) * 4)));
    if (k >= PIT.steps - 6) {
      const c = ASCENT_PROFILE[6];
      return { name: "the Road of Ashes", at: pt(c.x, c.y, c.z) };
    }
    const trail = [];
    for (let j = 3; j <= 15 && k + j <= PIT.steps; j += 3) trail.push(pathCell(k + j));
    return { name: `the top of the pit (step ${k} of ${PIT.steps})`, at: trail[trail.length - 1] ?? pathCell(PIT.steps), trail };
  }
  if (zone === "spire") {
    if (inBox(r, SPIRE.minX, SPIRE.maxX, SPIRE.minZ, SPIRE.maxZ)) return { name: "the Keeper of the Spire (climb)", at: pt(DEVIL_SPOT.x, DEVIL_SPOT.y, DEVIL_SPOT.z) };
    if (r.x > THROAT_TUNNEL.toX + 2 && Math.abs(r.z - THROAT_TUNNEL.z) < 4) return { name: "the frozen lake", at: pt(THROAT_TUNNEL.toX, CAVERN.lakeY, THROAT_TUNNEL.z) };
    return { name: "the door of the Spire", at: pt(0, CAVERN.lakeY + 1, SPIRE.minZ - 2) };
  }
  // Dis, and the ways in and out of it.
  if (inBox(r, THROAT.minX, THROAT.maxX, THROAT.minZ, THROAT.maxZ) && r.y < F + 1) return { name: "the bottom of the Throat", at: pt(THROAT.minX, THROAT.bottomY, THROAT_TUNNEL.z) };
  if (r.x < THROAT.minX && Math.abs(r.z - THROAT_TUNNEL.z) < 4 && r.y < F - 4) return { name: "the frozen lake", at: pt(THROAT_TUNNEL.toX, CAVERN.lakeY, THROAT_TUNNEL.z) };
  const inCity = Math.hypot(r.x - DIS.x, r.z - DIS.z) < DIS.wallR - 0.5;
  if (!inCity) {
    if (r.z > 80) return { name: "the Throat", at: pt(THROAT.maxX, F, THROAT.doorZ) };
    if (Math.abs(r.z - HIDDEN_TUNNEL.crack.z) < 3 && r.x < 104 && r.x > 14) return { name: "the City of Dis", at: pt(104, F, HIDDEN_TUNNEL.crack.z) };
    const i = nearestProfile(ASCENT_PROFILE, r);
    const trail = [];
    for (let j = 3; j <= 15 && i + j < ASCENT_PROFILE.length; j += 3) trail.push(ASCENT_PROFILE[i + j]);
    const end = ASCENT_PROFILE[ASCENT_PROFILE.length - 1];
    return { name: "the west gate of Dis", at: pt(end.x, end.y, end.z), trail: trail.map((c) => pt(c.x, c.y, c.z)) };
  }
  if (seals === 7) return crossing(r, { name: "the Gate of Dis (open)", at: pt(DIS_INNER_GATE.x + 2, F, DIS_INNER_GATE.z - 2) });
  let best;
  for (let i = 0; i < 3; i++) {
    if (seals & (1 << i)) continue;
    const g = crossing(r, sealGoal(i, r));
    const d = Math.hypot(g.at.x - r.x, g.at.z - r.z);
    if (!best || d < best.d) best = { ...g, d };
  }
  return best;
}

const DIRS = ["ahead", "ahead and to the right", "to your right", "behind you, to the right", "behind you", "behind you, to the left", "to your left", "ahead and to the left"];

/** "42 blocks ahead and to the left, 6 below" */
export function describe(player, r, at) {
  const dx = at.x + 0.5 - r.x, dz = at.z + 0.5 - r.z;
  const d = Math.round(Math.hypot(dx, dz));
  const v = player.getViewDirection();
  const turn = Math.atan2(dx * v.z - dz * v.x, dx * v.x + dz * v.z); // positive = to the left
  const sector = ((Math.round(-turn / (Math.PI / 4)) % 8) + 8) % 8;
  const dy = Math.round(at.y - r.y);
  const vert = Math.abs(dy) < 3 ? "" : dy > 0 ? `, ${dy} above` : `, ${-dy} below`;
  return d < 3 && !vert ? "here" : `${d} blocks ${DIRS[sector]}${vert}`;
}

function wisp(player, loc) {
  const l = { x: ox + loc.x + 0.5, y: loc.y + 1, z: oz + loc.z + 0.5 };
  try {
    player.spawnParticle("agartha:soul_wisp", l);
  } catch {
    try {
      player.dimension.spawnParticle("agartha:soul_wisp", l);
    } catch {
      // unloaded
    }
  }
}

const told = new Set();

/** Called every 2 ticks for each soul in Hell. */
export function guideTick(tick, player, zone, seals) {
  if (tick % 10 !== 0) return;
  const crouching = player.isSneaking;
  if (tick % 30 !== 0 && !crouching) return;
  const l = player.location;
  const r = { x: l.x - ox, y: l.y, z: l.z - oz };
  const goal = goalFor(r, zone, seals);
  if (!goal) return;
  if (!told.has(player.id)) {
    told.add(player.id);
    player.sendMessage("§8§oIf you are lost, crouch. The dead will show you the way.");
  }
  if (crouching) player.onScreenDisplay.setActionBar(`§b${goal.name}§7: ${describe(player, r, goal.at)}`);
  if (tick % 30 !== 0) return;
  if (goal.trail?.length) {
    for (const c of goal.trail) wisp(player, c);
    return;
  }
  const dx = goal.at.x + 0.5 - r.x, dz = goal.at.z + 0.5 - r.z, dy = goal.at.y - r.y;
  const dist = Math.hypot(dx, dz);
  if (dist < 2.5) return;
  for (let s = 2; s <= Math.min(10, dist); s += 2) {
    const k = s / dist;
    wisp(player, { x: r.x + dx * k - 0.5, y: r.y + Math.max(-2, Math.min(2, dy * k)), z: r.z + dz * k - 0.5 });
  }
}
