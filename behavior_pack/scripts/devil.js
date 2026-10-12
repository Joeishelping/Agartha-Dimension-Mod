// The Devil, Keeper of the Contract, in the Hall of Thrones. No combat: a
// conversation, and a Deal. He remembers how many times you climbed, how
// your heart weighed against the Feather, and whether you learned his name.
//
// The prices of leaving:
//   Memory      lose every level of experience, and everything you learned here
//   Possession  he takes what you hold in your hand
//   Years       carry his mark (weakness, slowness, hunger) for ten minutes
//   The Feather's Mercy   only if your heart was light, and only once
//   The Wager   climb once more from the bottom without dying; reach him and go free
//   Refuse      climb again
// Or speak his true name, learned in five syllables from glyphs in the dark.

import { world, system, EquipmentSlot, ItemStack } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { TRUE_NAME } from "./hell_layout.js";
import { hellState, setHellState, releaseFromHell, sendToBottom, knownName } from "./hell.js";

const TITLE = "§4The Keeper of the Contract";

const WHO = [
  "When they raised their shining heaven on the clouds, somebody had to keep the ledger of what it cost. I keep it. I have always kept it.",
  "The scribes of the old Duat drew me beside the scale, waiting for the heavy hearts. The monks drew me with horns. They were both right, and both wrong.",
  "Agartha is the light at the top of the world. I am the floor beneath it. Without a floor, where would the light fall?",
  "My name? Names have power here. If you want mine, remember it. It is written in pieces in the dark, where the climbing souls cannot read.",
];
const PLACE = [
  "Below. Where the souls who are not lifted come to climb. The pit is the Oubliette: it forgets them, and they forget everything except the climbing.",
  "Twelve gates, twelve hours of the long night. The lava rises because it always has. The buttons wake the damned because noise always does.",
  "This hall is the Spire of the Contract. Forty-two thrones for the judges of the dead. They are empty. They have been empty a very long time. I judge alone.",
  "The clock across the lake runs backwards. Nothing that happens here moves forward. Except, perhaps, you. That depends on what you sign.",
];

const talking = new Set();
const loreIndex = new Map();
const wait = (t) => new Promise((r) => system.runTimeout(r, t));

async function show(player, form) {
  for (let i = 0; i < 8; i++) {
    let r;
    try {
      r = await form.show(player);
    } catch {
      return undefined;
    }
    if (r?.canceled && r.cancelationReason === "UserBusy") {
      await wait(10);
      continue;
    }
    return r;
  }
  return undefined;
}

function voice(player, devil, anim) {
  try {
    player.playSound("agartha.devil_voice", { volume: 1, pitch: 0.9 + Math.random() * 0.15 });
    if (anim) devil?.playAnimation(`animation.agartha.devil.${anim}`, { blendOutTime: 0.3 });
  } catch {
    // cosmetic
  }
}

function greeting(st) {
  let text;
  if (st.loops === 0) {
    text = "So. You climbed.\n\nMost do not, the first time. Most fall, and climb again, and fall.\n\nI keep the Contract. Every soul that sinks this far owes something. Every soul that wishes to leave must pay it.";
  } else if (st.loops < 5) {
    text = `Again you stand before me. You fell ${st.loops} time${st.loops > 1 ? "s" : ""} on the way.\n\nThe pit remembers each one. So do I.`;
  } else {
    text = `${st.loops} times.\n\nYou keep climbing, as if the stair might end differently. It never does. Only the Contract ends it.`;
  }
  if (st.weighed === "light") text += "\n\nThe Feather did not judge you heavy. How rare.";
  else if (st.weighed === "heavy") text += "\n\nYour heart sank on the scale. Ammit is hungry. Choose carefully.";
  if (st.glyphs) text += `\n\n§8(You remember: ${knownName(st.glyphs)})`;
  return text;
}

export async function openDevil(player, devil) {
  if (talking.has(player.id)) return;
  talking.add(player.id);
  try {
    const st = hellState(player);
    if (st.wager) {
      voice(player, devil, "gesture");
      await show(player, new MessageFormData().title(TITLE).body("You climbed from the bottom and did not fall once.\n\nYou kept your word. So shall I.").button1("Go").button2("Go"));
      releaseFromHell(player, "the wager is won");
      return;
    }
    await converse(player, devil);
  } finally {
    talking.delete(player.id);
  }
}

async function converse(player, devil) {
  for (let turn = 0; turn < 12; turn++) {
    if (!player.isValid) return;
    const st = hellState(player);
    voice(player, devil, turn ? undefined : "gesture");
    const options = [["who", "Who are you?"], ["place", "What is this place?"], ["deal", "§4Make a Deal §r§8(leave Hell)"]];
    if (st.glyphs) options.push(["name", "§5Speak his true name"]);
    options.push(["leave", "§8Say nothing"]);
    const form = new ActionFormData().title(TITLE).body(greeting(st));
    for (const [, label] of options) form.button(label);
    const r = await show(player, form);
    if (!r || r.canceled || r.selection === undefined) return;
    const choice = options[r.selection]?.[0];
    if (choice === "leave") return;
    if (choice === "who" || choice === "place") {
      const list = choice === "who" ? WHO : PLACE;
      const key = `${player.id}:${choice}`;
      const i = loreIndex.get(key) ?? 0;
      loreIndex.set(key, (i + 1) % list.length);
      voice(player, devil);
      const more = await show(player, new MessageFormData().title(TITLE).body(list[i]).button1("Ask something else").button2("Say nothing"));
      if (!more || more.canceled || more.selection === 1) return;
      continue;
    }
    if (choice === "name") {
      await trueName(player, devil, st);
      return;
    }
    if (choice === "deal") {
      if (await deal(player, devil)) return;
    }
  }
}

/** Returns true when the conversation is over. */
async function deal(player, devil) {
  for (;;) {
    const st = hellState(player);
    voice(player, devil, "gesture");
    const prices = [
      ["memory", "The Price of Memory\n§8forget all you have learned"],
      ["possession", "The Price of Possession\n§8give him what you hold"],
      ["years", "The Price of Years\n§8carry his mark for ten minutes"],
    ];
    if (st.weighed === "light" && !st.featherUsed) prices.push(["feather", "§6The Feather's Mercy\n§8once, and never again"]);
    prices.push(["wager", "The Wager\n§8climb once more without falling"]);
    prices.push(["refuse", "§4Refuse"]);
    const form = new ActionFormData().title("§4The Contract").body("Every way out has a price. Name the one you will pay.");
    for (const [, label] of prices) form.button(label);
    const r = await show(player, form);
    if (!r || r.canceled || r.selection === undefined) return false;
    const price = prices[r.selection][0];

    if (price === "refuse") {
      voice(player, devil, "laugh");
      sendToBottom(player, "\"Then climb.\"");
      return true;
    }
    if (price === "possession") {
      const equip = player.getComponent("minecraft:equippable");
      const held = equip?.getEquipment(EquipmentSlot.Mainhand);
      if (!held) {
        await show(player, new MessageFormData().title("§4The Contract").body("Your hands are empty. I cannot take nothing.\n\nChoose another price.").button1("Choose again").button2("Choose again"));
        continue;
      }
      const name = held.nameTag ?? held.typeId.replace(/^\w+:/, "").replace(/_/g, " ");
      if (!(await confirm(player, `He wants the ${name}${held.amount > 1 ? ` (all ${held.amount})` : ""} in your hand. It will be his forever.`))) continue;
      equip.setEquipment(EquipmentSlot.Mainhand, undefined);
      player.sendMessage(`§4He takes the ${name}. §7It is his now.`);
      releaseFromHell(player, "you paid with what you held");
      return true;
    }
    if (price === "memory") {
      if (!(await confirm(player, "You will forget it all: every level of experience, every syllable you found in the dark, every time you climbed."))) continue;
      try {
        player.resetLevel();
      } catch {
        player.addLevels(-1000);
      }
      setHellState(player, "glyphs", 0);
      setHellState(player, "loops", 0);
      setHellState(player, "scars", undefined);
      releaseFromHell(player, "you paid with your memory");
      return true;
    }
    if (price === "years") {
      if (!(await confirm(player, "For ten minutes you will carry his mark: weak, slow and hungry, wherever you go."))) continue;
      releaseFromHell(player, "you carry his mark");
      system.runTimeout(() => {
        if (!player.isValid) return;
        for (const [fx, amp] of [["weakness", 0], ["slowness", 0], ["hunger", 1], ["mining_fatigue", 0]]) player.addEffect(fx, 20 * 600, { amplifier: amp });
        player.sendMessage("§4His mark is on you for ten minutes.");
      }, 10);
      return true;
    }
    if (price === "feather") {
      if (!(await confirm(player, "Your heart was light. Once, only once, the Feather may speak for you."))) continue;
      setHellState(player, "feather", true);
      releaseFromHell(player, "the Feather spoke for you");
      return true;
    }
    if (price === "wager") {
      if (!(await confirm(player, "Go back to the very bottom. Climb to me again without dying once, and you go free for nothing.\n\nFall, and the wager is lost."))) continue;
      setHellState(player, "wager", 1);
      sendToBottom(player, "\"Climb. Reach me without falling once, and you go free.\"");
      return true;
    }
  }
}

async function confirm(player, text) {
  const r = await show(player, new MessageFormData().title("§4Sign the Contract?").body(text).button1("§4Sign").button2("Not yet"));
  return !!r && !r.canceled && r.selection === 0;
}

async function trueName(player, devil, st) {
  voice(player, devil);
  const r = await show(player, new ModalFormData().title("§5His True Name").textField(`You remember: ${knownName(st.glyphs)}\n\nSpeak his name.`, "his name"));
  if (!r || r.canceled) return;
  const said = String(r.formValues?.[0] ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (said === TRUE_NAME.join("")) {
    world.sendMessage(`§5${player.name} spoke the true name of the Keeper of the Contract, and walked out of Hell.`);
    releaseFromHell(player, "you spoke his true name");
    system.runTimeout(() => {
      if (!player.isValid) return;
      const inv = player.getComponent("minecraft:inventory")?.container;
      const left = inv?.addItem(new ItemStack("minecraft:totem_of_undying", 1));
      if (left || !inv) player.dimension.spawnItem(new ItemStack("minecraft:totem_of_undying", 1), player.location);
      player.sendMessage("§5Bound by his name, he gives back one life he took.");
    }, 20);
    return;
  }
  voice(player, devil, "laugh");
  await show(player, new MessageFormData().title(TITLE).body(`"${said ? said.charAt(0) + said.slice(1).toLowerCase() : "..."}?"\n\nThat is not my name.`).button1("...").button2("..."));
  sendToBottom(player, "He laughed. The floor opened.");
}
