const assert = require('node:assert/strict');
require('../physics.js');
const { createWorld, step, CONFIG } = BumperPhysics;

// Repeatable side impact: the victim accelerates inward to resist the shove.
function impact({ legacy = false, boosted = false, edge = false, speed = 12 } = {}) {
  const w = createWorld({ bots: 1, ...(legacy ? { impactMultiplier: 1, boostImpactMultiplier: 1, knockbackDuration: 0 } : {}) });
  const [attacker, target] = w.cars;
  attacker.ai = target.ai = null;
  const x = edge ? 21 : 0;
  Object.assign(attacker.state, { x: x - 2, z: 0, vx: speed, vz: 0, angle: Math.PI / 2, mass: 1, boostTime: boosted ? .4 : 0 });
  Object.assign(target.state, { x, z: 0, vx: 0, vz: 0, angle: -Math.PI / 2, mass: 1 });
  target.input.throttle = 1;
  step(w, CONFIG.tick);
  const launch = target.state.vx;
  let furthest = target.state.x;
  for (let i = 0; i < 60 && w.status === 'playing'; i++) { step(w, CONFIG.tick); furthest = Math.max(furthest, target.state.x); }
  return { launch, travel: furthest - x, alive: target.state.alive, recovery: target.state.knockback, phase: w.phase };
}
const before = impact({ legacy: true });
const after = impact();
const boost = impact({ boosted: true });
assert.ok(after.travel > before.travel * 2, 'strong hits resist immediate counter-steering/braking');
assert.ok(boost.launch > after.launch * 1.2, 'boost adds meaningful impact beyond approach speed');
assert.equal(impact({ edge: true }).alive, false, 'a clean normal-speed hit can eliminate from 4m inside the edge');
assert.equal(impact({ edge: true, legacy: true }).alive, true, 'same old impact was too weak');
assert.equal(impact({ edge: true, speed: 1 }).alive, true, 'small bumps do not launch cars off the arena');
assert.equal(after.alive, true, 'center hits are survivable');
assert.equal(after.recovery, 0, 'normal handling returns after knockback');
assert.equal(impact({ edge: true }).phase, 0, 'elimination comes from the hit, not arena collapse');
console.log(`Impact regression passed: ${before.travel.toFixed(2)}m -> ${after.travel.toFixed(2)}m resisted travel; normal launch ${after.launch.toFixed(1)}m/s, boosted ${boost.launch.toFixed(1)}m/s.`);
