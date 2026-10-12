// The geometry of Hell, shared by the blueprint (what gets built) and the
// runtime (lava, traps, crumbling steps, waves, souls, glyphs, the clock).
// Pure JavaScript, no Minecraft imports. All x/z are relative to the origin
// (the same as Agartha's: Hell lies directly beneath it).
//
// Layer 1, the Oubliette of Entropic Recurrence: a pit 80 blocks deep. A slab
// spiral climbs its wall (half a block per step, 160 steps, ~2.8 turns) past
// twelve Gates of the Hours to the Twelfth Gate at the top.
//
// Layer 2, the Spire of Absolute Contract: a vast cavern north of the pit
// with a frozen black lake, the Spire (Hall of Thrones), the Inverse
// Cathedral hanging from the ceiling and the Clocktower of Reversion.

export const PIT = {
  x: 0,
  z: 0,
  airR: 10.5, // open shaft radius (the path runs along the wall inside it)
  wallR: 14, // decorated wall thickness
  floorY: -58, // feet level on the floor (floor blocks at -59)
  ceilY: 27, // first solid block of the ceiling
  rc: 9, // path centreline radius: one step = one block along it
  laneMin: 7.5,
  laneMax: 10.5,
  steps: 160,
};

// The path is oriented so the hidden way out lies east and the Twelfth Gate
// opens toward the cavern (north = +z here).
const THETA0 = Math.PI / 2 - 100 / PIT.rc;
const TURN = 2 * Math.PI * PIT.rc; // steps per full turn

export const stepAngle = (k) => THETA0 + k / PIT.rc;
/** Feet height when standing on step k. */
export const stepSurface = (k) => PIT.floorY + k * 0.5;
/** The block that forms step k: { y, slab } (slab = bottom half slab). */
export function stepBlock(k) {
  return k % 2 ? { y: PIT.floorY + (k - 1) / 2, slab: true } : { y: PIT.floorY + k / 2 - 1, slab: false };
}

export function laneOf(r) {
  return r < 8.5 ? 8 : r < 9.5 ? 9 : 10;
}

/** Relative cell of step k in a lane (radius 8, 9 or 10). */
export function pathCell(k, lane = 9) {
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
  ["The Twelfth Hour", "The Contract Awaits"],
].map(([name, epithet], i) => ({ n: i + 1, name, epithet, k: Math.round(((i + 1) * PIT.steps) / 12) }));

/** Local frame of an alcove: centre angle, tangent and outward unit vectors. */
export function hourFrame(h) {
  const a = stepAngle(h.k);
  return {
    a,
    out: [Math.cos(a), Math.sin(a)],
    tan: [-Math.sin(a), Math.cos(a)],
    floor: Math.floor(stepSurface(h.k)),
  };
}

/** The button inside an hour's alcove (relative coords) and which way it faces. */
export function hourButton(h) {
  const f = hourFrame(h);
  const x = Math.round(PIT.x + f.out[0] * 13.5);
  const z = Math.round(PIT.z + f.out[1] * 13.5);
  const facing = Math.abs(f.out[0]) > Math.abs(f.out[1]) ? (f.out[0] > 0 ? "west" : "east") : f.out[1] > 0 ? "north" : "south";
  return { x, y: f.floor + 1, z, facing };
}

// Spike traps: each covers only some lanes of two steps, so there is always
// a way past (asymmetrical, never the same side twice).
export const TRAPS = [
  { k: 17, lanes: [9, 10] },
  { k: 31, lanes: [8] },
  { k: 45, lanes: [9] },
  { k: 58, lanes: [8, 9] },
  { k: 72, lanes: [10] },
  { k: 86, lanes: [8, 10] },
  { k: 99, lanes: [9, 10] },
  { k: 113, lanes: [8] },
  { k: 126, lanes: [8, 10] },
  { k: 139, lanes: [9, 10] },
  { k: 153, lanes: [9] },
];

// Crumbling stretches: thin steps that give way under you and regrow later.
export const CRUMBLE = [[21, 23], [48, 50], [62, 64], [89, 91], [103, 105], [117, 118], [129, 131], [143, 145], [156, 157]];
// Missing steps: jump.
export const GAPS = [36, 77, 124, 150];

export function stepKind(k, lane) {
  if (GAPS.includes(k)) return "gap";
  for (let i = 0; i < TRAPS.length; i++) {
    const t = TRAPS[i];
    if ((k === t.k || k === t.k + 1) && t.lanes.includes(lane)) return "trap";
  }
  if (CRUMBLE.some(([a, b]) => k >= a && k <= b)) return "crumble";
  return "path";
}

const SLAB = { "minecraft:vertical_half": "bottom" };
const STEP_IDS = {
  path: ["minecraft:polished_blackstone_bricks", "minecraft:polished_blackstone_brick_slab"],
  trap: ["minecraft:polished_deepslate", "minecraft:polished_deepslate_slab"],
  crumble: ["minecraft:cobbled_deepslate", "minecraft:cobbled_deepslate_slab"],
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

// The hidden way: from step 108, stepping stones hang over the void (inside
// the path, so they never block it) and climb back the way you came, each a
// block higher. From the last one, a long jump across to a ledge in the wall,
// where a patch of cracked bricks hides a tunnel winding down to the lake.
const STONE_R = 6.5;
export const STONES = Array.from({ length: 9 }, (_, j) => {
  const a = stepAngle(108 - 2.3 * (j + 1));
  return { x: Math.round(PIT.x + STONE_R * Math.cos(a)), z: Math.round(PIT.z + STONE_R * Math.sin(a)), y: Math.floor(stepSurface(108)) + j };
});
const ledgeAngle = stepAngle(108 - 2.3 * 9);
/** The ledge before the crack: cells at radius 9..10, feet height y. */
export const CRACK_LEDGE = { a: ledgeAngle, y: STONES[STONES.length - 1].y + 1 };
const crack = { x: Math.round(PIT.x + 11 * Math.cos(ledgeAngle)), z: Math.round(PIT.z + 11 * Math.sin(ledgeAngle)) };
// Tunnel waypoints (axis-aligned), from the crack in the east wall to the lake.
export const HIDDEN_TUNNEL = {
  startY: CRACK_LEDGE.y,
  crack,
  points: [[crack.x, crack.z], [46, crack.z], [46, 22], [24, 22], [24, 46]],
};

// The cavern of Layer 2.
export const CAVERN = { x: 0, z: 90, rx: 56, rz: 54, lakeY: -44, ceilY: 31 };
export function cavernCeil(x, z) {
  const d2 = ((x - CAVERN.x) / CAVERN.rx) ** 2 + ((z - CAVERN.z) / CAVERN.rz) ** 2;
  return Math.floor(CAVERN.ceilY - 4 * d2);
}

// Apep, the serpent of chaos, frozen in the lake around the Spire. Its head
// rears up in the south-east, facing the shore where the hidden way comes out.
export const SERPENT = { r: 30, headAngle: -0.9 };
export const SERPENT_HEAD = (() => {
  const a = SERPENT.headAngle;
  const dir = [Math.cos(a), Math.sin(a)];
  return { x: CAVERN.x + SERPENT.r * dir[0] + dir[0] * 3, z: CAVERN.z + SERPENT.r * dir[1] + dir[1] * 3, y: -33, dir };
})();

// The Twelfth Gate's tunnel to the cavern, and the bridge to the Spire.
export const TOP_TUNNEL = { y: 22, points: [[-4, 10], [-4, 20], [0, 20], [0, 38]] };
export const BRIDGE = { x: 0, fromZ: 38, toZ: 70, fromY: 22 };

// The Spire: base from the lake to the Hall of Thrones, the hall on top.
export const SPIRE = { minX: -11, maxX: 11, minZ: 70, maxZ: 112, hallY: 6, vaultY: 22, roofY: 26, tipY: 30 };
export const DEVIL_SPOT = { x: 0.5, y: SPIRE.hallY + 1, z: 105.5 };
export const SCALE = { x: 0, z: 98 };

// The Clocktower of Reversion, on the east shore; its face looks at the Spire.
export const CLOCKTOWER = { minX: 34, maxX: 42, minZ: 86, maxZ: 94, topY: 20 };
export const CLOCK = { x: 33, cy: 8, cz: 90, r: 5, minute: 4, hour: 2.6 };

// The Inverse Cathedral, hanging from the ceiling over the west of the lake.
export const CATHEDRAL = { minX: -39, maxX: -29, minZ: 78, maxZ: 102, topY: 29 };

// Where the arrivals stand: on the floor of the pit, by the first step.
export const ARRIVAL = (() => {
  const a = stepAngle(0) - 0.35;
  return { x: PIT.x + 8 * Math.cos(a) + 0.5, y: PIT.floorY, z: PIT.z + 8 * Math.sin(a) + 0.5, face: pathCell(6) };
})();

// The five syllables of the Devil's true name (his ren), hidden in the dark.
export const TRUE_NAME = ["AZ", "RA", "KHET", "MO", "RUN"];
export const GLYPHS = (() => {
  const back = stepAngle(0) + Math.PI;
  const h5 = hourFrame(HOURS[4]);
  return [
    { x: Math.round(8 * Math.cos(back)), y: PIT.floorY, z: Math.round(8 * Math.sin(back)) },
    { x: Math.round(h5.out[0] * 13 + h5.tan[0] * 2), y: h5.floor, z: Math.round(h5.out[1] * 13 + h5.tan[1] * 2) },
    { x: 47, y: null, z: 22 }, // at the hidden tunnel's turn; y from its floor
    { x: Math.round(SERPENT_HEAD.x + SERPENT_HEAD.dir[0] * 6), y: CAVERN.lakeY, z: Math.round(SERPENT_HEAD.z + SERPENT_HEAD.dir[1] * 6) },
    { x: 38, y: CLOCK.cy - 4, z: 91 },
  ];
})();

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
const hidden = tunnelProfile(HIDDEN_TUNNEL.points, HIDDEN_TUNNEL.startY, CAVERN.lakeY);
GLYPHS[2].y = Math.ceil(hidden.find((c) => c.x === 46 && c.z === 22)?.y ?? CAVERN.lakeY);
export const HIDDEN_PROFILE = hidden;

/** Which part of Hell a (relative) point is in: "pit", "spire" or null. */
export function hellZone(x, y, z) {
  if (y < -63 || y > 34) return null;
  if (Math.hypot(x - PIT.x, z - PIT.z) < PIT.wallR + 1 && y >= PIT.floorY - 2 && y <= PIT.ceilY) return "pit";
  if (x >= -64 && x <= 64 && z >= -24 && z <= 148) return "spire";
  return null;
}
