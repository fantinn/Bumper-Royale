// Run with: node tests/maps.cjs — covers map rules, pickups and KO credit.
const assert = require('node:assert/strict');
require('../physics.js'); require('../ai.js');
const { createWorld, step, CONFIG, MAPS, floorAt, toWorld } = BumperPhysics;
function seed(n) { return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
function place(car, x, z, vx = 0, vz = 0, angle = Math.PI / 2) { Object.assign(car.state, { x, z, vx, vz, angle }); car.ai = null; }
{
  // A clean shove off the edge credits the attacker with the KO.
  const w = createWorld({ bots: 2, pickupInterval: 0 });
  place(w.cars[0], 19, 0, 12); place(w.cars[1], 21, 0); place(w.cars[2], -5, 0);
  for (let i = 0; i < 90 && w.cars[1].state.alive; i++) step(w, CONFIG.tick);
  assert.equal(w.cars[1].state.alive, false, 'victim falls');
  const ko = w.eliminated.length && w.cars[0].state.kos;
  assert.equal(ko, 1, 'attacker credited');
}
{
  // A car driving off alone is not credited to anyone.
  const w = createWorld({ bots: 1, pickupInterval: 0 });
  place(w.cars[0], -5, 0); place(w.cars[1], 24.5, 0, 6);
  let event = null;
  for (let i = 0; i < 30 && !event; i++) { step(w, CONFIG.tick); event = w.events.find(e => e.type === 'elimination'); }
  assert.equal(event.by, null, 'solo fall has no attacker');
}
{
  // Shock pickup launches nearby rivals and marks the collector as the hitter.
  const w = createWorld({ bots: 2, pickupInterval: 0 });
  place(w.cars[0], 0, 0); place(w.cars[1], 3, 0); place(w.cars[2], 15, 0);
  w.pickups.push({ id: 1, type: 'shock', x: 0, z: 0 });
  step(w, CONFIG.tick);
  assert.equal(w.pickups.length, 0, 'pickup consumed');
  assert.ok(w.cars[1].state.vx > 8, 'nearby car launched');
  assert.equal(w.cars[1].state.lastHit, 0, 'shock records the attacker');
  assert.equal(w.cars[2].state.vx, 0, 'distant car unaffected');
}
{
  // Heavy pickup makes collisions favor the heavy car.
  const hit = heavy => {
    const w = createWorld({ bots: 1, pickupInterval: 0, drag: 0, grip: 0 });
    place(w.cars[0], -1, 0, 8); place(w.cars[1], 1, 0);
    w.cars[0].state.mass = w.cars[1].state.mass = 1; if (heavy) w.cars[0].state.heavy = 5;
    step(w, CONFIG.tick); return w.cars[1].state.vx;
  };
  assert.ok(hit(true) > hit(false) * 1.15, 'heavy car hits harder');
}
{
  // Pickups spawn on safe floor and charge refills boost.
  const w = createWorld({ bots: 1 }, seed(3));
  place(w.cars[0], 0, 0); place(w.cars[1], -10, 0);
  for (let i = 0; i < 60 * 12; i++) { w.cars[0].state.x = w.cars[1].state.x = 0; w.cars[1].state.z = -10; w.cars[0].state.z = 3; step(w, CONFIG.tick); }
  assert.ok(w.pickups.length >= 1, 'pickups spawn over time');
  for (const p of w.pickups) assert.ok(floorAt(w, p.x, p.z), 'pickup on the floor');
  const c = createWorld({ bots: 1, pickupInterval: 0 }); place(c.cars[0], 0, 0); place(c.cars[1], -10, 0);
  c.cars[0].state.cooldown = 2.5; c.pickups.push({ id: 1, type: 'charge', x: 0, z: 0 }); step(c, CONFIG.tick);
  assert.equal(c.cars[0].state.cooldown, 0, 'charge refills boost');
}
{
  // Sector map: the dropped slice swallows cars; the island and other slices hold.
  const w = createWorld({ map: 'doca', bots: 2, pickupInterval: 0 }, seed(5));
  const zone = w.order[0], a = (zone + .5) / w.config.phases * Math.PI * 2, b = a + Math.PI;
  place(w.cars[0], 0, 0); place(w.cars[1], Math.sin(a) * 15, Math.cos(a) * 15); place(w.cars[2], Math.sin(b) * 15, Math.cos(b) * 15);
  w.time = w.config.phaseSeconds - w.config.warningSeconds; step(w, CONFIG.tick);
  assert.equal(w.warningZone, zone, 'warns the slice about to drop');
  w.time = w.config.phaseSeconds; step(w, CONFIG.tick);
  assert.equal(w.cars[1].state.alive, false, 'car on dropped slice falls');
  assert.equal(w.cars[2].state.alive, true, 'opposite slice holds');
  assert.equal(w.cars[0].state.alive, true, 'island holds');
  assert.equal(w.radius, w.config.radius, 'outer radius unchanged until all slices fall');
}
{
  // Spinning floor carries a parked car around without flinging it off quickly.
  const w = createWorld({ map: 'neon', bots: 1, pickupInterval: 0 });
  place(w.cars[0], 0, 18, w.config.spin * 18, 0); place(w.cars[1], 0, -4);
  for (let i = 0; i < 120; i++) step(w, CONFIG.tick);
  const s = w.cars[0].state, r = Math.hypot(s.x, s.z);
  assert.ok(Math.abs(Math.atan2(s.x, s.z)) > .25, 'car moved with the floor');
  assert.ok(r > 18 && r < 21, 'mild outward pull');
}
{
  // Bumpers rotate with the floor and kick cars out at a minimum speed.
  const w = createWorld({ map: 'neon', bots: 1, pickupInterval: 0 });
  const b = w.bumpers[0], [bx, bz] = toWorld(w, b.x, b.z), n = Math.hypot(bx, bz);
  place(w.cars[0], bx - bx / n * 2.6, bz - bz / n * 2.6, bx / n * 6, bz / n * 6); place(w.cars[1], -20, 0);
  let bumped = false;
  for (let i = 0; i < 30 && !bumped; i++) { step(w, CONFIG.tick); bumped = w.events.some(e => e.type === 'bumper'); }
  assert.ok(bumped, 'bumper event');
  const s = w.cars[0].state; assert.ok(Math.hypot(s.vx, s.vz) >= w.config.bumperMinSpeed * .9, 'bounced hard');
}
{
  // Ice keeps more sideways slide than the classic floor.
  const slide = map => { const w = createWorld({ map, bots: 1, pickupInterval: 0 }); place(w.cars[0], 0, 0, 0, 10, Math.PI / 2); place(w.cars[1], -20, 0); for (let i = 0; i < 20; i++) step(w, CONFIG.tick); return Math.abs(w.cars[0].state.vz); };
  assert.ok(slide('gelo') > slide('parque') * 2, 'ice is slippery');
}
let longest = 0;
for (const map of Object.keys(MAPS)) for (const bots of [5, 11, 23]) for (let s = 1; s <= 3; s++) {
  const w = createWorld({ map, bots }, seed(s * 7 + bots));
  w.cars[0].ai = { aggression: .7, nextThink: 0, target: null };
  for (let t = 0; t < 12000 && w.status === 'playing'; t++) {
    BumperAI.update(w); step(w, CONFIG.tick);
    for (const car of w.cars) for (const key of ['x', 'z', 'vx', 'vz', 'y']) assert.ok(Number.isFinite(car.state[key]), `finite ${key} on ${map}`);
  }
  assert.equal(w.status, 'finished', `match resolves on ${map}`);
  longest = Math.max(longest, w.time);
}
console.log(`Maps passed: KO credit, pickups, sectors, spin, bumpers, ice and 36 bot matches on ${Object.keys(MAPS).length} maps. Longest: ${longest.toFixed(1)}s.`);
