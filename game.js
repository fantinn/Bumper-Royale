/* Presentation layer: reads simulation state, forwards inputs, and consumes events. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function fail(message) { $('error').textContent = message; $('error').hidden = false; }
  if (!window.THREE) { fail('Não foi possível carregar o Three.js. Conecte-se à internet e recarregue a página.'); return; }
  const { CONFIG, createWorld, step } = BumperPhysics;
  const T = THREE, scene = new T.Scene();
  scene.background = new T.Color('#172532'); scene.fog = new T.Fog('#172532', 65, 150);
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch (_) { fail('Este navegador não conseguiu iniciar o WebGL. Ative a aceleração de hardware e recarregue.'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  $('view').appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, .1, 260);
  scene.add(new T.HemisphereLight('#d5e6ed', '#4d3c51', 1.8));
  const sun = new T.DirectionalLight('#ffe2b2', 2.1); sun.position.set(-20, 35, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 100 }); sun.shadow.normalBias = .04; scene.add(sun);
  const materials = new Map();
  function mat(color, extra = {}) { const key = color + JSON.stringify(extra); if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: .65, ...extra })); return materials.get(key); }
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
  function box(parent, size, color, x, y, z) { return mesh(new T.BoxGeometry(...size), mat(color), parent, x, y, z); }
  function cylinder(parent, rt, rb, height, color, x, y, z, sides = 16) { return mesh(new T.CylinderGeometry(rt, rb, height, sides), mat(color), parent, x, y, z); }
  const arena = new T.Group(); scene.add(arena);
  const ceilingHeight = BumperPavilion.ceilingHeight;
  const pavilion = BumperPavilion.build(T, scene, { mesh, box, cylinder, mat }, CONFIG.radius);
  const cameraRay = new T.Raycaster(), cameraSight = new T.Vector3(), cameraObstacles = [];
  let rings = [], centerIsland, carModels = new Map(), particles = [], world, mode = 'menu', paused = false, accumulator = 0, lastTime = 0, shake = 0, endTimer = 0, audioContext = null, sound = false;
  const palette = ['#dfff72', '#ff795e', '#8271e8', '#56d5de', '#ffbd59', '#ef87bf', '#f1efe6', '#5292ef', '#b1e565', '#d8614e', '#94a3ff', '#5ac5a3'];
  // Dispose per-match geometry and textures, while retaining shared materials.
  function disposeTree(group) { group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } }); group.removeFromParent(); }
  function wedge(inner, outer, start, end) {
    const shape = new T.Shape(); shape.moveTo(Math.cos(start) * outer, Math.sin(start) * outer);
    shape.absarc(0, 0, outer, start, end, false);
    shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
    shape.absarc(0, 0, inner, end, start, true); shape.closePath();
    const g = new T.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: false, curveSegments: 4 }); g.rotateX(-Math.PI / 2); g.translate(0, -1.15, 0); return g;
  }
  function buildArena() {
    for (const child of [...arena.children]) disposeTree(child);
    rings = []; centerIsland = new T.Group(); arena.add(centerIsland);
    const centerRadius = CONFIG.radius - CONFIG.phases * CONFIG.ringWidth;
    cylinder(centerIsland, centerRadius, Math.max(.1, centerRadius - .5), 1.15, '#577475', 0, -.575, 0, 64);
    for (let ring = 0; ring < CONFIG.phases; ring++) {
      const outer = CONFIG.radius - ring * CONFIG.ringWidth, inner = outer - CONFIG.ringWidth;
      const group = new T.Group(); arena.add(group);
      for (let n = 0; n < 32; n++) {
        const a = n / 32 * Math.PI * 2, b = (n + 1) / 32 * Math.PI * 2;
        const color = ring === 0 ? (n % 2 ? '#e8b865' : '#384347') : (ring % 2 ? '#667b80' : '#75888a');
        const tile = mesh(wedge(inner + .035, outer - .035, a + .001, b - .001), mat(color, { metalness: .55, roughness: .38 }), group);
        tile.userData.original = tile.material;
        if (ring > 0 && n % 2 === 0) {
          const stripe = box(group, [.12, .025, 1], '#a6b3d1', Math.cos(a) * (outer - .65), .025, Math.sin(a) * (outer - .65)); stripe.rotation.y = -a + Math.PI / 2;
        }
      }
      rings.push({ group, index: ring, dropped: false, fall: 0 });
    }
    const circle = mesh(new T.RingGeometry(centerRadius * .74, centerRadius * .756, 64), mat('#cfbdf0', { side: T.DoubleSide }), centerIsland, 0, .025, 0); circle.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) { const mark = box(centerIsland, [.18, .03, centerRadius * .32], '#cfbdf0', Math.sin(i * Math.PI / 2) * centerRadius * .5, .03, Math.cos(i * Math.PI / 2) * centerRadius * .5); mark.rotation.y = i * Math.PI / 2; }
  }
  function label(text, color) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#19223bdc'; ctx.beginPath(); ctx.roundRect(8, 8, 240, 80, 25); ctx.fill();
    ctx.fillStyle = color; ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 50);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(2.3, .86, 1); sprite.position.y = 3.4; return sprite;
  }
  function makeCar(car) {
    const group = new T.Group(), body = new T.Group(); group.add(body); scene.add(group);
    const color = palette[car.id % palette.length];
    cylinder(body, 1.03, 1.08, .36, '#25314b', 0, .34, 0);
    cylinder(body, .99, 1.02, .11, color, 0, .52, 0);
    const shell = cylinder(body, .74, .94, .57, color, 0, .79, 0); shell.scale.z = 1.14;
    box(body, [1.02, .23, .86], color, 0, 1.06, .42);
    box(body, [.78, .5, .3], '#26354c', 0, 1.2, -.35);
    box(body, [.53, .55, .42], car.id === 0 ? '#edf7d7' : '#33435c', 0, 1.37, -.13);
    cylinder(body, .29, .27, .4, '#ffd0a0', 0, 1.86, -.12, 8);
    const helmet = mesh(new T.SphereGeometry(.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * .63), mat(color), body, 0, 2.04, -.12);
    box(body, [.4, .12, .05], '#25314b', 0, 2, .18);
    const wheel = mesh(new T.TorusGeometry(.22, .045, 5, 12), mat('#26354c'), body, 0, 1.34, .41); wheel.rotation.x = -.6;
    for (const x of [-.5, .5]) box(body, [.25, .13, .07], '#fff2cb', x, .91, .94);
    cylinder(body, .13, .17, .45, '#242e39', -.63, 1.27, -.6, 8);
    // The collector is separate from body roll: its shoe stays on the ceiling plane.
    const collector = new T.Group(); group.add(collector);
    const poles = Array.from({ length: 3 }, () => mesh(new T.CylinderGeometry(.035, .045, 1, 6), mat('#b6c4ce', { metalness: .85, roughness: .22 }), collector));
    const shoe = box(collector, [.5, .065, .3], '#e1c291', 0, ceilingHeight - .035, 0);
    const contact = mesh(new T.SphereGeometry(.075, 8, 6), mat('#fff4cd', { emissive: '#bdeaff', emissiveIntensity: 5 }), collector);
    contact.castShadow = false;
    group.add(label(car.name, car.id === 0 ? '#dfff72' : '#ffffff'));
    if (car.id === 0) { const ring = mesh(new T.RingGeometry(1.25, 1.34, 40), new T.MeshBasicMaterial({ color: '#e4ff88', side: T.DoubleSide }), group, 0, .04, 0); ring.rotation.x = -Math.PI / 2; }
    carModels.set(car.id, { group, body, poles, shoe, contact, sparkTime: car.id * .017 });
  }
  function prepare(options = {}) {
    for (const model of carModels.values()) disposeTree(model.group); carModels.clear();
    for (const p of particles) { scene.remove(p.mesh); p.mesh.geometry.dispose(); } particles = [];
    buildArena(); world = createWorld(options); world.cars.forEach(makeCar); accumulator = 0; endTimer = 0; shake = 0;
    $('feed').replaceChildren(); $('result').hidden = true; $('pause').hidden = true; paused = false;
  }
  function start() {
    prepare({ bots: Number($('bots').value), difficulty: $('difficulty').value }); mode = 'playing';
    $('menu').hidden = true; $('sceneLabel').hidden = true; $('hud').hidden = false; keys.clear();
    const s = world.cars[0].state; camera.position.set(s.x - Math.sin(s.angle) * 14, 6, s.z - Math.cos(s.angle) * 14); camera.lookAt(s.x, 3.5, s.z);
    if (sound) initAudio();
  }
  const keys = new Set();
  function setPause(value) { if (mode !== 'playing' || world.status !== 'playing') return; paused = value; $('pause').hidden = !value; keys.clear(); accumulator = 0; }
  addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code) && mode === 'playing') e.preventDefault();
    if (e.code === 'Escape' && !e.repeat) setPause(!paused);
    keys.add(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
  $('play').onclick = start; $('again').onclick = start; $('resume').onclick = () => setPause(false);
  $('bots').onchange = () => { document.querySelector('#menu .eyebrow').textContent = `${Number($('bots').value) + 1} CARRINHOS. UM SOBREVIVENTE.`; };
  function initAudio() { try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume(); } catch (_) { sound = false; } }
  $('sound').onclick = () => { sound = !sound; if (sound) initAudio(); $('sound').textContent = sound ? 'Som: ligado' : 'Som: desligado'; $('sound').setAttribute('aria-pressed', String(sound)); };
  function tone(freq, duration, volume = .06) {
    if (!sound || !audioContext) return;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
    oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(freq, now); oscillator.frequency.exponentialRampToValueAtTime(freq * .35, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(now + duration);
  }
  function burst(x, z, count, color, y = .8, electric = false) {
    for (let i = 0; i < count && particles.length < 250; i++) {
      const p = mesh(new T.BoxGeometry(.13, .13, .13), mat(color, { emissive: color, emissiveIntensity: .5 }), scene, x, y, z);
      p.castShadow = false; const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      if (electric) p.scale.set(.4, 1.8, .4);
      particles.push({ mesh: p, vx: Math.sin(a) * v, vz: Math.cos(a) * v, vy: electric ? -1 - Math.random() * 2 : 2 + Math.random() * 5, life: electric ? .15 + Math.random() * .22 : .4 + Math.random() * .5, electric });
    }
  }
  function events() {
    for (const event of world.events) {
      if (event.type === 'hit') { burst(event.x, event.z, Math.min(22, Math.ceil(event.strength)), '#ffed9a'); if (event.ids.includes(0)) shake = Math.min(.7, event.strength * .025); tone(90 + event.strength * 8, .12); }
      if (event.type === 'boost') { const s = world.cars[event.id].state; burst(s.x, s.z, 10, '#caff77'); if (event.id === 0) tone(350, .25); }
      if (event.type === 'collapse') { shake = .45; tone(70, .5, .1); }
      if (event.type === 'elimination') {
        const line = document.createElement('div'); line.textContent = `${event.id === 0 ? 'VOCÊ' : 'CARRINHO ' + world.cars[event.id].name} caiu ↓`;
        $('feed').prepend(line); while ($('feed').children.length > 5) $('feed').lastChild.remove();
        if (event.id === 0) endTimer = 1.6;
      }
      if (event.type === 'finish' && !endTimer) endTimer = 1.6;
    }
  }
  function finish() {
    mode = 'result'; $('hud').hidden = true; $('result').hidden = false;
    const player = world.cars[0].state, victory = world.winner === 0;
    $('resultEyebrow').textContent = victory ? 'A PISTA É SUA' : 'FIM DE PARTIDA';
    $('resultTitle').textContent = victory ? 'SOBROU VOCÊ!' : 'FOI POR POUCO.';
    $('position').textContent = '#' + (player.place || 1);
    $('resultText').textContent = victory ? `Vitória! Você deixou ${world.config.bots} adversários para trás.` : `${player.place || 1}º lugar de ${world.cars.length} carrinhos. Mais uma batida, mais uma chance.`;
    keys.clear(); tone(victory ? 700 : 170, .5);
  }
  function updateHUD() {
    $('alive').textContent = world.cars.filter(c => c.state.alive).length;
    const remaining = Math.ceil(world.config.phaseSeconds - world.time % world.config.phaseSeconds);
    $('phase').textContent = world.phase < CONFIG.phases ? `QUEDA ${world.phase + 1} / ${CONFIG.phases} · ${remaining}s` : 'ILHA FINAL · SOBREVIVA';
    $('warning').hidden = !world.warning && !(world.phase === CONFIG.phases);
    $('warning').textContent = world.warning ? `⚠ A ARENA VAI ENCOLHER EM ${remaining}s` : 'ÚLTIMA ILHA — DISPUTE O CENTRO';
    const cooldown = world.cars[0].state.cooldown;
    $('boostFill').style.width = `${(1 - cooldown / CONFIG.boostCooldown) * 100}%`;
    $('boostText').textContent = cooldown > 0 ? cooldown.toFixed(1) + 's' : 'PRONTO';
  }
  const desiredCamera = new T.Vector3(), lookTarget = new T.Vector3();
  const poleStart = new T.Vector3(), poleEnd = new T.Vector3(), poleDirection = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  let visualTime = 0;
  function render(dt, now) {
    visualTime += dt;
    for (const car of world.cars) {
      const s = car.state, model = carModels.get(car.id);
      model.group.position.set(s.x, s.y, s.z); model.body.rotation.y = s.angle;
      model.body.rotation.z = s.alive ? -car.input.steer * Math.min(.06, Math.hypot(s.vx, s.vz) * .004) : s.y * .09;
      model.group.visible = s.y > -55;
      const speed = Math.hypot(s.vx, s.vz);
      const bx = -.63 * Math.cos(s.angle) - .6 * Math.sin(s.angle), bz = .63 * Math.sin(s.angle) - .6 * Math.cos(s.angle);
      const tx = bx - s.vx * .035, tz = bz - s.vz * .035;
      const top = ceilingHeight - (s.alive ? s.y : 0) - .045;
      for (let j = 0; j < model.poles.length; j++) {
        const a = j / 3, b = (j + 1) / 3;
        const bend = s.alive ? Math.sin(visualTime * 21 + car.id) * Math.min(.08, speed * .006) : 0;
        poleStart.set(bx + (tx - bx) * a + Math.sin(a * Math.PI) * bend, 1.4 + (top - 1.4) * a, bz + (tz - bz) * a);
        poleEnd.set(bx + (tx - bx) * b + Math.sin(b * Math.PI) * bend, 1.4 + (top - 1.4) * b, bz + (tz - bz) * b);
        const pole = model.poles[j]; pole.position.copy(poleStart).add(poleEnd).multiplyScalar(.5);
        poleDirection.copy(poleEnd).sub(poleStart); pole.scale.y = poleDirection.length(); pole.quaternion.setFromUnitVectors(up, poleDirection.normalize());
      }
      model.shoe.position.set(tx, top, tz); model.shoe.rotation.y = s.angle;
      model.contact.position.set(tx, top - .04, tz);
      const moving = mode === 'menu' || (mode === 'playing' && speed > .6);
      model.contact.visible = s.alive && moving;
      model.contact.scale.setScalar(.7 + .6 * Math.sin(visualTime * 39 + car.id) ** 2);
      if (s.alive && moving && dt > 0) {
        model.sparkTime -= dt;
        if (model.sparkTime <= 0) { burst(s.x + tx, s.z + tz, s.boostTime > 0 ? 5 : 2, car.id % 2 ? '#ffe4a1' : '#d1f2ff', ceilingHeight - .1, true); model.sparkTime = mode === 'menu' ? .5 : .11 + Math.random() * .14; }
      }
    }
    for (const ring of rings) {
      const dropping = ring.index < world.phase;
      if (dropping) { ring.fall += dt; ring.group.position.y = -14 * ring.fall * ring.fall; ring.group.rotation.z = ring.fall * .08; ring.group.visible = ring.fall < 3; }
      else {
        const warning = world.warning && ring.index === world.phase;
        ring.group.position.y = warning ? Math.sin(now * 45) * .065 : 0;
        ring.group.rotation.z = warning ? Math.sin(now * 32) * .002 : 0;
        ring.group.children.forEach(tile => { if (tile.userData.original) tile.material = warning && Math.sin(now * 9) > 0 ? mat('#ff6d56', { emissive: '#ff493a', emissiveIntensity: .35 }) : tile.userData.original; });
      }
    }
    // The central disk visibly contracts together with the final sudden-death boundary.
    const scale = world.phase === CONFIG.phases ? world.radius / (CONFIG.radius - CONFIG.phases * CONFIG.ringWidth) : 1;
    centerIsland.scale.set(scale, 1, scale);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt; p.mesh.rotation.x += dt * 6;
      const fade = Math.max(.01, Math.min(1, p.life * (p.electric ? 7 : 3))); p.mesh.scale.set(fade * (p.electric ? .4 : 1), fade * (p.electric ? 1.8 : 1), fade * (p.electric ? .4 : 1));
      if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); particles.splice(i, 1); }
    }
    if (mode === 'menu') {
      camera.position.set(10, 6.8, 28); camera.lookAt(innerWidth > 700 ? -10 : 0, 3.7, -6);
    } else if (mode === 'playing') {
      const s = world.cars[0].state;
      desiredCamera.set(s.x - Math.sin(s.angle) * 14, 6, s.z - Math.cos(s.angle) * 14);
      camera.position.lerp(desiredCamera, 1 - Math.exp(-3.3 * dt));
      lookTarget.set(s.x + Math.sin(s.angle) * 3, 3.5, s.z + Math.cos(s.angle) * 3);
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
      pavilion.updateMatrixWorld(true);
      for (const hit of cameraRay.intersectObjects(pavilion.children, true)) {
        if (hit.object.isMesh && hit.object.visible) { hit.object.visible = false; cameraObstacles.push(hit.object); }
      }
    }
    renderer.render(scene, camera);
  }
  function frame(ms) {
    requestAnimationFrame(frame);
    const now = ms / 1000, dt = Math.min(.05, lastTime ? now - lastTime : 0); lastTime = now;
    if (mode === 'playing' && !paused) {
      const player = world.cars[0];
      player.input = { throttle: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')), steer: Number(keys.has('KeyA') || keys.has('ArrowLeft')) - Number(keys.has('KeyD') || keys.has('ArrowRight')), boost: keys.has('Space') };
      accumulator += dt;
      while (accumulator >= CONFIG.tick) { if (world.status === 'playing') { BumperAI.update(world); step(world, CONFIG.tick); events(); } accumulator -= CONFIG.tick; }
      // Continue the falling animation after the winner has been resolved.
      if (world.status === 'finished') for (const car of world.cars) if (!car.state.alive) { car.state.vy -= 24 * dt; car.state.y += car.state.vy * dt; }
      updateHUD();
      if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) finish(); }
    }
    render(paused ? 0 : dt, now);
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  prepare(); $('play').disabled = false; $('play').textContent = 'JOGAR AGORA ↗'; requestAnimationFrame(frame);
})();
