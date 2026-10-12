// Checks the Hell blueprint: every operation stays inside Hell's reserved box
// and its tile, fills are legal, and every walkable surface (the spiral, the
// tunnels, the bridge, the stairs) has headroom. Run: node tools/test_hell.mjs
import { listHellTiles, isInsideHell, HELL } from "../behavior_pack/scripts/config.js";
import { hellTileOps, wallStair } from "../behavior_pack/scripts/hell_blueprint.js";
import * as L from "../behavior_pack/scripts/hell_layout.js";

let fails = 0;
const check = (c, m) => { if (!c) { fails++; if (fails < 30) console.error("FAIL:", m); } };
const X0 = HELL.shell.minX - 2, Z0 = HELL.shell.minZ - 2, Y0 = HELL.minY, NX = HELL.shell.maxX - HELL.shell.minX + 5, NZ = HELL.shell.maxZ - HELL.shell.minZ + 5, NY = HELL.maxY - HELL.minY + 1;
const vox = new Uint8Array(NX * NZ * NY);
const ids = ["?", "air"];
const code = new Map([["minecraft:air", 1]]);
const idx = (x, y, z) => ((x - X0) * NZ + (z - Z0)) * NY + (y - Y0);
const SOFT = /air|lantern|torch|sign|button|chain|skull|soul_fire|campfire|pointed_dripstone|wall$|iron_bars|lava/;
let ops = 0;
for (const tile of listHellTiles()) {
  for (const op of hellTileOps(tile)) {
    ops++;
    const pts = op[0] === "fill" ? [[op[1], op[2], op[3]], [op[4], op[5], op[6]]] : [[op[1], op[2], op[3]]];
    for (const [x, y, z] of pts) {
      check(isInsideHell(x, y, z), `outside Hell ${JSON.stringify(op)}`);
      check(x >= tile.minX && x <= tile.maxX && z >= tile.minZ && z <= tile.maxZ, `outside tile ${JSON.stringify(op)}`);
    }
    const id = op[0] === "fill" ? op[7] : op[0] === "sign" ? "minecraft:sign" : op[4];
    if (op[0] === "loot" || op[0] === "spawn") continue;
    if (!code.has(id)) { code.set(id, ids.length); ids.push(id); }
    const c = code.get(id);
    if (op[0] === "fill") {
      const vol = (op[4] - op[1] + 1) * (op[5] - op[2] + 1) * (op[6] - op[3] + 1);
      check(vol > 0 && vol <= 32768, `fill volume ${vol}`);
      for (let x = op[1]; x <= op[4]; x++) for (let z = op[3]; z <= op[6]; z++) for (let y = op[2]; y <= op[5]; y++) vox[idx(x, y, z)] = c;
    } else vox[idx(op[1], op[2], op[3])] = c;
  }
}
const at = (x, y, z) => ids[vox[idx(x, y, z)]] ?? "?";
const clear = (x, y, z) => SOFT.test(at(x, y, z));
/** A body standing with feet at height s on cell (x, z) has room. */
function room(x, s, z, what) {
  // Feet at s, head at s + 1.8: every cell the body passes through must be clear
  // (on a half slab, the lower half of the feet cell is the slab itself).
  const cells = [];
  for (let y = Math.floor(s); y <= Math.floor(s + 1.8); y++) if (!(s % 1 && y === Math.floor(s))) cells.push(y);
  const ok = cells.every((y) => clear(x, y, z));
  check(ok, `${what}: no headroom at ${x},${s},${z} (${cells.map((y) => at(x, y, z)).join(", ")})`);
  return ok;
}
function floor(x, s, z, what) {
  const y = s % 1 ? Math.floor(s) : s - 1;
  check(!clear(x, y, z), `${what}: nothing to stand on at ${x},${s},${z} (${at(x, y, z)})`);
}

// The spiral path.
let pathCells = 0;
for (const c of L.pathCells()) {
  if (c.kind === "gap") continue;
  pathCells++;
  room(c.x, L.stepSurface(c.k), c.z, `step ${c.k} lane ${c.lane}`);
  floor(c.x, L.stepSurface(c.k), c.z, `step ${c.k}`);
}
// Every Gate of the Hours has a button and an inscription; the arrival is clear.
for (const h of L.HOURS.slice(0, 11)) {
  const b = L.hourButton(h);
  check(at(b.x, b.y, b.z).includes("button"), `hour ${h.n} button`);
  check(at(b.x, b.y + 1, b.z) === "minecraft:sign", `hour ${h.n} sign`);
}
room(Math.floor(L.ARRIVAL.x), L.ARRIVAL.y, Math.floor(L.ARRIVAL.z), "arrival");
// The hidden way: stones a jump apart and each a block higher, a ledge, the crack, the tunnel.
for (let i = 1; i < L.STONES.length; i++) {
  const a = L.STONES[i - 1], b = L.STONES[i];
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  check(d >= 1 && d <= 3.2 && b.y - a.y === 1, `stone ${i}: ${d.toFixed(1)} apart, rise ${b.y - a.y}`);
  room(b.x, b.y + 1, b.z, `stone ${i}`);
}
for (const p of L.HIDDEN_PROFILE.slice(1)) room(p.x, Math.ceil(p.y), p.z, `hidden tunnel t=${p.t}`); // t=0 is the crack itself
check(at(L.HIDDEN_TUNNEL.crack.x, L.CRACK_LEDGE.y, L.HIDDEN_TUNNEL.crack.z) === "minecraft:cracked_deepslate_bricks", "the hidden tunnel is sealed by cracked bricks");
// The Road of Ashes from the Twelfth Gate to the west gate of Dis.
for (const p of L.ASCENT_PROFILE) { room(p.x, Math.ceil(p.y), p.z, `road of ashes t=${p.t}`); floor(p.x, p.y % 1 ? p.y : Math.ceil(p.y), p.z, `road of ashes t=${p.t}`); }
room(L.DIS_WEST_GATE.x, L.DIS.floorY, L.DIS_WEST_GATE.z, "west gate of Dis");
// Dis: the avenue, the bridges, the seals, the inner gate (shut), the Throat.
for (let x = L.DIS_WEST_GATE.x; x < L.riverX(L.DIS.z) - L.RIVER_HALF - 2; x += 3) room(x, L.DIS.floorY, L.DIS.z, `avenue x=${x}`);
for (const b of L.BRIDGES) for (const c of L.bridgeCells(b)) if (!c.edge) { room(c.x, L.DIS.floorY, c.z, `${b.name}`); floor(c.x, L.DIS.floorY, c.z, `${b.name}`); }
for (const s of L.SEALS) check(at(s.x, s.y, s.z) === "minecraft:crying_obsidian", `${s.name} altar`);
for (const s of L.SEALS) {
  const ok = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]].some(([dx, dz]) => clear(s.x + dx, s.y, s.z + dz) && clear(s.x + dx, s.y + 1, s.z + dz) && !clear(s.x + dx, s.y - 1, s.z + dz));
  check(ok, `somewhere to stand by ${s.name}`);
}
const gate = L.innerGateCells();
check(gate.every((g) => !clear(g.x, g.y, g.z) || at(g.x, g.y, g.z).includes("iron_bars")), "the inner gate of Dis is shut");
check(gate.filter((g) => typeof g.kind === "number").every((g) => at(g.x, g.y, g.z) === "minecraft:crying_obsidian"), "three locks on the inner gate");
const tr = L.THROAT_ROAD.points;
for (const [x, z] of [tr[1], [Math.round((tr[1][0] + tr[2][0]) / 2), tr[2][1]], tr[2]]) room(x, L.DIS.floorY, z, "road to the Throat");
const TH = L.THROAT;
const throatTops = new Map();
wallStair(TH.minX + 1, TH.maxX - 1, TH.minZ + 1, TH.maxZ - 1, TH.topY, TH.bottomY, 2, (x, z, y) => throatTops.set(`${x},${z}`, [x, z, Math.max(y, throatTops.get(`${x},${z}`)?.[2] ?? -999)]), { startAt: [TH.maxX - 1, TH.doorZ], down: true });
for (const [x, z, y] of throatTops.values()) room(x, y, z, `throat stair y=${y}`);
for (let x = L.THROAT_TUNNEL.toX; x < L.THROAT_TUNNEL.fromX; x += 4) { room(x, L.CAVERN.lakeY, L.THROAT_TUNNEL.z, "tunnel to the lake"); floor(x, L.CAVERN.lakeY, L.THROAT_TUNNEL.z, "tunnel to the lake"); }
// The Tower of the Furies' stair.
const FT = L.FURY_TOWER;
const towerTops = new Map();
wallStair(FT.minX + 1, FT.maxX - 1, FT.minZ + 1, FT.maxZ - 1, L.DIS.floorY + 0.5, FT.topY + 1.01, 2, (x, z, y) => towerTops.set(`${x},${z}`, [x, z, Math.max(y, towerTops.get(`${x},${z}`)?.[2] ?? -999)]));
for (const [x, z, y] of towerTops.values()) room(x, y, z, `fury tower stair y=${y}`);
room(0, L.SPIRE.hallY, L.SPIRE.minZ + 1, "hall door");
room(0, L.SPIRE.hallY, L.SPIRE.minZ - 2, "the balcony");
room(0, L.CAVERN.lakeY + 1, L.SPIRE.minZ, "base door");
check(at(0, L.CAVERN.lakeY, L.SPIRE.minZ - 2).includes("slab"), "a half step up from the ice to the Spire's door");
room(Math.floor(L.DEVIL_SPOT.x), L.DEVIL_SPOT.y, Math.floor(L.DEVIL_SPOT.z), "the Devil's spot");
// The Spire's inner stair and the Clocktower's stair.
// (Where two flights overlap at a corner, the later, higher step is the one you stand on.)
const stairTops = (fn) => { const m = new Map(); fn((x, z, y) => m.set(`${x},${z}`, [x, z, Math.max(y, m.get(`${x},${z}`)?.[2] ?? -999)])); return [...m.values()]; };
const S = L.SPIRE;
for (const [x, z, y] of stairTops((f) => wallStair(S.minX + 2, S.maxX - 2, S.minZ + 2, S.maxZ - 2, L.CAVERN.lakeY + 0.5, S.hallY + 0.01, 2, f))) room(x, y, z, `spire stair y=${y}`);
const T = L.CLOCKTOWER;
for (const [x, z, y] of stairTops((f) => wallStair(T.minX + 1, T.maxX - 1, T.minZ + 1, T.maxZ - 1, L.CAVERN.lakeY + 0.5, L.CLOCK.cy - 4, 1, f))) room(x, y, z, `clock stair y=${y}`);
for (const [i, g] of L.GLYPHS.entries()) check(at(g.x, g.y, g.z).includes("chiseled"), `glyph ${i + 1} pedestal`);

console.log({ ops, pathCells, blocks: ids.length - 2 });
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log("all hell checks passed");
