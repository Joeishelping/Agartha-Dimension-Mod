// Central configuration for the Agartha sky-realm.
//
// Bedrock add-ons cannot register brand-new dimensions, so Agartha lives in a
// reserved "pocket" of the Overworld sky far away from spawn. Every block the
// add-on ever writes is inside REGION (see isInsideRegion), so nothing outside
// that box can be touched by this add-on.

export const REALM = {
  // World-space centre of the pocket. Must be a multiple of 16 (chunk aligned).
  originX: 100000,
  originZ: 100000,

  // Height of the snowfield the castle stands on.
  surfaceY: 276,

  // Island footprint (relative to origin).
  islandRadius: 58,

  // Sea of clouds below the island.
  cloudBaseY: 214,
  cloudRadius: 150,

  // Anything that drops below this height inside the pocket dies instantly.
  killY: 209,

  // The pocket is built in 3x3 tiles of 128x128 blocks (8x8 chunks each), so a
  // single ticking area (<= 100 chunks) can load one tile at a time.
  tileSize: 128,
  tileRange: 1,

  // Vertical slice owned by the pocket. Everything from clearFromY up to the
  // build limit inside the region is wiped once before building.
  clearFromY: 200,
  clearToY: 319,

  // Bump to force a rebuild on worlds that already have an older realm.
  buildVersion: 1,

  // Landing pad in front of the castle gate (relative coords, y is absolute).
  arrival: { x: 0.5, z: 48.5 },
};

export const G = REALM.surfaceY + 1; // first air block above the snowfield

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
  tiles.sort((a, b) => (Math.abs(a.i) + Math.abs(a.j)) - (Math.abs(b.i) + Math.abs(b.j)));
  return tiles;
}

export const IDS = {
  rune: "agartha:frost_rune",
  axe: "agartha:jarl_axe",
  mead: "agartha:mead_horn",
  cloud: "agartha:cloud",
  runestone: "agartha:runestone",
};
