/* Simulation only: no DOM or Three.js. A future server can step this same world
   and replace entity.input with messages received from connected players. */
(function (root) {
  'use strict';
  const CONFIG = {
    bots: 11, difficulty: 'normal', tick: 1 / 60,
    radius: 25, ringWidth: 4, phases: 5, phaseSeconds: 16, warningSeconds: 4,
    carRadius: 1.05, mass: 1, acceleration: 22, reverseAcceleration: 12, brakeAcceleration: 32,
    maxSpeed: 14, turnSpeed: 2.8, steeringResponse: 14, drag: .8, grip: 4.2,
    restitution: .88, boostImpulse: 12, boostCooldown: 3, boostDuration: .42,
    finalSeconds: 18,
    difficultyProfiles: { easy: { power: .74, reaction: .48 }, normal: { power: .94, reaction: .23 }, hard: { power: 1.08, reaction: .12 } }
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function createWorld(options = {}, random = Math.random) {
    const config = { ...CONFIG, ...options };
    const world = { config, random, time: 0, phase: 0, radius: config.radius, cars: [], events: [], eliminated: [], status: 'playing', winner: null, warning: false };
    for (let i = 0; i <= config.bots; i++) {
      const a = i / (config.bots + 1) * Math.PI * 2;
      const r = config.radius * (i % 2 ? .66 : .77);
      world.cars.push({ id: i, name: i === 0 ? 'VOCÊ' : String(i).padStart(2, '0'),
        input: { throttle: 0, steer: 0, boost: false },
        state: { x: Math.sin(a) * r, z: Math.cos(a) * r, vx: 0, vz: 0, angle: a + Math.PI, steering: 0, y: 0, vy: 0, alive: true, cooldown: 0, boostTime: 0, mass: config.mass * (i ? .92 + random() * .16 : 1) },
        ai: i ? { aggression: .3 + random() * .7, nextThink: 0, target: null } : null });
    }
    return world;
  }
  function step(world, dt) {
    if (world.status !== 'playing') return;
    const c = world.config;
    world.events = []; world.time += dt;
    const phase = Math.min(c.phases, Math.floor(world.time / c.phaseSeconds));
    if (phase > world.phase) { world.phase = phase; world.events.push({ type: 'collapse', phase }); }
    const baseRadius = c.radius - world.phase * c.ringWidth;
    // The final island gradually vanishes, ensuring that camping cannot cause a draw forever.
    world.radius = Math.max(0, baseRadius - Math.max(0, world.time - c.phases * c.phaseSeconds - c.finalSeconds) * .5);
    world.warning = world.phase < c.phases && c.phaseSeconds - world.time % c.phaseSeconds <= c.warningSeconds;
    for (const car of world.cars) {
      const s = car.state, input = car.input;
      if (!s.alive) { s.vy -= 24 * dt; s.y += s.vy * dt; s.x += s.vx * dt; s.z += s.vz * dt; continue; }
      s.cooldown = Math.max(0, s.cooldown - dt); s.boostTime = Math.max(0, s.boostTime - dt);
      const speed = Math.hypot(s.vx, s.vz);
      s.steering += (clamp(input.steer, -1, 1) - s.steering) * (1 - Math.exp(-c.steeringResponse * dt));
      s.angle += s.steering * c.turnSpeed * (.6 + .4 * Math.min(1, speed / 5)) * dt;
      const fx = Math.sin(s.angle), fz = Math.cos(s.angle);
      if (input.boost && s.cooldown <= 0) {
        s.vx += fx * c.boostImpulse; s.vz += fz * c.boostImpulse;
        s.cooldown = c.boostCooldown; s.boostTime = c.boostDuration;
        world.events.push({ type: 'boost', id: car.id });
      }
      const power = car.ai ? c.difficultyProfiles[c.difficulty].power : 1;
      const throttle = clamp(input.throttle, -1, 1);
      const forwardSpeed = s.vx * fx + s.vz * fz;
      const braking = throttle * forwardSpeed < 0;
      const accel = (braking ? c.brakeAcceleration : throttle >= 0 ? c.acceleration : c.reverseAcceleration) * power;
      s.vx += fx * throttle * accel * dt; s.vz += fz * throttle * accel * dt;
      // Remove lateral velocity gradually: grip with a small, readable arcade drift.
      const side = s.vx * fz - s.vz * fx;
      s.vx -= fz * side * Math.min(1, c.grip * dt); s.vz += fx * side * Math.min(1, c.grip * dt);
      const drag = Math.exp(-c.drag * dt); s.vx *= drag; s.vz *= drag;
      const v = Math.hypot(s.vx, s.vz), limit = c.maxSpeed * power + (s.boostTime > 0 ? c.boostImpulse : 0);
      if (v > limit) { const ratio = Math.max(limit / v, Math.exp(-2 * dt)); s.vx *= ratio; s.vz *= ratio; }
      s.x += s.vx * dt; s.z += s.vz * dt;
    }
    // Equal and opposite impulses depend on approach velocity and inverse mass.
    for (let i = 0; i < world.cars.length; i++) for (let j = i + 1; j < world.cars.length; j++) {
      const a = world.cars[i].state, b = world.cars[j].state;
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
      if (squared >= c.carRadius * c.carRadius * 4) continue;
      const distance = Math.sqrt(squared);
      const nx = distance > .0001 ? dx / distance : 1, nz = distance > .0001 ? dz / distance : 0, invA = 1 / a.mass, invB = 1 / b.mass;
      const correction = Math.max(0, c.carRadius * 2 - distance) / (invA + invB);
      a.x -= nx * correction * invA; a.z -= nz * correction * invA;
      b.x += nx * correction * invB; b.z += nz * correction * invB;
      const approach = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (approach < 0) {
        const impulse = -(1 + c.restitution) * approach / (invA + invB);
        a.vx -= impulse * nx * invA; a.vz -= impulse * nz * invA;
        b.vx += impulse * nx * invB; b.vz += impulse * nz * invB;
        if (-approach > 2) world.events.push({ type: 'hit', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, strength: -approach, ids: [world.cars[i].id, world.cars[j].id] });
      }
    }
    const falling = world.cars.filter(car => car.state.alive && Math.hypot(car.state.x, car.state.z) > world.radius + c.carRadius * .28);
    // Batch elimination gives simultaneous falls the same place, independent of entity order.
    const survivors = world.cars.filter(car => car.state.alive).length - falling.length;
    for (const car of falling) {
      car.state.alive = false; car.state.vy = 1; car.state.place = survivors + 1;
      world.eliminated.push(car.id); world.events.push({ type: 'elimination', id: car.id, place: car.state.place });
    }
    const alive = world.cars.filter(car => car.state.alive);
    if (alive.length <= 1) { world.status = 'finished'; world.winner = alive[0]?.id ?? null; if (alive[0]) alive[0].state.place = 1; world.events.push({ type: 'finish' }); }
  }
  root.BumperPhysics = { CONFIG, createWorld, step, clamp };
})(globalThis);
