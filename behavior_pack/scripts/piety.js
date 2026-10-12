// The Piety Board, and the choice after death.
//
// Anyone may set their own piety (0 to 100) at a Piety Board, or with
// /scriptevent agartha:piety. If they also choose to face the afterlife, then
// whenever they die out in the world (not in Agartha, not in Hell) they are
// asked as they respawn: go on to the afterlife, or simply respawn? The
// pious (50 and above) rise to Agartha; the rest go down to Hell.

import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { enterHell, HELL_TAG } from "./hell.js";

export const PIETY_BOARD = "agartha:piety_board";
const PIETY = "agartha:piety";
const AFTERLIFE = "agartha:afterlife";
const PENDING = "agartha:afterlife_pending";
const HEAVEN = 50;

let enterAgartha; // set by main.js (which owns travel to Agartha)
let inAgartha = () => false;
export function setAgarthaEntrance(enter, isIn) {
  enterAgartha = enter;
  inAgartha = isIn;
}

export function pietyOf(player) {
  const v = Number(player.getDynamicProperty(PIETY) ?? 50);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 50;
}

const wait = (t) => new Promise((r) => system.runTimeout(r, t));
async function show(player, form) {
  for (let i = 0; i < 12; i++) {
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

function verdict(piety) {
  return piety >= HEAVEN ? "§bAgartha, the heaven above the clouds" : "§4Hell, the pit beneath the world";
}

export async function openPietyBoard(player) {
  const piety = pietyOf(player);
  const on = !!player.getDynamicProperty(AFTERLIFE);
  const form = new ModalFormData().title("§6The Piety Board");
  try {
    form.slider(`How pious are you?\n§70 = wicked, 100 = saintly. ${HEAVEN} or more rises to Agartha; less goes down to Hell.`, 0, 100, { valueStep: 1, defaultValue: piety });
    form.toggle("When I die, let me choose the afterlife", { defaultValue: on });
  } catch {
    // Older script API: positional arguments.
    form.slider("How pious are you? (50+ rises to Agartha)", 0, 100, 1, piety);
    form.toggle("When I die, let me choose the afterlife", on);
  }
  const r = await show(player, form);
  if (!r || r.canceled || !player.isValid) return;
  const [p, a] = r.formValues ?? [];
  const value = Math.max(0, Math.min(100, Math.round(Number(p ?? piety))));
  player.setDynamicProperty(PIETY, value);
  player.setDynamicProperty(AFTERLIFE, !!a);
  player.playSound(value >= HEAVEN ? "agartha.bless" : "agartha.dread", { volume: 0.6 });
  player.sendMessage(`§6Your piety is now §f${value}§6. ${a ? `When you die you may go on to ${verdict(value)}§6.` : "§7You will simply respawn when you die."}`);
}

// Death out in the world: remember to offer the choice.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (deadEntity?.typeId !== "minecraft:player" || !deadEntity.getDynamicProperty(AFTERLIFE)) return;
    if (deadEntity.hasTag(HELL_TAG) || inAgartha(deadEntity)) return;
    deadEntity.setDynamicProperty(PENDING, true);
  } catch {
    // gone
  }
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn || !player?.getDynamicProperty(PENDING)) return;
  player.setDynamicProperty(PENDING, undefined);
  system.runTimeout(() => {
    if (player.isValid) offerAfterlife(player);
  }, 20);
});

export async function offerAfterlife(player) {
  const piety = pietyOf(player);
  const heaven = piety >= HEAVEN;
  const form = new ActionFormData()
    .title("§fYou have died")
    .body(`§7Your piety: §f${piety}§7.\n\nYour soul may go on to ${verdict(piety)}§7, or you may return to the world as you are.`)
    .button(heaven ? "§bGo to the afterlife\n§8Agartha" : "§4Go to the afterlife\n§8Hell")
    .button("§7Respawn normally");
  const r = await show(player, form);
  if (!r || r.canceled || r.selection !== 0 || !player.isValid) return;
  if (heaven) {
    if (enterAgartha?.(player) === false) player.sendMessage("§7The clouds part, but Agartha has not been raised. §8(An operator must raise it first.)");
  } else {
    enterHell(player);
  }
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.block?.typeId !== PIETY_BOARD) return;
  ev.cancel = true;
  const { player } = ev;
  system.run(() => openPietyBoard(player));
});

system.afterEvents.scriptEventReceive.subscribe(({ id, sourceEntity }) => {
  if (id !== "agartha:piety" || sourceEntity?.typeId !== "minecraft:player") return;
  openPietyBoard(sourceEntity);
});
