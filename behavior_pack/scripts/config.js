// Central configuration for the Agartha sky-realm.
//
// Bedrock add-ons cannot register brand-new dimensions, so Agartha lives in a
// reserved "pocket" of the Overworld sky far away from spawn. Every block the
// add-on ever writes is inside REGION (see isInsideRegion), so nothing outside
// that box can be touched by this add-on.

export const REALM = {
  // World-space centre of the pocket. Must be a multiple of 16 (chunk aligned).
  originX: 200000,
  originZ: 200000,

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
  buildVersion: 3,

  // Where souls arrive: the plaza before Heaven's Gate (relative coords).
  arrival: { x: 0.5, z: 176.5 },
};

export const B = REALM.baseY;

/** Horizontal half extent of the reserved region, in blocks. */
export const REGION_HALF = REALM.tileSize * (REALM.tileRange + 0.5);

/** Relative (to origin) coordinates of the reserved region, inclusive. */
export const REGION = {
  minX: -REGION_HALF,
  maxX: REGION_HALF - 1,
  minZ: -REGION_HALF,
  maxZ: REGION_HALF - 1,
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
        minX: i * s - s / 2, maxX: i * s + s / 2 - 1,
        minZ: j * s - s / 2, maxZ: j * s + s / 2 - 1,
      });
    }
  }
  // Serpentine order, so a player flown over the site moves only one tile at a time.
  tiles.sort((a, b) => (a.j - b.j) || ((a.j % 2 === 0 ? 1 : -1) * (a.i - b.i)));
  return tiles;
}

export const IDS = {
  axe: "agartha:jarl_axe",
  mead: "agartha:mead_horn",
  cloud: "agartha:cloud",
  keystone: "agartha:gate_keystone",
  portal: "agartha:portal",
};
