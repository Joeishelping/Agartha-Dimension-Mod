// The geometry of Hell, shared by the blueprint (what gets built) and the
// runtime (lava, traps, vents, arrow slits, crumbling steps, waves, souls,
// seals, glyphs, the clock). Pure JavaScript, no Minecraft imports. All x/z
// are relative to the origin (the same as Agartha's: Hell lies beneath it).
//
// Layer I, the Oubliette of Entropic Recurrence: a pit 80 blocks deep and
// 31 across. A slab spiral climbs its wall (320 steps, nearly four turns)
// past twelve Gates of the Hours to the Twelfth Gate at the top.
//
// Layer II, the City of Dis: a burning city behind red-hot walls in a
// cavern 160 blocks across, east of the pit. Three Seals bind its inner gate.
//
// Layer III, the Spire of Absolute Contract: a vast cavern north of the pit
// with a frozen black lake, the Spire (Hall of Thrones), the Inverse
// Cathedral hanging from the ceiling and the Clocktower of Reversion.

// ---------------------------------------------------------------------------
// Layer I: the pit
// ---------------------------------------------------------------------------

export const PIT = {
  x: 0,
  z: 0,
  airR: 15.5, // open shaft radius (the path runs along the wall inside it)
  wallR: 19, // decorated wall thickness
  floorY: -58, // feet level on the floor (floor blocks at -59)
  ceilY: 27, // first solid block of the ceiling
  rc: 13, // path centreline radius: one step = one block along it
  laneMin: 11.5,
  laneMax: 15.5,
  steps: 320,
};

// The Twelfth Gate opens north-east, toward the road to Dis.
const THETA0 = Math.PI / 4 - PIT.steps / PIT.rc;
const TURN = 2 * Math.PI * PIT.rc; // steps per full turn

export const stepAngle = (k) => THETA0 + k / PIT.rc;
/** Feet height when standing on step k: half a block every second step. */
export const stepSurface = (k) => PIT.floorY + 0.5 * Math.floor(k / 2);
/** The block that forms step k: { y, slab } (slab = bottom half slab). */
export function stepBlock(k) {
  const s = stepSurface(k);
  return s % 1 ? { y: Math.floor(s), slab: true } : { y: s - 1, slab: false };
}

export function laneOf(r) {
  return r < PIT.laneMin + 1 ? 12 : r < PIT.laneMin + 2 ? 13 : 14;
}

/** Relative cell of step k in a lane (radius 12, 13 or 14). */
export function pathCell(k, lane = 13) {
  const a = stepAngle(k);
  return { x: Math.round(PIT.x + lane * Math.cos(a)), z: Math.round(PIT.z + lane * Math.sin(a)), y: stepSurface(k) };
}

/** Every step whose angle matches this cell, for each turn of the spiral. */
export function stepsAtCell(x, z) {
  const a = Math.atan2(z - PIT.z, x - PIT.x);
  let k = ((((a - THETA0) * PIT.rc) % TURN) + TURN) % TURN;
  const out = [];
  for (; k <= PIT.steps + 0.5; k += TURN) out.push(Math.round(k));
  return out;
}

/** The path step a body at (x, y, z) stands on, or null. */
export function stepUnder(x, y, z) {
  const r = Math.hypot(x - PIT.x, z - PIT.z);
  if (r < PIT.laneMin || r >= PIT.laneMax) return null;
  for (const k of stepsAtCell(Math.floor(x) + 0.5, Math.floor(z) + 0.5)) {
    if (Math.abs(stepSurface(k) - y) < 1.1) return k;
  }
  return null;
}

// The twelve Gates of the Hours (alcoves in the wall). The twelfth is the
// way out of the pit, at the very top.
export const HOURS = [
  ["The First Hour", "The Gate of the Swallower"],
  ["The Second Hour", "Where Names Are Lost"],
  ["The Third Hour", "The Field of Ash"],
  ["The Fourth Hour", "The Sand That Burns"],
  ["The Fifth Hour", "The Cave of the Serpent"],
  ["The Sixth Hour", "The Drowned Depths"],
  ["The Seventh Hour", "Where the Heart Is Weighed"],
  ["The Eighth Hour", "The Sealed Tombs"],
  ["The Ninth Hour", "The Rowers in the Dark"],
  ["The Tenth Hour", "The Fire That Drowns"],
  ["The Eleventh Hour", "The Pits of Unmaking"],
  ["The Twelfth Hour", "The Road to Dis"],
].map(([name, epithet], i) => ({ n: i + 1, name, epithet, k: Math.round(((i + 1) * PIT.steps) / 12) }));

/** Local frame of an alcove: centre angle, tangent and outward unit vectors. */
export function hourFrame(h) {
  const a = stepAngle(h.k);
  return { a, out: [Math.cos(a), Math.sin(a)], tan: [-Math.sin(a), Math.cos(a)], floor: Math.floor(stepSurface(h.k)) };
}

export const ALCOVE = { from: PIT.airR, to: PIT.airR + 4, centre: PIT.airR + 2, button: PIT.airR + 3 };

/** The button inside an hour's alcove (relative coords) and which way it faces. */
export function hourButton(h) {
  const f = hourFrame(h);
  const x = Math.round(PIT.x + f.out[0] * ALCOVE.button);
  const z = Math.round(PIT.z + f.out[1] * ALCOVE.button);
  const facing = Math.abs(f.out[0]) > Math.abs(f.out[1]) ? (f.out[0] > 0 ? "west" : "east") : f.out[1] > 0 ? "north" : "south";
  return { x, y: f.floor + 1, z, facing };
}

// Hazards along the spiral, placed greedily so they never overlap each other
// or the Gates of the Hours: spike traps (each covers only some lanes of two
// steps, so there is always a way past: asymmetrical, never the same side
// twice), crumbling stretches, missing steps, and vents of soul fire.
const taken = [];
const free = (a, b, margin = 1) => HOURS.every((h) => b < h.k - 4 || a > h.k + 3) && taken.every(([x, y]) => b < x - margin || a > y + margin) && a > 6 && b < PIT.steps - 3;
function place(count, first, spacing, len) {
  const out = [];
  for (let i = 0, k = first; out.length < count && k < PIT.steps; i++, k = Math.round(first + i * spacing)) {
    for (let nudge = 0; nudge < 14; nudge++) {
      const a = k + nudge;
      if (free(a, a + len - 1)) {
        taken.push([a, a + len - 1]);
        out.push(a);
        break;
      }
    }
  }
  return out;
}
const LANE_SETS = [[13, 14], [12], [13], [12, 13], [14], [12, 14]];
export const TRAPS = place(24, 14, 12.7, 2).map((k, i) => ({ k, lanes: LANE_SETS[i % LANE_SETS.length] }));
export const CRUMBLE = place(14, 22, 21.1, 4).map((a, i) => [a, a + 2 + (i % 2)]);
export const GAPS = place(8, 36, 37.3, 1);
export const VENTS = place(12, 26, 25.3, 2);

export function stepKind(k, lane) {
  if (GAPS.includes(k)) return "gap";
  for (let i = 0; i < TRAPS.length; i++) {
    const t = TRAPS[i];
    if ((k === t.k || k === t.k + 1) && t.lanes.includes(lane)) return "trap";
  }
  if (CRUMBLE.some(([a, b]) => k >= a && k <= b)) return "crumble";
  if (VENTS.some((v) => k === v || k === v + 1)) return "vent";
  return "path";
}

const SLAB = { "minecraft:vertical_half": "bottom" };
const STEP_IDS = {
  path: ["minecraft:polished_blackstone_bricks", "minecraft:polished_blackstone_brick_slab"],
  trap: ["minecraft:polished_deepslate", "minecraft:polished_deepslate_slab"],
  crumble: ["minecraft:cobbled_deepslate", "minecraft:cobbled_deepslate_slab"],
  vent: ["minecraft:soul_soil", "minecraft:blackstone_slab"],
};
/** The block of step k for a kind of cell: [id, states?] at stepBlock(k).y. */
export function stepPerm(kind, k) {
  const ids = STEP_IDS[kind] ?? STEP_IDS.path;
  return stepBlock(k).slab ? [ids[1], SLAB] : [ids[0]];
}

export function trapIndex(k, lane) {
  return TRAPS.findIndex((t) => (k === t.k || k === t.k + 1) && t.lanes.includes(lane));
}

/** Every path cell: { x, z, k, lane, kind } (relative). */
export function pathCells() {
  const out = [];
  const R = Math.ceil(PIT.laneMax);
  for (let x = -R; x <= R; x++) {
    for (let z = -R; z <= R; z++) {
      const r = Math.hypot(x + 0.5 - PIT.x, z + 0.5 - PIT.z);
      if (r < PIT.laneMin || r >= PIT.laneMax) continue;
      const lane = laneOf(r);
      for (const k of stepsAtCell(x + 0.5, z + 0.5)) {
        if (!Number.isInteger(k) || k < 1 || k > PIT.steps) continue;
        out.push({ x, z, k, lane, kind: stepKind(k, lane) });
      }
    }
  }
  return out;
}

// Arrow slits in the pit wall, scattered up its height. They shoot at
// whoever climbs past.
export const SLITS = Array.from({ length: 30 }, (_, i) => {
  const k = 20 + ((i * 97) % (PIT.steps - 30));
  const a = stepAngle(k) + 0.35 * ((i % 2) * 2 - 1);
  return { x: Math.round(PIT.x + (PIT.airR + 0.6) * Math.cos(a)), y: Math.floor(stepSurface(k)) + 2 + (i % 3), z: Math.round(PIT.z + (PIT.airR + 0.6) * Math.sin(a)), a };
});

// The hidden way: from step 167, stepping stones hang over the void (inside
// the path, so they never block it) and climb back the way you came, each a
// block higher. From the last one, a long jump across to a ledge in the east
// wall, where a patch of cracked bricks hides a tunnel straight to Dis.
const STONE_R = 9.5;
const STONE_FROM = 167;
export const STONES = Array.from({ length: 9 }, (_, j) => {
  const a = stepAngle(STONE_FROM - 2.3 * (j + 1));
  return { x: Math.round(PIT.x + STONE_R * Math.cos(a)), z: Math.round(PIT.z + STONE_R * Math.sin(a)), y: Math.floor(stepSurface(STONE_FROM)) + j };
});
const ledgeAngle = stepAngle(STONE_FROM - 2.3 * 9);
/** The ledge before the crack: cells at radius 12..15, feet height y. */
export const CRACK_LEDGE = { a: ledgeAngle, y: STONES[STONES.length - 1].y + 1, r1: 12.6, r2: PIT.airR + 0.6 };
const crack = { x: Math.round(PIT.x + (PIT.airR + 0.8) * Math.cos(ledgeAngle)), z: Math.round(PIT.z + (PIT.airR + 0.8) * Math.sin(ledgeAngle)) };

// ---------------------------------------------------------------------------
// Layer II: the City of Dis
// ---------------------------------------------------------------------------

export const DIS = { x: 150, z: 30, rx: 80, rz: 78, floorY: -12, ceilY: 33, wallR: 62, wallTop: 8 };
/** Ceiling height of the Dis cavern over a cell (a low dome). */
export function disCeil(x, z) {
  const d2 = ((x - DIS.x) / DIS.rx) ** 2 + ((z - DIS.z) / DIS.rz) ** 2;
  return Math.floor(DIS.ceilY - 10 * d2);
}
/** Centre line of the Phlegethon, the river of fire, at a given z. */
export const riverX = (z) => DIS.x + 6 + 9 * Math.sin(z / 14);
export const RIVER_HALF = 4;
export const BRIDGES = [{ z: 14, crumbling: true, name: "the Bridge of Sighs" }];
// The Ferryman's crossing: a raft of bones over the river of fire, further south.
export const FERRY = (() => {
  const z = 50;
  const cx = riverX(z + 0.5);
  const xs = Math.floor(cx - RIVER_HALF), xe = Math.ceil(cx + RIVER_HALF) - 1;
  return { z, y: -14, west: xs, east: xe - 2, dockW: xs - 1, dockE: xe + 1 }; // y: the raft's blocks (feet one above)
})();
/** The cells of a bridge over the Phlegethon (relative x/z; the deck is at DIS.floorY - 1). */
export function bridgeCells(b) {
  const out = [];
  const cx = riverX(b.z + 0.5);
  for (let z = b.z - 1; z <= b.z + 1; z++) {
    for (let x = Math.floor(cx - RIVER_HALF - 2); x <= Math.ceil(cx + RIVER_HALF + 1); x++) out.push({ x, z, edge: z !== b.z });
  }
  return out;
}
// Where the roads arrive: the west gate (from the pit), the inner gate (to the Spire).
export const DIS_WEST_GATE = { x: DIS.x - DIS.wallR - 1, z: DIS.z };
export const DIS_INNER_GATE = (() => {
  const a = (Math.PI * 2) / 3; // south-west
  return { x: Math.round(DIS.x + DIS.wallR * Math.cos(a) + 1), z: Math.round(DIS.z + DIS.wallR * Math.sin(a)), a, width: 9, height: 12 };
})();
export const MAUSOLEUM = { x: 116, z: 2, half: 7 };
export const FURY_TOWER = { minX: 170, maxX: 184, minZ: -14, maxZ: 0, topY: 22 };
export const KENNEL = { minX: 168, maxX: 198, minZ: 36, maxZ: 64, gateZ: 50 };
export const DEN = { x: 189, z: 56, r: 6 };
export const FALLEN_KING = { x: 132, z: 52, r: 7 };
/** The Seals that bind the inner gate: altar positions (feet level = altar's y). */
// The crypt under the Mausoleum: nine sealed tombs, one of them true.
export const CRYPT = (() => {
  const { x, z } = MAUSOLEUM;
  const F = DIS.floorY;
  const markers = [
    ["minecraft:gilded_blackstone", "He was buried with his gold, and it did not save him."],
    ["minecraft:skeleton_skull", "He wears his own face upon his grave."],
    ["minecraft:bone_block", "Nothing is left of him but bone."],
    ["minecraft:crying_obsidian", "His grave still weeps."],
    ["minecraft:chain", "He was chained, even in death."],
    ["minecraft:soul_lantern", "A cold light keeps watch over him."],
    ["minecraft:magma", "He burns hotter than the rest."],
    ["minecraft:iron_bars", "Even his grave is a cage."],
    ["minecraft:redstone_block", "His heart was too heavy for the scale."],
  ];
  const tombs = [];
  let i = 0;
  for (const tz of [z - 5, z - 1, z + 3]) {
    for (const tx of [x - 6, x - 3, x]) {
      const [marker, riddle] = markers[i++];
      tombs.push({ x: tx, z: tz, marker, riddle, button: { x: tx + 2, y: F - 6, z: tz + 1, facing: "east" } });
    }
  }
  return {
    minX: x - 7, maxX: x + 7, minZ: z - 7, maxZ: z + 9, floorY: F - 6,
    stair: { x: x + 5, z: z - 4, steps: 7 },
    sign: { x: x + 6, y: F - 4, z: z + 5, facing: "west" },
    altar: { x: x - 2, z: z + 8 },
    tombs,
  };
})();

export const SEALS = [
  { name: "the Seal of Ash", where: "in the crypt beneath the Mausoleum", x: CRYPT.altar.x, y: CRYPT.floorY, z: CRYPT.altar.z },
  { name: "the Seal of Wind", where: "atop the Tower of the Furies", x: Math.floor((FURY_TOWER.minX + FURY_TOWER.maxX) / 2), y: FURY_TOWER.topY + 1, z: Math.floor((FURY_TOWER.minZ + FURY_TOWER.maxZ) / 2) },
  { name: "the Seal of Teeth", where: "in the den of Garm", x: DEN.x, y: DIS.floorY, z: DEN.z },
];

/**
 * The inner Gate of Dis, in the wall: every cell of its opening with what it
 * is when shut ("bars", "frame" or a lock 0..2). The runtime opens it by
 * clearing these cells once all three Seals are broken.
 */
export function innerGateCells() {
  const g = DIS_INNER_GATE;
  const out = [];
  const R = DIS.wallR;
  const tan = [-Math.sin(g.a), Math.cos(g.a)];
  for (let x = g.x - 10; x <= g.x + 10; x++) {
    for (let z = g.z - 10; z <= g.z + 10; z++) {
      const px = x + 0.5 - DIS.x, pz = z + 0.5 - DIS.z;
      const r = Math.hypot(px, pz);
      const along = px * tan[0] + pz * tan[1] - (g.x - DIS.x) * tan[0] - (g.z - DIS.z) * tan[1];
      if (r < R - 0.5 || r >= R + 3.5 || Math.abs(along) > g.width / 2) continue;
      for (let dy = 0; dy < g.height; dy++) {
        const edge = Math.abs(along) > g.width / 2 - 1 || dy === g.height - 1;
        const lock = !edge && dy >= 4 && dy <= 6 ? Math.floor((along + g.width / 2 - 1) / ((g.width - 2) / 3)) : -1;
        out.push({ x, y: DIS.floorY + dy, z, kind: edge ? "frame" : lock >= 0 && lock < 3 && Math.abs(((along + g.width / 2 - 1) % ((g.width - 2) / 3)) - (g.width - 2) / 6) < 0.9 ? lock : "bars" });
      }
    }
  }
  return out;
}

/** Feet height along an axis-aligned tunnel that descends half a block per block. */
export function tunnelProfile(points, startY, minY) {
  const cells = [];
  let t = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const n = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    const dx = Math.sign(x2 - x1), dz = Math.sign(z2 - z1);
    for (let s = i ? 1 : 0; s <= n; s++) {
      const y = Math.max(minY, startY - 0.5 * t);
      cells.push({ x: x1 + dx * s, z: z1 + dz * s, y, dx, dz, t });
      t++;
    }
  }
  return cells;
}

// The hidden tunnel: from the crack in the pit's east wall straight into Dis.
export const HIDDEN_TUNNEL = {
  startY: CRACK_LEDGE.y,
  crack,
  points: [[crack.x, crack.z], [104, crack.z]],
};
export const HIDDEN_PROFILE = tunnelProfile(HIDDEN_TUNNEL.points, HIDDEN_TUNNEL.startY, DIS.floorY);

// The Road of Ashes: from the Twelfth Gate down to the west gate of Dis.
const TOP = (() => {
  const a = stepAngle(PIT.steps);
  return { x: Math.round(PIT.x + (PIT.airR + 2) * Math.cos(a)), z: Math.round(PIT.z + (PIT.airR + 2) * Math.sin(a)) };
})();
export const ASCENT_ROAD = {
  startY: Math.floor(stepSurface(PIT.steps)),
  points: [[TOP.x, TOP.z], [TOP.x, DIS.z], [DIS_WEST_GATE.x + 6, DIS.z]],
};
export const ASCENT_PROFILE = tunnelProfile(ASCENT_ROAD.points, ASCENT_ROAD.startY, DIS.floorY);

// ---------------------------------------------------------------------------
// Layer III: the cavern of the Spire
// ---------------------------------------------------------------------------

export const CAVERN = { x: 0, z: 90, rx: 56, rz: 54, lakeY: -44, ceilY: 31 };
export function cavernCeil(x, z) {
  const d2 = ((x - CAVERN.x) / CAVERN.rx) ** 2 + ((z - CAVERN.z) / CAVERN.rz) ** 2;
  return Math.floor(CAVERN.ceilY - 4 * d2);
}

// The Throat: beyond the inner gate of Dis, a square shaft spirals down to
// the level of the frozen lake, and a tunnel runs west to its shore.
export const THROAT = { minX: 98, maxX: 108, minZ: 98, maxZ: 108, topY: DIS.floorY, bottomY: CAVERN.lakeY, doorZ: 101 };
// (The road starts just outside the gate, so building it never breaks the gate.)
const OUTSIDE_GATE = { x: Math.round(DIS.x + (DIS.wallR + 4.5) * Math.cos(DIS_INNER_GATE.a)), z: Math.round(DIS.z + (DIS.wallR + 4.5) * Math.sin(DIS_INNER_GATE.a)) };
export const THROAT_ROAD = { points: [[OUTSIDE_GATE.x, OUTSIDE_GATE.z], [OUTSIDE_GATE.x, THROAT.doorZ], [THROAT.maxX, THROAT.doorZ]] };
export const THROAT_TUNNEL = { z: 103, fromX: THROAT.minX, toX: 50 };

// Apep, the serpent of chaos, frozen in the lake around the Spire. Its head
// rears up in the south-east, facing the shore.
export const SERPENT = { r: 30, headAngle: -0.9 };
export const SERPENT_HEAD = (() => {
  const a = SERPENT.headAngle;
  const dir = [Math.cos(a), Math.sin(a)];
  return { x: CAVERN.x + SERPENT.r * dir[0] + dir[0] * 3, z: CAVERN.z + SERPENT.r * dir[1] + dir[1] * 3, y: -33, dir };
})();

// The Spire: base from the lake to the Hall of Thrones, the hall on top.
export const SPIRE = { minX: -11, maxX: 11, minZ: 70, maxZ: 112, hallY: 6, vaultY: 22, roofY: 26, tipY: 30 };
export const DEVIL_SPOT = { x: 0.5, y: SPIRE.hallY + 1, z: 105.5 };
export const SCALE = { x: 0, z: 98 };

// The Clocktower of Reversion, on the east shore; its face looks at the Spire.
export const CLOCKTOWER = { minX: 34, maxX: 42, minZ: 80, maxZ: 88, topY: 20 };
export const CLOCK = { x: 33, cy: 8, cz: 84, r: 5, minute: 4, hour: 2.6 };

// The Inverse Cathedral, hanging from the ceiling over the west of the lake.
export const CATHEDRAL = { minX: -39, maxX: -29, minZ: 78, maxZ: 102, topY: 29 };

// ---------------------------------------------------------------------------

// Where the arrivals stand: on the floor of the pit, by the first step.
export const ARRIVAL = (() => {
  const a = stepAngle(0) - 0.3;
  return { x: PIT.x + 11 * Math.cos(a) + 0.5, y: PIT.floorY, z: PIT.z + 11 * Math.sin(a) + 0.5, face: pathCell(8) };
})();

// The five syllables of the Devil's true name (his ren), hidden in the dark.
export const TRUE_NAME = ["AZ", "RA", "KHET", "MO", "RUN"];
export const GLYPHS = (() => {
  const back = stepAngle(0) + Math.PI;
  const h5 = hourFrame(HOURS[4]);
  const mid = HIDDEN_PROFILE[Math.floor(HIDDEN_PROFILE.length * 0.6)];
  return [
    { x: Math.round(11 * Math.cos(back)), y: PIT.floorY, z: Math.round(11 * Math.sin(back)) },
    { x: Math.round(h5.out[0] * (ALCOVE.centre + 0.5) + h5.tan[0] * 2), y: h5.floor, z: Math.round(h5.out[1] * (ALCOVE.centre + 0.5) + h5.tan[1] * 2) },
    { x: mid.x, y: Math.ceil(mid.y), z: mid.z + 1 }, // in the hidden tunnel, against its side
    { x: Math.round(SERPENT_HEAD.x + SERPENT_HEAD.dir[0] * 6), y: CAVERN.lakeY, z: Math.round(SERPENT_HEAD.z + SERPENT_HEAD.dir[1] * 6) },
    { x: 38, y: CLOCK.cy - 4, z: CLOCK.cz + 1 },
  ];
})();

/** Which part of Hell a (relative) point is in: "pit", "dis", "spire" or null. */
export function hellZone(x, y, z) {
  if (y < -63 || y > 34) return null;
  if (x < HELL_SHELL.minX || x > HELL_SHELL.maxX || z < HELL_SHELL.minZ || z > HELL_SHELL.maxZ) return null;
  if (Math.hypot(x - PIT.x, z - PIT.z) < PIT.wallR + 1 && y >= PIT.floorY - 2 && y <= PIT.ceilY) return "pit";
  const dc = ((x - CAVERN.x) / (CAVERN.rx + 6)) ** 2 + ((z - CAVERN.z) / (CAVERN.rz + 6)) ** 2;
  if (dc <= 1 || (x < 60 && z > 40)) return "spire";
  return "dis";
}

/** The solid shell everything is carved from (relative x/z, inclusive). */
export const HELL_SHELL = { minX: -26, maxX: 234, minZ: -52, maxZ: 148 };
