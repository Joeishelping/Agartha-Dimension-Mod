// Renders preview images of the realm from the blueprint, without Minecraft.
// Run: node tools/preview.mjs [outDir]   (then tools/ppm2png.py converts them)
import { writeFileSync, mkdirSync } from "node:fs";
import { listTiles, REALM, B } from "../behavior_pack/scripts/config.js";
import { tileOps } from "../behavior_pack/scripts/blueprint.js";

const out = process.argv[2] ?? "dist/preview";
mkdirSync(out, { recursive: true });
const X0 = -320, Z0 = -320, W = 640, Y0 = REALM.clearFromY, H = REALM.clearToY - Y0 + 1;
const vox = new Uint8Array(W * W * H);
const idx = (x, y, z) => ((x - X0) * W + (z - Z0)) * H + (y - Y0);
const palette = [null];
const pid = new Map();
const COLORS = {
  snow: [244, 248, 255], snow_layer: [240, 246, 255], packed_ice: [150, 185, 235], blue_ice: [110, 160, 235], stone: [125, 125, 128],
  calcite: [222, 224, 220], quartz: [236, 232, 226], smooth_quartz: [238, 234, 228], quartz_bricks: [232, 228, 220], chiseled_quartz: [230, 226, 216],
  quartz_pillar: [234, 230, 222], quartz_stairs: [236, 232, 226], quartz_slab: [236, 232, 226], gold: [250, 205, 60], glowstone: [255, 220, 120],
  sea_lantern: [200, 235, 240], light_blue_stained_glass: [130, 190, 240], light_blue_concrete: [60, 170, 220], beacon: [120, 230, 230], iron: [220, 220, 220],
  spruce_leaves: [50, 82, 60], spruce_log: [70, 50, 32], spruce_planks: [115, 85, 50], dark_oak: [66, 45, 25], stone_brick: [120, 120, 120], cobblestone: [110, 110, 110],
  cloud: [250, 252, 255], wool_red: [160, 40, 40], wool_white: [235, 235, 235], wool: [200, 170, 60], bone: [225, 220, 200], lantern: [255, 190, 90], campfire: [255, 140, 40], end_rod: [255, 255, 250],
  hay: [200, 170, 50], gravel: [135, 130, 128], default: [160, 160, 160],
};
function colorFor(id) {
  const n = id.replace(/^\w+:/, "");
  if (n === "cloud") return COLORS.cloud;
  if (n === "red_wool") return COLORS.wool_red;
  if (n === "white_wool") return COLORS.wool_white;
  for (const k of Object.keys(COLORS)) if (n === k || n.startsWith(k)) return COLORS[k];
  if (n.includes("quartz")) return COLORS.quartz;
  if (n.includes("stone_brick")) return COLORS.stone_brick;
  if (n.includes("wool")) return COLORS.wool;
  if (n.includes("dark_oak")) return COLORS.dark_oak;
  if (n.includes("spruce")) return COLORS.spruce_planks;
  if (n.includes("iron")) return COLORS.iron;
  if (n.includes("gold")) return COLORS.gold;
  return COLORS.default;
}
function code(id) {
  if (id === "minecraft:air") return 0;
  let c = pid.get(id);
  if (c === undefined) { c = palette.length; palette.push({ id, rgb: colorFor(id), soft: /snow_layer|lantern|fence|campfire|end_rod|slab|glass_pane/.test(id) }); pid.set(id, c); }
  return c;
}
const t0 = Date.now();
for (const tile of listTiles()) {
  for (const op of tileOps(tile)) {
    if (op[0] === "fill") {
      const [, x1, y1, z1, x2, y2, z2, id, mode] = op;
      const c = code(id);
      for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) {
        const base = idx(x, 0 + Y0, z);
        for (let y = y1; y <= y2; y++) { const i = base + (y - Y0); if (mode !== "keep" || vox[i] === 0) vox[i] = c; }
      }
    } else if (op[0] === "set") vox[idx(op[1], op[2], op[3])] = code(op[4]);
  }
}
console.log("voxelized in", (Date.now() - t0) / 1000, "s");

function writePPM(name, w, h, px) {
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  writeFileSync(`${out}/${name}.ppm`, Buffer.concat([header, Buffer.from(px)]));
}
const get = (x, y, z) => (x < X0 || x >= X0 + W || z < Z0 || z >= Z0 + W || y < Y0 || y >= Y0 + H) ? 0 : vox[idx(x, y, z)];

// Top-down map with hillshade.
{
  const px = new Uint8Array(W * W * 3);
  const topY = new Int16Array(W * W).fill(-1);
  for (let x = X0; x < X0 + W; x++) for (let z = Z0; z < Z0 + W; z++) {
    for (let y = Y0 + H - 1; y >= Y0; y--) { if (vox[idx(x, y, z)]) { topY[(x - X0) * W + (z - Z0)] = y; break; } }
  }
  for (let x = 0; x < W; x++) for (let z = 0; z < W; z++) {
    const y = topY[x * W + z];
    const o = (z * W + x) * 3;
    if (y < 0) { px.set([40, 60, 110], o); continue; }
    const rgb = palette[vox[idx(x + X0, y, z + Z0)]].rgb;
    const yn = topY[Math.max(0, x - 1) * W + Math.max(0, z - 1)];
    const shade = Math.max(0.55, Math.min(1.25, 1 + (y - (yn < 0 ? y : yn)) * 0.06)) * (0.75 + 0.25 * (y - 100) / 220);
    px.set(rgb.map((v) => Math.max(0, Math.min(255, v * shade))), o);
  }
  writePPM("map", W, W, px);
}

// Perspective render (simple voxel ray marcher with fog and sun shading).
function render(name, cam, look, w = 1200, h = 675, fov = 75, night = false) {
  const px = new Uint8Array(w * h * 3);
  const f = [look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]];
  const fl = Math.hypot(...f); f.forEach((_, i) => (f[i] /= fl));
  const r = [-f[2], 0, f[0]]; const rl = Math.hypot(...r); r.forEach((_, i) => (r[i] /= rl));
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const tanH = Math.tan((fov * Math.PI) / 360);
  const sun = [0.4, 0.8, 0.45];
  const fogC = night ? [40, 60, 90] : [222, 236, 255];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = ((i + 0.5) / w * 2 - 1) * tanH;
    const sy = (1 - (j + 0.5) / h * 2) * tanH * (h / w);
    const d = [f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy];
    const dl = Math.hypot(...d); d.forEach((_, k) => (d[k] /= dl));
    // DDA
    let x = Math.floor(cam[0]), y = Math.floor(cam[1]), z = Math.floor(cam[2]);
    const step = d.map((v) => (v > 0 ? 1 : -1));
    const tDelta = d.map((v) => Math.abs(1 / (v || 1e-9)));
    let tMax = [0, 1, 2].map((k) => { const p = cam[k], c = [x, y, z][k]; return d[k] > 0 ? (c + 1 - p) * tDelta[k] : (p - c) * tDelta[k]; });
    let t = 0, hit = 0, face = 1;
    while (t < 700) {
      if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) { x += step[0]; t = tMax[0]; tMax[0] += tDelta[0]; face = 0; }
      else if (tMax[1] < tMax[2]) { y += step[1]; t = tMax[1]; tMax[1] += tDelta[1]; face = 1; }
      else { z += step[2]; t = tMax[2]; tMax[2] += tDelta[2]; face = 2; }
      if (y < Y0 - 1 && d[1] < 0) break;
      if (y > Y0 + H && d[1] > 0) break;
      const v = get(x, y, z);
      if (v) { hit = v; break; }
    }
    let col;
    if (hit) {
      const p = palette[hit];
      const n = [0, 0, 0]; n[face] = -step[face];
      const lam = Math.max(0, n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]);
      const emissive = /lantern|glowstone|beacon|end_rod|campfire|sea_lantern/.test(p.id);
      const k = emissive ? 1.1 : 0.6 + 0.5 * lam;
      col = p.rgb.map((v) => v * k * (night && !emissive ? 0.35 : 1));
      const fog = Math.min(1, Math.max(0, (t - 120) / 520));
      col = col.map((v, q) => v * (1 - fog) + fogC[q] * fog);
    } else if (night) {
      const a = Math.max(0, d[1]);
      const aur = Math.max(0, Math.sin(Math.atan2(d[0], -d[2]) * 5 + d[1] * 8)) * Math.exp(-((d[1] - 0.35) ** 2) * 30);
      col = [10 + 20 * a + 40 * aur, 20 + 30 * a + 200 * aur, 50 + 50 * a + 150 * aur];
    } else {
      const a = Math.max(0, d[1]);
      col = [222 - 140 * a, 236 - 90 * a, 255 - 20 * a];
    }
    px.set(col.map((v) => Math.max(0, Math.min(255, v))), (j * w + i) * 3);
  }
  writePPM(name, w, h, px);
}
const A = [0.5, B + 3.6, 188];
render("arrival", A, [0, B + 22, 60]);
render("aerial_south", [0, 300, 330], [0, B + 10, -20], 1200, 675, 70);
render("aerial_east", [330, 270, 40], [-20, B + 10, -40], 1200, 675, 70);
render("temple", [0, B + 12, -20], [0, B + 30, -110], 1200, 675, 75);
render("village", [40, B + 25, 150], [110, B + 5, 70], 1200, 675, 75);
render("night", A, [0, B + 40, 60], 1200, 675, 80, true);
console.log("rendered in", (Date.now() - t0) / 1000, "s");
