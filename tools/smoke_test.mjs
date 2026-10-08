// Runs the add-on's scripts against a mock Minecraft API and walks through
// the main player flows. Run: node tools/smoke_test.mjs
import { cpSync, rmSync } from "node:fs";
rmSync("tools/mock/scripts", { recursive: true, force: true });
cpSync("behavior_pack/scripts", "tools/mock/scripts", { recursive: true });
const mc = await import("./mock/node_modules/@minecraft/server/index.js");
await import("./mock/scripts/main.js");
const { __subs: subs, system, makePlayer, __messages, blocks, world } = mc;
const { REALM, B } = await import("./mock/scripts/config.js");
const OX = REALM.originX, OZ = REALM.originZ;
const exitKey = `${OX},${B + 1},${OZ + 189}`;
let fails = 0;
const expect = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) fails++; };
const fire = (n, e) => (subs[n] ?? []).forEach((f) => f(e));
const ticks = (n) => { for (let i = 0; i < n; i++) system.__tick(); };
const dim = world.getDimension("overworld");
const inRealm = (p) => p.hasTag("agartha_in_realm");

fire("worldLoad", {});
const p = makePlayer();
p.location = { x: 40, y: 64, z: 50 };
ticks(20 * 30);
expect(!mc.cmds.some((c) => c.startsWith("fill")), "nothing is forged until an operator asks");

// Walking into a stray portal block before forging does nothing harmful.
fire("system.scriptEventReceive", { id: "agartha:forge", message: "", sourceEntity: p });
expect(p.mode === "Spectator", "the forger is put in spectator mode");
let t = 0; while (system.__busy() && t++ < 400000) system.__tick();
expect(__messages.some((m) => m.includes("Agartha is forged")), `realm forged (${JSON.stringify(mc.stats())})`);
expect(p.log.some((e) => e[0] === "tp" && e[1].y === 300), "the forger was flown over the site");
expect(p.mode === "Survival" && p.location.x === 40, "the forger is returned home in their own game mode");
expect(p.items.includes("agartha:gate_keystone"), "the forger receives the Keystone");
expect(mc.cmds.every((c) => !c.includes("undefined")), "no malformed commands");
expect(mc.spawned.some(([id]) => id === "agartha:allfather"), "the All-Father stands at the Gates");

// Using the Keystone in the air while looking at nothing just explains itself.
fire("itemUse", { source: p, itemStack: { typeId: "agartha:gate_keystone" } });
ticks(2);
expect(p.log.some((e) => e[0] === "msg" && e[1].includes("Look at the ground")), "keystone in the air without a target explains itself");
ticks(25);
// Raise the Gate by tapping the ground with the Keystone (before-event, works on any block).
const ev = { player: p, block: { location: { x: 50, y: 63, z: 50 } }, itemStack: { typeId: "agartha:gate_keystone" } };
fire("before.playerInteractWithBlock", ev);
ticks(2);
expect(ev.cancel === true, "the tap is consumed by the Keystone");
expect([...blocks.values()].filter((v) => v === "agartha:portal").length > 30, "the Heavenly Gate is raised with a portal");
expect(!p.items.includes("agartha:gate_keystone"), "the Keystone is consumed");
// A second keystone is refused.
fire("system.scriptEventReceive", { id: "agartha:keystone", message: "", sourceEntity: p });
expect(!p.items.includes("agartha:gate_keystone"), "no second Keystone while the Gate stands");

// Walk through the Gate (portal plane at z=50, x 47..53, y 64..71).
p.location = { x: 50.5, y: 64, z: 52.5 }; ticks(2);
p.location = { x: 50.5, y: 64, z: 51.5 }; ticks(2);
p.location = { x: 50.5, y: 64, z: 50.5 }; ticks(2);
ticks(10);
expect(inRealm(p) && Math.abs(p.location.z - (OZ + REALM.arrival.z)) < 1 && Math.abs(p.location.x - (OX + REALM.arrival.x)) < 1, "walking through the Gate arrives at the Gates of Agartha");
ticks(80);
expect(p.log.some((e) => e[0] === "msg" && e[1].includes("All-Father")), "the All-Father welcomes the arrival");

// Status report.
fire("system.scriptEventReceive", { id: "agartha:status", message: "", sourceEntity: p });
expect(p.log.some((e) => e[0] === "msg" && e[1].includes("Watcher: §frunning")) && p.log.some((e) => e[0] === "msg" && /Gate: .*portal blocks present/.test(e[1])), "status reports the watcher and the Gate");

// Break part of the exit; it mends itself.
blocks.delete(exitKey);
ticks(220);
expect(blocks.get(exitKey) === "agartha:portal", "the exit portal mends itself");

// The one exit.
p.location = { x: OX + 0.5, y: B + 1, z: OZ + 189.5 };
ticks(2);
expect(!inRealm(p) && Math.abs(p.location.z - 51.5) < 0.01, "the exit returns you before the Heavenly Gate");
ticks(6);
expect(!inRealm(p), "no instant re-entry after returning");

// Falling kills; death in Agartha means a normal respawn.
ticks(50);
p.location = { x: 50.5, y: 64, z: 50.5 }; ticks(2); ticks(100);
p.location = { ...p.location, y: 90 }; ticks(4);
expect(p.log.some((e) => e[0] === "kill"), "falling below the clouds kills");
p.location = { x: 0, y: 64, z: 0 };
fire("playerSpawn", { player: p, initialSpawn: false });
expect(!inRealm(p), "after dying in Agartha you respawn normally");

// Building a Gate by hand: tear it down first, then place portal blocks.
for (const [k, v] of [...blocks]) if (v === "agartha:portal" && Number(k.split(",")[0]) < 1000) blocks.delete(k);
fire("playerBreakBlock", { player: p, brokenBlockPermutation: { type: { id: "agartha:portal" } }, dimension: dim });
expect(p.items.includes("agartha:gate_keystone"), "tearing down the Gate returns the Keystone");
for (const [x, y] of [[20, 64], [21, 64], [20, 65], [21, 65]]) {
  blocks.set(`${x},${y},20`, "agartha:portal");
  fire("playerPlaceBlock", { player: p, block: dim.getBlock({ x, y, z: 20 }), dimension: dim });
}
expect(p.log.some((e) => e[0] === "msg" && e[1].includes("founded here")), "the first hand-placed portal founds the Gate");
expect([20, 21].every((x) => blocks.get(`${x},65,20`) === "agartha:portal"), "nearby portal blocks join the Gate");
ticks(50);
p.location = { x: 20.5, y: 64, z: 22.5 }; ticks(2);
p.location = { x: 20.5, y: 64, z: 20.5 }; ticks(10);
expect(inRealm(p), "walking through a hand-built Gate reaches Agartha");
ticks(60);
p.location = { x: OX + 0.5, y: B + 1, z: OZ + 189.5 }; ticks(2);
expect(!inRealm(p) && Math.abs(p.location.z - 22.5) < 0.01, "and the exit brings you back to it");

// Tapping the Gate's surface also takes you through.
ticks(60);
p.location = { x: 20.5, y: 64, z: 23.5 }; ticks(2);
const tap = { player: p, block: { typeId: "agartha:portal", location: { x: 20, y: 64, z: 20 } } };
fire("before.playerInteractWithBlock", tap);
ticks(4);
expect(tap.cancel === true && inRealm(p), "tapping the portal surface enters Agartha");
ticks(60);
p.location = { x: OX + 0.5, y: B + 1, z: OZ + 189.5 }; ticks(2);
expect(!inRealm(p) && Math.abs(p.location.z - 23.5) < 0.01, "and you come back where you tapped from");

// Stray portal blocks are refused.
blocks.set("500,64,500", "agartha:portal");
fire("playerPlaceBlock", { player: p, block: dim.getBlock({ x: 500, y: 64, z: 500 }), dimension: dim });
expect(blocks.get("500,64,500") === "minecraft:air", "portal blocks placed elsewhere are refused");

// Tearing the Gate down returns its Keystone.
p.items.length = 0;
for (const [k, v] of [...blocks]) if (v === "agartha:portal" && Number(k.split(",")[0]) < 1000) blocks.delete(k);
fire("playerBreakBlock", { player: p, brokenBlockPermutation: { type: { id: "agartha:portal" } }, dimension: dim });
expect(p.items.includes("agartha:gate_keystone"), "the fallen Gate's Keystone returns");
// Erasing Agartha.
p.location = { x: 40, y: 64, z: 50 };
const before = mc.cmds.length;
fire("system.scriptEventReceive", { id: "agartha:erase", message: "", sourceEntity: p });
expect(p.mode === "Spectator", "the eraser is carried over the site");
t = 0; while (system.__busy() && t++ < 400000) system.__tick();
expect(__messages.some((m) => m.includes("has been erased")), "erase completes");
expect(mc.cmds.slice(before).every((c) => !c.startsWith("fill") || c.includes(" minecraft:air ")), "erase only clears blocks");
expect(p.mode === "Survival" && p.location.x === 40, "the eraser is returned home");
p.location = { x: 50.5, y: 64, z: 52.5 }; ticks(60);
p.location = { x: 50.5, y: 64, z: 50.5 }; ticks(4);
expect(!inRealm(p), "after erasing, the Gate no longer leads anywhere");
rmSync("tools/mock/scripts", { recursive: true, force: true });
if (fails) process.exit(1);
console.log("smoke test passed");
