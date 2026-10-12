import { HELL_SHELL } from "./hell_layout.js";
// Central configuration for the Agartha sky-realm.
//
// Bedrock add-ons cannot register brand-new dimensions, so Agartha lives in a
// reserved "pocket" of the Overworld sky far away from spawn. Every block the
// add-on ever writes is inside REGION (see isInsideRegion), so nothing outside
// that box can be touched by this add-on.

export const REALM = {
  // World-space centre of the pocket (any coordinates; the build grid is
  // shifted to line up with Minecraft's 16-block chunks).
  originX: 99890,
  originZ: 100298,

  // Height of the snowfield plains. Mountains rise from here to the build limit.
  baseY: 200,

  // Floating continent footprint (relative to origin).
  islandRadius: 205,

  // Sea of clouds below the continent.
  cloudBaseY: 112,
  cloudRadius: 300,

  // Anything that drops below this height inside the pocket dies instantly.
  killY: 104,

  // The pocket is built in 11x11 tiles of 64x64 blocks (4x4 chunks each):
  // small enough to load quickly around a hovering player or a ticking area.
  tileSize: 64,
  tileRange: 5,

  // Vertical slice owned by the pocket. Everything from clearFromY up to the
  // build limit inside the region is wiped once before building.
  clearFromY: 96,
  clearToY: 319,

  // Bump to force a rebuild on worlds that already have an older realm.
  buildVersion: 6,

  // Where souls arrive: the plaza before Heaven's Gate (relative coords).
  arrival: { x: 0.5, z: 176.5 },
};

export const B = REALM.baseY;

/** Horizontal half extent of the reserved region, in blocks. */
export const REGION_HALF = REALM.tileSize * (REALM.tileRange + 0.5);

// Shift of the tile grid (relative coords) so tile edges land on chunk borders.
const mod16 = (v) => ((v % 16) + 16) % 16;
const SHIFT_X = -mod16(REALM.originX);
const SHIFT_Z = -mod16(REALM.originZ);

/** Relative (to origin) coordinates of the reserved region, inclusive. */
export const REGION = {
  minX: -REGION_HALF + SHIFT_X,
  maxX: REGION_HALF - 1 + SHIFT_X,
  minZ: -REGION_HALF + SHIFT_Z,
  maxZ: REGION_HALF - 1 + SHIFT_Z,
  minY: REALM.clearFromY,
  maxY: REALM.clearToY,
};

export function isInsideRegion(rx, y, rz) {
  return (
    rx >= REGION.minX && rx <= REGION.maxX &&
    rz >= REGION.minZ && rz <= REGION.maxZ &&
    y >= REGION.minY && y <= REGION.maxY
  );
}

/** Tiles in build order (centre first so the island is ready soonest). */
export function listTiles() {
  const tiles = [];
  const r = REALM.tileRange;
  const s = REALM.tileSize;
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      tiles.push({
        i, j,
        minX: i * s - s / 2 + SHIFT_X, maxX: i * s + s / 2 - 1 + SHIFT_X,
        minZ: j * s - s / 2 + SHIFT_Z, maxZ: j * s + s / 2 - 1 + SHIFT_Z,
      });
    }
  }
  // Serpentine order, so a player flown over the site moves only one tile at a time.
  tiles.sort((a, b) => (a.j - b.j) || ((a.j % 2 === 0 ? 1 : -1) * (a.i - b.i)));
  return tiles;
}

// ---------------------------------------------------------------------------
// Hell: the underworld beneath Agartha, sealed deep underground.
// ---------------------------------------------------------------------------

export const HELL = {
  // Directly beneath Agartha: heaven above, hell below.
  originX: REALM.originX,
  originZ: REALM.originZ,
  // Everything Hell builds lies between these heights (bedrock is below).
  minY: -63,
  maxY: 34,
  // The solid shell everything is carved from (relative x/z, inclusive).
  shell: HELL_SHELL,
  buildVersion: 4,
};

// 5x4 tiles of 64x64 on the same chunk-aligned grid as Agartha.
const HELL_TILES_I = [0, 1, 2, 3, 4];
const HELL_TILES_J = [-1, 0, 1, 2];
export const HELL_REGION = {
  minX: -32 + SHIFT_X, maxX: 4 * 64 + 31 + SHIFT_X,
  minZ: -96 + SHIFT_Z, maxZ: 159 + SHIFT_Z,
  minY: HELL.minY, maxY: HELL.maxY,
};

export function isInsideHell(rx, y, rz) {
  const r = HELL_REGION;
  return rx >= r.minX && rx <= r.maxX && rz >= r.minZ && rz <= r.maxZ && y >= r.minY && y <= r.maxY;
}

export function listHellTiles() {
  const s = REALM.tileSize;
  const tiles = [];
  for (const j of HELL_TILES_J) {
    for (const i of j % 2 ? [...HELL_TILES_I].reverse() : HELL_TILES_I) {
      tiles.push({ i, j: j + 1, minX: i * s - s / 2 + SHIFT_X, maxX: i * s + s / 2 - 1 + SHIFT_X, minZ: j * s - s / 2 + SHIFT_Z, maxZ: j * s + s / 2 - 1 + SHIFT_Z }); // j + 1: ticking-area names stay positive
    }
  }
  return tiles;
}

export const IDS = {
  axe: "agartha:jarl_axe",
  mead: "agartha:mead_horn",
  cloud: "agartha:cloud",
  keystone: "agartha:gate_keystone",
  portal: "agartha:portal",
  hellPortal: "agartha:hell_portal",
  scarab: "agartha:heart_scarab",
  devil: "agartha:devil",
  soul: "agartha:soul",
};
