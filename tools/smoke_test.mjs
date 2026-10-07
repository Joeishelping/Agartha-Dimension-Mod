// Runs the add-on's scripts against a mock Minecraft API and walks through
// the main player flows. Run: node tools/smoke_test.mjs
import { cpSync, rmSync } from "node:fs";
rmSync("tools/mock/scripts", { recursive: true, force: true });
cpSync("behavior_pack/scripts", "tools/mock/scripts", { recursive: true });
const mc = await import("./mock/node_modules/@minecraft/server/index.js");
await import("./mock/scripts/main.js");
const { __subs: subs, system, makePlayer, __messages, blocks, world } = mc;
let fails = 0;
const expect = (c, m) => { console.log(c ? "ok  " : "FAIL", m); if (!c) fails++; };
const fire = (n, e) => (subs[n] ?? []).forEach((f) => f(e));
const ticks = (n) => { for (let i = 0; i < n; i++) system.__tick(); };
const dim = world.getDimension("overworld");
const place = (p, x, y, z) => {
  blocks.set(`${x},${y},${z}`, "agartha:portal");
  fire("playerPlaceBlock", { player: p, block: dim.getBlock({ x, y, z }), dimension: dim });
};

fire("worldLoad", {});
const p = makePlayer();
ticks(20 * 16); // auto-forge kicks in after 15 s
let t = 0; while (system.__busy() && t++ < 100000) system.__tick();
expect(__messages.some((m) => m.includes("stand open")), `realm auto-forged (${JSON.stringify(mc.stats())})`);
expect(mc.cmds.every((c) => !c.includes("undefined")), "no malformed commands");
expect(mc.cmds.some((c) => /fill .* agartha:portal replace/.test(c)), "return portal built in Agartha");
expect(mc.cmds.filter((c) => c.startsWith("loot")).length >= 10, "loot chests filled");

// Dying in the mortal world does nothing special.
p.location = { x: 40, y: 64, z: 50 };
fire("playerSpawn", { player: p, initialSpawn: false });
ticks(10);
expect(!p.hasTag("agartha_in_realm") && p.location.x === 40, "death does not send players to Agartha");

// Build the one Gate (3 wide x 4 tall at x=50..52, z=50).
for (let x = 50; x <= 52; x++) for (let y = 64; y <= 67; y++) place(p, x, y, 50);
expect(p.log.some((e) => e[0] === "msg" && e[1].includes("founded")), "first portal founds the Gate");
place(p, 300, 64, 300);
expect(blocks.get("300,64,300") === "minecraft:air" && p.log.some((e) => e[0] === "msg" && e[1].includes("only one")), "a second, distant portal is refused");

// Walk into it from the south.
p.location = { x: 51.5, y: 64, z: 52.5 }; ticks(2);
p.location = { x: 51.5, y: 64, z: 51.5 }; ticks(2);
p.location = { x: 51.5, y: 64, z: 50.5 }; ticks(2);
ticks(10);
expect(p.hasTag("agartha_in_realm") && Math.abs(p.location.z - 200176.5) < 1, "walking into the Gate travels to Agartha");
ticks(100);
expect(p.hasTag("agartha_in_realm"), "stays in realm after grace period");

// Walk into Agartha's return portal.
p.location = { x: 200000.5, y: 201, z: 200189.5 };
ticks(2);
expect(!p.hasTag("agartha_in_realm") && Math.abs(p.location.z - 51.5) < 0.01 && Math.abs(p.location.x - 51.5) < 0.01, "return portal brings you back in front of the Gate");
ticks(4);
expect(!p.hasTag("agartha_in_realm"), "no instant re-entry after returning");

// Runestone also returns; falling kills; death in heaven = normal respawn.
ticks(50);
p.location = { x: 51.5, y: 64, z: 50.5 }; ticks(2);
ticks(100);
fire("playerInteractWithBlock", { player: p, block: { typeId: "agartha:runestone" } });
expect(!p.hasTag("agartha_in_realm") && Math.abs(p.location.z - 51.5) < 0.01, "runestone returns to the Gate");
ticks(50);
p.location = { x: 51.5, y: 64, z: 50.5 }; ticks(2); ticks(100);
p.location = { ...p.location, y: 90 }; ticks(4);
expect(p.log.some((e) => e[0] === "kill"), "falling below the clouds kills");
p.location = { x: 0, y: 64, z: 0 };
fire("playerSpawn", { player: p, initialSpawn: false });
expect(!p.hasTag("agartha_in_realm"), "after dying in Agartha you respawn normally");

// Resetting the Gate lets a new one be founded elsewhere.
fire("system.scriptEventReceive", { id: "agartha:portal_reset", message: "", sourceEntity: p });
place(p, 300, 64, 300);
expect(blocks.get("300,64,300") === "agartha:portal", "after portal_reset a new Gate can be built");
rmSync("tools/mock/scripts", { recursive: true, force: true });
if (fails) process.exit(1);
console.log("smoke test passed");
