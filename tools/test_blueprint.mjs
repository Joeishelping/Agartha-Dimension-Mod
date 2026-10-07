// Sanity checks for the realm blueprint. Run: node tools/test_blueprint.mjs
import { listTiles, isInsideRegion, REALM, G } from "../behavior_pack/scripts/config.js";
import { tileOps, islandColumn, VAULT } from "../behavior_pack/scripts/blueprint.js";

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; if (fails < 20) console.error("FAIL:", msg); } };

const t0 = Date.now();
const counts = {};
const ids = new Set();
let total = 0, fillBlocks = 0;
const tiles = listTiles();
check(tiles.length === 9, "9 tiles");
for (const tile of tiles) {
  check((REALM.originX + tile.minX) % 16 === 0 && (REALM.originZ + tile.minZ) % 16 === 0, "tile chunk aligned");
  check(((tile.maxX - tile.minX + 1) / 16) * ((tile.maxZ - tile.minZ + 1) / 16) <= 100, "ticking area <= 100 chunks");
  for (const op of tileOps(tile)) {
    total++;
    counts[op[0]] = (counts[op[0]] || 0) + 1;
    if (op[0] === "fill") {
      const [, x1, y1, z1, x2, y2, z2, id] = op;
      ids.add(id);
      const vol = (x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1);
      fillBlocks += vol;
      check(vol > 0 && vol <= 32768, `fill volume ${vol}`);
      for (const [x, y, z] of [[x1, y1, z1], [x2, y2, z2]]) {
        check(isInsideRegion(x, y, z), `fill outside region ${op}`);
        check(x >= tile.minX && x <= tile.maxX && z >= tile.minZ && z <= tile.maxZ, `fill outside tile ${op}`);
      }
    } else {
      const [, x, y, z, id] = op;
      if (op[0] === "set") ids.add(id);
      check(isInsideRegion(x, y, z), `${op[0]} outside region ${JSON.stringify(op)}`);
      check(x >= tile.minX && x <= tile.maxX && z >= tile.minZ && z <= tile.maxZ, `${op[0]} outside tile ${JSON.stringify(op)}`);
    }
  }
}
// Island geometry checks.
let maxTop = 0, minBottom = 999, cols = 0;
for (let x = -70; x <= 70; x++) for (let z = -70; z <= 70; z++) {
  const c = islandColumn(x, z);
  if (!c) continue;
  cols++;
  maxTop = Math.max(maxTop, c.top);
  minBottom = Math.min(minBottom, c.bottom);
  check(Math.abs(x) <= 63 && Math.abs(z) <= 63, `island leaves centre tile at ${x},${z}`);
}
check(minBottom > REALM.killY, `island bottom ${minBottom} above kill plane`);
check(maxTop <= 319, "peak below build limit");
// Castle footprint, landing pad and vault are on solid ground.
for (const [x, z] of [[-24, 42], [24, 42], [-24, 8], [24, 8], [0, 48], [0, 51], [-28, 42], [28, 42], [3, 50]]) {
  const c = islandColumn(x, z);
  check(c && c.top === REALM.surfaceY, `flat ground at ${x},${z}: ${JSON.stringify(c)}`);
}
for (const [dx, dz] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) {
  const c = islandColumn(VAULT.x + dx, VAULT.z + dz);
  check(c && c.top > VAULT.floorY + 7, `vault buried at ${dx},${dz}: ${JSON.stringify(c)}`);
}

console.log({ total, counts, fillBlocks, cols, maxTop, minBottom, ms: Date.now() - t0 });
console.log("block ids:", [...ids].sort().join(" "));
if (fails) { console.error(`${fails} check(s) failed`); process.exit(1); }
console.log("all checks passed");
