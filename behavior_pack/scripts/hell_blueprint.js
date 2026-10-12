// The Hell blueprint: turns hell_layout.js into block operations, one tile at
// a time. Pure JavaScript (tested in Node, like Agartha's blueprint).
//
// Everything is carved out of a solid deepslate shell, so no natural cave,
// water or lava can ever leak in, and nothing outside the shell is touched.

import { HELL, HELL_REGION } from "./config.js";
import { fbm, hash2, hash3 } from "./noise.js";
import { Canvas, stairs, slab } from "./canvas.js";
import {
  PIT, HOURS, ALCOVE, hourFrame, hourButton, pathCells, stepBlock, stepPerm, SLITS,
  STONES, CRACK_LEDGE, HIDDEN_TUNNEL, HIDDEN_PROFILE, ASCENT_PROFILE, CAVERN, cavernCeil,
  SPIRE, SCALE, CLOCKTOWER, CLOCK, CATHEDRAL, SERPENT, SERPENT_HEAD, GLYPHS, ARRIVAL,
  DIS, disCeil, riverX, RIVER_HALF, BRIDGES, DIS_WEST_GATE, DIS_INNER_GATE, innerGateCells, MAUSOLEUM, FURY_TOWER,
  KENNEL, DEN, FALLEN_KING, SEALS, THROAT, THROAT_ROAD, THROAT_TUNNEL, bridgeCells,
} from "./hell_layout.js";

const DEEP = "minecraft:deepslate";
const PBB = "minecraft:polished_blackstone_bricks";
const PB = "minecraft:polished_blackstone";
const BLACK = "minecraft:blackstone";
const TILES = "minecraft:deepslate_tiles";
const DBRICK = "minecraft:deepslate_bricks";
const CHISELED = "minecraft:chiseled_polished_blackstone";
const GILDED = "minecraft:gilded_blackstone";
const BASALT = "minecraft:polished_basalt";
const MATTE = "minecraft:black_concrete";
const CHAIN = ["minecraft:chain", { pillar_axis: "y" }];

const put = (c, x, y, z, b) => c.set(x, y, z, b[0], b[1]);
const box = (c, x1, y1, z1, x2, y2, z2, b, mode) => c.fill(x1, y1, z1, x2, y2, z2, b[0], b[1], mode);

/** Calls f(x, z) for every cell of the tile inside the given box. */
function cells(c, minX, maxX, minZ, maxZ, f) {
  const t = c.tile;
  for (let x = Math.max(minX, t.minX); x <= Math.min(maxX, t.maxX); x++) {
    for (let z = Math.max(minZ, t.minZ); z <= Math.min(maxZ, t.maxZ); z++) f(x, z);
  }
}

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

function shell(c) {
  const s = HELL.shell;
  for (let x = s.minX; x <= s.maxX; x += 16) {
    for (let z = s.minZ; z <= s.maxZ; z += 16) {
      c.fill(x, HELL.minY, z, Math.min(s.maxX, x + 15), HELL.maxY, Math.min(s.maxZ, z + 15), DEEP);
    }
  }
}

// ---------------------------------------------------------------------------
// Layer 1: the Oubliette
// ---------------------------------------------------------------------------

const WALL = [DBRICK, PBB, TILES, BLACK, "minecraft:cracked_polished_blackstone_bricks", "minecraft:polished_deepslate", DBRICK, BLACK];

function pitWallBlock(x, y, z) {
  const h = hash3(x, y, z, 13);
  if (h < 0.025) return ["minecraft:crying_obsidian"]; // the weeping walls
  if (h < 0.04) return [GILDED];
  const band = Math.floor((y + Math.floor(hash2(x, z, 7) * 3)) / 4);
  const sector = Math.floor((Math.atan2(z, x) + Math.PI) * 2);
  return [WALL[Math.floor(hash2(band, sector, 11) * WALL.length)]];
}

function pit(c) {
  const R = PIT.wallR;
  cells(c, PIT.x - R, PIT.x + R, PIT.z - R, PIT.z + R, (x, z) => {
    const r = Math.hypot(x + 0.5 - PIT.x, z + 0.5 - PIT.z);
    if (r < PIT.airR) {
      c.fill(x, PIT.floorY, z, x, PIT.ceilY - 1, z, "minecraft:air");
      // The floor: soul soil and bone, burning at the heart.
      const h = hash2(x, z, 21);
      const floor = r < 5.5 ? "minecraft:magma" : h < 0.55 ? "minecraft:soul_soil" : h < 0.8 ? "minecraft:soul_sand" : h < 0.9 ? "minecraft:bone_block" : BLACK;
      c.set(x, PIT.floorY - 1, z, floor);
      // The ceiling, ribbed with blackstone.
      c.set(x, PIT.ceilY, z, hash2(x, z, 22) < 0.5 ? BLACK : PBB);
    } else if (r < PIT.airR + 1.3) {
      c.voxels(0, 0, 0, 0, PIT.floorY - 1, PIT.ceilY, () => [x, z], (u, y) => pitWallBlock(x, y, z));
    }
  });

  // The spiral path.
  for (const p of pathCells()) {
    if (!c.has(p.x, p.z) || p.kind === "gap") continue;
    const b = stepBlock(p.k);
    put(c, p.x, b.y, p.z, stepPerm(p.kind, p.k));
    // Crumbling steps are thin, with nothing beneath: they give way.
    if (p.kind !== "crumble") c.fill(p.x, b.y - 2, p.z, p.x, b.y - 1, p.z, BLACK);
  }

  for (const h of HOURS) hourGate(c, h);

  // Arrow slits: barred notches in the wall that watch the stair.
  for (const sl of SLITS) {
    c.fill(sl.x, sl.y, sl.z, sl.x, sl.y + 1, sl.z, "minecraft:iron_bars");
  }

  // The hidden way: stepping stones over the void, a ledge, a cracked wall.
  for (const st of STONES) {
    c.set(st.x, st.y, st.z, PB);
    c.set(st.x, st.y - 1, st.z, "minecraft:polished_blackstone_wall");
  }
  cells(c, -R, R, -R, R, (x, z) => {
    const r = Math.hypot(x + 0.5, z + 0.5);
    const a = Math.atan2(z + 0.5, x + 0.5);
    let da = a - CRACK_LEDGE.a;
    da = Math.atan2(Math.sin(da), Math.cos(da)) * r;
    if (r >= CRACK_LEDGE.r1 && r < CRACK_LEDGE.r2 && Math.abs(da) <= 1.6) {
      c.set(x, CRACK_LEDGE.y - 1, z, PBB);
      c.fill(x, CRACK_LEDGE.y, z, x, CRACK_LEDGE.y + 2, z, "minecraft:air");
    }
  });

  // An obelisk on the burning heart of the floor, with the old warning.
  const F = PIT.floorY;
  for (let y = 0; y < 18; y++) {
    const w = y < 2 ? 2 : y < 13 ? 1 : 0;
    c.fill(PIT.x - w, F + y, PIT.z - w, PIT.x + w, F + y, PIT.z + w, y < 2 ? PBB : y === 12 ? GILDED : y > 12 ? CHISELED : PB);
  }
  c.set(PIT.x, F + 18, PIT.z, "minecraft:soul_campfire");
  const facing = { "2,0": "east", "-2,0": "west", "0,2": "south", "0,-2": "north" };
  for (const [key, dir] of Object.entries(facing)) {
    const [dx, dz] = key.split(",").map(Number);
    c.sign(PIT.x + dx, F + 4, PIT.z + dz, dir, "§4ABANDON\n§4ALL HOPE,\n§7ye who\n§7enter here");
  }

  // Chains hang from the dark, with cages at their ends.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const rr = i % 2 ? 6.5 : 8.5;
    const x = Math.round(PIT.x + rr * Math.cos(a));
    const z = Math.round(PIT.z + rr * Math.sin(a));
    const end = PIT.ceilY - 12 - ((i * 13) % 52);
    if (c.has(x, z)) c.fill(x, end + 3, z, x, PIT.ceilY - 1, z, CHAIN[0], CHAIN[1]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const edge = dx || dz;
        for (let y = end; y <= end + 2; y++) {
          if (edge) c.set(x + dx, y, z + dz, "minecraft:iron_bars");
        }
        c.set(x + dx, end - 1, z + dz, PB);
      }
    }
    c.set(x, end, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    c.set(x, end - 2, z, "minecraft:soul_lantern", { hanging: true });
  }

  // Bones and fires on the floor (away from where souls arrive).
  cells(c, -16, 16, -16, 16, (x, z) => {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r < 6 || r >= PIT.laneMin - 0.5) return; // not on the spiral's first steps
    if (Math.hypot(x + 0.5 - ARRIVAL.x, z + 0.5 - ARRIVAL.z) < 3) return;
    const h = hash2(x, z, 23);
    if (h < 0.05) c.set(x, F, z, "minecraft:bone_block", { pillar_axis: hash2(x, z, 24) < 0.5 ? "x" : "z" });
    else if (h < 0.08) c.set(x, F, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    else if (h < 0.1) c.set(x, F, z, "minecraft:soul_fire");
  });
}

/** One of the twelve Gates of the Hours: an alcove with a pylon gate. */
function hourGate(c, h) {
  const f = hourFrame(h);
  const F = f.floor;
  const cx = PIT.x + f.out[0] * ALCOVE.centre;
  const cz = PIT.z + f.out[1] * ALCOVE.centre;
  cells(c, Math.floor(cx - 5), Math.ceil(cx + 5), Math.floor(cz - 5), Math.ceil(cz + 5), (x, z) => {
    const px = x + 0.5 - PIT.x;
    const pz = z + 0.5 - PIT.z;
    const d = px * f.out[0] + pz * f.out[1];
    const a = px * f.tan[0] + pz * f.tan[1];
    if (d < ALCOVE.from || d > ALCOVE.to + 0.1 || Math.abs(a) > 2.6) return;
    const front = d < ALCOVE.from + 1;
    if (front && Math.abs(a) > 1.5) {
      // Pylon pillars.
      c.fill(x, F, z, x, F + 3, z, BASALT, { pillar_axis: "y" });
      c.set(x, F + 4, z, CHISELED);
      return;
    }
    c.set(x, F - 1, z, front ? GILDED : PBB);
    c.fill(x, F, z, x, F + (front ? 3 : 4), z, "minecraft:air");
    if (front) c.set(x, F + 4, z, Math.abs(a) < 0.6 ? GILDED : PBB);
    c.set(x, F + 5, z, TILES);
  });
  const lx = Math.round(PIT.x + f.out[0] * ALCOVE.centre - 0.5);
  const lz = Math.round(PIT.z + f.out[1] * ALCOVE.centre - 0.5);
  c.set(lx, F + 4, lz, "minecraft:soul_lantern", { hanging: true });
  if (h.n === 12) return; // the top: the Road of Ashes goes on from here
  const b = hourButton(h);
  const back = { west: [1, 0], east: [-1, 0], north: [0, 1], south: [0, -1] }[b.facing];
  c.fill(b.x, b.y - 1, b.z, b.x, b.y + 2, b.z, "minecraft:air");
  for (let y = b.y - 1; y <= b.y + 2; y++) c.set(b.x + back[0], y, b.z + back[1], PBB);
  c.set(b.x, b.y - 1, b.z, PBB);
  c.set(b.x, b.y, b.z, "minecraft:polished_blackstone_button", { facing_direction: { north: 2, south: 3, west: 4, east: 5 }[b.facing] });
  c.sign(b.x, b.y + 1, b.z, b.facing, `§4${h.name.toUpperCase()}\n§8—\n§7${h.epithet}`);
}

// ---------------------------------------------------------------------------
// Roads: the Road of Ashes, the hidden way, the Throat
// ---------------------------------------------------------------------------

function tunnelCells(points, f) {
  for (let i = 0; i + 1 < points.length; i++) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const n = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
    const dx = Math.sign(x2 - x1), dz = Math.sign(z2 - z1);
    for (let s = 0; s <= n; s++) for (let w = -1; w <= 1; w++) f(x1 + dx * s + (dz ? w : 0), z1 + dz * s + (dx ? w : 0), s, w);
  }
}

/** Carves a descending road along a profile: 3 wide, `h` tall, half a block per block. */
function road(c, profile, h, opts = {}) {
  for (const p of profile) {
    for (let w = -1; w <= 1; w++) {
      const x = p.x + (p.dz ? w : 0);
      const z = p.z + (p.dx ? w : 0);
      const fy = Math.floor(p.y);
      if (opts.lavaAt?.has(p.t)) {
        c.fill(x, fy - 2, z, x, fy - 1, z, "minecraft:lava");
        c.set(x, fy - 3, z, DEEP);
      } else if (p.y % 1) c.set(x, fy, z, ...slab(opts.slab ?? "minecraft:cobbled_deepslate_slab"));
      else c.set(x, fy - 1, z, opts.floor?.(w, p) ?? "minecraft:cobbled_deepslate");
      c.fill(x, Math.ceil(p.y), z, x, Math.ceil(p.y) + h - 1, z, "minecraft:air");
      if (opts.ceiling) c.set(x, Math.ceil(p.y) + h, z, opts.ceiling);
      if (w === 0 && opts.drips && hash2(p.t, 0, 61) < 0.18) {
        c.set(x, Math.ceil(p.y) + h - 1, z, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: true });
      }
      if (w === 0 && opts.lanterns && p.t % 9 === 4) c.set(x, Math.ceil(p.y) + h - 1, z, "minecraft:soul_lantern", { hanging: true });
    }
  }
}

function tunnels(c) {
  // The Road of Ashes: from the Twelfth Gate down to the west gate of Dis.
  road(c, ASCENT_PROFILE, 4, {
    slab: "minecraft:polished_blackstone_brick_slab",
    floor: (w) => (w ? PBB : MATTE),
    ceiling: TILES,
    lanterns: true,
  });
  // Bones and skulls along its sides.
  for (const p of ASCENT_PROFILE) {
    if (hash2(p.t, 1, 62) > 0.2) continue;
    const w = hash2(p.t, 2, 62) < 0.5 ? -1 : 1;
    const x = p.x + (p.dz ? w : 0), z = p.z + (p.dx ? w : 0);
    c.set(x, Math.ceil(p.y), z, hash2(p.t, 3, 62) < 0.5 ? "minecraft:skeleton_skull" : "minecraft:bone_block", { facing_direction: 1, pillar_axis: "y" });
  }

  // The hidden way: narrow, dark, with pools of lava to leap.
  road(c, HIDDEN_PROFILE, 3, { lavaAt: new Set([22, 23, 46, 47, 70, 71]), drips: true });
  // The cracked bricks that hide its mouth.
  const { crack } = HIDDEN_TUNNEL;
  c.fill(crack.x, CRACK_LEDGE.y, crack.z - 1, crack.x, CRACK_LEDGE.y + 2, crack.z + 1, "minecraft:cracked_deepslate_bricks");

  // Beyond the inner gate of Dis: the road to the Throat, the Throat, and
  // the tunnel to the shore of the frozen lake.
  tunnelCells(THROAT_ROAD.points, (x, z) => {
    c.set(x, DIS.floorY - 1, z, PBB);
    c.fill(x, DIS.floorY, z, x, DIS.floorY + 4, z, "minecraft:air");
    c.set(x, DIS.floorY + 5, z, TILES);
  });
  const T = THROAT;
  cells(c, T.minX, T.maxX, T.minZ, T.maxZ, (x, z) => {
    const wall = x === T.minX || x === T.maxX || z === T.minZ || z === T.maxZ;
    if (wall) return;
    c.fill(x, T.bottomY, z, x, T.topY + 4, z, "minecraft:air");
    c.set(x, T.bottomY - 1, z, TILES);
    c.set(x, T.topY + 5, z, TILES);
  });
  // From the door at the top, round and down to the floor of the shaft.
  wallStair(T.minX + 1, T.maxX - 1, T.minZ + 1, T.maxZ - 1, T.topY, T.bottomY, 2, (x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
    c.set(x, fy - 2, z, BLACK);
  }, { startAt: [T.maxX - 1, THROAT.doorZ], down: true });
  // A chain down the middle of the Throat, with a soul lantern at its end.
  const mx = Math.floor((T.minX + T.maxX) / 2), mz = Math.floor((T.minZ + T.maxZ) / 2);
  c.fill(mx, T.bottomY + 8, mz, mx, T.topY + 4, mz, CHAIN[0], CHAIN[1]);
  c.set(mx, T.bottomY + 7, mz, "minecraft:soul_lantern", { hanging: true });
  for (let x = THROAT_TUNNEL.toX; x <= THROAT_TUNNEL.fromX; x++) {
    for (let w = -1; w <= 1; w++) {
      const z = THROAT_TUNNEL.z + w;
      c.set(x, CAVERN.lakeY - 1, z, w ? PBB : MATTE);
      c.fill(x, CAVERN.lakeY, z, x, CAVERN.lakeY + 3, z, "minecraft:air");
      c.set(x, CAVERN.lakeY + 4, z, TILES);
      if (!w && x % 9 === 0) c.set(x, CAVERN.lakeY + 3, z, "minecraft:soul_lantern", { hanging: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Layer II: the City of Dis
// ---------------------------------------------------------------------------

const RED = "minecraft:red_nether_brick";
const NETHER = "minecraft:nether_brick";

function disShape(x, z) {
  const dn = ((x + 0.5 - DIS.x) / DIS.rx) ** 2 + ((z + 0.5 - DIS.z) / DIS.rz) ** 2;
  const wobble = (fbm(x / 10, z / 10, 71) - 0.5) * 0.14;
  if (dn > 1 + wobble) return null;
  const r = Math.hypot(x + 0.5 - DIS.x, z + 0.5 - DIS.z);
  let floor = DIS.floorY;
  if (r > DIS.wallR + 8) floor += Math.round((r - DIS.wallR - 8) * 0.5 * (0.6 + 0.8 * fbm(x / 7, z / 7, 72)));
  const ceil = disCeil(x, z) - Math.floor(fbm(x / 8, z / 8, 73) * 3);
  return { floor: Math.min(floor, ceil - 8), ceil, r };
}
const riverDist = (x, z) => Math.abs(x + 0.5 - riverX(z + 0.5));
const inCity = (x, z) => Math.hypot(x + 0.5 - DIS.x, z + 0.5 - DIS.z) < DIS.wallR;
/** The streets of Dis: an avenue from the west gate, a way north-south, and roads to the landmarks. */
function street(x, z) {
  const rx = riverX(z + 0.5);
  if (Math.abs(z - DIS.z) <= 2 && x < rx) return true; // the avenue from the west gate
  if (Math.abs(x - 118) <= 1 && z >= MAUSOLEUM.z + MAUSOLEUM.half && z <= DIS_INNER_GATE.z) return true;
  if (Math.abs(z - BRIDGES[0].z) <= 1 && x > rx && x <= FURY_TOWER.minX) return true;
  if (Math.abs(x - (FURY_TOWER.minX - 1)) <= 1 && z >= FURY_TOWER.maxZ && z <= BRIDGES[0].z) return true;
  if (Math.abs(z - BRIDGES[1].z) <= 1 && x > rx && x <= KENNEL.minX) return true;
  return false;
}

function dis(c) {
  const F = DIS.floorY;
  // The cavern, the river of fire, the ceiling.
  cells(c, DIS.x - DIS.rx - 4, DIS.x + DIS.rx + 4, DIS.z - DIS.rz - 4, DIS.z + DIS.rz + 4, (x, z) => {
    const s = disShape(x, z);
    if (!s) return;
    c.fill(x, s.floor, z, x, s.ceil - 1, z, "minecraft:air");
    const h = hash2(x, z, 74);
    let ground = h < 0.3 ? "minecraft:soul_soil" : h < 0.6 ? BLACK : h < 0.85 ? "minecraft:basalt" : "minecraft:coarse_dirt";
    if (inCity(x, z) && street(x, z)) ground = hash2(x, z, 76) < 0.15 ? "minecraft:cracked_polished_blackstone_bricks" : PBB;
    c.set(x, s.floor - 1, z, ground);
    c.set(x, s.ceil, z, hash2(x, z, 75) < 0.12 ? "minecraft:magma" : DEEP);
    const rd = riverDist(x, z);
    if (rd <= RIVER_HALF) {
      c.set(x, F - 5, z, DEEP);
      c.fill(x, F - 4, z, x, F - 3, z, "minecraft:lava");
      c.fill(x, F - 2, z, x, Math.max(F - 1, s.floor - 1), z, "minecraft:air");
    } else if (rd <= RIVER_HALF + 1.2 && s.floor === F) c.set(x, F - 1, z, "minecraft:magma");
    // Chains and cages hang from the dark; dripstone fangs.
    const k = hash2(x, z, 77);
    if (k < 0.004 && !street(x, z)) {
      const end = s.ceil - 6 - Math.floor(hash2(x, z, 78) * 10);
      c.fill(x, end + 1, z, x, s.ceil - 1, z, CHAIN[0], CHAIN[1]);
      c.set(x, end, z, "minecraft:soul_lantern", { hanging: true });
    } else if (k < 0.05) {
      const len = 1 + Math.floor(hash2(x, z, 79) * 4);
      for (let i = 0; i < len; i++) {
        const part = i === 0 ? "tip" : i === 1 ? "frustum" : i === len - 1 ? "base" : "middle";
        c.set(x, s.ceil - len + i, z, "minecraft:pointed_dripstone", { dripstone_thickness: part, hanging: true });
      }
    }
  });

  disWall(c);
  // The Field of Tombs: the burning graves of the heretics, west of the river.
  for (let gx = DIS.x - DIS.wallR + 6; gx < DIS.x + 10; gx += 5) {
    for (let gz = DIS.z - DIS.wallR + 6; gz < DIS.z + DIS.wallR - 4; gz += 6) {
      const x = gx + Math.floor(hash2(gx, gz, 80) * 3) - 1;
      const z = gz + Math.floor(hash2(gx, gz, 81) * 3) - 1;
      if (!c.has(x, z) && !c.has(x + 2, z + 4)) continue;
      if (Math.hypot(x - DIS.x, z - DIS.z) > DIS.wallR - 6 || riverDist(x, z) < RIVER_HALF + 5 || x > riverX(z) - 4) continue;
      if (Math.abs(z - DIS.z) <= 5 || Math.abs(x - 118) <= 4) continue;
      if (Math.abs(x - MAUSOLEUM.x) <= MAUSOLEUM.half + 4 && Math.abs(z - MAUSOLEUM.z) <= MAUSOLEUM.half + 4) continue;
      if (Math.hypot(x - FALLEN_KING.x, z - FALLEN_KING.z) < FALLEN_KING.r + 6) continue;
      if (x > 94 && x < 112 && Math.abs(z) < 5) continue; // where the hidden way comes out
      const h = hash2(gx, gz, 82);
      if (h < 0.68) tomb(c, x, z, hash2(gx, gz, 83) < 0.5);
      else if (h < 0.9) ruin(c, x, z, gx, gz);
      else c.set(x, F, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    }
  }
  mausoleum(c);
  furyTower(c);
  kennel(c);
  fallenKing(c);
  for (const b of BRIDGES) {
    for (const cell of bridgeCells(b)) {
      if (b.crumbling) c.set(cell.x, F - 1, cell.z, cell.edge ? "minecraft:cracked_deepslate_tiles" : "minecraft:cracked_deepslate_bricks");
      else {
        c.set(cell.x, F - 1, cell.z, cell.edge ? PBB : MATTE);
        c.set(cell.x, F - 2, cell.z, PB);
        if (cell.edge && (cell.x % 3 === 0)) {
          c.set(cell.x, F, cell.z, "minecraft:polished_blackstone_wall");
          c.set(cell.x, F + 1, cell.z, "minecraft:skeleton_skull", { facing_direction: 1 });
        }
      }
    }
  }
}

/** The red-hot iron walls of Dis, its twelve towers and two gates. */
function disWall(c) {
  const F = DIS.floorY;
  const R = DIS.wallR;
  const gate = innerGateCells();
  const gateKeys = new Set(gate.map((g) => `${g.x},${g.z}`));
  cells(c, DIS.x - R - 8, DIS.x + R + 8, DIS.z - R - 8, DIS.z + R + 8, (x, z) => {
    const px = x + 0.5 - DIS.x, pz = z + 0.5 - DIS.z;
    const r = Math.hypot(px, pz);
    const a = Math.atan2(pz, px);
    // Towers: twelve, flanking the gates.
    for (let i = 0; i < 12; i++) {
      const ta = (i * Math.PI) / 6 + Math.PI / 12;
      const tx = DIS.x + (R + 1.5) * Math.cos(ta), tz = DIS.z + (R + 1.5) * Math.sin(ta);
      const d = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
      if (d > 4.6 || riverDist(x, z) <= RIVER_HALF + 1) continue;
      const top = DIS.wallTop + 8;
      c.voxels(0, 0, 0, 0, F - 1, top, () => [x, z], (u, y) => {
        if (d > 3.6 && y === top) return (x + z) % 2 ? [RED] : null;
        if (y === top - 1 && d > 3.6) return [RED];
        if (d > 3.6 && (y - F) % 6 === 4 && Math.abs(Math.sin(Math.atan2(z + 0.5 - tz, x + 0.5 - tx) * 2)) < 0.25) return ["minecraft:magma"];
        if (y % 5 === 0) return ["minecraft:magma"];
        return [hash3(x, y, z, 84) < 0.5 ? RED : BLACK];
      });
      if (d < 1) {
        c.set(x, top + 1, z, "minecraft:netherrack");
        c.set(x, top + 2, z, "minecraft:fire");
      }
      return;
    }
    if (r < R || r >= R + 3) return;
    if (gateKeys.has(`${x},${z}`)) return; // drawn below
    const rd = riverDist(x, z);
    const westGate = Math.abs(z - DIS_WEST_GATE.z) <= 2 && x < DIS.x;
    c.voxels(0, 0, 0, 0, F - 1, DIS.wallTop + 1, () => [x, z], (u, y) => {
      if (y === DIS.wallTop + 1) return (Math.round(a * 60) % 2) && r > R + 1.5 ? [RED] : null;
      if (rd <= RIVER_HALF && y < F + 4) return y <= F - 1 ? null : ["minecraft:iron_bars"]; // culvert over the river
      if (westGate && y >= F && y <= F + 7) return Math.abs(z - DIS_WEST_GATE.z) === 2 || y === F + 7 ? [GILDED] : ["minecraft:air"];
      if (y % 5 === 0) return ["minecraft:magma"];
      const h = hash3(x, y, z, 85);
      return [h < 0.4 ? RED : h < 0.75 ? BLACK : NETHER];
    });
    if (westGate) c.fill(x, F + 5, z, x, F + 6, z, "minecraft:iron_bars"); // the portcullis, raised
  });
  // The inner gate, shut. Three locks (one per Seal) of crying obsidian.
  for (const g of gate) {
    const id = g.kind === "frame" ? GILDED : g.kind === "bars" ? "minecraft:iron_bars" : "minecraft:crying_obsidian";
    c.set(g.x, g.y, g.z, id);
  }
  for (const g of gate) if (g.y === DIS.floorY) c.set(g.x, g.y - 1, g.z, PBB);
}

function tomb(c, x, z, alongX) {
  const F = DIS.floorY;
  const [w, l] = alongX ? [5, 3] : [3, 5];
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < l; dz++) {
      const inner = dx > 0 && dx < w - 1 && dz > 0 && dz < l - 1;
      if (inner) {
        c.set(x + dx, F - 1, z + dz, "minecraft:netherrack");
        c.set(x + dx, F, z + dz, "minecraft:fire");
      } else c.set(x + dx, F, z + dz, (dx + dz) % 4 === 0 ? CHISELED : PB);
    }
  }
  // The lid, thrown aside; sometimes a headstone with a skull.
  const lx = alongX ? x + 1 : x + w;
  const lz = alongX ? z + l : z + 1;
  c.set(lx, F, lz, "minecraft:polished_blackstone_slab", { "minecraft:vertical_half": "bottom" });
  if (hash2(x, z, 86) < 0.4) {
    const hx = alongX ? x - 1 : x + 1, hz = alongX ? z + 1 : z - 1;
    c.fill(hx, F, hz, hx, F + 1, hz, "minecraft:polished_blackstone_wall");
    c.set(hx, F + 2, hz, "minecraft:skeleton_skull", { facing_direction: 1 });
  }
}

function ruin(c, x, z, gx, gz) {
  const F = DIS.floorY;
  const h = Math.floor(hash2(gx, gz, 87) * 3) + 1;
  for (let i = 0; i < 4; i++) {
    c.fill(x + i, F, z, x + i, F + Math.max(0, h - (i % 2)), z, hash2(x + i, z, 88) < 0.3 ? "minecraft:cracked_polished_blackstone_bricks" : PBB);
  }
  for (let i = 1; i < 3; i++) c.fill(x, F, z + i, x, F + Math.max(0, h - i), z + i, PBB);
  if (hash2(gx, gz, 89) < 0.5) c.fill(x + 2, F, z + 2, x + 4, F, z + 2, BASALT, { pillar_axis: "x" }); // a fallen pillar
}

/** The Mausoleum: the Seal of Ash on its altar, burning tombs around it. */
function mausoleum(c) {
  const F = DIS.floorY;
  const { x: mx, z: mz, half } = MAUSOLEUM;
  c.fill(mx - half - 1, F - 1, mz - half - 1, mx + half + 1, F - 1, mz + half + 1, PBB);
  c.fill(mx - half - 1, F, mz - half - 1, mx + half + 1, F, mz + half + 1, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  c.fill(mx - half, F, mz - half, mx + half, F, mz + half, TILES);
  c.fill(mx - half + 1, F + 1, mz - half + 1, mx + half - 1, F + 6, mz + half - 1, "minecraft:air");
  for (let dx = -half; dx <= half; dx++) {
    for (let dz = -half; dz <= half; dz++) {
      const edge = Math.abs(dx) === half || Math.abs(dz) === half;
      if (!edge) continue;
      const door = Math.min(Math.abs(dx), Math.abs(dz)) <= 1;
      const pillar = Math.abs(dx) % 3 === 0 && Math.abs(dz) % 3 === 0;
      if (door) {
        c.fill(mx + dx, F + 4, mz + dz, mx + dx, F + 6, mz + dz, CHISELED);
        continue;
      }
      c.fill(mx + dx, F + 1, mz + dz, mx + dx, F + 6, mz + dz, pillar ? BASALT : PBB, pillar ? { pillar_axis: "y" } : undefined);
    }
  }
  for (let k = 0; k <= half; k++) c.fill(mx - half + k, F + 7 + k, mz - half + k, mx + half - k, F + 7 + k, mz + half - k, k === half ? GILDED : MATTE);
  const s = SEALS[0];
  c.set(s.x, s.y - 1, s.z, CHISELED);
  c.set(s.x, s.y, s.z, "minecraft:crying_obsidian");
  c.fill(s.x, s.y + 1, s.z, s.x, F + 6, s.z, CHAIN[0], CHAIN[1]);
  for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
    c.set(s.x + dx, F, s.z + dz, "minecraft:soul_soil");
    c.set(s.x + dx, F + 1, s.z + dz, "minecraft:soul_fire");
  }
  for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    for (let i = -1; i <= 1; i++) {
      c.set(s.x + dx + i, F, s.z + dz, "minecraft:netherrack");
      c.set(s.x + dx + i, F + 1, s.z + dz, "minecraft:fire");
    }
  }
}

/** The Tower of the Furies: the Seal of Wind at its top, among their nests. */
function furyTower(c) {
  const F = DIS.floorY;
  const T = FURY_TOWER;
  const cz = Math.floor((T.minZ + T.maxZ) / 2);
  cells(c, T.minX, T.maxX, T.minZ, T.maxZ, (x, z) => {
    const wall = x === T.minX || x === T.maxX || z === T.minZ || z === T.maxZ;
    const corner = (x === T.minX || x === T.maxX) && (z === T.minZ || z === T.maxZ);
    if (wall) {
      c.voxels(0, 0, 0, 0, F - 1, T.topY + 1, () => [x, z], (u, y) => {
        if (y === T.topY + 1) return (x + z) % 2 ? [RED] : null;
        const win = !corner && (x + z) % 4 === 0 && (y - F) % 7 >= 3 && (y - F) % 7 <= 5 && y < T.topY - 1;
        if (win) return ["minecraft:iron_bars"];
        return [corner ? BASALT : y % 6 === 0 ? "minecraft:magma" : RED, corner ? { pillar_axis: "y" } : undefined];
      });
    } else {
      c.set(x, F - 1, z, TILES);
      c.fill(x, F, z, x, T.topY - 1, z, "minecraft:air");
      c.set(x, T.topY, z, PBB);
    }
  });
  c.fill(T.minX, F, cz - 1, T.minX, F + 3, cz + 1, "minecraft:air");
  const stair = (f) => wallStair(T.minX + 1, T.maxX - 1, T.minZ + 1, T.maxZ - 1, F + 0.5, T.topY + 1.01, 2, f);
  stair((x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  // Clear headroom where the stair comes up through the top.
  stair((x, z, y) => {
    if (Math.ceil(y) + 2 < T.topY) return;
    c.fill(x, Math.ceil(y), z, x, Math.min(T.topY + 3, Math.ceil(y) + 2), z, "minecraft:air");
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  // Nests of bone and black feathers, and the Seal.
  for (const [x, z] of [[T.minX + 2, T.minZ + 2], [T.maxX - 2, T.maxZ - 2], [T.minX + 2, T.maxZ - 2]]) {
    c.set(x, T.topY + 1, z, "minecraft:black_wool");
    c.set(x + 1, T.topY + 1, z, "minecraft:bone_block", { pillar_axis: "x" });
    c.set(x, T.topY + 1, z + 1, "minecraft:skeleton_skull", { facing_direction: 1 });
  }
  const s = SEALS[1];
  c.set(s.x, s.y - 1, s.z, CHISELED);
  c.set(s.x, s.y, s.z, "minecraft:crying_obsidian");
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) c.set(s.x + dx * 2, s.y, s.z + dz * 2, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: false });
}

/** The Kennel of Garm: a bone-strewn yard, and the den where the Seal of Teeth lies. */
function kennel(c) {
  const F = DIS.floorY;
  const K = KENNEL;
  cells(c, K.minX, K.maxX, K.minZ, K.maxZ, (x, z) => {
    const wall = x === K.minX || x === K.maxX || z === K.minZ || z === K.maxZ;
    const gate = x === K.minX && Math.abs(z - K.gateZ) <= 2;
    c.set(x, F - 1, z, hash2(x, z, 90) < 0.6 ? "minecraft:soul_soil" : "minecraft:coarse_dirt");
    if (gate) {
      c.fill(x, F + 4, z, x, F + 4, z, RED);
      return;
    }
    if (wall) {
      c.fill(x, F, z, x, F + 1, z, RED);
      c.fill(x, F + 2, z, x, F + 3, z, (x + z) % 3 ? "minecraft:iron_bars" : RED);
      return;
    }
    const h = hash2(x, z, 91);
    if (h < 0.05) c.set(x, F, z, "minecraft:bone_block", { pillar_axis: h < 0.025 ? "x" : "z" });
    else if (h < 0.07) c.set(x, F, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    else if (h < 0.075) {
      c.fill(x, F, z, x, F + 2, z, "minecraft:polished_blackstone_wall");
      c.fill(x, F + 3, z, x, F + 3, z, CHAIN[0], CHAIN[1]);
    }
  });
  // Kennels along the north wall.
  for (let x = K.minX + 3; x < K.maxX - 10; x += 6) {
    c.fill(x, F, K.minZ + 1, x + 3, F + 2, K.minZ + 3, BLACK);
    c.fill(x + 1, F, K.minZ + 1, x + 2, F + 1, K.minZ + 3, "minecraft:air");
    c.fill(x + 1, F, K.minZ + 1, x + 2, F, K.minZ + 1, "minecraft:bone_block", { pillar_axis: "x" });
  }
  // The den: a mound of black rock, open to the west.
  const D = DEN;
  cells(c, D.x - D.r - 1, D.x + D.r + 1, D.z - D.r - 1, D.z + D.r + 1, (x, z) => {
    const dh = Math.hypot(x + 0.5 - D.x - 0.5, z + 0.5 - D.z - 0.5);
    if (dh > D.r + 0.5) return;
    const height = Math.floor(Math.sqrt(Math.max(0, (D.r + 0.5) ** 2 - dh * dh)));
    const shell = dh > D.r - 1.2;
    const door = x < D.x - 2 && Math.abs(z - D.z) <= 1;
    if (shell && !door) c.fill(x, F, z, x, F + height, z, hash2(x, z, 92) < 0.7 ? BLACK : "minecraft:basalt");
    else {
      c.fill(x, F, z, x, F + Math.max(2, height - 1), z, "minecraft:air");
      c.set(x, F + Math.max(3, height), z, BLACK);
      if (!door && hash2(x, z, 93) < 0.25) c.set(x, F, z, "minecraft:bone_block", { pillar_axis: "y" });
    }
  });
  const s = SEALS[2];
  c.set(s.x, s.y - 1, s.z, CHISELED);
  c.set(s.x, s.y, s.z, "minecraft:crying_obsidian");
  c.set(s.x, s.y + 3, s.z, "minecraft:soul_lantern", { hanging: true });
}

/** The Fallen King: the crowned head of a toppled colossus, half sunk in the ash. */
function fallenKing(c) {
  const F = DIS.floorY;
  const K = FALLEN_KING;
  const cy = F + 1;
  cells(c, K.x - K.r - 6, K.x + K.r + 6, K.z - K.r - 2, K.z + K.r + 2, (x, z) => {
    for (let y = F - 1; y <= cy + K.r + 1; y++) {
      const dx = x + 0.5 - K.x, dy = y + 0.5 - cy, dz = z + 0.5 - K.z;
      const d = Math.hypot(dx, dy, dz);
      // Crown: a gilded band and spikes on the east side (the head lies on its side).
      const crownBand = dx > K.r - 2.5 && dx < K.r - 0.5 && Math.hypot(dy, dz) < K.r - 1;
      const spike = dx >= K.r - 1 && dx < K.r + 5 && Math.hypot(dy, dz) > 3 && Math.hypot(dy, dz) < 5.5 - (dx - K.r + 1) * 0.7 && Math.abs(Math.sin(Math.atan2(dy, dz) * 4)) > 0.8;
      if (d > K.r && !spike) continue;
      let id = hash3(x, y, z, 94) < 0.25 ? "minecraft:cracked_polished_blackstone_bricks" : BLACK;
      if (crownBand || spike) id = GILDED;
      // Hollow eyes on the west face, weeping.
      const eye = dx < -K.r + 2.5 && Math.abs(dy - 1.5) < 1.2 && Math.abs(Math.abs(dz) - 2.5) < 1.1;
      if (eye) id = "minecraft:magma";
      if (dx < -K.r + 2 && dy < 0.5 && dy > -1.5 && Math.abs(Math.abs(dz) - 2.5) < 0.7) id = "minecraft:crying_obsidian";
      c.set(x, y, z, id);
    }
  });
}

// ---------------------------------------------------------------------------
// Layer III: the cavern of the Spire
// ---------------------------------------------------------------------------

function cavernShape(x, z) {
  const dn = ((x + 0.5 - CAVERN.x) / CAVERN.rx) ** 2 + ((z + 0.5 - CAVERN.z) / CAVERN.rz) ** 2;
  const wobble = (fbm(x / 9, z / 9, 41) - 0.5) * 0.14;
  if (dn > 1 + wobble) return null;
  const d = Math.sqrt(Math.max(0, dn));
  let floor = CAVERN.lakeY;
  if (d > 0.86) floor += Math.round(((d - 0.86) / 0.14) * 8 * (0.6 + 0.8 * fbm(x / 6, z / 6, 42)));
  const ceil = cavernCeil(x, z) - Math.floor(fbm(x / 7, z / 7, 43) * 3);
  return { floor: Math.min(floor, ceil - 6), ceil, lake: floor === CAVERN.lakeY, d };
}

function nearStructure(x, z, m = 0) {
  return (
    (x >= SPIRE.minX - 4 - m && x <= SPIRE.maxX + 4 + m && z >= SPIRE.minZ - 4 - m && z <= SPIRE.maxZ + 4 + m) ||
    (x >= CLOCKTOWER.minX - 3 - m && x <= CLOCKTOWER.maxX + 3 + m && z >= CLOCKTOWER.minZ - 3 - m && z <= CLOCKTOWER.maxZ + 3 + m) ||
    (x >= CATHEDRAL.minX - 6 - m && x <= CATHEDRAL.maxX + 6 + m && z >= CATHEDRAL.minZ - 3 - m && z <= CATHEDRAL.maxZ + 9 + m) ||
    (x >= THROAT_TUNNEL.toX - 4 && Math.abs(z - THROAT_TUNNEL.z) <= 3 + m)
  );
}

function cavern(c) {
  cells(c, CAVERN.x - CAVERN.rx - 4, CAVERN.x + CAVERN.rx + 4, CAVERN.z - CAVERN.rz - 4, CAVERN.z + CAVERN.rz + 4, (x, z) => {
    const s = cavernShape(x, z);
    if (!s) return;
    c.fill(x, s.floor, z, x, s.ceil - 1, z, "minecraft:air");
    if (s.lake) {
      // Cocytus: black ice veined with frost, over packed ice.
      const vein = Math.abs(fbm(x / 8, z / 8, 44) - 0.5) < 0.025;
      c.set(x, s.floor - 1, z, vein ? "minecraft:packed_ice" : "minecraft:black_stained_glass");
      c.set(x, s.floor - 2, z, "minecraft:packed_ice");
    } else {
      const h = hash2(x, z, 45);
      c.set(x, s.floor - 1, z, h < 0.4 ? BLACK : h < 0.7 ? "minecraft:basalt" : h < 0.85 ? "minecraft:soul_soil" : DEEP);
    }
    c.set(x, s.ceil, z, hash2(x, z, 46) < 0.6 ? DEEP : BLACK);
    // Stalactites of dripstone, and great fangs of deepslate.
    if (nearStructure(x, z)) return;
    const h = hash2(x, z, 47);
    if (h < 0.05) {
      const len = 1 + Math.floor(hash2(x, z, 48) * 4);
      for (let i = 0; i < len; i++) {
        // From the bottom up: tip, frustum, middle..., base.
        const part = i === 0 ? "tip" : i === 1 ? "frustum" : i === len - 1 ? "base" : "middle";
        c.set(x, s.ceil - len + i, z, "minecraft:pointed_dripstone", { dripstone_thickness: part, hanging: true });
      }
    }
  });
  // Great fangs: cones of deepslate hanging from the dark.
  for (let i = 0; i < 26; i++) {
    const a = hash2(i, 1, 49) * Math.PI * 2;
    const rr = 0.2 + 0.7 * Math.sqrt(hash2(i, 2, 49));
    const fx = Math.round(CAVERN.x + Math.cos(a) * CAVERN.rx * rr);
    const fz = Math.round(CAVERN.z + Math.sin(a) * CAVERN.rz * rr);
    if (nearStructure(fx, fz, 3)) continue;
    const top = cavernCeil(fx, fz);
    const len = 8 + Math.floor(hash2(i, 3, 49) * 12);
    const rad = 2 + hash2(i, 4, 49) * 1.5;
    cells(c, fx - 4, fx + 4, fz - 4, fz + 4, (x, z) => {
      const r = Math.hypot(x - fx, z - fz);
      if (r > rad) return;
      const depth = Math.round(len * (1 - r / rad));
      if (depth > 0) c.fill(x, top - depth, z, x, top, z, hash2(x, z, 50) < 0.7 ? DEEP : "minecraft:dripstone_block");
    });
  }
}

/** Apep: coils of the serpent arch out of the black ice around the Spire. */
function serpent(c) {
  const R = SERPENT.r;
  cells(c, CAVERN.x - R - 4, CAVERN.x + R + 4, CAVERN.z - R - 4, CAVERN.z + R + 4, (x, z) => {
    const dx = x + 0.5 - CAVERN.x, dz = z + 0.5 - CAVERN.z;
    const r = Math.hypot(dx, dz);
    if (Math.abs(r - R) > 3) return;
    const a = Math.atan2(dz, dx);
    const cy = CAVERN.lakeY - 2 + 6.5 * Math.sin(4 * a + 0.6);
    for (let y = CAVERN.lakeY - 3; y <= cy + 3; y++) {
      if ((r - R) ** 2 + (y + 0.5 - cy) ** 2 > 6.5) continue;
      const scale = hash3(x, y, z, 51);
      c.set(x, y, z, scale < 0.12 ? GILDED : (Math.floor(a * 12) + y) % 3 === 0 ? PB : BLACK);
    }
  });
  // The head rears out of the ice, jaws open.
  const H = SERPENT_HEAD;
  const [ux, uz] = H.dir;
  cells(c, Math.floor(H.x - 9), Math.ceil(H.x + 9), Math.floor(H.z - 9), Math.ceil(H.z + 9), (x, z) => {
    const px = x + 0.5 - H.x, pz = z + 0.5 - H.z;
    const along = px * ux + pz * uz;
    const side = -px * uz + pz * ux;
    for (let y = CAVERN.lakeY - 2; y <= H.y + 4; y++) {
      const py = y + 0.5 - H.y;
      // Neck: from the coil up to the back of the head.
      const t = Math.min(1, Math.max(0, (y - CAVERN.lakeY + 2) / (H.y - CAVERN.lakeY + 2)));
      const neckAlong = -3 + 1.5 * t;
      const inNeck = y <= H.y && (along - neckAlong) ** 2 + side ** 2 <= 5.5;
      const inHead = (along / 5.5) ** 2 + (side / 3) ** 2 + (py / 2.6) ** 2 <= 1;
      if (!inNeck && !inHead) continue;
      if (inHead && along > 0.5 && Math.abs(py) < 0.7) continue; // the open jaws
      const eye = inHead && Math.abs(Math.abs(side) - 2) < 0.6 && py > 0.5 && py < 1.6 && along > 0.5 && along < 2;
      c.set(x, y, z, eye ? "minecraft:shroomlight" : hash3(x, y, z, 52) < 0.1 ? GILDED : BLACK);
    }
    // Fangs.
    if (Math.abs(along - 4) < 0.6 && Math.abs(Math.abs(side) - 1.2) < 0.6) {
      c.set(x, H.y, z, "minecraft:pointed_dripstone", { dripstone_thickness: "tip", hanging: true });
    }
  });
}

// ---------------------------------------------------------------------------
// The Spire of Absolute Contract
// ---------------------------------------------------------------------------

/** A square spiral stair along the inside of a rectangle, half a block per step. */
export function wallStair(minX, maxX, minZ, maxZ, fromY, toY, width, f, opts = {}) {
  let lanes = [];
  for (let z = minZ; z <= maxZ; z++) lanes.push([minX, z, 1, 0]);
  for (let x = minX + 1; x <= maxX; x++) lanes.push([x, maxZ, 0, -1]);
  for (let z = maxZ - 1; z >= minZ; z--) lanes.push([maxX, z, -1, 0]);
  for (let x = maxX - 1; x > minX; x--) lanes.push([x, minZ, 0, 1]);
  if (opts.startAt) {
    // Begin at a given cell (e.g. a door) and go round from there.
    const i = lanes.findIndex(([x, z]) => x === opts.startAt[0] && z === opts.startAt[1]);
    if (i > 0) lanes = [...lanes.slice(i), ...lanes.slice(0, i)];
  }
  const dir = opts.down ? -1 : 1;
  const done = (y) => (opts.down ? y < toY : y > toY);
  let t = 0;
  for (;;) {
    for (const [x, z, ix, iz] of lanes) {
      const y = fromY + dir * t * 0.5;
      if (done(y)) return;
      for (let w = 0; w < width; w++) f(x + ix * w, z + iz * w, y, t);
      t++;
    }
  }
}

function spire(c) {
  const S = SPIRE;
  const L = CAVERN.lakeY;
  const H = S.hallY;
  // Plinth.
  c.fill(S.minX - 2, L - 2, S.minZ - 2, S.maxX + 2, L - 1, S.maxZ + 2, TILES);
  c.fill(S.minX - 2, L, S.minZ - 2, S.maxX + 2, L, S.maxZ + 2, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  c.fill(S.minX - 1, L, S.minZ - 1, S.maxX + 1, L, S.maxZ + 1, PBB);
  // The tower: matte black walls banded with deepslate tiles.
  cells(c, S.minX, S.maxX, S.minZ, S.maxZ, (x, z) => {
    const wall = x <= S.minX + 1 || x >= S.maxX - 1 || z <= S.minZ + 1 || z >= S.maxZ - 1;
    if (wall) {
      c.voxels(0, 0, 0, 0, L + 1, S.roofY - 4, () => [x, z], (u, y) => {
        if (y % 12 === 0) return [TILES];
        const corner = (x <= S.minX + 1 || x >= S.maxX - 1) && (z <= S.minZ + 1 || z >= S.maxZ - 1);
        return [corner ? BASALT : (z + x) % 7 === 0 ? MATTE : PBB, corner ? { pillar_axis: "y" } : undefined];
      });
    } else {
      c.fill(x, L + 1, z, x, H - 1, z, "minecraft:air");
      c.set(x, L, z, Math.abs(x) < 3 && Math.abs(z - 91) < 3 ? "minecraft:soul_soil" : TILES);
    }
  });
  // Slit windows down the base, soul light behind them.
  for (let y = L + 6; y < H - 4; y += 12) {
    for (let z = S.minZ + 5; z < S.maxZ - 3; z += 6) {
      for (const x of [S.minX, S.minX + 1, S.maxX - 1, S.maxX]) c.fill(x, y, z, x, y + 5, z, "minecraft:iron_bars");
    }
  }
  // A well of soul fire at the bottom of the hollow tower.
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.set(dx, L + 1, 91 + dz, "minecraft:soul_campfire");
  // The base door (south), facing the lake.
  c.fill(-1, L + 1, S.minZ, 1, L + 4, S.minZ + 1, "minecraft:air");
  c.fill(-2, L + 5, S.minZ, 2, L + 5, S.minZ, GILDED);
  // The stair inside, from the lake up to the Hall of Thrones.
  wallStair(S.minX + 2, S.maxX - 2, S.minZ + 2, S.maxZ - 2, L + 0.5, H + 0.01, 2, (x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });

  // Buttresses on the long sides.
  for (let z = S.minZ + 4; z <= S.maxZ - 4; z += 8) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x0 = side < 0 ? S.minX - 1 - k : S.maxX + 1 + k;
        const top = H + 12 - k * 9;
        c.fill(x0, L + 1, z, x0, top, z + 1, k ? PBB : BASALT, k ? undefined : { pillar_axis: "y" });
      }
    }
  }

  // --- The Hall of Thrones ---
  const hx1 = S.minX + 2, hx2 = S.maxX - 2, hz1 = S.minZ + 2, hz2 = S.maxZ - 2;
  cells(c, hx1, hx2, hz1, hz2, (x, z) => {
    const aisle = Math.abs(x) <= 2;
    c.set(x, H - 1, z, aisle ? MATTE : Math.abs(x) === 3 ? PBB : TILES);
    const vault = S.vaultY - Math.floor((x * x) / 14);
    c.fill(x, H, z, x, vault - 1, z, "minecraft:air");
    c.set(x, vault, z, z % 6 === 2 ? TILES : PBB);
  });
  // Where the inner stair comes up through the floor: clear its headroom.
  wallStair(S.minX + 2, S.maxX - 2, S.minZ + 2, S.maxZ - 2, L + 0.5, H + 0.01, 2, (x, z, y) => {
    if (Math.ceil(y) + 2 < H - 1) return;
    c.fill(x, Math.ceil(y), z, x, Math.min(H + 2, Math.ceil(y) + 2), z, "minecraft:air");
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  // Pointed windows of tinted glass in the long walls.
  for (let z = hz1 + 3; z <= hz2 - 3; z += 4) {
    for (const x of [S.minX, S.minX + 1, S.maxX - 1, S.maxX]) {
      c.fill(x, H + 5, z, x, H + 10, z, "minecraft:tinted_glass");
      c.set(x, H + 11, z, "minecraft:tinted_glass");
    }
  }
  // The south door, where the bridge arrives.
  c.fill(-1, H, S.minZ, 1, H + 4, S.minZ + 1, "minecraft:air");
  c.fill(-2, H + 5, S.minZ, 2, H + 6, S.minZ, CHISELED);
  c.set(0, H + 6, S.minZ, GILDED);
  // Galleries along both long walls, with the upper thrones.
  for (const side of [-1, 1]) {
    const xg = side < 0 ? hx1 : hx2;
    const xr = side < 0 ? hx1 + 2 : hx2 - 2;
    c.fill(xg, H + 5, hz1 + 4, xg + side * -1, H + 5, hz2 - 2, PBB);
    c.fill(xr, H + 6, hz1 + 4, xr, H + 6, hz2 - 2, "minecraft:polished_blackstone_wall");
  }
  // Forty-two thrones of the assessors, all empty.
  let thrones = 0;
  for (const tier of [0, 1]) {
    for (let z = hz1 + 5; z <= hz2 - 3 && thrones < 42; z += 3) {
      for (const side of [-1, 1]) {
        if (thrones >= 42) break;
        const y = tier ? H + 6 : H;
        const seatX = side < 0 ? hx1 + (tier ? 0 : 1) : hx2 - (tier ? 0 : 1);
        const backX = seatX + side;
        c.set(seatX, y, z, ...stairs("minecraft:polished_blackstone_stairs", side < 0 ? "west" : "east"));
        c.fill(backX, y, z, backX, y + 2, z, PB);
        c.set(backX, y + 3, z, CHISELED);
        c.set(seatX, y, z - 1, "minecraft:polished_blackstone_wall");
        c.set(seatX, y, z + 1, "minecraft:polished_blackstone_wall");
        if (!tier) c.set(seatX, H + 4, z, "minecraft:soul_lantern", { hanging: true });
        thrones++;
      }
    }
  }
  // Braziers of cold soul fire down the aisle.
  for (let z = hz1 + 6; z <= hz2 - 12; z += 8) {
    for (const x of [-3, 3]) {
      c.set(x, H, z, "minecraft:polished_blackstone_wall");
      c.set(x, H + 1, z, "minecraft:soul_campfire");
    }
  }
  // Lanterns hung on long chains from the vault.
  for (let z = hz1 + 8; z <= hz2 - 6; z += 12) {
    c.fill(0, H + 8, z, 0, S.vaultY - 1, z, CHAIN[0], CHAIN[1]);
    c.set(0, H + 7, z, "minecraft:soul_lantern", { hanging: true });
  }

  // The dais and the Devil's throne at the north end.
  c.fill(-6, H, hz2 - 7, 6, H, hz2, PBB);
  c.fill(-6, H, hz2 - 8, 6, H, hz2 - 8, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  c.fill(-2, H + 1, hz2 - 1, 2, H + 9, hz2, PB);
  c.set(0, H + 1, hz2 - 2, ...stairs("minecraft:polished_blackstone_stairs", "north"));
  for (const sx of [-2, 2]) c.fill(sx, H + 1, hz2 - 3, sx, H + 2, hz2 - 2, PBB);
  c.fill(-1, H + 10, hz2, 1, H + 11, hz2, CHISELED);
  for (const sx of [-1, 1]) {
    // Horns.
    for (let k = 0; k < 6; k++) c.set(sx * (3 + (k > 3 ? 1 : 0)), H + 8 + k, hz2 - (k > 4 ? 1 : 0), k === 5 ? GILDED : BLACK);
  }
  // A rose window of tinted glass behind it.
  for (let x = -5; x <= 5; x++) {
    for (let y = -5; y <= 5; y++) {
      const r = Math.hypot(x, y);
      if (r > 5.2) continue;
      const spoke = x === 0 || y === 0 || Math.abs(x) === Math.abs(y);
      for (const z of [S.maxZ - 1, S.maxZ]) c.set(x, H + 12 + y, z, r > 4.3 || spoke ? GILDED : "minecraft:tinted_glass");
    }
  }

  // The Scale of Two Truths, the heart against the feather; Ammit waits.
  const sz = SCALE.z;
  c.fill(SCALE.x, H, sz, SCALE.x, H + 4, sz, "minecraft:polished_blackstone_wall");
  c.fill(SCALE.x - 4, H + 5, sz, SCALE.x + 4, H + 5, sz, PB);
  c.set(SCALE.x, H + 6, sz, GILDED);
  for (const sx of [-4, 4]) {
    c.fill(SCALE.x + sx, H + 3, sz, SCALE.x + sx, H + 4, sz, CHAIN[0], CHAIN[1]);
    c.fill(SCALE.x + sx - 1, H + 2, sz, SCALE.x + sx + 1, H + 2, sz, "minecraft:gold_block");
  }
  c.set(SCALE.x - 4, H + 3, sz, "minecraft:redstone_block"); // the heart
  c.set(SCALE.x + 4, H + 3, sz, "minecraft:white_wool"); // the feather of Ma'at
  // Ammit, the Devourer: crocodile head, lion's mane, crouched.
  c.fill(5, H, sz - 3, 6, H + 1, sz + 1, BLACK);
  c.fill(4, H + 1, sz - 4, 7, H + 3, sz - 3, GILDED);
  c.fill(5, H + 2, sz - 5, 6, H + 2, sz - 9, "minecraft:polished_deepslate");
  c.fill(5, H + 1, sz - 5, 6, H + 1, sz - 8, "minecraft:polished_deepslate");
  c.set(5, H + 3, sz - 5, "minecraft:shroomlight");
  c.set(6, H + 3, sz - 5, "minecraft:shroomlight");

  // Roof and the spire itself, reaching for the roof of the world.
  cells(c, S.minX, S.maxX, S.minZ, S.maxZ, (x, z) => {
    const roof = S.roofY - Math.floor(Math.abs(x) / 2.2);
    const vault = S.vaultY - Math.floor((x * x) / 14);
    const from = x <= S.minX + 1 || x >= S.maxX - 1 || z <= S.minZ + 1 || z >= S.maxZ - 1 ? S.roofY - 3 : vault + 1;
    if (roof >= from) c.fill(x, from, z, x, roof, z, PBB);
    c.set(x, roof + 1, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
  });
  for (let k = 0; k <= S.tipY - S.roofY; k++) {
    const w = Math.max(0, 3 - k);
    c.fill(-w, S.roofY + 1 + k, 91 - w, w, S.roofY + 1 + k, 91 + w, k === S.tipY - S.roofY ? GILDED : MATTE);
  }
}

/** Where the bridge once came in: a balcony over the black ice. */
function balcony(c) {
  const H = SPIRE.hallY;
  c.fill(-2, H - 1, SPIRE.minZ - 4, 2, H - 1, SPIRE.minZ - 1, PBB);
  c.fill(-2, H - 3, SPIRE.minZ - 3, 2, H - 2, SPIRE.minZ - 1, PB);
  for (const x of [-2, 2]) c.fill(x, H, SPIRE.minZ - 4, x, H, SPIRE.minZ - 1, "minecraft:polished_blackstone_wall");
  c.fill(-2, H, SPIRE.minZ - 4, 2, H, SPIRE.minZ - 4, "minecraft:polished_blackstone_wall");
  c.set(0, H - 4, SPIRE.minZ - 3, "minecraft:soul_lantern", { hanging: true });
}

// ---------------------------------------------------------------------------
// The Clocktower of Reversion
// ---------------------------------------------------------------------------

/** Relative cells of the clock face: [x, y, z] → block, for hands at the given angles. */
export function clockFace(minuteAngle, hourAngle) {
  const out = [];
  const { x, cy, cz, r } = CLOCK;
  const hands = new Set();
  for (const [ang, len] of [[minuteAngle, CLOCK.minute], [hourAngle, CLOCK.hour]]) {
    for (let s = 0; s <= len; s += 0.5) hands.add(`${Math.round(cy + s * Math.cos(ang))},${Math.round(cz - s * Math.sin(ang))}`);
  }
  for (let dy = -r - 1; dy <= r + 1; dy++) {
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      const d = Math.hypot(dy, dz);
      if (d > r + 1.2) continue;
      let b = "minecraft:calcite";
      if (d > r + 0.2) b = GILDED;
      else if (hands.has(`${cy + dy},${cz + dz}`)) b = PB;
      else if (Math.abs(d - (r - 0.6)) < 0.5) {
        const a = Math.atan2(dz, dy);
        if (Math.abs(((a / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.36) b = BLACK;
      }
      out.push([x, cy + dy, cz + dz, b]);
    }
  }
  return out;
}

function clocktower(c) {
  const T = CLOCKTOWER;
  const L = CAVERN.lakeY;
  cells(c, T.minX, T.maxX, T.minZ, T.maxZ, (x, z) => {
    const wall = x === T.minX || x === T.maxX || z === T.minZ || z === T.maxZ;
    const corner = (x === T.minX || x === T.maxX) && (z === T.minZ || z === T.maxZ);
    if (wall) c.fill(x, L, z, x, T.topY, z, corner ? BASALT : PBB, corner ? { pillar_axis: "y" } : undefined);
    else {
      c.set(x, L, z, TILES);
      c.fill(x, L + 1, z, x, T.topY - 1, z, "minecraft:air");
      c.set(x, T.topY, z, TILES);
    }
  });
  for (let k = 0; k <= 4; k++) c.fill(T.minX + k, T.topY + 1 + k, T.minZ + k, T.maxX - k, T.topY + 1 + k, T.maxZ - k, k === 4 ? GILDED : MATTE);
  // Door (west, toward the Spire).
  c.fill(T.minX, L + 1, CLOCK.cz - 1, T.minX, L + 4, CLOCK.cz + 1, "minecraft:air");
  // Stair up inside to the clock room behind the face.
  const roomY = CLOCK.cy - 5;
  wallStair(T.minX + 1, T.maxX - 1, T.minZ + 1, T.maxZ - 1, L + 0.5, roomY + 1, 1, (x, z, y) => {
    const fy = Math.floor(y);
    if (y % 1) c.set(x, fy, z, "minecraft:polished_blackstone_brick_slab", { "minecraft:vertical_half": "bottom" });
    else c.set(x, fy - 1, z, PBB);
  });
  c.fill(T.minX + 2, roomY, T.minZ + 2, T.maxX - 2, roomY, T.maxZ - 2, TILES);
  c.set(40, roomY + 4, CLOCK.cz, "minecraft:soul_lantern", { hanging: false });
  c.set(40, roomY + 3, CLOCK.cz, PBB);
  // Slit windows.
  for (let y = L + 6; y < T.topY - 2; y += 10) for (const z of [CLOCK.cz - 2, CLOCK.cz + 2]) c.fill(T.maxX, y, z, T.maxX, y + 4, z, "minecraft:iron_bars");
  // The face, hands set at a quarter past the hour (they will turn backwards).
  for (const [x, y, z, b] of clockFace(Math.PI / 2, Math.PI * 0.15)) c.set(x, y, z, b);
}

// ---------------------------------------------------------------------------
// The Inverse Cathedral
// ---------------------------------------------------------------------------

function cathedral(c) {
  const C = CATHEDRAL;
  const cx = (C.minX + C.maxX) / 2;
  const top = C.topY;
  const bottom = top - 12; // walls hang down to here
  // Fused into the roof of the cavern.
  c.fill(C.minX - 2, top, C.minZ - 2, C.maxX + 2, HELL.maxY, C.maxZ + 8, TILES);
  cells(c, C.minX, C.maxX, C.minZ, C.maxZ, (x, z) => {
    const wall = x === C.minX || x === C.maxX || z === C.minZ || z === C.maxZ;
    const dx = Math.abs(x - cx);
    const ridge = bottom - 1 - Math.round((C.maxX - C.minX) / 2 - dx);
    if (wall) {
      c.voxels(0, 0, 0, 0, bottom, top - 1, () => [x, z], (u, y) => {
        const window = (x === C.minX || x === C.maxX) && z % 4 === 0 && y > bottom + 2 && y < top - 3;
        if (window) return [y === bottom + 3 ? GILDED : "minecraft:gray_stained_glass"];
        return [y % 6 === 0 ? TILES : PBB];
      });
    } else c.fill(x, bottom, z, x, top - 1, z, "minecraft:air");
    // The roof, hanging upside down: its ridge points at the lake.
    c.fill(x, ridge, z, x, bottom - 1, z, dx < 0.6 ? GILDED : z % 3 === 0 ? MATTE : TILES);
    if (dx < 0.6 && z % 4 === 2) c.set(x, ridge - 1, z, "minecraft:soul_lantern", { hanging: true });
  });
  // Rose window at the north end.
  for (let dx = -4; dx <= 4; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      const r = Math.hypot(dx, dy);
      if (r > 4.3) continue;
      const spoke = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
      c.set(Math.round(cx + dx), bottom + 6 + dy, C.minZ, spoke || r > 3.5 ? BLACK : "minecraft:red_stained_glass");
    }
  }
  // The bell tower, inverted, ending in a spire that points down at the ice.
  const bx1 = Math.round(cx) - 3, bx2 = Math.round(cx) + 3, bz1 = C.maxZ + 1, bz2 = C.maxZ + 7;
  const towerBottom = bottom - 18;
  cells(c, bx1, bx2, bz1, bz2, (x, z) => {
    const wall = x === bx1 || x === bx2 || z === bz1 || z === bz2;
    const open = !((x - bx1) % 3 === 0 || (z - bz1) % 3 === 0);
    c.voxels(0, 0, 0, 0, towerBottom, top - 1, () => [x, z], (u, y) => {
      if (!wall) return y === towerBottom ? [TILES] : ["minecraft:air"];
      if (open && y > towerBottom + 1 && y < towerBottom + 6) return ["minecraft:air"]; // the belfry
      return [y % 5 === 0 ? MATTE : PBB];
    });
  });
  for (let k = 1; k <= 4; k++) {
    c.fill(bx1 + k - 1, towerBottom - k, bz1 + k - 1, bx2 - k + 1, towerBottom - k, bz2 - k + 1, k === 4 ? GILDED : MATTE);
  }
  c.set(Math.round(cx), towerBottom + 1, Math.round((bz1 + bz2) / 2), "minecraft:soul_lantern", { hanging: false });
  // Flying buttresses, flying upwards into the rock.
  for (let z = C.minZ + 3; z <= C.maxZ - 3; z += 6) {
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? C.minX : C.maxX;
      for (let k = 1; k <= 6; k++) c.fill(x0 + side * k, bottom + 2 + k, z, x0 + side * k, bottom + 3 + k, z, PBB);
    }
  }
}

// ---------------------------------------------------------------------------
// The lake: the frozen damned, cold fires, and the path from the hidden way
// ---------------------------------------------------------------------------

function lake(c) {
  cells(c, CAVERN.x - CAVERN.rx, CAVERN.x + CAVERN.rx, CAVERN.z - CAVERN.rz, CAVERN.z + CAVERN.rz, (x, z) => {
    const s = cavernShape(x, z);
    if (!s?.lake || nearStructure(x, z, 1)) return;
    const r = Math.hypot(x + 0.5 - CAVERN.x, z + 0.5 - CAVERN.z);
    if (Math.abs(r - SERPENT.r) < 4) return;
    const h = hash2(x, z, 55);
    const y = CAVERN.lakeY;
    if (h < 0.014) c.set(x, y, z, "minecraft:skeleton_skull", { facing_direction: 1 });
    else if (h < 0.02) c.set(x, y, z, "minecraft:bone_block", { pillar_axis: "y" });
    else if (h < 0.0235) c.set(x, y, z, "minecraft:soul_campfire");
  });
  // Lantern posts from where the Throat's tunnel comes out toward the Spire's door.
  const ex = THROAT_TUNNEL.toX, ez = THROAT_TUNNEL.z;
  const tx = 0, tz = SPIRE.minZ - 2;
  const n = Math.round(Math.hypot(tx - ex, tz - ez) / 6);
  for (let i = 1; i < n; i++) {
    const x = Math.round(ex + ((tx - ex) * i) / n) + 2;
    const z = Math.round(ez + ((tz - ez) * i) / n);
    if (Math.abs(Math.hypot(x - CAVERN.x, z - CAVERN.z) - SERPENT.r) < 4) continue;
    c.fill(x, CAVERN.lakeY, z, x, CAVERN.lakeY + 1, z, "minecraft:polished_blackstone_wall");
    c.set(x, CAVERN.lakeY + 2, z, "minecraft:soul_lantern", { hanging: false });
  }
}

/** Pedestals for the five syllables of the true name. */
function glyphs(c) {
  for (const g of GLYPHS) {
    c.set(g.x, g.y, g.z, CHISELED);
    c.set(g.x, g.y + 1, g.z, "minecraft:soul_torch");
  }
}

// ---------------------------------------------------------------------------

/** Every operation needed to build one tile of Hell, in order. */
export function* hellTileOps(tile) {
  const steps = [shell, cavern, dis, pit, tunnels, serpent, spire, balcony, clocktower, cathedral, lake, glyphs];
  for (const step of steps) {
    const c = new Canvas(tile, HELL_REGION);
    step(c);
    yield* c.ops;
  }
}

/** Operations that put back solid rock where Hell was. */
export function* hellEraseOps(tile) {
  const c = new Canvas(tile, HELL_REGION);
  const s = HELL.shell;
  for (let x = s.minX; x <= s.maxX; x += 16) {
    for (let z = s.minZ; z <= s.maxZ; z += 16) {
      c.fill(x, HELL.minY, z, Math.min(s.maxX, x + 15), 0, Math.min(s.maxZ, z + 15), DEEP);
      c.fill(x, 1, z, Math.min(s.maxX, x + 15), HELL.maxY, Math.min(s.maxZ, z + 15), "minecraft:stone");
    }
  }
  yield* c.ops;
}

