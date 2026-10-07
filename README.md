# Agartha — Frozen Heaven (Minecraft Bedrock add-on)

A small floating island in the sky: a snowy mountain with a Viking castle built into it, a cave that leads to a treasure vault, and a sea of clouds underneath. Fall off the island and you die once you drop through the clouds.

## How to play
1. Craft a **Frost Rune** (crafting table):
   ```
    . P .        P = Packed Ice
    P E P        E = Eye of Ender
    . D .        D = Diamond
   ```
2. **Use** the rune (right-click / tap) to travel to Agartha. The first time anyone does this, the realm is built, which takes a few seconds and shows a progress bar. After that, travel is instant.
3. To go home, use the rune again or tap one of the glowing **Runestones** (on the landing pad, by the throne, and in the vault). You're returned to exactly where you left from.

### What's there
- **Floating island**: snowfield, spruce trees, and a mountain peak reaching the build limit. Icicle spikes hang underneath into the clouds.
- **The castle**: a stone curtain wall, 4 round towers with timber roofs and lookouts, a gate, a smithy and stores in the courtyard, and a Viking longhouse great hall with a long hearth, feasting tables and a throne.
- **The cave**: a door behind the throne leads into the mountain through an ice-veined tunnel to the **treasure vault** (3 hoard chests).
- **Unique loot**: *Jarl's Frostbite Axe* (10 damage; hits freeze and weaken targets) and *Horn of Honey Mead* (Strength, Regeneration and Fire Resistance). Both are found only in chests.
- **Atmosphere**: white, heavenly fog, falling snow, permanent night vision while you're there, and no hostile mob spawns.
- **Kill plane**: drop below the clouds (Y < 209) and you die instantly. Creative and spectator players are teleported back to the landing pad instead.

## Where it lives and why it's safe
Bedrock add-ons **can't add real new dimensions**; only the Overworld, Nether and End exist. So Agartha is a sealed pocket in the **Overworld sky at X 100,000 / Z 100,000**, as high as the game allows:

| | Y level |
|---|---|
| Mountain peak | 318 (build limit is 319) |
| Castle / snowfield | 276 |
| Island underside | ~221 |
| Cloud layer | ~212–219 |
| Instant-death plane | 209 |

Safety guarantees:
- **World generation is untouched.** The add-on never changes how terrain generates.
- **It's built only on demand**, the first time someone uses a Frost Rune, and only once.
- **Every block write is bounds-checked** against one reserved box: X/Z 99,808 → 100,191, Y 200 → 319. Nothing outside it can be modified. `tools/test_blueprint.mjs` verifies all ~100,000 placements stay inside.
- Blocks are placed with standard commands and the official Script API (the same as `/fill`), not raw chunk edits.
- Uninstalling leaves your world as it was. Only the island remains, out at 100k/100k.

Works on new or existing worlds. Requires Minecraft Bedrock **1.21.90 or newer**.

## Install
- Run `./tools/package.sh`, then open `dist/Agartha.mcaddon` on your device. Minecraft imports both packs.
- Or copy `behavior_pack/` and `resource_pack/` into `development_behavior_packs/` and `development_resource_packs/`.
- Activate **both** packs on your world. No experimental toggles are needed.

## Development
- `node tools/test_blueprint.mjs`: checks the realm blueprint (bounds, ticking-area size, island above the kill plane, buried vault).
- `python3 tools/gen_textures.py`: regenerates all textures (needs Pillow).
- Location, heights and sizes are all in `behavior_pack/scripts/config.js`. If you change them on a world that already has the realm, bump `buildVersion` to rebuild it.
