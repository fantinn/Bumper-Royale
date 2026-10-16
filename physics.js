/* Simulation only: no DOM or Three.js. A future server can step this same world
   and replace entity.input with messages received from connected players. */
(function (root) {
  'use strict';
  const CONFIG = {
    bots: 11, difficulty: 'normal', tick: 1 / 60, map: 'parque',
    radius: 25, ringWidth: 4, phases: 5, phaseSeconds: 16, warningSeconds: 4,
    // 'rings' drops concentric bands from the outside in; 'sectors' drops pie slices in random order.
    collapse: 'rings', islandRadius: 5,
    carRadius: 1.05, mass: 1, acceleration: 22, reverseAcceleration: 12, brakeAcceleration: 32,
    maxSpeed: 14, turnSpeed: 2.8, steeringResponse: 14, drag: .8, grip: 4.2,
    restitution: .88, boostImpulse: 12, boostCooldown: 3, boostDuration: .42,
    impactMultiplier: 1.6, boostImpactMultiplier: 1.3, impactThreshold: 3,
    knockbackDuration: .7, knockbackGrip: .12, knockbackControl: .25, maxCollisionImpulse: 30,
    finalSeconds: 18,
    // Rotating floor (rad/s) carries cars along; a mild outward pull rewards staying central.
    spin: 0, centrifugal: .6,
    bumpers: [], bumperBounce: 1.35, bumperMinSpeed: 10,
    pickupFirst: 4, pickupInterval: 5.5, pickupMax: 3, pickupReach: .75,
    heavyDuration: 6, heavyMass: 1.8, shockRadius: 6.5, shockImpulse: 15,
    // An elimination within this window after a hit credits the last car that touched the victim.
    koWindow: 3,
    difficultyProfiles: { easy: { power: .74, reaction: .48 }, normal: { power: .94, reaction: .23 }, hard: { power: 1.08, reaction: .12 } }
  };
  // Gameplay rules per map. Scenery lives in maps.js under the same ids.
  const MAPS = {
    parque: {},
    gelo: { grip: 1.35, drag: .42, acceleration: 17, turnSpeed: 2.6, restitution: .95 },
    neon: {
      spin: .2,
      bumpers: [
        { x: 9.55, z: 9.55, r: 1.25 }, { x: -9.55, z: 9.55, r: 1.25 }, { x: 9.55, z: -9.55, r: 1.25 }, { x: -9.55, z: -9.55, r: 1.25 },
        { x: 0, z: 9.5, r: .9 }, { x: 0, z: -9.5, r: .9 }
      ]
    },
    doca: { collapse: 'sectors', phases: 6, phaseSeconds: 12, islandRadius: 7, grip: 3.8 }
  };
  const PICKUPS = ['charge', 'heavy', 'shock'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const massOf = (world, s) => s.mass * (s.heavy > 0 ? world.config.heavyMass : 1);
  // The floor is rotated by world.rotation around the vertical axis (Three.js rotation.y convention).
  function toLocal(world, x, z) { const c = Math.cos(world.rotation), s = Math.sin(world.rotation); return [x * c - z * s, x * s + z * c]; }
  function toWorld(world, x, z) { const c = Math.cos(world.rotation), s = Math.sin(world.rotation); return [x * c + z * s, -x * s + z * c]; }
  // Zone index of a floor point in local coordinates; -1 is the permanent central island.
  function zoneAt(world, x, z) {
    const c = world.config, r = Math.hypot(x, z);
    if (r <= c.islandRadius) return -1;
    if (c.collapse === 'sectors') { const a = (Math.atan2(x, z) + Math.PI * 2) % (Math.PI * 2); return Math.min(c.phases - 1, Math.floor(a / (Math.PI * 2) * c.phases)); }
    return clamp(Math.floor((c.radius - r) / c.ringWidth), 0, c.phases - 1);
  }
  function floorAt(world, x, z, margin = 0) {
    const c = world.config, r = Math.hypot(x, z);
    if (r > world.radius + margin) return false;
    if (c.collapse !== 'sectors' || r <= c.islandRadius + margin) return true;
    const zone = zoneAt(world, ...toLocal(world, x, z));
    return zone < 0 || !world.dropped[zone];
  }
  // Conservative check used by bots and pickup spawning: also avoids the zone about to fall.
  function safeAt(world, x, z, pad = 0) {
    const c = world.config, r = Math.hypot(x, z);
    if (r > world.radius - pad) return false;
    if (c.collapse !== 'sectors') return !(world.warning && r > world.radius - c.ringWidth - pad);
    if (r <= c.islandRadius - pad) return true;
    const a = Math.atan2(x, z);
    for (const offset of [0, pad, -pad]) {
      const b = a + (r > 0 ? offset / r : 0);
      const zone = zoneAt(world, ...toLocal(world, Math.sin(b) * r, Math.cos(b) * r));
      if (zone >= 0 && (world.dropped[zone] || (world.warning && zone === world.warningZone))) return false;
    }
    return true;
  }
  function createWorld(options = {}, random = Math.random) {
    const map = MAPS[options.map] ? options.map : CONFIG.map;
    const config = { ...CONFIG, ...MAPS[map], ...options, map };
    if (config.collapse === 'rings') config.islandRadius = config.radius - config.phases * config.ringWidth;
    const order = Array.from({ length: config.phases }, (_, i) => i);
    if (config.collapse === 'sectors') for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const world = { config, random, time: 0, phase: 0, radius: config.radius, rotation: 0, cars: [], events: [], eliminated: [], status: 'playing', winner: null, warning: false,
      order, dropped: order.map(() => false), warningZone: -1, bumpers: [], pickups: [], nextPickup: config.pickupFirst, pickupId: 0 };
    world.bumpers = config.bumpers.map(b => ({ ...b, zone: zoneAt(world, b.x, b.z), hit: -9 }));
    for (let i = 0; i <= config.bots; i++) {
      const a = i / (config.bots + 1) * Math.PI * 2;
      const r = config.radius * (i % 2 ? .66 : .77);
      world.cars.push({ id: i, name: i === 0 ? 'VOCÊ' : String(i).padStart(2, '0'),
        input: { throttle: 0, steer: 0, boost: false },
        state: { x: Math.sin(a) * r, z: Math.cos(a) * r, vx: 0, vz: 0, angle: a + Math.PI, steering: 0, y: 0, vy: 0, alive: true, cooldown: 0, boostTime: 0, knockback: 0, heavy: 0, kos: 0, lastHit: -1, lastHitTime: -99, mass: config.mass * (i ? .92 + random() * .16 : 1) },
        ai: i ? { aggression: .3 + random() * .7, nextThink: 0, target: null } : null });
    }
    // On a spinning floor every car starts out riding along with it.
    for (const { state: s } of world.cars) { s.vx = config.spin * s.z; s.vz = -config.spin * s.x; }
    return world;
  }
  function spawnPickup(world) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = world.random() * Math.PI * 2, r = Math.sqrt(world.random()) * Math.max(0, world.radius - 3);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (!safeAt(world, x, z, 2.5)) continue;
      const type = PICKUPS[Math.floor(world.random() * PICKUPS.length)];
      world.pickups.push({ id: ++world.pickupId, type, x, z });
      return;
    }
  }
  function applyPickup(world, car, pickup) {
    const c = world.config, s = car.state;
    if (pickup.type === 'charge') s.cooldown = 0;
    if (pickup.type === 'heavy') s.heavy = c.heavyDuration;
    if (pickup.type === 'shock') {
      for (const other of world.cars) {
        const o = other.state;
        if (other === car || !o.alive) continue;
        const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
        if (d >= c.shockRadius) continue;
        const nx = d > .001 ? dx / d : 1, nz = d > .001 ? dz / d : 0;
        const push = c.shockImpulse * (1 - d / c.shockRadius * .5) / (massOf(world, o) / c.mass);
        o.vx += nx * push; o.vz += nz * push;
        o.knockback = Math.max(o.knockback, c.knockbackDuration); o.lastHit = car.id; o.lastHitTime = world.time;
      }
    }
    world.events.push({ type: 'pickup', id: car.id, kind: pickup.type, x: pickup.x, z: pickup.z });
  }
  function step(world, dt) {
    if (world.status !== 'playing') return;
    const c = world.config;
    world.events = []; world.time += dt; world.rotation = c.spin * world.time;
    const phase = Math.min(c.phases, Math.floor(world.time / c.phaseSeconds));
    while (world.phase < phase) { const zone = world.order[world.phase]; world.dropped[zone] = true; world.phase++; world.events.push({ type: 'collapse', phase: world.phase, zone }); }
    const baseRadius = c.collapse === 'sectors' ? (world.phase >= c.phases ? c.islandRadius : c.radius) : c.radius - world.phase * c.ringWidth;
    // The final island gradually vanishes, ensuring that camping cannot cause a draw forever.
    world.radius = Math.max(0, baseRadius - Math.max(0, world.time - c.phases * c.phaseSeconds - c.finalSeconds) * .5);
    world.warning = world.phase < c.phases && c.phaseSeconds - world.time % c.phaseSeconds <= c.warningSeconds;
    world.warningZone = world.warning ? world.order[world.phase] : -1;
    world.pickups = world.pickups.filter(p => floorAt(world, p.x, p.z, -.5));
    if (c.pickupInterval > 0 && world.time >= world.nextPickup) {
      world.nextPickup = world.time + c.pickupInterval;
      if (world.pickups.length < c.pickupMax) spawnPickup(world);
    }
    for (const car of world.cars) {
      const s = car.state, input = car.input;
      if (!s.alive) { s.vy -= 24 * dt; s.y += s.vy * dt; s.x += s.vx * dt; s.z += s.vz * dt; continue; }
      s.cooldown = Math.max(0, s.cooldown - dt); s.boostTime = Math.max(0, s.boostTime - dt);
      s.knockback = Math.max(0, s.knockback - dt); s.heavy = Math.max(0, s.heavy - dt);
      // Handling runs relative to the floor so a spinning platform carries parked cars along.
      let fvx = 0, fvz = 0;
      if (c.spin) {
        fvx = c.spin * s.z; fvz = -c.spin * s.x;
        const pull = c.spin * c.spin * c.centrifugal * dt; s.vx += s.x * pull; s.vz += s.z * pull;
        s.vx -= fvx; s.vz -= fvz;
      }
      // Strong impacts temporarily loosen traction; steering remains available.
      const recovery = c.knockbackDuration > 0 ? Math.min(1, s.knockback / (c.knockbackDuration * .5)) : 0;
      const traction = 1 - recovery * (1 - c.knockbackGrip);
      const control = 1 - recovery * (1 - c.knockbackControl);
      const speed = Math.hypot(s.vx, s.vz);
      s.steering += (clamp(input.steer, -1, 1) - s.steering) * (1 - Math.exp(-c.steeringResponse * dt));
      s.angle += s.steering * c.turnSpeed * (.6 + .4 * Math.min(1, speed / 5)) * dt + c.spin * dt;
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
      s.vx += fx * throttle * accel * control * dt; s.vz += fz * throttle * accel * control * dt;
      // Remove lateral velocity gradually: grip with a small, readable arcade drift.
      const side = s.vx * fz - s.vz * fx;
      s.vx -= fz * side * Math.min(1, c.grip * traction * dt); s.vz += fx * side * Math.min(1, c.grip * traction * dt);
      const drag = Math.exp(-c.drag * (1 - recovery * .7) * dt); s.vx *= drag; s.vz *= drag;
      const v = Math.hypot(s.vx, s.vz), limit = c.maxSpeed * power + (s.boostTime > 0 ? c.boostImpulse : 0);
      if (v > limit && s.knockback <= 0) { const ratio = Math.max(limit / v, Math.exp(-2 * dt)); s.vx *= ratio; s.vz *= ratio; }
      s.vx += fvx; s.vz += fvz;
      s.x += s.vx * dt; s.z += s.vz * dt;
    }
    // Pinball bumpers kick cars away with a guaranteed minimum speed.
    world.bumpers.forEach((b, index) => {
      if (b.zone >= 0 && world.dropped[b.zone]) return;
      const [bx, bz] = toWorld(world, b.x, b.z), reach = c.carRadius + b.r;
      for (const car of world.cars) {
        const s = car.state;
        if (!s.alive) continue;
        const dx = s.x - bx, dz = s.z - bz, squared = dx * dx + dz * dz;
        if (squared >= reach * reach) continue;
        const d = Math.sqrt(squared), nx = d > .001 ? dx / d : 1, nz = d > .001 ? dz / d : 0;
        s.x = bx + nx * reach; s.z = bz + nz * reach;
        const normal = s.vx * nx + s.vz * nz;
        if (normal >= c.bumperMinSpeed) continue;
        const added = Math.max(c.bumperMinSpeed, -normal * c.bumperBounce) - normal;
        s.vx += nx * added; s.vz += nz * added;
        s.knockback = Math.max(s.knockback, c.knockbackDuration * .6);
        if (world.time - b.hit > .15) world.events.push({ type: 'bumper', index, id: car.id, x: bx + nx * b.r, z: bz + nz * b.r });
        b.hit = world.time;
      }
    });
    for (const pickup of [...world.pickups]) {
      for (const car of world.cars) {
        const s = car.state;
        if (!s.alive || Math.hypot(s.x - pickup.x, s.z - pickup.z) > c.carRadius + c.pickupReach) continue;
        world.pickups.splice(world.pickups.indexOf(pickup), 1);
        applyPickup(world, car, pickup);
        break;
      }
    }
    // Equal and opposite impulses depend on approach velocity and inverse mass.
    for (let i = 0; i < world.cars.length; i++) for (let j = i + 1; j < world.cars.length; j++) {
      const a = world.cars[i].state, b = world.cars[j].state;
      if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
      if (squared >= c.carRadius * c.carRadius * 4) continue;
      const distance = Math.sqrt(squared);
      const nx = distance > .0001 ? dx / distance : 1, nz = distance > .0001 ? dz / distance : 0, invA = 1 / massOf(world, a), invB = 1 / massOf(world, b);
      const correction = Math.max(0, c.carRadius * 2 - distance) / (invA + invB);
      a.x -= nx * correction * invA; a.z -= nz * correction * invA;
      b.x += nx * correction * invB; b.z += nz * correction * invB;
      const approach = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (approach < 0) {
        const strength = -approach;
        const force = 1 + (c.impactMultiplier - 1) * clamp((strength - c.impactThreshold) / 9, 0, 1);
        // A boost only amplifies a hit if that boosted car is moving into contact.
        const boosting = (a.boostTime > 0 && a.vx * nx + a.vz * nz > 1) || (b.boostTime > 0 && b.vx * nx + b.vz * nz < -1);
        const impulse = Math.min(c.maxCollisionImpulse, (1 + c.restitution) * strength * force * (boosting ? c.boostImpactMultiplier : 1) / (invA + invB));
        a.vx -= impulse * nx * invA; a.vz -= impulse * nz * invA;
        b.vx += impulse * nx * invB; b.vz += impulse * nz * invB;
        if (strength > c.impactThreshold) {
          a.knockback = Math.max(a.knockback, c.knockbackDuration * clamp(impulse * invA / 16, .25, 1));
          b.knockback = Math.max(b.knockback, c.knockbackDuration * clamp(impulse * invB / 16, .25, 1));
        }
        if (strength > 2) {
          a.lastHit = world.cars[j].id; a.lastHitTime = world.time;
          b.lastHit = world.cars[i].id; b.lastHitTime = world.time;
          world.events.push({ type: 'hit', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, strength, ids: [world.cars[i].id, world.cars[j].id] });
        }
      }
    }
    const falling = world.cars.filter(car => car.state.alive && !floorAt(world, car.state.x, car.state.z, c.carRadius * .28));
    // Batch elimination gives simultaneous falls the same place, independent of entity order.
    const survivors = world.cars.filter(car => car.state.alive).length - falling.length;
    for (const car of falling) {
      const s = car.state;
      s.alive = false; s.vy = 1; s.place = survivors + 1;
      const by = s.lastHit >= 0 && world.time - s.lastHitTime <= c.koWindow ? s.lastHit : null;
      if (by !== null) world.cars[by].state.kos++;
      world.eliminated.push(car.id); world.events.push({ type: 'elimination', id: car.id, place: s.place, by });
    }
    const alive = world.cars.filter(car => car.state.alive);
    if (alive.length <= 1) { world.status = 'finished'; world.winner = alive[0]?.id ?? null; if (alive[0]) alive[0].state.place = 1; world.events.push({ type: 'finish' }); }
  }
  root.BumperPhysics = { CONFIG, MAPS, createWorld, step, clamp, massOf, toLocal, toWorld, zoneAt, floorAt, safeAt };
})(globalThis);
