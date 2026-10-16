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
      // Personality traits (see BumperPhysics.STYLES); missing traits fall back to neutral.
      const caution = ai.caution ?? 1, greed = ai.greed ?? 9, hunt = ai.hunt ?? 0, chaos = ai.chaos ?? 0, turbo = ai.boost ?? 0;
      let target = null, best = Infinity;
      for (const other of world.cars) {
        if (other.id === car.id || !other.state.alive) continue;
        const d = Math.hypot(s.x - other.state.x, s.z - other.state.z);
        // Hunters treat the player as if they were much closer than they are.
        const score = d * (other.id === 0 ? 1 - hunt * .6 : 1);
        if (score < best) { best = score; target = other; }
      }
      if (!target) { car.input = { throttle: 0, steer: 0, boost: false }; continue; }
      ai.target = target.id;
      const t = target.state, distance = Math.hypot(s.x - t.x, s.z - t.z);
      const retreat = !safeAt(world, s.x, s.z, 2.5 * caution) || !safeAt(world, s.x + s.vx * lookAhead, s.z + s.vz * lookAhead, 1.6 * caution);
      let tx = 0, tz = 0, seeking = false;
      if (!retreat) {
        let pickup = null, pickupDistance = Infinity;
        for (const p of world.pickups) { const d = Math.hypot(p.x - s.x, p.z - s.z); if (d < pickupDistance) { pickupDistance = d; pickup = p; } }
        if (pickup && pickupDistance < greed && pickupDistance < distance * (greed > 9 ? 1.5 : .8)) { tx = pickup.x; tz = pickup.z; seeking = true; }
        else {
          const tr = Math.hypot(t.x, t.z) || 1;
          // Approach from the inside to push a target outward, then commit to contact.
          const flank = distance > 5 ? 2.4 * (1 - ai.aggression * .5) : 0;
          tx = t.x + t.vx * .16 - t.x / tr * flank;
          tz = t.z + t.vz * .16 - t.z / tr * flank;
        }
      }
      const desired = Math.atan2(tx - s.x, tz - s.z);
      const delta = Math.atan2(Math.sin(desired - s.angle), Math.cos(desired - s.angle));
      const aligned = Math.abs(delta) < .28;
      const wobble = chaos ? (world.random() - .5) * chaos * 2 : 0;
      const boostRange = turbo ? 11 : 8, boostPad = turbo ? 3 : ai.aggression > .75 ? 3.5 : 5;
      car.input = {
        steer: Math.max(-1, Math.min(1, delta * 1.9 + wobble)),
        throttle: Math.abs(delta) > 1.6 ? (retreat ? -.7 : .15) : (retreat ? .9 : .65 + ai.aggression * .35),
        boost: !retreat && !seeking && aligned && distance > 2.2 && distance < boostRange && safeAt(world, s.x, s.z, boostPad * caution) && (ai.aggression > .42 || turbo > 0) && s.knockback <= 0
      };
    }
  }
  root.BumperAI = { update };
})(globalThis);
