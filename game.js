/* Presentation layer: reads simulation state, forwards inputs, and consumes events. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function fail(message) { $('error').textContent = message; $('error').hidden = false; }
  if (!window.THREE) { fail('Não foi possível carregar o Three.js. Conecte-se à internet e recarregue a página.'); return; }
  const { CONFIG, createWorld, step } = BumperPhysics;
  const T = THREE, scene = new T.Scene();
  // Opt-in diagnostics for comparing the same scene before/after optimization.
  const perf = new URLSearchParams(location.search).has('perf') ? document.createElement('output') : null;
  if (perf) { perf.id = 'performance'; perf.style.cssText = 'position:fixed;right:20px;bottom:85px;z-index:10;background:#142033;color:white;padding:8px;font:12px monospace'; document.body.appendChild(perf); }
  let perfStart = performance.now(), perfFrames = 0;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
  catch (_) { fail('Este navegador não conseguiu iniciar o WebGL. Ative a aceleração de hardware e recarregue.'); return; }
  let resolutionScale = 1, frameAverage = 16.7, adaptTime = 0, renderDirty = true, lastDraw = 0, economy = false;
  function resizeRenderer() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, resolutionScale, Math.sqrt(1440000 / (innerWidth * innerHeight))));
    renderer.setSize(innerWidth, innerHeight);
    renderDirty = true;
  }
  resizeRenderer(); // Never render four retina pixels for every CSS pixel.
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping;
  $('view').appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, .1, 320);
  const hemi = new T.HemisphereLight('#d5e6ed', '#4d3c51', 1.8); scene.add(hemi);
  const sun = new T.DirectionalLight('#ffe2b2', 2.1); sun.position.set(-20, 35, 15); scene.add(sun);
  const materials = new Map();
  function mat(color, extra = {}) { const { metalness, roughness, ...options } = extra; const key = color + JSON.stringify(options); if (!materials.has(key)) materials.set(key, new T.MeshLambertMaterial({ color, ...options })); return materials.get(key); }
  const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(parent, size, color, x, y, z) { return mesh(new T.BoxGeometry(...size), mat(color), parent, x, y, z); }
  function cylinder(parent, rt, rb, height, color, x, y, z, sides = 16) { return mesh(new T.CylinderGeometry(rt, rb, height, sides), mat(color), parent, x, y, z); }
  const helpers = { mesh, box, cylinder, mat };
  const arena = new T.Group(); scene.add(arena);
  const sparks = BumperRender.particles(T, scene);
  const cameraRay = new T.Raycaster(), cameraSight = new T.Vector3(), cameraObstacles = [];
  let zones = [], centerIsland, bumperModels = [], carModels = new Map(), world, mode = 'menu', paused = false, accumulator = 0, lastTime = 0, shake = 0, endTimer = 0, audioContext = null, sound = false, hudTime = 0;
  let cameraAngle = 0, queuedBoost = false, feedbackTime = 0, nextSound = 0, countdown = 0, countdownShown = '', playerTime = 0, killer = null, koStreak = 0, lastKo = -9;
  let theme, scenery = null, cameraPosts = [], ceilingHeight = null, skyTexture = null;
  const feedback = document.createElement('div'); feedback.className = 'impact-feedback'; feedback.hidden = true; $('hud').appendChild(feedback);
  function announce(text, small = false) { feedback.textContent = text; feedback.classList.toggle("small", small); feedback.hidden = false; feedbackTime = 1.3; feedback.classList.remove('pop'); void feedback.offsetWidth; feedback.classList.add('pop'); }
  const palette = ['#dfff72', '#ff795e', '#8271e8', '#56d5de', '#ffbd59', '#ef87bf', '#f1efe6', '#5292ef', '#b1e565', '#d8614e', '#94a3ff', '#5ac5a3'];

  // ---- Profile: local progression, unlockable colors and per-map records. ----
  const SKINS = [
    { color: '#dfff72', level: 1 }, { color: '#ff795e', level: 1 }, { color: '#56d5de', level: 1 }, { color: '#ef87bf', level: 2 },
    { color: '#ffbd59', level: 3 }, { color: '#8271e8', level: 4 }, { color: '#f1efe6', level: 5 }, { color: '#ff2e63', level: 7 },
    { color: '#2effb0', level: 9 }, { color: '#1c1c28', level: 11 }, { color: '#ffd700', level: 14 }
  ];
  const STORE = 'batebate.profile.v1';
  const profile = (() => {
    const base = { xp: 0, wins: 0, matches: 0, kos: 0, best: {}, color: SKINS[0].color, map: 'parque', bots: 11, difficulty: 'normal' };
    try { return { ...base, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch (_) { return base; }
  })();
  function saveProfile() { try { localStorage.setItem(STORE, JSON.stringify(profile)); } catch (_) { /* Private mode: progress lasts for this visit. */ } }
  function levelInfo(xp) {
    let level = 1, need = 100;
    while (xp >= need) { xp -= need; level++; need = 100 + (level - 1) * 40; }
    return { level, into: xp, need };
  }

  // ---- Theme: sky, lights and static scenery for the selected map. ----
  function skyBackground(sky) {
    if (!Array.isArray(sky)) return new T.Color(sky);
    const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 256;
    const ctx = canvas.getContext('2d'), gradient = ctx.createLinearGradient(0, 0, 0, 256);
    sky.forEach((color, i) => gradient.addColorStop(i / (sky.length - 1), color));
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 256);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; return texture;
  }
  function applyTheme(id) {
    theme = BumperMaps.byId[id] || BumperMaps.list[0];
    if (scenery) disposeTree(scenery);
    skyTexture?.dispose?.();
    skyTexture = skyBackground(theme.sky); scene.background = skyTexture;
    scene.fog = new T.Fog(theme.fogColor || (Array.isArray(theme.sky) ? theme.sky[theme.sky.length - 1] : theme.sky), theme.fog[0], theme.fog[1]);
    hemi.color.set(theme.hemi[0]); hemi.groundColor.set(theme.hemi[1]); hemi.intensity = theme.hemi[2];
    sun.color.set(theme.sun[0]); sun.intensity = theme.sun[1]; renderer.toneMappingExposure = theme.exposure;
    ceilingHeight = theme.ceiling ? theme.ceiling() : null;
    scenery = theme.build(T, scene, helpers, CONFIG.radius);
    cameraPosts = scenery.children.filter(child => child.userData.cameraObstacle);
    BumperRender.batch(T, scenery);
    scenery.updateMatrixWorld(true);
    scenery.traverse(object => { object.matrixAutoUpdate = false; });
    $('footerMap').textContent = theme.footer; $('sceneTag').textContent = theme.tagline; $('sceneTitle').textContent = theme.name.toUpperCase();
    renderDirty = true;
  }
  // Dispose per-match geometry and textures, while retaining shared materials.
  function disposeTree(group) {
    group.traverse(o => {
      if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
      o.userData.ownedMaterial?.dispose();
      if (o.material?.map && !o.userData.sharedTexture) { o.material.map.dispose(); o.material.dispose(); }
    });
    group.removeFromParent();
  }
  function wedge(inner, outer, start, end) {
    const shape = new T.Shape(); shape.moveTo(Math.cos(start) * outer, Math.sin(start) * outer);
    shape.absarc(0, 0, outer, start, end, false);
    shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
    shape.absarc(0, 0, inner, end, start, true); shape.closePath();
    const g = new T.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); g.translate(0, -1.15, 0); return g;
  }
  // Wedge angles follow the simulation's atan2(x, z) convention.
  const tile = (group, inner, outer, a, b, color) => { const m = mesh(wedge(inner + .035, outer - .035, a - Math.PI / 2 + .002, b - Math.PI / 2 - .002), mat(color), group); m.userData.original = m.material; return m; };
  const floorTextures = new Map(), warnGlow = new T.Color('#ff3a2a');
  function floorTexture(config) {
    if (!floorTextures.has(theme.id)) {
      const painted = BumperFloors.paint(theme.id, config);
      let texture = null;
      if (painted) {
        texture = new T.CanvasTexture(painted.canvas); texture.colorSpace = T.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); texture.userData.half = painted.half;
      }
      floorTextures.set(theme.id, texture);
    }
    return floorTextures.get(theme.id);
  }
  // UVs come from world-space position so every slice samples its own part of the canvas.
  function floorOverlay(geometry, parent, texture) {
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position, uv = geometry.attributes.uv, half = texture.userData.half;
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / (2 * half) + .5, .5 - position.getZ(i) / (2 * half));
    const glowing = Boolean(theme.floor.glowFloor);
    const material = new T.MeshLambertMaterial({ map: texture, emissiveMap: glowing ? texture : null, emissive: glowing ? '#ffffff' : '#000000', emissiveIntensity: glowing ? .7 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const overlay = new T.Mesh(geometry, material); overlay.position.y = .004;
    Object.assign(overlay.userData, { overlay: true, sharedTexture: true, ownedMaterial: material, emissive: material.emissive.clone() });
    parent.add(overlay);
  }
  function buildArena() {
    for (const child of [...arena.children]) disposeTree(child);
    const c = world.config, f = theme.floor, stripe = f.glowStripe ? glow(f.stripe) : mat(f.stripe), painted = floorTexture(c);
    zones = []; bumperModels = []; centerIsland = new T.Group(); arena.add(centerIsland);
    cylinder(centerIsland, c.islandRadius, Math.max(.1, c.islandRadius - .5), 1.15, f.island, 0, -.575, 0, 64);
    for (let index = 0; index < c.phases; index++) { const group = new T.Group(); arena.add(group); zones.push({ group, index, fall: 0 }); }
    if (c.collapse === 'sectors') {
      const bands = 4, width = (c.radius - c.islandRadius) / bands;
      zones.forEach(({ group, index }) => {
        const a0 = index / c.phases * Math.PI * 2, a1 = (index + 1) / c.phases * Math.PI * 2;
        for (let band = 0; band < bands; band++) for (let k = 0; k < 4; k++) {
          const inner = c.islandRadius + band * width, a = a0 + (a1 - a0) * k / 4, b = a0 + (a1 - a0) * (k + 1) / 4;
          tile(group, inner, inner + width, a, b, band === bands - 1 ? ((k + index) % 2 ? f.outerB : f.outerA) : ((band + k + index) % 2 ? f.ringA : f.ringB));
        }
        const middle = (c.radius + c.islandRadius) / 2, edgeLine = new T.Mesh(new T.BoxGeometry(.16, .05, c.radius - c.islandRadius), stripe);
        edgeLine.position.set(Math.sin(a0) * middle, .02, Math.cos(a0) * middle); edgeLine.rotation.y = a0; group.add(edgeLine);
      });
    } else {
      zones.forEach(({ group, index }) => {
        const outer = c.radius - index * c.ringWidth, inner = outer - c.ringWidth;
        for (let n = 0; n < 32; n++) {
          const a = n / 32 * Math.PI * 2, b = (n + 1) / 32 * Math.PI * 2;
          tile(group, inner, outer, a, b, index === 0 ? (n % 2 ? f.outerB : f.outerA) : (index % 2 ? f.ringA : f.ringB));
          if (!painted && index > 0 && n % 2 === 0) { const mark = new T.Mesh(new T.BoxGeometry(.12, .025, 1), stripe); mark.position.set(Math.sin(a) * (outer - .65), .025, Math.cos(a) * (outer - .65)); mark.rotation.y = a; group.add(mark); }
        }
      });
    }
    if (painted) {
      // Painted top surfaces: one textured overlay per zone, sliced from the same world-space canvas.
      if (c.collapse === 'sectors') zones.forEach(({ group, index }) => { const a0 = index / c.phases * Math.PI * 2, a1 = (index + 1) / c.phases * Math.PI * 2; floorOverlay(new T.RingGeometry(c.islandRadius + .035, c.radius - .035, 24, 1, a0 - Math.PI / 2 + .002, a1 - a0 - .004), group, painted); });
      else zones.forEach(({ group, index }) => { const outer = c.radius - index * c.ringWidth; floorOverlay(new T.RingGeometry(outer - c.ringWidth + .035, outer - .035, 96, 1), group, painted); });
      floorOverlay(new T.CircleGeometry(c.islandRadius - .02, 64), centerIsland, painted);
    } else {
    const circle = mesh(new T.RingGeometry(c.islandRadius * .74, c.islandRadius * .756, 64), mat(f.mark, { side: T.DoubleSide }), centerIsland, 0, .025, 0); circle.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) { const mark = box(centerIsland, [.18, .03, c.islandRadius * .32], f.mark, Math.sin(i * Math.PI / 2) * c.islandRadius * .5, .03, Math.cos(i * Math.PI / 2) * c.islandRadius * .5); mark.rotation.y = i * Math.PI / 2; }
    }
    // Bumpers ride on the zone that holds them and fall together with it.
    const bumperStyle = theme.bumper || { base: '#2b3446', top: '#ff795e' };
    for (const b of world.bumpers) cylinder(b.zone >= 0 ? zones[b.zone].group : centerIsland, b.r, b.r * 1.1, .9, bumperStyle.base, b.x, .45, b.z, 20);
    for (const zone of zones) BumperRender.batch(T, zone.group);
    BumperRender.batch(T, centerIsland);
    for (const b of world.bumpers) {
      const parent = b.zone >= 0 ? zones[b.zone].group : centerIsland;
      const top = mesh(new T.CylinderGeometry(b.r * .82, b.r * .82, .3, 20), glow(bumperStyle.top), parent, b.x, 1.02, b.z);
      const halo = mesh(new T.TorusGeometry(b.r * 1.02, .07, 6, 28), glow('#ffffff'), top, 0, -.18, 0); halo.rotation.x = Math.PI / 2;
      bumperModels.push(top);
    }
  }
  function label(text, color) {
    // The tag grows with the name so "Tia Neide 👵" fits as well as "VOCÊ".
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), font = 'bold 40px Arial, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.font = font; const width = Math.min(504, Math.max(240, Math.ceil(ctx.measureText(text).width) + 56));
    canvas.width = width + 8; canvas.height = 96;
    ctx.fillStyle = '#19223bdc'; ctx.beginPath(); ctx.roundRect(4, 8, width, 80, 25); ctx.fill();
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 50, width - 24);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(.86 * canvas.width / 96, .86, 1); sprite.position.y = 3.4; return sprite;
  }
  function makeCar(car, color) {
    const group = new T.Group(), body = new T.Group(); group.add(body); scene.add(group);
    // Classic fairground look: fat rubber bumper, rounded tub, big friendly headlights.
    const bumper = mesh(new T.TorusGeometry(.96, .17, 8, 36), mat('#1f2433'), body, 0, .3, 0); bumper.rotation.x = Math.PI / 2;
    const trim = mesh(new T.TorusGeometry(.96, .045, 4, 36), mat('#f5f1e6'), body, 0, .47, 0); trim.rotation.x = Math.PI / 2;
    cylinder(body, .95, .9, .26, '#2b3348', 0, .17, 0, 24);
    const tub = mesh(new T.SphereGeometry(.88, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color), body, 0, .42, -.04); tub.scale.set(1, .58, 1.1);
    const nose = mesh(new T.SphereGeometry(.56, 18, 10), mat(color), body, 0, .66, .5); nose.scale.set(1.15, .62, .85);
    const stripe = mesh(new T.SphereGeometry(.57, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f5f1e6'), body, 0, .69, .5); stripe.scale.set(.32, .64, .87);
    for (const x of [-.36, .36]) {
      mesh(new T.CylinderGeometry(.15, .15, .08, 14), mat('#2b3348'), body, x, .74, .9).rotation.x = Math.PI / 2;
      mesh(new T.SphereGeometry(.12, 12, 8), glow('#fff6c8'), body, x, .74, .94);
      mesh(new T.BoxGeometry(.2, .1, .06), glow('#ff4d5e'), body, x * 1.1, .66, -.98);
    }
    // Cushioned seat and a little spoiler.
    const seat = mesh(new T.CapsuleGeometry(.16, .55, 4, 10), mat('#2b3348'), body, 0, 1.08, -.48); seat.rotation.z = Math.PI / 2;
    box(body, [.7, .2, .5], '#2b3348', 0, .86, -.22);
    box(body, [1.05, .06, .26], color, 0, 1.02, -.92);
    for (const x of [-.38, .38]) box(body, [.06, .26, .1], '#2b3348', x, .87, -.9);
    // Driver: round head with eyes, helmet in the team color, arms on the wheel.
    const skins = ['#ffd0a0', '#e3a979', '#b97a51', '#8a5638', '#f2c7a5'], shirts = ['#f5f1e6', '#26354c', '#ffbd59', '#56d5de', '#ef87bf'];
    cylinder(body, .23, .3, .46, car.id === 0 ? '#edf7d7' : shirts[car.id % shirts.length], 0, 1.1, -.18, 12);
    const head = car.id === 0 ? '#ffd0a0' : skins[car.id % skins.length];
    mesh(new T.SphereGeometry(.27, 16, 12), mat(head), body, 0, 1.58, -.14);
    mesh(new T.SphereGeometry(.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * .45), mat(color), body, 0, 1.62, -.16);
    const brim = mesh(new T.CylinderGeometry(.16, .16, .03, 12, 1, false, -Math.PI / 2, Math.PI), mat(color), body, 0, 1.7, .08); brim.scale.z = 1.2;
    for (const x of [-.09, .09]) {
      mesh(new T.SphereGeometry(.045, 8, 6), mat('#141b35'), body, x, 1.58, .11);
      mesh(new T.SphereGeometry(.05, 8, 6), mat('#ff9e9e'), body, x * 1.9, 1.5, .07);
    }
    const limb = (from, to, radius, color) => {
      const a = new T.Vector3(...from), b = new T.Vector3(...to), m = mesh(new T.CylinderGeometry(radius, radius, a.distanceTo(b), 6), mat(color), body);
      m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize());
    };
    for (const x of [-1, 1]) { limb([x * .24, 1.26, -.16], [x * .17, 1.18, .3], .065, car.id === 0 ? '#edf7d7' : shirts[car.id % shirts.length]); mesh(new T.SphereGeometry(.07, 8, 6), mat(head), body, x * .17, 1.18, .32); }
    limb([0, .86, .55], [0, 1.15, .36], .04, '#2b3348');
    const wheel = mesh(new T.TorusGeometry(.2, .04, 6, 16), mat('#2b3348'), body, 0, 1.18, .36); wheel.rotation.x = -.95;
    if (ceilingHeight) cylinder(body, .1, .14, .5, '#2b3348', -.63, 1.17, -.6, 8);
    BumperRender.batch(T, body);
    // Cheap contact shadows replace the dynamic shadow-map pass.
    const shadow = mesh(new T.CircleGeometry(1.12, 16), new T.MeshBasicMaterial({ color: '#15212b', transparent: true, opacity: .3, depthWrite: false }), group, 0, .025, 0);
    shadow.rotation.x = -Math.PI / 2; shadow.userData.ownedMaterial = shadow.material;
    // The collector is separate from body roll: its shoe stays on the ceiling plane.
    let poles = null, shoe = null, contact = null;
    if (ceilingHeight) {
      const collector = new T.Group(); group.add(collector);
      poles = Array.from({ length: 3 }, () => mesh(new T.CylinderGeometry(.035, .045, 1, 6), mat('#b6c4ce', { metalness: .85, roughness: .22 }), collector));
      shoe = box(collector, [.5, .065, .3], '#e1c291', 0, ceilingHeight - .035, 0);
      contact = mesh(new T.SphereGeometry(.075, 8, 6), mat('#fff4cd', { emissive: '#bdeaff', emissiveIntensity: 5 }), collector);
    }
    group.add(label(car.emoji ? `${car.name} ${car.emoji}` : car.name, car.id === 0 ? '#dfff72' : '#ffffff'));
    if (car.id === 0) { const ring = mesh(new T.RingGeometry(1.25, 1.34, 40), new T.MeshBasicMaterial({ color: '#e4ff88', side: T.DoubleSide }), group, 0, .04, 0); ring.rotation.x = -Math.PI / 2; ring.userData.ownedMaterial = ring.material; }
    const s = car.state;
    carModels.set(car.id, { group, body, poles, shoe, contact, previous: { x: s.x, y: s.y, z: s.z, angle: s.angle }, pose: { x: s.x, y: s.y, z: s.z, angle: s.angle }, sparkTime: car.id * .017, size: 1, squash: 0 });
  }

  // ---- Pickups and shockwaves: pooled, shared geometry. ----
  const PICKUP_LOOK = {
    charge: { geometry: new T.OctahedronGeometry(.42), color: '#dfff72', text: '⚡ BOOST RECARREGADO' },
    heavy: { geometry: new T.BoxGeometry(.58, .58, .58), color: '#ff9b4a', text: '🔨 MODO PESADO' },
    shock: { geometry: new T.TorusGeometry(.34, .12, 8, 20), color: '#47f2ff', text: '🌀 ONDA DE CHOQUE!' }
  };
  const haloGeometry = new T.RingGeometry(.75, .92, 32);
  const pickupModels = new Map();
  function syncPickups(now) {
    const seen = new Set();
    for (const p of world.pickups) {
      seen.add(p.id);
      let model = pickupModels.get(p.id);
      if (!model) {
        const look = PICKUP_LOOK[p.type];
        model = new T.Group();
        const icon = new T.Mesh(look.geometry, new T.MeshBasicMaterial({ color: look.color })); icon.userData.sharedGeometry = true; icon.userData.ownedMaterial = icon.material;
        const halo = new T.Mesh(haloGeometry, new T.MeshBasicMaterial({ color: look.color, transparent: true, opacity: .6, side: T.DoubleSide, depthWrite: false }));
        halo.rotation.x = -Math.PI / 2; halo.position.y = .06; halo.userData.sharedGeometry = true; halo.userData.ownedMaterial = halo.material;
        model.add(icon, halo); model.userData.icon = icon; model.userData.halo = halo; scene.add(model); pickupModels.set(p.id, model);
      }
      model.position.set(p.x, 0, p.z);
      model.userData.icon.position.y = 1.1 + Math.sin(now * 3 + p.id) * .2; model.userData.icon.rotation.set(now * 1.3, now * 2, 0);
      model.userData.halo.scale.setScalar(1 + Math.sin(now * 5 + p.id) * .12);
    }
    for (const [id, model] of pickupModels) if (!seen.has(id)) { disposeTree(model); pickupModels.delete(id); }
  }
  const shockwaves = Array.from({ length: 3 }, () => {
    const ring = new T.Mesh(new T.RingGeometry(.85, 1, 48), new T.MeshBasicMaterial({ color: '#47f2ff', transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring); return { ring, time: 9 };
  });
  function shockwave(x, z) { const wave = shockwaves.reduce((a, b) => (a.time > b.time ? a : b)); wave.time = 0; wave.ring.position.set(x, .3, z); wave.ring.visible = true; }

  function prepare(options = {}) {
    for (const model of carModels.values()) disposeTree(model.group); carModels.clear();
    for (const model of pickupModels.values()) disposeTree(model); pickupModels.clear();
    sparks.clear();
    world = createWorld({ map: theme.id, ...options }); buildArena();
    const botColors = palette.filter(color => color !== profile.color);
    world.cars.forEach(car => makeCar(car, car.id === 0 ? profile.color : botColors[car.id % botColors.length]));
    accumulator = 0; endTimer = 0; shake = 0; queuedBoost = false; hudTime = 0; feedbackTime = 0; feedback.hidden = true; killer = null; koStreak = 0; lastKo = -9; playerTime = 0;
    $('feed').replaceChildren(); $('result').hidden = true; $('pause').hidden = true; paused = false;
  }
  function start() {
    profile.bots = Number($('bots').value); profile.difficulty = $('difficulty').value; saveProfile();
    prepare({ bots: profile.bots, difficulty: profile.difficulty }); mode = 'playing'; document.body.classList.add('playing');
    $('menu').hidden = true; $('sceneLabel').hidden = true; $('hud').hidden = false; $('touch').hidden = !touchMode; keys.clear();
    const s = world.cars[0].state; camera.position.set(s.x - Math.sin(s.angle) * 14, 6, s.z - Math.cos(s.angle) * 14); camera.lookAt(s.x, 3.5, s.z);
    cameraAngle = s.angle; lookTarget.set(s.x, 3.5, s.z); camera.fov = 46; camera.updateProjectionMatrix(); lastTime = 0; perfStart = performance.now(); perfFrames = 0;
    countdown = 3.6; countdownShown = '';
    // Introduce one hunter as this match's rival while the countdown runs.
    const rival = world.cars.find(car => car.ai?.hunt);
    if (rival) { announce(`👀 ${rival.name} ${rival.emoji} está de olho em você`, true); feedbackTime = 3.4; }
    if (sound) initAudio();
    updateHUD(); renderDirty = true;
  }
  function toMenu() {
    mode = 'menu'; paused = false; document.body.classList.remove('playing');
    $('result').hidden = true; $('pause').hidden = true; $('hud').hidden = true; $('touch').hidden = true; $('menu').hidden = false; $('sceneLabel').hidden = false; $('countdown').hidden = true;
    prepare(); renderMenu(); renderDirty = true;
  }

  // ---- Menu: map cards, color swatches and profile summary. ----
  function renderMenu() {
    const info = levelInfo(profile.xp);
    $('level').textContent = info.level;
    $('profileText').textContent = `NÍVEL ${info.level} · ${profile.wins} vitórias · ${profile.kos} KOs`;
    $('menuLevelFill').style.width = `${info.into / info.need * 100}%`;
    $('maps').replaceChildren(...BumperMaps.list.map(map => {
      const card = document.createElement('button'); card.className = 'map-card'; card.setAttribute('aria-pressed', String(map.id === theme.id));
      const swatch = document.createElement('i'); swatch.style.background = `conic-gradient(${map.floor.outerA} 0 25%, ${map.floor.outerB} 0 50%, ${map.floor.ringA} 0 75%, ${map.floor.island} 0)`;
      const name = document.createElement('b'); name.textContent = map.name;
      const rule = document.createElement('small'); rule.textContent = map.rule;
      card.append(swatch, name, rule);
      if (profile.best[map.id]) { const best = document.createElement('em'); best.textContent = profile.best[map.id] === 1 ? '★ VENCEU' : `#${profile.best[map.id]}`; card.append(best); }
      card.onclick = () => { if (map.id === theme.id) return; profile.map = map.id; saveProfile(); applyTheme(map.id); prepare(); renderMenu(); };
      return card;
    }));
    const next = SKINS.find(skin => skin.level > info.level);
    $('skinHint').textContent = next ? `próxima cor no nível ${next.level}` : 'todas liberadas';
    $('skins').replaceChildren(...SKINS.map(skin => {
      const button = document.createElement('button'); button.className = 'skin'; button.style.background = skin.color;
      const locked = skin.level > info.level; button.disabled = locked; button.textContent = locked ? skin.level : '';
      button.title = locked ? `Libera no nível ${skin.level}` : 'Usar esta cor';
      button.setAttribute('aria-pressed', String(skin.color === profile.color));
      button.onclick = () => { profile.color = skin.color; saveProfile(); prepare(); renderMenu(); };
      return button;
    }));
    $('bots').value = String(profile.bots); $('difficulty').value = profile.difficulty;
    document.querySelector('#menu .eyebrow').textContent = `${Number($('bots').value) + 1} CARRINHOS. UM SOBREVIVENTE.`;
  }

  // ---- Input: keyboard plus an optional virtual stick for touch screens. ----
  const keys = new Set();
  const touchInput = { throttle: 0, steer: 0 };
  let touchMode = matchMedia('(pointer: coarse)').matches;
  function enableTouch() { if (touchMode) return; touchMode = true; document.body.classList.add('touch'); if (mode === 'playing') $('touch').hidden = false; }
  if (touchMode) document.body.classList.add('touch');
  addEventListener('touchstart', enableTouch, { passive: true, once: true });
  {
    const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob'), reach = 55;
    let pointer = null, ox = 0, oy = 0;
    const reset = () => { pointer = null; touchInput.throttle = 0; touchInput.steer = 0; knob.style.transform = ''; base.style.left = ''; base.style.top = ''; };
    zone.addEventListener('pointerdown', e => {
      pointer = e.pointerId; zone.setPointerCapture(pointer);
      const rect = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
      base.style.left = `${ox - rect.left}px`; base.style.top = `${oy - rect.top}px`;
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== pointer) return;
      let dx = e.clientX - ox, dy = e.clientY - oy; const length = Math.hypot(dx, dy);
      if (length > reach) { dx *= reach / length; dy *= reach / length; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const magnitude = Math.min(1, length / reach);
      // Push forward-ish to drive, pull back to brake/reverse; sideways steers.
      touchInput.steer = Math.max(-1, Math.min(1, -dx / reach * 1.4));
      touchInput.throttle = magnitude < .2 ? 0 : (dy > reach * .45 ? -magnitude : magnitude);
    });
    zone.addEventListener('pointerup', reset); zone.addEventListener('pointercancel', reset);
    $('boostBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (mode === 'playing' && !paused) queuedBoost = true; });
    $('pauseBtn').addEventListener('pointerdown', e => { e.preventDefault(); setPause(true); });
  }
  function setPause(value) { if (mode !== 'playing' || world.status !== 'playing') return; paused = value; $('pause').hidden = !value; keys.clear(); queuedBoost = false; renderDirty = true; lastTime = 0; perfStart = performance.now(); perfFrames = 0; }
  addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code) && mode === 'playing') e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) setPause(!paused);
    if (e.code === 'Space' && !e.repeat && mode === 'playing' && !paused) queuedBoost = true;
    if (e.code === 'Enter' && !e.repeat && mode === 'result') start();
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
  $('play').onclick = start; $('again').onclick = start; $('resume').onclick = () => setPause(false); $('toMenu').onclick = toMenu; $('quit').onclick = toMenu;
  $('quality').onclick = () => { economy = !economy; resolutionScale = economy ? .65 : 1; frameAverage = 16.7; adaptTime = 0; resizeRenderer(); $('quality').textContent = economy ? 'Gráficos: leve' : 'Gráficos: auto'; $('quality').setAttribute('aria-pressed', String(economy)); };
  $('bots').onchange = () => { document.querySelector('#menu .eyebrow').textContent = `${Number($('bots').value) + 1} CARRINHOS. UM SOBREVIVENTE.`; };

  // ---- Audio: tiny synthesized cues. ----
  function initAudio() { try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch (_) { sound = false; } }
  $('sound').onclick = () => { sound = !sound; if (sound) initAudio(); $('sound').textContent = sound ? 'Som: ligado' : 'Som: desligado'; $('sound').setAttribute('aria-pressed', String(sound)); };
  function tone(freq, duration, volume = .06, { force = false, type = 'triangle', slide = .35, delay = 0 } = {}) {
    if (!sound || !audioContext) return;
    if (!force && audioContext.currentTime < nextSound) return;
    if (!force) nextSound = audioContext.currentTime + .06;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, now); oscillator.frequency.exponentialRampToValueAtTime(freq * slide, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + duration);
  }
  const jingle = notes => notes.forEach((freq, i) => tone(freq, .16, .07, { force: true, type: 'square', slide: 1, delay: i * .09 }));
  function burst(x, z, count, color, y = .8, electric = false) {
    sparks.emit(x, z, Math.min(count, 12), color, y, electric);
  }
  const nameOf = id => (id === 0 ? 'VOCÊ' : `${world.cars[id].emoji} ${world.cars[id].name}`);
  function feedLine(text) { const line = document.createElement('div'); line.textContent = text; $('feed').prepend(line); while ($('feed').children.length > 5) $('feed').lastChild.remove(); }
  function events() {
    const player = world.cars[0].state;
    for (const event of world.events) {
      if (event.type === 'hit') { for (const id of event.ids) { const model = carModels.get(id); model.squash = Math.max(model.squash, Math.min(1, event.strength / 12)); } burst(event.x, event.z, Math.min(22, Math.ceil(event.strength)), '#ffed9a'); if (event.ids.includes(0)) { shake = Math.min(.4, event.strength * .018); if (event.strength > 10) announce('BATIDA FORTE!'); } tone(90 + event.strength * 8, .12); }
      if (event.type === 'boost') { const s = world.cars[event.id].state; burst(s.x, s.z, 10, '#caff77'); if (event.id === 0) tone(350, .25); }
      if (event.type === 'collapse') { shake = .3; announce(world.config.collapse === 'sectors' ? 'UMA FATIA AFUNDOU!' : 'O PISO CEDEU!'); tone(70, .5, .1, { force: true }); }
      if (event.type === 'bumper') { carModels.get(event.id).squash = .8; burst(event.x, event.z, 10, theme.bumper?.top || '#ff795e', 1); tone(520, .1, .05, { type: 'square', slide: 1.6 }); if (event.id === 0) shake = .22; }
      if (event.type === 'pickup') {
        const look = PICKUP_LOOK[event.kind];
        burst(event.x, event.z, 12, look.color, 1.1);
        if (event.kind === 'shock') { shockwave(event.x, event.z); if (Math.hypot(event.x - player.x, event.z - player.z) < 10) shake = .35; tone(110, .45, .09, { force: true, type: 'sawtooth', slide: .3 }); }
        if (event.id === 0) { announce(look.text); if (event.kind !== 'shock') tone(660, .18, .06, { force: true, slide: 1.8 }); }
      }
      if (event.type === 'elimination') {
        if (event.by === null) feedLine(`${nameOf(event.id)} caiu sozinho ↓`);
        else feedLine(`${nameOf(event.by)} derrubou ${nameOf(event.id)} 💥`);
        if (event.id === 0 && event.by) announce(`${nameOf(event.by)}: “${world.cars[event.by].taunt}”`);
        if (event.by === 0 && event.id !== 0) {
          koStreak = world.time - lastKo < 4 ? koStreak + 1 : 1; lastKo = world.time;
          announce(koStreak >= 3 ? `${koStreak}× KO! IMPARÁVEL!` : koStreak === 2 ? 'DUPLO KO!' : `VOCÊ DERRUBOU ${world.cars[event.id].name.toUpperCase()} ${world.cars[event.id].emoji}`);
          jingle(koStreak > 1 ? [660, 880, 1100] : [660, 990]);
        }
        if (event.id === 0) { endTimer = 1.6; killer = event.by; playerTime = world.time; }
      }
      if (event.type === 'finish' && !endTimer) endTimer = 1.6;
    }
  }
  function finish() {
    renderDirty = true;
    mode = 'result'; document.body.classList.remove('playing'); $('hud').hidden = true; $('touch').hidden = true; $('result').hidden = false;
    const player = world.cars[0].state, victory = world.winner === 0, place = player.place || 1, total = world.cars.length;
    if (player.alive) playerTime = world.time;
    const before = levelInfo(profile.xp);
    const multiplier = { easy: .8, normal: 1, hard: 1.35 }[world.config.difficulty] || 1;
    const xp = Math.round((20 + (total - place) * 6 + player.kos * 30 + (victory ? 120 : 0)) * multiplier);
    profile.xp += xp; profile.matches++; profile.kos += player.kos; if (victory) profile.wins++;
    profile.best[theme.id] = Math.min(profile.best[theme.id] || Infinity, place);
    saveProfile();
    const after = levelInfo(profile.xp);
    $('resultEyebrow').textContent = victory ? 'A PISTA É SUA' : 'FIM DE PARTIDA';
    $('resultTitle').textContent = victory ? 'SOBROU VOCÊ!' : place <= 3 ? 'NO PÓDIO!' : 'FOI POR POUCO.';
    $('position').textContent = '#' + place;
    $('resultText').textContent = victory ? `Vitória no ${theme.name}! ${world.config.bots} adversários ficaram pelo caminho.`
      : `${place}º de ${total}${killer ? ` · derrubado por ${nameOf(killer)} (${world.cars[killer].style})` : ''}. Mais uma batida, mais uma chance.`;
    $('taunt').hidden = !killer || victory;
    if (killer && !victory) $('taunt').textContent = `“${world.cars[killer].taunt}”`;
    $('statKos').textContent = player.kos; $('statTime').textContent = `${Math.round(playerTime)}s`; $('statXp').textContent = `+${xp}`;
    $('resultLevel').textContent = after.level;
    $('resultLevelText').textContent = after.level > before.level ? `SUBIU PARA O NÍVEL ${after.level}!` : `NÍVEL ${after.level} · ${after.into}/${after.need} XP`;
    $('resultLevelFill').style.width = `${after.into / after.need * 100}%`;
    const unlocked = SKINS.filter(skin => skin.level > before.level && skin.level <= after.level);
    $('unlock').textContent = unlocked.length ? `🎨 ${unlocked.length > 1 ? unlocked.length + ' novas cores liberadas' : 'Nova cor liberada'}! Escolha no menu.` : '';
    keys.clear();
    if (victory) jingle([523, 659, 784, 1047]); else tone(170, .5, .06, { force: true });
  }
  function updateHUD() {
    const c = world.config;
    $('alive').textContent = world.cars.filter(car => car.state.alive).length;
    $('kos').textContent = world.cars[0].state.kos;
    const remaining = Math.ceil(c.phaseSeconds - world.time % c.phaseSeconds), sectors = c.collapse === 'sectors';
    $('phase').textContent = world.phase < c.phases ? `${sectors ? 'FATIA' : 'QUEDA'} ${world.phase + 1} / ${c.phases} · ${remaining}s` : 'ILHA FINAL · SOBREVIVA';
    $('warning').hidden = countdown > 0 || (!world.warning && world.phase !== c.phases);
    $('warning').textContent = world.warning ? (sectors ? `⚠ A FATIA VERMELHA CAI EM ${remaining}s` : `⚠ A ARENA VAI ENCOLHER EM ${remaining}s`) : 'ÚLTIMA ILHA — DISPUTE O CENTRO';
    const s = world.cars[0].state;
    $('boostFill').style.width = `${(1 - s.cooldown / c.boostCooldown) * 100}%`;
    $('boostText').textContent = s.heavy > 0 ? `🔨 ${s.heavy.toFixed(0)}s · ${s.cooldown > 0 ? s.cooldown.toFixed(1) + 's' : 'PRONTO'}` : s.cooldown > 0 ? s.cooldown.toFixed(1) + 's' : 'PRONTO';
    $('boostBtn').classList.toggle('cooling', s.cooldown > 0);
  }
  const desiredCamera = new T.Vector3(), lookTarget = new T.Vector3(), desiredLook = new T.Vector3();
  const poleStart = new T.Vector3(), poleEnd = new T.Vector3(), poleDirection = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  let visualTime = 0;
  function render(dt, now) {
    visualTime += dt;
    const running = mode === 'playing' && world.status === 'playing' && countdown <= .6;
    for (const car of world.cars) {
      const s = car.state, model = carModels.get(car.id);
      const pose = BumperRender.pose(model.previous, s, running ? accumulator / CONFIG.tick : 1, model.pose);
      model.group.position.set(pose.x, pose.y, pose.z); model.body.rotation.y = pose.angle;
      model.body.rotation.z = s.alive ? -s.steering * Math.min(.075, Math.hypot(s.vx, s.vz) * .004) : s.y * .09;
      model.group.visible = s.y > -55;
      // Heavy cars visibly bulk up for the duration of the power-up.
      // Hits squash the car like rubber; driving adds a gentle bounce.
      model.size += ((s.heavy > 0 ? 1.22 : 1) - model.size) * (1 - Math.exp(-10 * dt));
      model.squash *= Math.exp(-7 * dt);
      const wobble = model.squash * Math.sin(visualTime * 30), size = model.size;
      model.body.scale.set(size * (1 + wobble * .12), size * (1 - wobble * .16), size * (1 + wobble * .12));
      model.body.position.y = s.alive ? Math.abs(Math.sin(visualTime * 9 + car.id)) * Math.min(.05, Math.hypot(s.vx, s.vz) * .004) : 0;
      if (!model.poles) continue;
      const speed = Math.hypot(s.vx, s.vz);
      const bx = -.63 * Math.cos(pose.angle) - .6 * Math.sin(pose.angle), bz = .63 * Math.sin(pose.angle) - .6 * Math.cos(pose.angle);
      const tx = bx - s.vx * .035, tz = bz - s.vz * .035;
      const top = ceilingHeight - (s.alive ? pose.y : 0) - .045;
      for (let j = 0; j < model.poles.length; j++) {
        const a = j / 3, b = (j + 1) / 3;
        const bend = s.alive ? Math.sin(visualTime * 21 + car.id) * Math.min(.08, speed * .006) : 0;
        poleStart.set(bx + (tx - bx) * a + Math.sin(a * Math.PI) * bend, 1.4 + (top - 1.4) * a, bz + (tz - bz) * a);
        poleEnd.set(bx + (tx - bx) * b + Math.sin(b * Math.PI) * bend, 1.4 + (top - 1.4) * b, bz + (tz - bz) * b);
        const pole = model.poles[j]; pole.position.copy(poleStart).add(poleEnd).multiplyScalar(.5);
        poleDirection.copy(poleEnd).sub(poleStart); pole.scale.y = poleDirection.length(); pole.quaternion.setFromUnitVectors(up, poleDirection.normalize());
      }
      model.shoe.position.set(tx, top, tz); model.shoe.rotation.y = pose.angle;
      model.contact.position.set(tx, top - .04, tz);
      const moving = mode === 'menu' || (mode === 'playing' && speed > .6);
      model.contact.visible = s.alive && moving;
      model.contact.scale.setScalar(.7 + .6 * Math.sin(visualTime * 39 + car.id) ** 2);
      if (s.alive && moving && dt > 0) {
        model.sparkTime -= dt;
        if (model.sparkTime <= 0) { burst(s.x + tx, s.z + tz, s.boostTime > 0 ? 5 : 2, car.id % 2 ? '#ffe4a1' : '#d1f2ff', ceilingHeight - .1, true); model.sparkTime = mode === 'menu' ? .5 : .11 + Math.random() * .14; }
      }
    }
    const c = world.config;
    arena.rotation.y = c.spin * (mode === 'menu' ? visualTime : world.time + (running ? accumulator : 0));
    for (const zone of zones) {
      if (world.dropped[zone.index]) { zone.fall += dt; zone.group.position.y = -14 * zone.fall * zone.fall; zone.group.rotation.z = zone.fall * .08; zone.group.visible = zone.fall < 3; }
      else {
        const warning = world.warningZone === zone.index;
        zone.group.position.y = warning ? Math.sin(now * 45) * .065 : 0;
        zone.group.rotation.z = warning ? Math.sin(now * 32) * .002 : 0;
        const flash = warning && Math.sin(now * 9) > 0;
        zone.group.children.forEach(child => {
          if (child.userData.original) child.material = flash ? mat('#ff6d56', { emissive: '#ff493a', emissiveIntensity: .35 }) : child.userData.original;
          if (child.userData.overlay) { child.material.color.set(flash ? '#ff8a78' : '#ffffff'); child.material.emissive.copy(flash ? warnGlow : child.userData.emissive); child.material.emissiveIntensity = flash ? .45 : (theme.floor.glowFloor ? .7 : 0); }
        });
      }
    }
    world.bumpers.forEach((b, i) => { const pulse = Math.max(0, .3 - (world.time - b.hit)) * 2; bumperModels[i].scale.set(1 + pulse, 1 + pulse * 2, 1 + pulse); });
    // The central disk visibly contracts together with the final sudden-death boundary.
    const scale = world.phase === c.phases ? world.radius / c.islandRadius : 1;
    centerIsland.scale.set(scale, 1, scale);
    syncPickups(now);
    for (const wave of shockwaves) {
      if (!wave.ring.visible) continue;
      wave.time += dt; const t = wave.time / .45;
      if (t >= 1) { wave.ring.visible = false; continue; }
      wave.ring.scale.setScalar(1 + t * c.shockRadius); wave.ring.material.opacity = .8 * (1 - t);
    }
    sparks.update(dt);
    if (scenery.userData.update && dt > 0) scenery.userData.update(dt, visualTime);
    if (mode === 'menu') {
      camera.position.set(10, 6.8, 28); camera.lookAt(innerWidth > 700 ? -10 : 0, 3.7, -6);
    } else if (mode === 'playing') {
      const s = world.cars[0].state, pose = carModels.get(0).pose;
      const angleDelta = Math.atan2(Math.sin(pose.angle - cameraAngle), Math.cos(pose.angle - cameraAngle));
      cameraAngle += angleDelta * (1 - Math.exp(-5 * dt));
      desiredCamera.set(pose.x - Math.sin(cameraAngle) * 14, 6, pose.z - Math.cos(cameraAngle) * 14);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-6 * dt));
      desiredLook.set(pose.x + Math.sin(cameraAngle) * 3, 3.5, pose.z + Math.cos(cameraAngle) * 3);
      lookTarget.lerp(desiredLook, 1 - Math.exp(-10 * dt));
      const desiredFov = 46 + Math.min(6, Math.hypot(s.vx, s.vz) * .25) + (s.boostTime > 0 ? 3 : 0);
      if (Math.abs(camera.fov - desiredFov) > .02) { camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-5 * dt)); camera.updateProjectionMatrix(); }
      camera.lookAt(lookTarget); shake *= Math.exp(-7 * dt);
      if (shake > .005 && !paused) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
    }
    // Hide scenery between the camera and the player, especially perimeter posts.
    // Restore it every frame so columns reappear as soon as the camera clears them.
    for (const obstacle of cameraObstacles) obstacle.visible = true;
    cameraObstacles.length = 0;
    if (mode === 'playing') {
      const s = world.cars[0].state;
      cameraSight.set(s.x, Math.max(0, s.y) + 1.2, s.z).sub(camera.position);
      cameraRay.far = cameraSight.length(); cameraRay.set(camera.position, cameraSight.normalize());
      for (const hit of cameraRay.intersectObjects(cameraPosts, false)) {
        if (hit.object.isMesh && hit.object.visible) { hit.object.visible = false; cameraObstacles.push(hit.object); }
      }
      // A ray starting inside a post never hits it, so also clear posts right next to the lens.
      for (const post of cameraPosts) if (post.visible && Math.hypot(post.position.x - camera.position.x, post.position.z - camera.position.z) < 2.2) { post.visible = false; cameraObstacles.push(post); }
    }
    renderer.render(scene, camera);
    if (perf && ++perfFrames && performance.now() - perfStart >= 1000) {
      perf.textContent = `${Math.round(perfFrames * 1000 / (performance.now() - perfStart))} FPS | ${renderer.info.render.calls} draws | ${renderer.info.render.triangles} triangles | ${renderer.info.memory.geometries} geometries`;
      perfFrames = 0; perfStart = performance.now();
    }
  }
  function tickCountdown(dt) {
    countdown -= dt;
    const label = countdown > .6 ? String(Math.ceil(countdown - .6)) : countdown > 0 ? 'JÁ!' : '';
    if (label === countdownShown) return;
    countdownShown = label;
    const el = $('countdown'); el.hidden = !label; el.textContent = label;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    if (label) tone(label === 'JÁ!' ? 880 : 440, label === 'JÁ!' ? .35 : .15, .07, { force: true, type: 'square', slide: 1 });
  }
  function frame(ms) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastTime = 0; return; }
    if ((paused || mode === 'result') && !renderDirty) { lastTime = 0; return; }
    if (mode === 'menu' && ms - lastDraw < 1000 / 30) return;
    lastDraw = ms;
    const now = ms / 1000, elapsed = lastTime ? now - lastTime : 0, dt = Math.min(.1, elapsed); lastTime = now;
    // Sustained slow frames lower resolution, without changing physics or bot count.
    if (!paused && mode === 'playing' && elapsed > 0 && elapsed < .2) {
      frameAverage += (elapsed * 1000 - frameAverage) * .025; adaptTime += elapsed;
      if (adaptTime > 4) { if (!economy && frameAverage > 23 && resolutionScale > .65) { resolutionScale = Math.max(.65, resolutionScale - .15); resizeRenderer(); } adaptTime = 0; }
    }
    if (mode === 'playing' && !paused) {
      if (countdown > 0) tickCountdown(dt);
      if (countdown <= .6) {
        const player = world.cars[0];
        const keyThrottle = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
        const keySteer = Number(keys.has('KeyA') || keys.has('ArrowLeft')) - Number(keys.has('KeyD') || keys.has('ArrowRight'));
        player.input = { throttle: keyThrottle || touchInput.throttle, steer: keySteer || touchInput.steer, boost: queuedBoost || keys.has('Space') };
        accumulator += dt;
        while (accumulator >= CONFIG.tick) {
          if (world.status === 'playing') {
            for (const car of world.cars) { const previous = carModels.get(car.id).previous, s = car.state; previous.x = s.x; previous.y = s.y; previous.z = s.z; previous.angle = s.angle; }
            BumperAI.update(world); step(world, CONFIG.tick); queuedBoost = false; events();
          }
          accumulator -= CONFIG.tick;
        }
      }
      // Continue the falling animation after the winner has been resolved.
      if (world.status === 'finished') for (const car of world.cars) if (!car.state.alive) { car.state.vy -= 24 * dt; car.state.y += car.state.vy * dt; }
      hudTime += dt; if (hudTime >= .1) { updateHUD(); hudTime = 0; }
      if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) finish(); }
      if (feedbackTime > 0) { feedbackTime -= dt; if (feedbackTime <= 0) feedback.hidden = true; }
    }
    render(paused ? 0 : dt, now);
    renderDirty = false;
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); resizeRenderer(); });
  applyTheme(profile.map); prepare(); renderMenu();
  $('play').disabled = false; $('play').textContent = 'JOGAR AGORA ↗'; requestAnimationFrame(frame);
})();
