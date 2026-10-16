/* A bot produces the same normalized input contract as keyboard/network input. */
(function (root) {
  'use strict';
  function update(world) {
    const c = world.config, { safeAt } = root.BumperPhysics;
    // Slippery floors need a longer look-ahead before the edge.
    const lookAhead = .45 * Math.max(1, Math.min(2.2, 4.2 / c.grip));
    for (const car of world.cars) {
      if (!car.ai || !car.state.alive) continue;
      const ai = car.ai, s = car.state;
      if (world.time < ai.nextThink) continue;
      ai.nextThink = world.time + c.difficultyProfiles[c.difficulty].reaction * (.8 + world.random() * .4);
      let target = null, nearest = Infinity;
      for (const other of world.cars) {
        if (other.id === car.id || !other.state.alive) continue;
        const d = Math.hypot(s.x - other.state.x, s.z - other.state.z);
        if (d < nearest) { nearest = d; target = other; }
      }
      if (!target) { car.input = { throttle: 0, steer: 0, boost: false }; continue; }
      ai.target = target.id;
      const t = target.state;
      const retreat = !safeAt(world, s.x, s.z, 2.5) || !safeAt(world, s.x + s.vx * lookAhead, s.z + s.vz * lookAhead, 1.6);
      let tx = 0, tz = 0, seeking = false;
      if (!retreat) {
        let pickup = null, distance = Infinity;
        for (const p of world.pickups) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < distance) { distance = d; pickup = p; } }
        if (pickup && distance < 9 && distance < nearest * .8) { tx = pickup.x; tz = pickup.z; seeking = true; }
        else {
          const tr = Math.hypot(t.x, t.z) || 1;
          // Approach from the inside to push a target outward, then commit to contact.
          const flank = nearest > 5 ? 2.4 * (1 - ai.aggression * .5) : 0;
          tx = t.x + t.vx * .16 - t.x / tr * flank;
          tz = t.z + t.vz * .16 - t.z / tr * flank;
        }
      }
      const desired = Math.atan2(tx - s.x, tz - s.z);
      const delta = Math.atan2(Math.sin(desired - s.angle), Math.cos(desired - s.angle));
      const aligned = Math.abs(delta) < .28;
      car.input = {
        steer: Math.max(-1, Math.min(1, delta * 1.9)),
        throttle: Math.abs(delta) > 1.6 ? (retreat ? -.7 : .15) : (retreat ? .9 : .65 + ai.aggression * .35),
        boost: !retreat && !seeking && aligned && nearest > 2.2 && nearest < 8 && safeAt(world, s.x, s.z, ai.aggression > .75 ? 3.5 : 5) && ai.aggression > .42 && s.knockback <= 0
      };
    }
  }
  root.BumperAI = { update };
})(globalThis);
