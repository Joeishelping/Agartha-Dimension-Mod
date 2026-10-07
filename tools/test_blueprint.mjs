// Sanity checks for the realm blueprint. Run: node tools/test_blueprint.mjs
import { listTiles, isInsideRegion, REALM, B } from "../behavior_pack/scripts/config.js";
import { tileOps, islandColumn } from "../behavior_pack/scripts/blueprint.js";
import { LAYOUT } from "../behavior_pack/scripts/terrain.js";
import { STRUCTURES } from "../behavior_pack/scripts/structures.js";

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; if (fails < 25) console.error("FAIL:", msg); } };

const t0 = Date.now();
const counts = {};
const ids = new Set();
let total = 0;
const tiles = listTiles();
check(tiles.length === 25, "25 tiles");
for (const tile of tiles) {
  check((REALM.originX + tile.minX) % 16 === 0 && (REALM.originZ + tile.minZ) % 16 === 0, "tile chunk aligned");
  check(((tile.maxX - tile.minX + 1) / 16) * ((tile.maxZ - tile.minZ + 1) / 16) <= 100, "ticking area <= 100 chunks");
  for (const op of tileOps(tile)) {
    total++;
    counts[op[0]] = (counts[op[0]] || 0) + 1;
    const pts = op[0] === "fill" ? [[op[1], op[2], op[3]], [op[4], op[5], op[6]]] : [[op[1], op[2], op[3]]];
    if (op[0] === "fill") {
      const vol = (op[4] - op[1] + 1) * (op[5] - op[2] + 1) * (op[6] - op[3] + 1);
      check(vol > 0 && vol <= 32768, `fill volume ${vol}`);
      ids.add(op[7]);
    } else if (op[0] === "set") ids.add(op[4]);
    for (const [x, y, z] of pts) {
      check(isInsideRegion(x, y, z), `${op[0]} outside region ${JSON.stringify(op)}`);
      check(x >= tile.minX && x <= tile.maxX && z >= tile.minZ && z <= tile.maxZ, `${op[0]} outside tile ${JSON.stringify(op)}`);
    }
  }
}
let maxTop = 0, minBottom = 999, cols = 0;
for (let x = -230; x <= 230; x++) for (let z = -230; z <= 230; z++) {
  const c = islandColumn(x, z);
  if (!c) continue;
  cols++;
  maxTop = Math.max(maxTop, c.top);
  minBottom = Math.min(minBottom, c.bottom);
}
check(minBottom > REALM.killY, `island bottom ${minBottom} above kill plane`);
// Key sites on solid ground at the expected height.
const flat = [[0, 176, B], [0, 120, B], [0, -100, B], [LAYOUT.citadel.x, LAYOUT.citadel.z + 30, LAYOUT.citadel.y], [LAYOUT.colossus.x, LAYOUT.colossus.z, LAYOUT.colossus.y]];
for (const [x, z, y] of flat) {
  const c = islandColumn(x, z);
  check(c && Math.abs(c.top - y) <= 1, `ground at ${x},${z} is ${c?.top}, expected ${y}`);
}
for (const p of LAYOUT.pyramids) for (const [dx, dz] of [[p.half, p.half], [-p.half, -p.half], [p.half, -p.half], [-p.half, p.half]]) {
  check(islandColumn(p.x + dx, p.z + dz), `pyramid corner on island ${p.x + dx},${p.z + dz}`);
}
for (const s of STRUCTURES) {
  for (const [x, z] of [[s.bounds.minX, s.bounds.minZ], [s.bounds.maxX, s.bounds.maxZ]]) {
    check(Math.abs(x) < 320 && Math.abs(z) < 320, `${s.name} inside region`);
  }
}
const sec = (Date.now() - t0) / 1000;
console.log({ total, counts, cols, maxTop, minBottom, seconds: sec });
console.log("block ids:", [...ids].sort().join(" "));
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log("all checks passed");
