# Agartha — the Frozen Heaven (Minecraft Bedrock add-on)

Agartha is the afterlife of your world: a vast floating Viking heaven of snow, ice and quartz above a sea of clouds. **When players die, they wake at the Gates of Agartha.** Falling through the clouds sends them back to the mortal world.

![Aerial view](docs/aerial_south.png)

## What's in Agartha
A floating continent about **420 blocks across** at **X 200,000 / Z 200,000**, from the clouds (Y ~110) to the build limit (Y 318).

| Landmark | |
|---|---|
| **Heaven's Gate** | Where souls arrive: a snowflake-inlaid plaza and two 45-block quartz-and-ice pillars crowned with beacon beams, under a golden sun. |
| **The Processional Avenue** | A lamp-lit quartz road guarded by two **All-Father statues** (~55 blocks tall), crowned, horned and holding glowing staffs. |
| **The Great Bridge** | A 130-block arched bridge over the **frozen lake**, where three **Viking longships** with striped sails and shields lie locked in the ice. |
| **The Temple of Agartha** | A three-tier quartz terrace, a colonnaded ice-glass hall with the All-Father's throne, a sacred beacon, and a skyline of **ice spires** up to 70 blocks tall. |
| **The Colossus** | An ~85-block All-Father carved into the mountainside above the temple. |
| **The Jarl's Citadel** | A walled Viking stronghold on a cliff terrace, reached by a grand stair. Its great hall leads into a mountain tunnel and the **treasure vault**. |
| **The Village** | Eight snow-roofed longhouses with smoking chimneys around a bonfire square, including a 39-block **mead hall**, linked to the avenue by a lantern road. |
| **Ice Pyramids** | Three stepped pyramids of calcite, quartz and ice, each with a beacon. The largest hides a jarl's **burial chamber**. |
| **Nature** | A ring of mountains with snow, ice and white-stone cliffs; snowy spruce forests; giant ice crystals; floating islets; goats, polar bears, wolves and foxes. |
| **Atmosphere** | Soft heavenly haze, falling snow, drifting golden motes, aurora curtains glowing overhead at night, and permanent night vision. No hostile mobs spawn. |

| | |
|---|---|
| ![Arrival](docs/arrival.png) | ![Temple](docs/temple.png) |
| ![East](docs/aerial_east.png) | ![Village](docs/village.png) |

*(Previews come from `tools/preview.mjs`, a simple voxel renderer of the exact blueprint, not in-game screenshots.)*

## How it works for players
- **Dying** in the mortal world: you respawn, then ascend to Heaven's Gate. Where you respawned is remembered.
- **Tap a Runestone** (at the gate plaza, temple, citadel, vault, mead hall and pyramid): you're reborn at that remembered spot.
- **Falling off Agartha** below the clouds: instant death, and you're reborn in the mortal world. Creative and spectator players are put back at the gate instead.
- **Frost Rune** (lets the living visit; use it again to go back):
  ```
   . P .        P = Packed Ice
   P E P        E = Eye of Ender
   . D .        D = Diamond
  ```
- **Loot:** the vault, the temple and the pyramid chamber hold *Viking hoards* (gold, diamonds, enchanted books, and the rare **Jarl's Frostbite Axe**). Longhouses hold food and **Horns of Honey Mead**.

## Operator commands
| Command | Effect |
|---|---|
| `/scriptevent agartha:afterlife off` / `on` | Turn the afterlife on or off (default **on**). |
| `/scriptevent agartha:forge` | Build Agartha now. |
| `/scriptevent agartha:rebuild` | Rebuild it from scratch (everyone must leave first). |
| `/scriptevent agartha:visit` | Go there yourself. |

## Building ("forging") and safety
- Agartha is **built automatically** about 15 seconds after the world loads, once. It runs in the background with progress messages in chat and takes a few minutes, depending on the device. If someone dies first, they're taken there as soon as it's ready.
- Bedrock add-ons **can't create real dimensions**, so Agartha lives in a reserved pocket of the Overworld sky. **Every block write is bounds-checked** against one box (X/Z 199,680 → 200,319, Y 96 → 319). Nothing outside it is ever changed, and world generation is untouched. `tools/test_blueprint.mjs` verifies all ~800,000 build operations stay inside.
- The build uses one temporary ticking area at a time (the world limit is 10).
- Requires Bedrock **1.21.90+**. Works on new and existing worlds; no experimental toggles are needed.

## Install
Run `./tools/package.sh` and open `dist/Agartha.mcaddon`, then activate **both** packs on your world.

## Development
| Command | Purpose |
|---|---|
| `node tools/test_blueprint.mjs` | Bounds, tile, and terrain checks for the whole build. |
| `node tools/smoke_test.mjs` | Runs the scripts against a mock Minecraft API: forging, dying → ascending, runestones, falling, the afterlife toggle. |
| `node --max-old-space-size=4096 tools/preview.mjs && python3 tools/ppm2png.py` | Renders preview images into `dist/preview/`. |
| `python3 tools/gen_textures.py` | Regenerates textures. |

The layout lives in `behavior_pack/scripts/terrain.js` (`LAYOUT`), the landmarks in `structures.js` and `citadel.js`, and location and heights in `config.js`. Bump `buildVersion` to rebuild existing worlds after changes.
