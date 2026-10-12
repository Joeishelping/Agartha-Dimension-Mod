// The All-Father: the god of Agartha who keeps the Heavenly Gates.
//
//  * Greets every arrival (and anyone who comes near after a while away).
//  * Talk to him (tap/right-click): he shares the lore of Agartha, blesses
//    you, and now and then gives a gift.
//  * On his own he gazes toward the Pole, raises his arms to call down light,
//    and at night summons the aurora above the Gates.

import { system } from "@minecraft/server";
import { REALM, B, IDS } from "./config.js";
import { LAYOUT } from "./terrain.js";

const greeted = new Map(); // playerId -> tick of last greeting
const loreIndex = new Map(); // playerId -> next lore line
const GIFT_COOLDOWN_MS = 20 * 60 * 1000;

export const WELCOMES = [
  ["Welcome home, my child.", "You did well."],
  ["At last you have come home.", "Rest now. You did well, my child."],
  ["The long road is behind you.", "Welcome to Agartha. You have earned your place here."],
  ["I have watched over you, child.", "Welcome home. You did well."],
];

const GREETINGS = [
  "Ah, you return to me. Walk in peace.",
  "The light of the Pole shines upon you.",
  "Rest your soul, child. There is no hurry here.",
  "The north wind sings your name today.",
];

const LORE = [
  "Beyond the north wind lies this land, where the sun never truly sets on the worthy.",
  "The Pole at the heart of the lake is the axis of all worlds. Every road begins and ends there.",
  "Four ways flow from the Pole: the glacier, the two frozen rivers, and the road you walked to me.",
  "Climb the Pilgrim's Stair behind the colossus, and stand at the Shrine of the Pole Star.",
  "Yggdrasil's roots drink from the Well of Urd. Its leaves remember every life.",
  "Heimdall keeps watch at the end of the rainbow bridge. Nothing passes unseen.",
  "The halls cut into the mountains hold the treasures of those who came before you.",
  "Drink with the jarls in the mead hall. Their songs are older than the mountains.",
  "Do not stray past the edge of the world. Below the clouds there is only the long fall.",
];

function say(player, text) {
  player.sendMessage(`§6§oThe All-Father: §r§f${text}`);
}

function face(af, loc) {
  try {
    af.teleport(af.location, { facingLocation: loc });
  } catch {
    // cosmetic
  }
}

function anim(af, name, sound) {
  try {
    af.playAnimation(`animation.agartha.allfather.${name}`, { blendOutTime: 0.4 });
    if (sound) af.dimension.playSound(sound, af.location);
  } catch {
    // cosmetic
  }
}

function burst(af, ids) {
  const l = af.location;
  for (const [id, dy] of ids) {
    try {
      af.dimension.spawnParticle(id, { x: l.x, y: l.y + dy, z: l.z });
    } catch {
      // cosmetic
    }
  }
}

/** The welcome as a traveller arrives through the Gate. */
export function welcomeArrival(player, af, tick) {
  greeted.set(player.id, tick);
  if (af) {
    face(af, player.location);
    anim(af, "welcome");
    burst(af, [["agartha:holy_motes", 4], ["agartha:god_rays", 30]]);
  }
  const [a, b] = WELCOMES[Math.floor(Math.random() * WELCOMES.length)];
  player.playSound("agartha.welcome");
  say(player, a);
  system.runTimeout(() => {
    if (!player.isValid) return;
    say(player, b);
    player.onScreenDisplay.setActionBar(`§f§o"${b}"`);
  }, 50);
}

/** Talking to him: lore, a blessing, and sometimes a gift. */
export function talk(player, af) {
  face(af, player.location);
  const i = loreIndex.get(player.id) ?? Math.floor(Math.random() * LORE.length);
  loreIndex.set(player.id, (i + 1) % LORE.length);
  anim(af, i % 2 ? "point" : "bless", "agartha.bless");
  burst(af, [["agartha:holy_motes", 4]]);
  say(player, LORE[i]);
  player.addEffect("regeneration", 20 * 10, { amplifier: 0, showParticles: true });
  const last = Number(player.getDynamicProperty("agartha:gift_at") ?? 0);
  if (Date.now() - last > GIFT_COOLDOWN_MS) {
    player.setDynamicProperty("agartha:gift_at", Date.now());
    system.runTimeout(() => {
      if (!player.isValid) return;
      say(player, "Take this, and be warmed against the cold.");
      try {
        player.runCommand(`give @s ${IDS.mead} 1`);
      } catch {
        // cosmetic
      }
    }, 40);
  }
}

/** His life when no one is talking to him. Called every 20 ticks. */
export function allFatherTick(af, players, tick, night) {
  if (!af?.isValid) return;
  const l = af.location;
  // Greet anyone who comes close after being away for a while.
  for (const p of players) {
    const d = Math.hypot(p.location.x - l.x, p.location.z - l.z);
    if (d < 9 && tick - (greeted.get(p.id) ?? -Infinity) > 20 * 120) {
      greeted.set(p.id, tick);
      face(af, p.location);
      anim(af, "bless", "agartha.bless");
      say(p, GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
      return;
    }
  }
  if (tick % (20 * 15) !== 0 || !players.length) return;
  const roll = Math.random();
  if (night || roll < 0.35) {
    // Raises his arms to the sky and calls down the light.
    anim(af, "invoke", "agartha.chime");
    burst(af, [["agartha:holy_motes", 3], ["agartha:holy_motes", 6], ["agartha:god_rays", 28], ["agartha:aurora", 34]]);
  } else if (roll < 0.7) {
    // Gazes toward the Pole, the axis of the world.
    face(af, { x: REALM.originX + LAYOUT.pole.x, y: B + 40, z: REALM.originZ + LAYOUT.pole.z });
  } else {
    anim(af, "bless");
    burst(af, [["agartha:spirit_lights", 2]]);
  }
}
