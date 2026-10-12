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
const rel = (l) => ({ x: l.x - OX, y: l.y, z: l.z - OZ });

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
expect(ys.reduce((a, b) => Math.min(a, b), 999) >= HELL.minY && ys.reduce((a, b) => Math.max(a, b), -999) <= HELL.maxY, "everything Hell writes stays inside its slice of the deep");

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
const lavaFills = () => mc.cmds.filter((c) => c.includes("lava replace air")).length;
ticks(20 * 8);
expect(lavaFills() === 0, "the lava waits a moment before it rises");
ticks(20 * 8);
expect(lavaFills() > 0, `then the floor begins to burn (${lavaFills()} lava fills)`);
const lv = () => Math.max(...mc.cmds.filter((c) => c.includes("lava replace air")).map((c) => +c.split(" ")[2]));
const lv1 = lv();
ticks(20 * 10);
expect(lv() > lv1, `the lava keeps rising (Y ${lv1} -> ${lv()})`);
expect(mc.entities.filter((e) => e.isValid && e.typeId === "agartha:soul").length === 16, "sixteen souls climb the spiral");
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

// --- The new terrors of the pit -----------------------------------------------
// Arrow slits shoot at a climber.
const arrowsBefore = mc.entities.filter((e) => e.typeId === "minecraft:arrow").length;
const sl = L.SLITS[5];
stand(p, Math.round(sl.x * 0.85) + 0.5, sl.y - 1, Math.round(sl.z * 0.85) + 0.5);
ticks(20 * 6);
const arrows = mc.entities.filter((e) => e.typeId === "minecraft:arrow");
expect(arrows.length > arrowsBefore && arrows.some((a) => a.impulse), `arrow slits shoot at you (${arrows.length - arrowsBefore} arrows)`);
// A vent of soul fire erupts under you.
const vk = L.VENTS[1];
const vc = L.pathCells().find((c) => c.k === vk);
stand(p, vc.x + 0.5, L.stepSurface(vk), vc.z + 0.5);
p.log.length = 0;
ticks(110);
expect(p.log.some((e) => e[0] === "fire") && p.log.some((e) => e[0] === "damage" && e[2] === "fire"), "vents of soul fire burn whoever stands on them");
// A soul grabs you and drags you toward the void.
const s0 = mc.entities.find((e) => e.typeId === "agartha:soul" && e.isValid);
p.log.length = 0;
for (let i = 0; i < 40 && !p.log.some((e) => e[0] === "knockback"); i++) { p.location = { ...s0.location }; ticks(4); }
expect(p.log.some((e) => e[0] === "knockback"), "the souls seize you and try to throw you off the stair");
// Creatures of our own come in the waves (they work on any difficulty).
const kinds = new Set(mc.entities.filter((e) => e.isValid && e.hasTag("agartha_hell_mob")).map((e) => e.typeId));
expect(kinds.has("agartha:damned") || kinds.has("agartha:hellhound"), `the waves are the Damned and hellhounds (${[...kinds].join(", ")})`);

// --- Death, and the loop ----------------------------------------------------
p.location = abs(5, -30, 5);
const cmdsBeforeDeath = mc.cmds.length;
fire("entityDie", { deadEntity: p, damageSource: { cause: "lava" } });
p.location = { x: 0, y: 70, z: 0 }; // the respawn point, far away
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(20);
expect(inHell(p) && p.location.y === L.PIT.floorY, "dying in Hell sends you back to the very bottom");
expect(prop(p, "loops") === 1 && titles(p).some((x) => x.includes("AGAIN")), "and Hell counts the ascents: AGAIN");
expect(msgs(p).some((m) => m.includes("burning")), "you remember how you died");
expect(mc.cmds.slice(cmdsBeforeDeath).some((c) => c.includes("air replace lava") && Number(c.split(" ")[2]) > L.PIT.floorY + 70), "and the pit is flushed of its lava, top to bottom");
ticks(20 * 6);
expect(inHell(p), "the soul stays in Hell after respawning");
stand(p, 5.5, -30, 5.5);
ticks(12);
expect(true, "(scars are remembered where you died)");

// --- Layer II: the City of Dis ------------------------------------------------
const D = L.DIS;
stand(p, L.ASCENT_PROFILE[40].x + 0.5, Math.ceil(L.ASCENT_PROFILE[40].y), L.ASCENT_PROFILE[40].z + 0.5);
ticks(10);
stand(p, D.x - 40, D.floorY, D.z + 0.5);
ticks(10);
expect(p.log.some((e) => e[0] === "cmd" && e[1].includes("agartha:dis_fog")) && titles(p).some((x) => x.includes("City of Dis")), "the Road of Ashes leads into the City of Dis");
ticks(20 * 12);
const disMobs = () => mc.entities.filter((e) => e.isValid && e.hasTag("agartha_dis"));
expect(disMobs().length > 0, `the city's hunters come for you (${disMobs().map((e) => e.typeId.replace("agartha:", "")).join(", ")})`);
expect(disMobs().some((e) => e.typeId === "agartha:fury"), "Furies circle over the city");
// A Fury dives.
const fury = disMobs().find((e) => e.typeId === "agartha:fury");
p.log.length = 0;
for (let i = 0; i < 120 && !p.log.some((e) => e[0] === "damage" && e[2] === "entityAttack"); i++) ticks(2);
expect(p.log.some((e) => e[0] === "damage" && e[2] === "entityAttack"), "a Fury dives and strikes");
// The Gate of Dis is shut until the three Seals are broken.
const gate = L.innerGateCells();
const gateShut = () => gate.filter((g) => g.kind === "bars").every((g) => (placed.get(`${OX + g.x},${g.y},${OZ + g.z}`) ?? "shut") !== "minecraft:air");
expect(gateShut(), "the Gate of Dis is shut");
const { sealBits } = await import("./mock/scripts/hell_dis.js");
const F = D.floorY;
const at = (x, y, z) => placed.get(`${OX + x},${y},${OZ + z}`);
// The crypt of nine tombs: one riddle, one true grave.
const C = L.CRYPT;
stand(p, L.MAUSOLEUM.x + 0.5, F, L.MAUSOLEUM.z + 0.5);
ticks(42);
const crypt = JSON.parse(world.getDynamicProperty("agartha:dis_crypt"));
expect(C.tombs.every((t) => at(t.button.x, t.button.y, t.button.z) === "minecraft:polished_blackstone_button"), "the nine tombs are closed, each with a button");
expect((placed.get(`${OX + C.sign.x},${C.sign.y},${OZ + C.sign.z}:text`) ?? "").includes(L.CRYPT.tombs[crypt.answer].riddle.split(" ")[0]), "the riddle of the true grave is written on the sign");
stand(p, C.minX + 4.5, C.floorY, C.minZ + 6.5);
ticks(4);
expect(msgs(p).some((m) => m.includes(C.tombs[crypt.answer].riddle)), "entering the crypt, you hear the riddle");
const press = (i) => fire("buttonPush", { block: { location: abs(C.tombs[i].button.x, C.tombs[i].button.y, C.tombs[i].button.z) }, source: p });
const wrong = (crypt.answer + 1) % 9;
let n0 = mc.entities.length;
p.log.length = 0;
press(wrong);
ticks(2);
expect(mc.entities.slice(n0).filter((e) => e.typeId === "agartha:damned").length === 3 && p.log.some((e) => e[0] === "fire"), "the wrong tomb: its dead rise, and you burn");
expect(at(C.tombs[wrong].button.x, C.tombs[wrong].button.y, C.tombs[wrong].button.z) === "minecraft:air" && (sealBits() & 1) === 0, "...it stays open, and the Seal holds");
press(crypt.answer);
ticks(2);
expect((sealBits() & 1) !== 0, "the true tomb breaks the Seal of Ash");

// The race up the Tower of the Furies.
const T = L.FURY_TOWER;
stand(p, T.minX + 1.5, F + 6, T.minZ + 1.5);
ticks(4);
expect(world.getDynamicProperty("agartha:dis_tower") === true && titles(p).some((x) => x.includes("Climb")), "climbing the tower starts the race: Climb.");
const lavaCmds = () => mc.cmds.filter((c) => c.includes("lava replace air") && c.startsWith(`fill ${OX + T.minX + 1} `));
ticks(50 + 10 * 6);
expect(lavaCmds().length >= 5, `the fire rises up the tower (${lavaCmds().length} layers)`);
expect(mc.cmds.some((c) => c.includes("minecraft:magma replace air")), "a false floor keeps the lava from pouring out of the door");
const s1 = L.SEALS[1];
stand(p, s1.x + 0.5, s1.y, s1.z + 0.5);
ticks(4);
expect((sealBits() & 2) !== 0, "touching the top in time breaks the Seal of Wind");
ticks(80);
expect(world.getDynamicProperty("agartha:dis_tower") === undefined && mc.cmds.some((c) => c.includes("air replace lava") && c.startsWith(`fill ${OX + T.minX + 1} `)), "then the tower drains and its stair is rebuilt");

// Garm.
stand(p, L.KENNEL.minX + 4.5, F, L.KENNEL.gateZ + 0.5);
ticks(4);
const garm = mc.entities.find((e) => e.isValid && e.hasTag("agartha_garm"));
expect(!!garm && garm.events.includes("agartha:as_garm") && garm.nameTag.includes("Garm"), "entering the kennel wakes Garm, the Hound of Hel");
garm.location = abs(L.KENNEL.minX + 14.5, F, L.KENNEL.gateZ + 0.5);
for (let i = 0; i < 200 && !garm.impulse; i++) ticks(2);
expect(!!garm.impulse, "Garm charges");
garm.hp = 0.4;
p.log.length = 0;
garm.location = abs(L.KENNEL.minX + 9.5, F, L.KENNEL.gateZ + 0.5);
for (let i = 0; i < 200 && !p.log.some((e) => e[0] === "fire"); i++) ticks(2);
expect(p.log.some((e) => e[0] === "fire"), "below half his blood, Garm breathes fire");
expect((sealBits() & 4) === 0, "the Seal of Teeth holds while Garm lives");
fire("entityDie", { deadEntity: garm });
garm.isValid = false;
ticks(4);
expect((sealBits() & 4) !== 0, "killing Garm breaks the Seal of Teeth");
ticks(42);
expect(!gateShut(), "with all three Seals broken, the Gate of Dis opens");
// The Bridge of Sighs falls behind you.
const sighs = L.BRIDGES.find((b) => b.crumbling);
const bc = L.bridgeCells(sighs);
stand(p, bc[0].x + 0.5, D.floorY, sighs.z + 0.5);
ticks(80);
expect(bc.filter((c) => !c.edge).every((c) => placed.get(`${OX + c.x},${D.floorY - 1},${OZ + c.z}`) === "minecraft:air"), "the Bridge of Sighs crumbles into the river of fire");
stand(p, D.x - 40, D.floorY, D.z + 0.5);
ticks(20 * 30);
expect(bc.filter((c) => !c.edge).every((c) => placed.get(`${OX + c.x},${D.floorY - 1},${OZ + c.z}`) !== "minecraft:air"), "and it rises again later");

// The Ferryman.
const R = L.FERRY;
stand(p, R.west + 1.5, R.y + 1, R.z + 0.5);
ticks(2);
expect(at(R.west, R.y, R.z) === "minecraft:bone_block", "the raft of bones waits at the west dock");
const hounds0 = mc.entities.filter((e) => e.typeId === "agartha:hellhound").length;
ticks(24);
ticks(20 * 6);
expect(at(R.east + 2, R.y, R.z) === "minecraft:bone_block" && at(R.west, R.y, R.z) === "minecraft:air", "standing on it, the Ferryman poles you across the fire");
expect(rel(p.location).x > R.east, "...and you go with it");
expect(mc.entities.filter((e) => e.typeId === "agartha:hellhound").length > hounds0, "hounds wait on the far bank");
expect(mc.entities.some((e) => e.isValid && e.typeId === "agartha:ferryman"), "the Ferryman rides his raft");

// The Gaoler only hears you run.
stand(p, D.x - 30.5, F, D.z + 0.5);
for (let i = 0; i < 20 * 25 && !mc.entities.some((e) => e.isValid && e.typeId === "agartha:gaoler"); i++) ticks(2);
const gaoler = mc.entities.find((e) => e.isValid && e.typeId === "agartha:gaoler");
expect(!!gaoler, "the Gaoler walks the city");
gaoler.location = abs(D.x - 20.5, F, D.z + 0.5);
ticks(4);
expect(!gaoler.events.includes("agartha:hunt"), "walking, he does not notice you");
p.isSprinting = true;
ticks(4);
expect(gaoler.events.includes("agartha:hunt"), "running, he hears you and comes");
p.isSprinting = false;
ticks(20 * 6);
expect(gaoler.events.includes("agartha:calm"), "stop running, and he loses you");

// Crouch, and the dead show the way.
p.isSneaking = true;
p.log.length = 0;
stand(p, D.x - 30.5, F, D.z + 0.5);
ticks(12);
expect(p.log.some((e) => e[0] === "bar" && /blocks/.test(e[1])), `crouching shows the way (${(p.log.find((e) => e[0] === "bar") ?? [])[1]})`);
p.isSneaking = false;

// --- Layer III -----------------------------------------------------------------
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

// --- The Piety Board, and the afterlife ------------------------------------------
const q = makePlayer();
q.location = { x: 500, y: 70, z: 500 };
ui.__answers.length = 0;
ui.__answers.push([20, true]);
fire("before.playerInteractWithBlock", { player: q, block: { typeId: "agartha:piety_board", location: { x: 500, y: 70, z: 501 } }, cancel: false });
await settle(4);
expect(q.getDynamicProperty("agartha:piety") === 20 && q.getDynamicProperty("agartha:afterlife") === true, "the Piety Board sets your piety (20) and your wish to face the afterlife");
fire("entityDie", { deadEntity: q, damageSource: { cause: "fall" } });
fire("playerSpawn", { player: q, initialSpawn: false });
ui.__answers.push("afterlife");
ticks(22);
await settle(6);
expect(ui.__shown.some((f) => f.title?.includes("died") && f.buttons[0].includes("Hell")), "dying in the world, the impious are offered Hell");
expect(inHell(q), "...and choosing the afterlife sends them down");
const q2 = makePlayer();
q2.location = { x: 600, y: 70, z: 600 };
ui.__answers.push([80, true]);
fire("system.scriptEventReceive", { id: "agartha:piety", message: "", sourceEntity: q2 });
await settle(4);
expect(q2.getDynamicProperty("agartha:piety") === 80, "/scriptevent agartha:piety opens the board too");
fire("entityDie", { deadEntity: q2, damageSource: { cause: "fall" } });
fire("playerSpawn", { player: q2, initialSpawn: false });
ui.__answers.push("Respawn normally");
ticks(22);
await settle(6);
expect(ui.__shown.some((f) => f.title?.includes("died") && f.buttons[0].includes("Agartha")) && !inHell(q2) && !q2.hasTag("agartha_in_realm"), "the pious are offered Agartha, and may simply respawn instead");

if (fails) {
  console.error(`${fails} check(s) failed`);
  process.exit(1);
}
console.log("hell smoke test passed");
