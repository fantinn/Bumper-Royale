// Run with: node tests/simulation.cjs (Node is only needed for developer tests).
const assert = require('node:assert/strict');
require('../physics.js'); require('../ai.js');
const { createWorld, step, CONFIG } = BumperPhysics;
function seed(n) { return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
function carAt(car, x, z, vx = 0, vz = 0) { Object.assign(car.state, { x, z, vx, vz, angle: Math.PI / 2 }); }
{
  const w = createWorld({ bots: 1, drag: 0, grip: 0 });
  carAt(w.cars[0], -1, 0, 10); carAt(w.cars[1], 1, 0);
  w.cars[0].state.mass = 2; w.cars[1].state.mass = 1;
  step(w, CONFIG.tick);
  assert.ok(w.cars[1].state.vx > 10, 'heavy attacker transfers strong impulse');
  assert.ok(Math.abs(w.cars[0].state.vx * 2 + w.cars[1].state.vx - 20) < 1e-8, 'collision conserves momentum');
}
{
  const w = createWorld({ bots: 1 }); carAt(w.cars[0], 0, 0); carAt(w.cars[1], -10, 0);
  w.cars[0].input.boost = true; step(w, CONFIG.tick);
  assert.equal(w.cars[0].state.cooldown, CONFIG.boostCooldown);
  step(w, CONFIG.tick); assert.ok(w.cars[0].state.cooldown < CONFIG.boostCooldown);
  assert.equal(w.events.filter(e => e.type === 'boost').length, 0, 'boost cannot retrigger during cooldown');
}
{
  const w = createWorld({ bots: 1 }); carAt(w.cars[0], 0, 0); carAt(w.cars[1], 24, 0);
  w.time = 15; step(w, CONFIG.tick); assert.ok(w.warning);
  w.time = 20; step(w, CONFIG.tick);
  assert.equal(w.radius, 21); assert.equal(w.cars[1].state.alive, false);
  assert.equal(w.winner, 0); assert.equal(w.cars[1].state.place, 2);
}
{
  const w = createWorld({ bots: 1 }); carAt(w.cars[0], 27, 0); carAt(w.cars[1], -27, 0);
  step(w, CONFIG.tick); assert.equal(w.winner, null); assert.equal(w.status, 'finished');
  assert.equal(w.cars[0].state.place, w.cars[1].state.place);
}
let maxSeconds = 0;
for (const difficulty of ['easy', 'normal', 'hard']) for (const bots of [5, 11, 23]) for (let s = 1; s <= 3; s++) {
  const w = createWorld({ bots, difficulty }, seed(s));
  // Also drive entity zero through the AI contract to exercise full matches.
  w.cars[0].ai = { aggression: .7, nextThink: 0, target: null };
  for (let t = 0; t < 10000 && w.status === 'playing'; t++) {
    BumperAI.update(w); step(w, CONFIG.tick);
    for (const car of w.cars) for (const key of ['x','z','vx','vz','y']) assert.ok(Number.isFinite(car.state[key]), `finite ${key}`);
  }
  assert.equal(w.status, 'finished', `match resolves: ${difficulty}, ${bots}, ${s}`);
  assert.ok(w.cars.filter(c => c.state.alive).length <= 1);
  maxSeconds = Math.max(maxSeconds, w.time);
}
console.log(`Passed: impulses, cooldown, shrinking, ranking, simultaneous falls, 27 complete bot matches. Longest: ${maxSeconds.toFixed(1)}s.`);
