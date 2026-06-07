// Chocobos & Chickabos — server script
//
// Provides three things that pure data-driven packs can't do cleanly:
//   1. Rider-controlled FLIGHT for fly-capable Chocobos (black & gold).
//   2. Growth of the Gysahl Green crop near players.
//   3. Stage-aware harvest drops for the crop.
//
// Everything below uses only stable @minecraft/server APIs. If the pack ever
// reports a script module error, set the "@minecraft/server" version in
// Chocobos_BP/manifest.json to the one your game ships (the code itself is
// version-agnostic).

import { world, system, ItemStack } from "@minecraft/server";

// ----------------------------- tuning knobs --------------------------------
const CHOCOBO = "cb:chocobo";
const CROP = "cb:gysahl_crop";

const FLY_SPEED = 0.78;     // cruise speed in the direction you look
const HOVER_LIFT = 0.08;    // counters gravity so level look ~= hover
const DESCEND_SPEED = 0.45; // sneak to slow down and sink

const CROP_MAX_AGE = 3;
const GROW_INTERVAL = 100;  // ticks between growth passes (~5s)
const GROW_CHANCE = 0.35;   // chance an eligible crop advances each pass
const GROW_RADIUS = 5;      // horizontal scan radius around each player
const GROW_HEIGHT = 2;      // vertical scan radius around each player

// ------------------------------- flight ------------------------------------
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    let mount;
    try {
      mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    } catch (e) {
      mount = undefined;
    }
    if (!mount || mount.typeId !== CHOCOBO) continue;

    let canFly = false;
    try {
      canFly = mount.getProperty("cb:can_fly") === true;
    } catch (e) {
      canFly = false;
    }
    if (!canFly) continue;

    const view = player.getViewDirection();
    let vx, vy, vz;
    if (player.isSneaking) {
      vx = view.x * FLY_SPEED * 0.3;
      vy = -DESCEND_SPEED;
      vz = view.z * FLY_SPEED * 0.3;
    } else {
      vx = view.x * FLY_SPEED;
      vy = view.y * FLY_SPEED + HOVER_LIFT;
      vz = view.z * FLY_SPEED;
    }

    try {
      mount.clearVelocity();
      mount.applyImpulse({ x: vx, y: vy, z: vz });
    } catch (e) {
      // applyImpulse can throw if the entity is momentarily invalid; ignore
    }
  }
}, 1);

// --------------------------- crop growth -----------------------------------
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const dim = player.dimension;
    const o = player.location;
    const bx = Math.floor(o.x), by = Math.floor(o.y), bz = Math.floor(o.z);
    for (let dx = -GROW_RADIUS; dx <= GROW_RADIUS; dx++) {
      for (let dy = -GROW_HEIGHT; dy <= GROW_HEIGHT; dy++) {
        for (let dz = -GROW_RADIUS; dz <= GROW_RADIUS; dz++) {
          let block;
          try {
            block = dim.getBlock({ x: bx + dx, y: by + dy, z: bz + dz });
          } catch (e) {
            continue; // chunk not loaded
          }
          if (!block || block.typeId !== CROP) continue;
          if (Math.random() > GROW_CHANCE) continue;
          let age;
          try {
            age = block.permutation.getState("cb:age");
          } catch (e) {
            continue;
          }
          if (typeof age === "number" && age < CROP_MAX_AGE) {
            try {
              block.setPermutation(block.permutation.withState("cb:age", age + 1));
            } catch (e) {
              // permutation set can fail at chunk edges; ignore
            }
          }
        }
      }
    }
  }
}, GROW_INTERVAL);

// ------------------------ stage-aware harvest ------------------------------
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const perm = ev.brokenBlockPermutation;
  if (!perm || perm.type.id !== CROP) return;

  let age = 0;
  try {
    age = perm.getState("cb:age") ?? 0;
  } catch (e) {
    age = 0;
  }

  const dim = ev.dimension;
  const loc = {
    x: ev.block.location.x + 0.5,
    y: ev.block.location.y + 0.5,
    z: ev.block.location.z + 0.5,
  };

  const drop = (id, count) => {
    if (count <= 0) return;
    try {
      dim.spawnItem(new ItemStack(id, count), loc);
    } catch (e) {
      // ignore spawn failures
    }
  };

  if (age >= CROP_MAX_AGE) {
    drop("cb:gysahl_green", 1 + Math.floor(Math.random() * 2)); // 1-2 greens
    drop("cb:gysahl_seeds", 1 + Math.floor(Math.random() * 2)); // 1-2 seeds
  } else {
    drop("cb:gysahl_seeds", 1); // immature: just return a seed
  }
});
