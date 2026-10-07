// Runs the add-on's scripts against a mock Minecraft API and walks through
// the main player flows. Run: node tools/smoke_test.mjs
import { cpSync, rmSync } from "node:fs";
rmSync("tools/mock/scripts", { recursive: true, force: true });
cpSync("behavior_pack/scripts", "tools/mock/scripts", { recursive: true });
const mc = await import("./mock/node_modules/@minecraft/server/index.js");
await import("./mock/scripts/main.js");
const { __subs: subs, system, makePlayer, __messages } = mc;
let fails = 0;
const expect = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) fails++; };
const fire = (n, e) => (subs[n] ?? []).forEach((f) => f(e));
const ticks = (n) => { for (let i = 0; i < n; i++) system.__tick(); };

fire("worldLoad", {});
const p = makePlayer();
ticks(20 * 16); // auto-forge kicks in after 15 s
let t = 0; while (system.__busy() && t++ < 100000) system.__tick();
expect(__messages.some((m) => m.includes("stand open")), `realm auto-forged (${JSON.stringify(mc.stats())})`);
expect(mc.cmds.every((c) => !c.includes("undefined")), "no malformed commands");
expect(mc.cmds.some((c) => /fill .* minecraft:quartz_stairs \[/.test(c)), "fill commands carry block states");
expect(mc.cmds.filter((c) => c.startsWith("loot")).length >= 10, "loot chests filled");
expect(mc.spawned.length > 5, "wildlife spawned");

// Mortal death -> ascend.
p.location = { x: 50, y: 64, z: 50 };
fire("entityDie", { deadEntity: p });
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(10);
expect(p.hasTag("agartha_in_realm") && Math.abs(p.location.z - 200176.5) < 1, "dead player ascends to the Gates of Agartha");
expect(p.log.some((e) => e[0] === "title" && e[1].includes("ascended")), "ascension title shown");
ticks(100);
expect(p.hasTag("agartha_in_realm"), "stays in realm after grace period");

// Runestone -> reborn at the place they respawned.
fire("playerInteractWithBlock", { player: p, block: { typeId: "agartha:runestone" } });
expect(!p.hasTag("agartha_in_realm") && p.location.x === 50, "runestone returns to the mortal respawn point");

// Rune travel, then fall through the clouds.
ticks(50);
fire("itemUse", { source: p, itemStack: { typeId: "agartha:frost_rune" } });
ticks(100);
expect(p.hasTag("agartha_in_realm"), "frost rune travels to the realm");
p.location = { ...p.location, y: 90 };
ticks(4);
expect(p.log.some((e) => e[0] === "kill"), "falling below the clouds kills");
fire("entityDie", { deadEntity: p });
p.location = { x: 50, y: 64, z: 50 };
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(10);
expect(!p.hasTag("agartha_in_realm") && p.location.x === 50, "dying in heaven means rebirth in the mortal world");

// Afterlife toggle.
fire("system.scriptEventReceive", { id: "agartha:afterlife", message: "off", sourceEntity: p });
fire("entityDie", { deadEntity: p });
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(10);
expect(!p.hasTag("agartha_in_realm"), "afterlife can be switched off");
rmSync("tools/mock/scripts", { recursive: true, force: true });
if (fails) process.exit(1);
console.log("smoke test passed");
