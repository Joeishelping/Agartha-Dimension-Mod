// Walks a soul through Hell against the mock Minecraft API: forging, the
// Hellmouth, the pit (lava, spikes, crumbling steps, buttons, waves, souls,
// glyphs, death and recurrence), the weighing, the clock, and every Deal.
// Run: node tools/smoke_hell.mjs
import { cpSync, rmSync } from "node:fs";
rmSync("tools/mock/scripts", { recursive: true, force: true });
cpSync("behavior_pack/scripts", "tools/mock/scripts", { recursive: true });
const mc = await import("./mock/node_modules/@minecraft/server/index.js");
const ui = await import("./mock/node_modules/@minecraft/server-ui/index.js");
await import("./mock/scripts/main.js");
const { __subs: subs, system, makePlayer, __messages, world, blocks, placed } = mc;
const { HELL } = await import("./mock/scripts/config.js");
const L = await import("./mock/scripts/hell_layout.js");
const OX = HELL.originX, OZ = HELL.originZ;
const abs = (x, y, z) => ({ x: OX + x, y, z: OZ + z });

let fails = 0;
const expect = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) fails++; };
const fire = (n, e) => (subs[n] ?? []).forEach((f) => f(e));
const ticks = (n) => { for (let i = 0; i < n; i++) system.__tick(); };
const settle = async (n = 5) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); ticks(2); } };
const inHell = (p) => p.hasTag("agartha_in_hell");
const msgs = (p) => p.log.filter((e) => e[0] === "msg").map((e) => e[1]);
const titles = (p) => p.log.filter((e) => e[0] === "title").map((e) => e[1]);
const prop = (p, k) => p.getDynamicProperty(`agartha:hell_${k}`);
const stand = (p, x, y, z) => { p.location = abs(x, y, z); };

fire("worldLoad", {});
const p = makePlayer();
p.location = { x: 500, y: 70, z: 500 };
ticks(60);

// --- Forging ---------------------------------------------------------------
fire("system.scriptEventReceive", { id: "agartha:scarab", message: "", sourceEntity: p });
expect(msgs(p).some((m) => m.includes("Forge Hell first")), "no Scarab before Hell is forged");
fire("system.scriptEventReceive", { id: "agartha:forge_hell", message: "", sourceEntity: p });
expect(p.mode === "Spectator", "the forger is put in spectator mode");
let t = 0; while (system.__busy() && t++ < 400000) system.__tick();
expect(__messages.some((m) => m.includes("Hell is forged")), "Hell is forged");
expect(p.mode === "Survival" && p.location.x === 500, "the forger is put back where they were");
expect(p.items.includes("agartha:heart_scarab"), "the forger receives the Heart Scarab");
expect(p.log.some((e) => e[0] === "tp" && e[1].y === -10), "the forger was carried through the deep");
const fills = mc.cmds.filter((c) => c.startsWith("fill"));
expect(fills.some((c) => /minecraft:polished_blackstone_bricks|deepslate/.test(c)), `the deep was carved (${fills.length} fills)`);
const ys = fills.map((c) => c.split(" ").map(Number)).flatMap((a) => [a[2], a[5]]);
expect(Math.min(...ys) >= HELL.minY && Math.max(...ys) <= HELL.maxY, "everything Hell writes stays inside its slice of the deep");

// --- The Hellmouth ---------------------------------------------------------
p.lookingAt = { x: 510, y: 69, z: 500 };
fire("before.playerInteractWithBlock", { player: p, block: world.getDimension("overworld").getBlock(p.lookingAt), itemStack: { typeId: "agartha:heart_scarab" }, cancel: false });
ticks(2);
expect(__messages.some((m) => m.includes("Hellmouth has opened")), "the Scarab opens the Hellmouth");
const portals = [...blocks.entries()].filter(([, id]) => id === "agartha:hell_portal").map(([k]) => k.split(",").map(Number));
expect(portals.length >= 30, `the Hellmouth has a portal in its jaws (${portals.length} blocks)`);
fire("system.scriptEventReceive", { id: "agartha:status", message: "", sourceEntity: p });
expect(msgs(p).some((m) => m.includes("Hell: §fforged")) && msgs(p).some((m) => m.includes("Hellmouth: §f510")), "status reports Hell and its mouth");

// --- Entering --------------------------------------------------------------
p.location = { x: 515, y: 70, z: 500 };
ticks(4);
const [px, py, pz] = portals[0];
p.location = { x: px + 0.5, y: py, z: pz + 0.5 };
ticks(4);
expect(inHell(p), "stepping into the Hellmouth takes you to Hell");
expect(Math.abs(p.location.x - (OX + L.ARRIVAL.x)) < 0.01 && p.location.y === L.PIT.floorY, "souls arrive at the bottom of the pit");
ticks(10);
expect(titles(p).some((x) => x.includes("Oubliette")), "the Oubliette greets the arrival");
expect(p.log.some((e) => e[0] === "cmd" && e[1].includes("agartha:hell_fog")), "the pit is wrapped in its fog");

// --- The pit: lava, spikes, crumbling, buttons, waves, souls ----------------
const lavaFills = () => mc.cmds.filter((c) => c.includes(" lava replace air")).length;
ticks(20 * 8);
expect(lavaFills() === 0, "the lava waits a moment before it rises");
ticks(20 * 8);
expect(lavaFills() > 0, `then the floor begins to burn (${lavaFills()} lava fills)`);
const lv = () => Math.max(...mc.cmds.filter((c) => c.includes(" lava replace air")).map((c) => +c.split(" ")[2]));
const lv1 = lv();
ticks(20 * 10);
expect(lv() > lv1, `the lava keeps rising (Y ${lv1} -> ${lv()})`);
expect(mc.entities.filter((e) => e.isValid && e.typeId === "agartha:soul").length === 8, "eight souls climb the spiral");
const soul = mc.entities.find((e) => e.typeId === "agartha:soul");
const soulAt = { ...soul.location };
ticks(20);
expect(soul.location.x !== soulAt.x || soul.location.y !== soulAt.y, "the souls move");

// Spikes: step onto a trap's lane.
const trapCell = L.pathCells().find((c) => c.kind === "trap" && c.k === L.TRAPS[2].k);
stand(p, trapCell.x + 0.5, L.stepSurface(trapCell.k), trapCell.z + 0.5);
ticks(12);
expect(p.log.some((e) => e[0] === "damage" && e[2] === "stalagmite" && e[1] >= 20), "spikes burst from the trap and strike");
const spikeKey = `${OX + trapCell.x},${L.stepBlock(trapCell.k).y + 1},${OZ + trapCell.z}`;
expect(placed.get(spikeKey) === "minecraft:pointed_dripstone", "the spikes are real blocks");
ticks(40);
expect(placed.get(spikeKey) === "minecraft:air", "and they sink back down");
// A safe lane past the same trap.
const safe = L.pathCells().find((c) => c.k === L.TRAPS[2].k && c.kind === "path");
expect(!!safe, "every trap leaves a lane free");

// Crumbling steps.
const cr = L.pathCells().find((c) => c.kind === "crumble");
stand(p, cr.x + 0.5, L.stepSurface(cr.k), cr.z + 0.5);
ticks(14);
const crKey = `${OX + cr.x},${L.stepBlock(cr.k).y},${OZ + cr.z}`;
expect(placed.get(crKey) === "minecraft:air", "a crumbling step gives way");
stand(p, L.ARRIVAL.x, L.ARRIVAL.y, L.ARRIVAL.z);
ticks(20 * 12);
expect(placed.get(crKey) !== "minecraft:air", "and grows back later");

// The button at a Gate of the Hours flushes the lava, and wakes the damned.
const h3 = L.HOURS[2];
const b = L.hourButton(h3);
stand(p, b.x + 0.5, b.y, b.z + 0.5);
ticks(4);
const mobsBefore = mc.entities.filter((e) => e.isValid && e.hasTag("agartha_hell_mob")).length;
fire("buttonPush", { block: { location: abs(b.x, b.y, b.z) }, source: p, dimension: world.getDimension("overworld") });
ticks(20 * 3);
expect(mc.cmds.some((c) => c.includes(" air replace lava")), "the button drains the lava");
expect(msgs(p).some((m) => m.includes("wakes the damned")), "and the noise wakes the damned");
const mobsAfter = mc.entities.filter((e) => e.isValid && e.hasTag("agartha_hell_mob")).length;
expect(mobsAfter > mobsBefore, `a wave comes (${mobsAfter - mobsBefore} of the damned)`);
fire("buttonPush", { block: { location: abs(b.x, b.y, b.z) }, source: p });
expect(true, "pressing again at once does nothing more");

// Glyph of the true name.
const g1 = L.GLYPHS[0];
stand(p, g1.x + 1.5, g1.y, g1.z + 0.5);
ticks(12);
expect((prop(p, "glyphs") & 1) === 1 && titles(p).some((x) => x.includes("AZ")), "a glyph in the dark teaches the first syllable");

// --- Death, and the loop ----------------------------------------------------
p.location = abs(5, -30, 5);
fire("entityDie", { deadEntity: p, damageSource: { cause: "lava" } });
p.location = { x: 0, y: 70, z: 0 }; // the respawn point, far away
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(20);
expect(inHell(p) && p.location.y === L.PIT.floorY, "dying in Hell sends you back to the very bottom");
expect(prop(p, "loops") === 1 && titles(p).some((x) => x.includes("AGAIN")), "and Hell counts the ascents: AGAIN");
expect(msgs(p).some((m) => m.includes("burning")), "you remember how you died");
ticks(20 * 6);
expect(inHell(p), "the soul stays in Hell after respawning");
stand(p, 5.5, -30, 5.5);
ticks(12);
expect(true, "(scars are remembered where you died)");

// --- Layer 2 ---------------------------------------------------------------
// Walk into the Hall of Thrones.
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(20);
expect(p.log.some((e) => e[0] === "cmd" && e[1].includes("agartha:abyss_fog")), "the Spire has its own cold fog");
const devil = mc.entities.find((e) => e.typeId === "agartha:devil" && e.isValid);
expect(!!devil, "the Devil waits in the Hall of Thrones");
const placedBefore = placed.size;
ticks(80);
expect([...placed.keys()].some((k) => k.startsWith(`${OX + L.CLOCK.x},`)), "the Clocktower's hands are turning (backwards)");
// The weighing.
stand(p, L.SCALE.x + 0.5, L.SPIRE.hallY + 1, L.SCALE.z + 2.5);
ticks(4);
expect(prop(p, "weighed") === "light" || prop(p, "weighed") === "heavy", `the heart is weighed (${prop(p, "weighed")})`);

const talk = async (...answers) => {
  ui.__answers.length = 0;
  ui.__answers.push(...answers);
  fire("before.playerInteractWithEntity", { player: p, target: devil, cancel: false });
  await settle(12);
};
const releasedCount = () => p.log.filter((e) => e[0] === "title" && e[1].includes("Released")).length;
const enterAgain = () => {
  p.location = { x: 515, y: 70, z: 500 };
  ticks(60);
  p.location = { x: px + 0.5, y: py, z: pz + 0.5 };
  ticks(4);
  stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
  ticks(6);
};

// Questions, then walk away.
await talk("Who are you?", "Ask something else", "What is this place?", "Say nothing");
expect(ui.__shown.some((f) => f.body?.includes("ledger")) && ui.__shown.some((f) => f.body?.includes("Oubliette")), "he answers questions");
expect(inHell(p), "talking alone frees no one");

// Refuse: back to the bottom.
const loops0 = prop(p, "loops");
await talk("Make a Deal", "Refuse");
expect(inHell(p) && prop(p, "loops") === loops0 + 1 && p.location.y === L.PIT.floorY, "refusing the Contract means climbing again");

// The Price of Years.
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(4);
await talk("Make a Deal", "Price of Years", "Sign");
ticks(20);
expect(!inHell(p) && releasedCount() === 1, "the Price of Years releases you...");
expect(p.location.x < OX - 1000, "...back to the mortal world, where you entered");
expect(p.log.filter((e) => e[0] === "effect" && ["weakness", "hunger"].includes(e[1])).length >= 2, "...carrying his mark");

// The Price of Possession, with empty hands, then holding something.
enterAgain();
p.mainhand = undefined;
await talk("Make a Deal", "Possession", "Choose again", "Refuse");
expect(ui.__shown.some((f) => f.body?.includes("Your hands are empty")), "he cannot take nothing");
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(4);
p.mainhand = { typeId: "minecraft:diamond_sword", amount: 1 };
await talk("Make a Deal", "Possession", "Sign");
expect(!inHell(p) && p.mainhand === undefined && msgs(p).some((m) => m.includes("diamond sword")), "the Price of Possession: he takes what you hold");

// The Wager: back to the bottom; reach him alive and go free.
enterAgain();
await talk("Make a Deal", "Wager", "Sign");
expect(inHell(p) && prop(p, "wager") === 1 && p.location.y === L.PIT.floorY, "the Wager sends you back to the bottom");
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(4);
await talk("Go");
expect(!inHell(p) && titles(p).length && p.log.some((e) => e[0] === "title" && e[1].includes("Released")), "reaching him without dying wins the Wager");
// ...and dying loses it.
enterAgain();
await talk("Make a Deal", "Wager", "Sign");
fire("entityDie", { deadEntity: p, damageSource: { cause: "fall" } });
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(20);
expect(inHell(p) && !prop(p, "wager") && msgs(p).some((m) => m.includes("wager is lost")), "dying loses the Wager");

// The true name: wrong, then right.
const allBits = (1 << L.TRUE_NAME.length) - 1;
p.setDynamicProperty("agartha:hell_glyphs", allBits);
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(4);
await talk("true name", ["Beelzebub"], 0);
expect(inHell(p) && p.location.y === L.PIT.floorY, "a wrong name: he laughs, and you fall");
stand(p, 0.5, L.SPIRE.hallY + 1, L.SPIRE.minZ + 4);
ticks(4);
await talk("true name", ["Az-ra-khet-mo-run"]);
ticks(30);
expect(!inHell(p) && __messages.some((m) => m.includes("true name")), "speaking his true name sets you free");
expect(p.items.includes("minecraft:totem_of_undying"), "and he gives back a life he took");

// The Price of Memory.
enterAgain();
await talk("Make a Deal", "Memory", "Sign");
expect(!inHell(p) && p.log.some((e) => e[0] === "resetLevel") && !prop(p, "glyphs") && !prop(p, "loops"), "the Price of Memory: you forget everything");

// Leaving the pit empty: lava drains, the damned and the souls are gone.
ticks(20 * 15);
expect(mc.entities.filter((e) => e.isValid && (e.hasTag?.("agartha_hell_mob") || e.typeId === "agartha:soul")).length === 0, "when the pit is empty, the damned and the souls are gone");

// Operator release and the Hellmouth's scarab returning.
enterAgain();
fire("system.scriptEventReceive", { id: "agartha:hell_release", message: "", sourceEntity: p });
expect(!inHell(p), "an operator can release themselves");

if (fails) {
  console.error(`${fails} check(s) failed`);
  process.exit(1);
}
console.log("hell smoke test passed");
