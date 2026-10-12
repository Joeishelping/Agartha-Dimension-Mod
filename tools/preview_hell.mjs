// Renders cutaway previews of Hell from its blueprint, without Minecraft.
// Run: node tools/preview_hell.mjs [outDir]   (then tools/ppm2png.py converts them)
//
// Each view slices Hell along a plane and looks into the carved spaces behind
// it: solid rock at the cut is drawn dark, open space shows what lies beyond,
// shaded by distance.
import { writeFileSync, mkdirSync } from "node:fs";
import { listHellTiles, HELL } from "../behavior_pack/scripts/config.js";
import { hellTileOps } from "../behavior_pack/scripts/hell_blueprint.js";

const out = process.argv[2] ?? "dist/preview";
mkdirSync(out, { recursive: true });
const X0 = HELL.shell.minX - 2, X1 = HELL.shell.maxX + 2, Z0 = HELL.shell.minZ - 2, Z1 = HELL.shell.maxZ + 2, Y0 = HELL.minY, Y1 = HELL.maxY;
const NX = X1 - X0 + 1, NZ = Z1 - Z0 + 1, NY = Y1 - Y0 + 1;
const vox = new Uint8Array(NX * NZ * NY); // 0 = untouched (natural rock), 1 = air
const idx = (x, y, z) => ((x - X0) * NZ + (z - Z0)) * NY + (y - Y0);
const inside = (x, y, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1 && y >= Y0 && y <= Y1;
const palette = [null, { id: "air" }];
const pid = new Map([["minecraft:air", 1]]);

const C = {
  deepslate: [52, 52, 58], deepslate_tiles: [44, 44, 50], deepslate_bricks: [58, 58, 64], polished_deepslate: [70, 70, 76], cobbled_deepslate: [80, 80, 86],
  cracked_deepslate_bricks: [96, 90, 80], blackstone: [40, 36, 42], polished_blackstone: [54, 50, 58], polished_blackstone_bricks: [48, 44, 52],
  cracked_polished_blackstone: [60, 56, 62], chiseled_polished_blackstone: [66, 60, 70], gilded_blackstone: [150, 110, 40], polished_basalt: [74, 74, 80], basalt: [70, 70, 76],
  black_concrete: [14, 14, 18], red_nether_brick: [110, 20, 20], nether_brick: [60, 26, 30], netherrack: [120, 40, 40], fire: [255, 170, 40], coarse_dirt: [100, 72, 52], black_wool: [20, 20, 20], black_stained_glass: [24, 24, 30], tinted_glass: [40, 34, 48], gray_stained_glass: [90, 90, 96], red_stained_glass: [160, 30, 30],
  crying_obsidian: [90, 30, 150], magma: [230, 90, 20], lava: [255, 120, 20], soul_soil: [80, 62, 50], soul_sand: [90, 70, 56], bone_block: [220, 214, 190], skeleton_skull: [230, 230, 220],
  soul_fire: [90, 230, 240], soul_campfire: [90, 230, 240], soul_lantern: [110, 240, 250], soul_torch: [110, 240, 250], shroomlight: [255, 160, 70], iron_bars: [150, 150, 150], chain: [120, 120, 130],
  packed_ice: [130, 160, 210], calcite: [222, 222, 214], gold_block: [240, 200, 60], redstone_block: [200, 20, 20], white_wool: [240, 240, 240], pointed_dripstone: [130, 100, 80], dripstone_block: [120, 92, 74],
  stone: [120, 120, 120], button: [60, 56, 62], sign: [140, 40, 50],
};
const GLOW = /soul|magma|lava|shroomlight|lantern|torch|campfire/;
function colorFor(id) {
  const n = id.replace(/^\w+:/, "");
  if (C[n]) return C[n];
  for (const k of Object.keys(C).sort((a, b) => b.length - a.length)) if (n.includes(k)) return C[k];
  return [160, 0, 160];
}
function code(id) {
  let c = pid.get(id);
  if (c === undefined) {
    c = palette.length;
    palette.push({ id, rgb: colorFor(id), glow: GLOW.test(id) });
    pid.set(id, c);
  }
  return c;
}

const t0 = Date.now();
for (const tile of listHellTiles()) {
  for (const op of hellTileOps(tile)) {
    if (op[0] === "fill") {
      const [, x1, y1, z1, x2, y2, z2, id] = op;
      const c = code(id);
      for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) for (let y = y1; y <= y2; y++) if (inside(x, y, z)) vox[idx(x, y, z)] = c;
    } else if (op[0] === "set" || op[0] === "sign") {
      const id = op[0] === "sign" ? "minecraft:sign" : op[4];
      if (inside(op[1], op[2], op[3])) vox[idx(op[1], op[2], op[3])] = code(id);
    }
  }
}
console.log("voxelized in", (Date.now() - t0) / 1000, "s");
const get = (x, y, z) => (inside(x, y, z) ? vox[idx(x, y, z)] : 0);
const solid = (v) => v > 1;

function writePPM(name, w, h, px) {
  writeFileSync(`${out}/${name}.ppm`, Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), Buffer.from(px)]));
  console.log("wrote", name, w, "x", h);
}

/**
 * Generic cut view. For each pixel (u, v) the ray starts at cut(u, v) and
 * marches along step until it hits something solid.
 */
function view(name, W, H, S, start, step, maxDepth) {
  const px = new Uint8Array(W * S * H * S * 3);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      let [x, y, z] = start(u, v);
      let rgb = [0, 0, 0];
      const first = get(x, y, z);
      if (first === 0) rgb = [20, 18, 22];
      else if (solid(first)) {
        const p = palette[first];
        const k = p.glow ? 1 : 0.55;
        rgb = p.rgb.map((c) => c * k);
      } else {
        for (let d = 1; d < maxDepth; d++) {
          x += step[0]; y += step[1]; z += step[2];
          const b = get(x, y, z);
          if (b === 0) { rgb = [10, 8, 12]; break; }
          if (solid(b)) {
            const p = palette[b];
            const fog = p.glow ? 1 : Math.max(0.25, 1 - d / maxDepth);
            rgb = p.rgb.map((c) => Math.min(255, c * fog * (p.glow ? 1.1 : 1.35) + 6));
            break;
          }
        }
      }
      for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) px.set(rgb.map((c) => c | 0), (((v * S + a) * W * S) + u * S + b) * 3);
    }
  }
  writePPM(name, W * S, H * S, px);
}

// 1. Section through the pit and the Spire, looking east (cut at x = 0).
view("hell_section_x0", NZ, NY, 4, (u, v) => [0, Y1 - v, Z0 + u], [1, 0, 0], 70);
// 2. Section across the cavern, looking north (cut at z = 88).
view("hell_section_z88", 130, NY, 4, (u, v) => [-64 + u, Y1 - v, 88], [0, 0, 1], 60);
// 3. Plan of everything, looking down from y = 0 (the City of Dis, the lake, the pit).
view("hell_plan_all", NX, NZ, 3, (u, v) => [X0 + u, 0, Z0 + v], [0, -1, 0], 60);
// 4. Plan of the Hall of Thrones, looking down from just under its vault.
view("hell_plan_hall", 130, 120, 4, (u, v) => [-64 + u, 15, 30 + v], [0, -1, 0], 14);
// 5. Plan of the pit, looking down from its ceiling.
view("hell_plan_pit", 44, 44, 9, (u, v) => [-22 + u, 26, -22 + v], [0, -1, 0], 90);
// 6. Plan of the City of Dis from just under its roof.
view("hell_plan_dis", 170, 166, 4, (u, v) => [65 + u, 18, -53 + v], [0, -1, 0], 40);
// 7. Section through Dis, looking north (cut at z = 30, along the avenue).
view("hell_section_dis", 180, 50, 4, (u, v) => [60 + u, 30 - v, 30], [0, 0, 1], 60);

// 7. The pit's wall unrolled: angle across, height down. Nearer = brighter,
// so the spiral path, the Gates of the Hours and the stepping stones stand out.
{
  const W = 900, H = 88, S = 2, VS = 5;
  const px = new Uint8Array(W * S * H * VS * 3);
  for (let v = 0; v < H; v++) {
    const y = 27 - v;
    for (let u = 0; u < W; u++) {
      const a = (u / W) * Math.PI * 2;
      let rgb = [0, 0, 0];
      for (let r = 10.9; r < 21; r += 0.25) {
        const b = get(Math.floor(r * Math.cos(a)), y, Math.floor(r * Math.sin(a)));
        if (solid(b) || b === 0) {
          const p = palette[b] ?? { rgb: [20, 18, 22] };
          const k = p.glow ? 1.2 : Math.max(0.35, 1.6 - r / 13);
          rgb = p.rgb.map((c) => Math.min(255, c * k + (r < 15.4 && !p.glow ? 40 : 0)));
          break;
        }
      }
      for (let a2 = 0; a2 < VS; a2++) for (let b2 = 0; b2 < S; b2++) px.set(rgb.map((c) => c | 0), (((v * VS + a2) * W * S) + u * S + b2) * 3);
    }
  }
  writePPM("hell_pit_unrolled", W * S, H * VS, px);
}
