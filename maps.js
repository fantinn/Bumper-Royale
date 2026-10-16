/* Map presentation: colors, lighting and scenery per map id. Gameplay rules for the
   same ids live in BumperPhysics.MAPS; nothing here changes the simulation. */
(function (root) {
  'use strict';
  // Deterministic scatter so each map looks identical every match.
  function seeded(n) { return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function sign(T, group, mesh, text, subtitle, width, x, y, z, rotation, colors) {
    const [background, border, title, sub] = colors;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = border; ctx.lineWidth = 12; ctx.strokeRect(12, 12, 1000, 232);
    ctx.textAlign = 'center'; ctx.fillStyle = title; ctx.font = '900 95px Arial'; ctx.fillText(text, 512, 128);
    ctx.fillStyle = sub; ctx.font = 'bold 31px Arial'; ctx.fillText(subtitle, 512, 198);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    const board = mesh(new T.PlaneGeometry(width, width / 4), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }), group, x, y, z);
    board.rotation.y = rotation;
    return board;
  }
  // Flat annulus on the ground plane, used for decks and ledges around the pit.
  function annulus(T, group, mesh, mat, inner, outer, y, color, segments = 64) {
    const ring = mesh(new T.RingGeometry(inner, outer, segments), mat(color), group, 0, y, 0); ring.rotation.x = -Math.PI / 2; return ring;
  }
  function snowfall(T, group, count = 520, span = 120, height = 32) {
    const positions = new Float32Array(count * 3), random = seeded(7);
    for (let i = 0; i < count; i++) { positions[i * 3] = (random() - .5) * span; positions[i * 3 + 1] = random() * height; positions[i * 3 + 2] = (random() - .5) * span; }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    const material = new T.PointsMaterial({ color: '#ffffff', size: .22, transparent: true, opacity: .85, depthWrite: false });
    const points = new T.Points(geometry, material); points.frustumCulled = false; points.userData.ownedMaterial = material; group.add(points);
    return dt => {
      for (let i = 0; i < count; i++) {
        let y = positions[i * 3 + 1] - dt * (1.6 + (i % 5) * .25);
        if (y < -1) y += height;
        positions[i * 3 + 1] = y; positions[i * 3] += Math.sin(y * .7 + i) * dt * .3;
      }
      geometry.attributes.position.needsUpdate = true;
    };
  }

  const parque = {
    id: 'parque', name: 'Parque do Bairro', rule: 'Clássico · anéis caem', footer: 'PARQUE DO BAIRRO / 01',
    tagline: 'FICHA NA MÃO. PÉ NO ACELERADOR.',
    sky: '#172532', fog: [65, 150], hemi: ['#d5e6ed', '#4d3c51', 1.8], sun: ['#ffe2b2', 2.1], exposure: 1.2,
    ceiling: () => root.BumperPavilion.ceilingHeight,
    floor: { outerA: '#384347', outerB: '#e8b865', ringA: '#667b80', ringB: '#75888a', island: '#577475', mark: '#cfbdf0', stripe: '#a6b3d1' },
    build: (T, scene, helpers, radius) => root.BumperPavilion.build(T, scene, helpers, radius)
  };

  const gelo = {
    id: 'gelo', name: 'Rinque Congelado', rule: 'Gelo · quase sem aderência', footer: 'RINQUE CONGELADO / 02',
    tagline: 'FREAR É UMA SUGESTÃO.',
    sky: ['#0d1a33', '#1e3a5c', '#3d6a8c'], fog: [70, 170], fogColor: '#2c5070', hemi: ['#e4f4ff', '#3b5677', 1.9], sun: ['#dff0ff', 2], exposure: 1.15,
    ceiling: null,
    floor: { outerA: '#c43a4a', outerB: '#f2f7fb', ringA: '#dbeaf3', ringB: '#cfe2ee', island: '#b9d6e8', mark: '#3d6fd1', stripe: '#7fb0e0' },
    build(T, scene, helpers, radius) {
      const { mesh, box, cylinder, mat } = helpers;
      const group = new T.Group(); scene.add(group);
      const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
      const random = seeded(11), R = radius + 5;
      box(group, [160, .6, 160], '#0b2c45', 0, -9, 0);
      annulus(T, group, mesh, mat, radius + 1.2, R + 1, -.7, '#bcd3e2');
      // Rink boards with alternating sponsor panels and a blue cap.
      const segments = 30, ads = ['#ff6f61', '#ffd166', '#5ad1c8', '#a98bff'];
      for (let i = 0; i < segments; i++) {
        const a = (i + .5) / segments * Math.PI * 2, length = Math.PI * 2 * R / segments + .12;
        box(group, [length, 1.5, .35], '#f4f8fb', Math.sin(a) * R, .05, Math.cos(a) * R).rotation.y = a;
        box(group, [length, .16, .55], '#2f6fd6', Math.sin(a) * R, .85, Math.cos(a) * R).rotation.y = a;
        if (i % 2) box(group, [length * .7, .6, .05], ads[(i >> 1) % 4], Math.sin(a) * (R - .2), .1, Math.cos(a) * (R - .2)).rotation.y = a;
      }
      // Stepped stands stay below the chase camera; spectators sit on every other seat.
      const shirts = ['#ff6f61', '#ffd166', '#5ad1c8', '#a98bff', '#f4f8fb', '#ff9ec7'];
      for (let tier = 0; tier < 6; tier++) {
        const r = R + 3 + tier * 2.2, top = -.2 + tier * .85, count = 36;
        for (let i = 0; i < count; i++) {
          const a = (i + .5) / count * Math.PI * 2, length = Math.PI * 2 * r / count + .1;
          box(group, [length, top + 1.2, 2.25], tier % 2 ? '#2a4d7a' : '#335d91', Math.sin(a) * r, (top - 1.2) / 2, Math.cos(a) * r).rotation.y = a;
          if ((i + tier) % 2 && random() > .25) {
            const x = Math.sin(a) * (r + .3), z = Math.cos(a) * (r + .3);
            cylinder(group, .3, .36, .9, shirts[Math.floor(random() * shirts.length)], x, top + .45, z, 6);
            mesh(new T.IcosahedronGeometry(.27, 1), mat(random() > .4 ? '#e3b48f' : '#8f5f3f'), group, x, top + 1.17, z);
          }
        }
      }
      // Outer arena wall, glowing banners and a ring of overhead lamps.
      for (let i = 0; i < 24; i++) {
        const a = (i + .5) / 24 * Math.PI * 2, r = R + 19;
        box(group, [Math.PI * 2 * r / 24 + .2, 18, .8], '#13223d', Math.sin(a) * r, 7, Math.cos(a) * r).rotation.y = a;
        if (i % 3 === 0) box(group, [3.2, 7, .1], ['#5ad1c8', '#ff6f61', '#ffd166'][i / 3 % 3], Math.sin(a) * (r - .5), 10, Math.cos(a) * (r - .5)).rotation.y = a;
        mesh(new T.BoxGeometry(3, .15, .5), glow('#eaf6ff'), group, Math.sin(a) * 30, 19, Math.cos(a) * 30).rotation.y = a;
      }
      // Snowmen mascots between the boards and the stands.
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + .3, x = Math.sin(a) * (R + 1.4), z = Math.cos(a) * (R + 1.4);
        mesh(new T.SphereGeometry(.75, 12, 8), mat('#f8fbff'), group, x, -.1, z);
        mesh(new T.SphereGeometry(.5, 12, 8), mat('#f8fbff'), group, x, .95, z);
        mesh(new T.SphereGeometry(.34, 10, 8), mat('#f8fbff'), group, x, 1.7, z);
        const nose = mesh(new T.ConeGeometry(.08, .4, 6), mat('#ff8a3d'), group, x - Math.sin(a) * .35, 1.7, z - Math.cos(a) * .35); nose.rotation.x = Math.PI / 2; nose.rotation.y = a + Math.PI;
        cylinder(group, .26, .26, .4, '#1f2a3a', x, 2.1, z, 10);
        box(group, [.9, .12, .2], ['#ff6f61', '#5ad1c8'][i % 2], x, 1.35, z).rotation.y = a;
      }
      sign(T, group, mesh, 'RINQUE', 'CONGELADO  •  SEGURE O VOLANTE', 18, 0, 11, -(R + 18), 0, ['#13223d', '#7fd8ff', '#eaf6ff', '#ffd166']);
      sign(T, group, mesh, 'PISO LISO!', 'FREIE ANTES  •  BATA DEPOIS', 14, 0, 11, R + 18, Math.PI, ['#13223d', '#ff6f61', '#eaf6ff', '#7fd8ff']);
      group.userData.update = snowfall(T, group);
      return group;
    }
  };

  const neon = {
    id: 'neon', name: 'Carrossel Neon', rule: 'Pista gira · bumpers', footer: 'CARROSSEL NEON / 03',
    tagline: 'A PISTA GIRA. A CIDADE ASSISTE.',
    sky: ['#07031a', '#1b0b3a', '#4a1560'], fog: [60, 175], fogColor: '#2a0f45', hemi: ['#b9a6ff', '#2a1440', 1.5], sun: ['#ff9fe0', 1.4], exposure: 1.25,
    ceiling: () => 8.8,
    floor: { outerA: '#ff3fa4', outerB: '#1a1336', ringA: '#2a2150', ringB: '#231b45', island: '#3a2a6e', mark: '#47f2ff', stripe: '#47f2ff', glowStripe: true },
    bumper: { base: '#1a1336', top: '#ff3fa4' },
    build(T, scene, helpers, radius) {
      const { mesh, box, cylinder, mat } = helpers;
      const group = new T.Group(); scene.add(group);
      const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
      const random = seeded(23), edge = radius + 8, height = 8.8;
      // A glowing grid in the abyss gives the fall real depth.
      box(group, [170, .6, 170], '#07040f', 0, -14, 0);
      const abyss = [];
      for (let p = -80; p <= 80; p += 4) abyss.push(-80, -13.6, p, 80, -13.6, p, p, -13.6, -80, p, -13.6, 80);
      const abyssGeometry = new T.BufferGeometry(); abyssGeometry.setAttribute('position', new T.Float32BufferAttribute(abyss, 3));
      const abyssMaterial = new T.LineBasicMaterial({ color: '#a43cff', transparent: true, opacity: .5 });
      const abyssLines = new T.LineSegments(abyssGeometry, abyssMaterial); abyssLines.userData.ownedMaterial = abyssMaterial; group.add(abyssLines);
      annulus(T, group, mesh, mat, radius + 2.2, 52, -1.3, '#16102c');
      const rim = mesh(new T.TorusGeometry(radius + 1.6, .12, 6, 96), glow('#ff3fa4'), group, 0, -.25, 0); rim.rotation.x = Math.PI / 2;
      const rim2 = mesh(new T.TorusGeometry(radius + 2.2, .08, 6, 96), glow('#47f2ff'), group, 0, -1.2, 0); rim2.rotation.x = Math.PI / 2;
      // Canopy posts hold the conductive grid; the camera hides them when they get in the way.
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, x = Math.sin(a) * edge, z = Math.cos(a) * edge;
        const post = cylinder(group, .25, .3, height + 2.5, '#2b2152', x, height / 2 - 1, z, 8);
        post.userData.cameraObstacle = true;
        mesh(new T.BoxGeometry(.12, height, .12), glow(i % 2 ? '#47f2ff' : '#ff3fa4'), group, x * .985, height / 2 - .5, z * .985);
      }
      const canopy = mesh(new T.CircleGeometry(edge + 1, 48), mat('#120a26'), group, 0, height + .14, 0);
      canopy.rotation.x = Math.PI / 2; canopy.castShadow = false;
      const grid = [];
      for (let p = -edge; p <= edge; p += 1.5) {
        const span = Math.sqrt(Math.max(0, edge * edge - p * p));
        grid.push(-span, height, p, span, height, p, p, height, -span, p, height, span);
      }
      const gridGeometry = new T.BufferGeometry(); gridGeometry.setAttribute('position', new T.Float32BufferAttribute(grid, 3));
      const gridMaterial = new T.LineBasicMaterial({ color: '#47f2ff', transparent: true, opacity: .35 });
      const gridLines = new T.LineSegments(gridGeometry, gridMaterial); gridLines.userData.ownedMaterial = gridMaterial; group.add(gridLines);
      const crown = mesh(new T.TorusGeometry(edge, .1, 6, 96), glow('#ff3fa4'), group, 0, height + .05, 0); crown.rotation.x = Math.PI / 2;
      // Parapet around the rooftop.
      for (let i = 0; i < 32; i++) {
        const a = (i + .5) / 32 * Math.PI * 2, r = 52;
        box(group, [Math.PI * 2 * r / 32 + .1, 1.4, .5], '#221a42', Math.sin(a) * r, -.6, Math.cos(a) * r).rotation.y = a;
        box(group, [Math.PI * 2 * r / 32 + .1, .1, .55], '#47f2ff', Math.sin(a) * r, .12, Math.cos(a) * r).rotation.y = a;
      }
      // Skyline: inward-facing lit windows are flat quads batched into one draw.
      const windowColors = ['#ffd27a', '#47f2ff', '#ff7ad6', '#fff3c4'];
      for (let i = 0; i < 46; i++) {
        const a = i / 46 * Math.PI * 2 + random() * .08, r = 66 + random() * 40;
        const w = 7 + random() * 9, h = 14 + random() * 46, d = 8 + random() * 6;
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        box(group, [w, h, d], random() > .5 ? '#1d1838' : '#251d48', x, h / 2 - 14, z).rotation.y = a;
        const face = r - d / 2 - .05, rx = Math.cos(a), rz = -Math.sin(a);
        for (let row = 0; row < Math.floor(h / 2.6) - 1; row++) for (let col = 0; col < Math.floor(w / 1.7); col++) {
          if (random() > .42) continue;
          const offset = (col + .5) * 1.7 - Math.floor(w / 1.7) * .85, y = -12 + row * 2.6;
          const win = mesh(new T.PlaneGeometry(.9, 1.2), glow(windowColors[Math.floor(random() * 4)]), group, Math.sin(a) * face + rx * offset, y, Math.cos(a) * face + rz * offset);
          win.rotation.y = a + Math.PI;
        }
        if (random() > .6) { cylinder(group, .08, .12, 5, '#3a2f66', x, h - 11.5, z, 6); mesh(new T.SphereGeometry(.35, 8, 6), glow('#ff3355'), group, x, h - 9, z); }
      }
      sign(T, group, mesh, 'CARROSSEL', 'NEON  •  A PISTA NÃO PARA', 22, 0, 20, -88, 0, ['#12082a', '#ff3fa4', '#ffffff', '#47f2ff']);
      sign(T, group, mesh, 'BUMPERS!', 'BATEU, VOLTOU  •  CUIDADO', 18, 86, 18, 0, -Math.PI / 2, ['#12082a', '#47f2ff', '#ffffff', '#ff7ad6']);
      return group;
    }
  };

  const doca = {
    id: 'doca', name: 'Doca do Porto', rule: 'Piso cai em fatias', footer: 'DOCA DO PORTO / 04',
    tagline: 'O CAIS VAI SE DESFAZENDO.',
    sky: ['#4f63a8', '#e98a7a', '#ffd39a'], fog: [80, 210], fogColor: '#f3b08a', hemi: ['#ffe0c2', '#3b4a6b', 1.7], sun: ['#ffc38a', 2.4], exposure: 1.1,
    ceiling: null,
    floor: { outerA: '#8a5a36', outerB: '#a8723f', ringA: '#9b6a3f', ringB: '#b07d4a', island: '#6f4b30', mark: '#ffe2a8', stripe: '#3a2a1e' },
    build(T, scene, helpers, radius) {
      const { mesh, box, cylinder, mat } = helpers;
      const group = new T.Group(); scene.add(group);
      const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
      const random = seeded(31);
      const water = mesh(new T.PlaneGeometry(520, 520), mat('#2f7f9a'), group, 0, -4.5, 0);
      water.rotation.x = -Math.PI / 2; water.userData.animated = true;
      // Pilings under the deck edge.
      for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; cylinder(group, .32, .36, 4.6, '#4a3424', Math.sin(a) * (radius + .4), -2.5, Math.cos(a) * (radius + .4), 8); }
      // Boardwalk around the pit, with bollards on the edge.
      annulus(T, group, mesh, mat, radius + 3.5, radius + 15, -.9, '#9c6b43');
      annulus(T, group, mesh, mat, radius + 3.3, radius + 3.6, -.85, '#ffe2a8');
      for (let i = 0; i < 24; i++) {
        const a = (i + .5) / 24 * Math.PI * 2, r = radius + 4.2;
        cylinder(group, .3, .36, .9, '#2c2f3a', Math.sin(a) * r, -.45, Math.cos(a) * r, 10);
        cylinder(group, .4, .4, .12, '#2c2f3a', Math.sin(a) * r, .05, Math.cos(a) * r, 10);
      }
      for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; cylinder(group, .3, .36, 4, '#4a3424', Math.sin(a) * (radius + 15), -2.8, Math.cos(a) * (radius + 15), 8); }
      // Low container stacks (two high max) stay under the chase camera's sightline.
      const containerColors = ['#d2553f', '#2f6f9f', '#e0a33a', '#3f8f5f', '#8a4fa0', '#e9e4d8'];
      for (let i = 0; i < 18; i++) {
        if (i % 3 === 2) continue;
        const a = i / 18 * Math.PI * 2 + .12, r = radius + 10 + random() * 3;
        const stack = 1 + Math.floor(random() * 2);
        for (let k = 0; k < stack; k++) {
          const c = box(group, [6, 2.5, 2.4], containerColors[Math.floor(random() * containerColors.length)], Math.sin(a) * r, .35 + k * 2.55, Math.cos(a) * r);
          c.rotation.y = a + Math.PI / 2 + (random() - .5) * .2;
        }
      }
      // Quay with cranes and a warehouse on one side of the harbor.
      box(group, [90, 2, 26], '#7b7f86', 0, -1.4, -75);
      for (const x of [-22, 18]) {
        for (const dx of [-3, 3]) for (const dz of [-3, 3]) box(group, [.6, 18, .6], '#e0a33a', x + dx, 8.6, -72 + dz);
        box(group, [7, 1.2, 7], '#e0a33a', x, 18, -72);
        box(group, [1.2, 1.2, 36], '#e0a33a', x, 19.5, -60);
        box(group, [3, 3, 3], '#3a3f4a', x, 21, -73);
        mesh(new T.SphereGeometry(.4, 8, 6), glow('#ff4433'), group, x, 20.4, -42);
        cylinder(group, .05, .05, 9, '#2c2f3a', x, 15, -46, 4);
        box(group, [2.4, .6, 1.4], '#3a3f4a', x, 10.5, -46);
      }
      box(group, [34, 12, 14], '#b5553f', 0, 5.6, -84);
      box(group, [35, .8, 15], '#7a3a2a', 0, 12, -84);
      sign(T, group, mesh, 'DOCA DO PORTO', 'ARMAZÉM 7  •  O CAIS VAI CEDER', 26, 0, 8, -76.9, 0, ['#2b2f3a', '#ffd39a', '#fff3dc', '#7fd3e8']);
      // Lighthouse on a rocky islet.
      mesh(new T.IcosahedronGeometry(7, 0), mat('#5a5560'), group, 70, -5, 52);
      for (let k = 0; k < 6; k++) cylinder(group, 2.2 - k * .2, 2.4 - k * .2, 3, k % 2 ? '#f4efe6' : '#d0473a', 70, 1 + k * 3, 52, 16);
      mesh(new T.SphereGeometry(1.1, 12, 8), glow('#fff1a8'), group, 70, 19.6, 52);
      cylinder(group, 1.5, 1.5, .4, '#2c2f3a', 70, 18.7, 52, 16);
      mesh(new T.ConeGeometry(1.6, 1.6, 16), mat('#2c2f3a'), group, 70, 21.2, 52);
      // Boats and buoys scattered on the water.
      for (let i = 0; i < 7; i++) {
        const a = 1.9 + i * .55 + random() * .2, r = 52 + random() * 40, x = Math.sin(a) * r, z = Math.cos(a) * r, heading = random() * Math.PI;
        const hull = box(group, [3, 1.4, 8], ['#f4efe6', '#d2553f', '#2f6f9f'][i % 3], x, -3.9, z); hull.rotation.y = heading;
        const cabin = box(group, [2.2, 1.6, 2.8], '#f4efe6', x + Math.sin(heading) * -1, -2.4, z + Math.cos(heading) * -1); cabin.rotation.y = heading;
        cylinder(group, .08, .08, 6, '#5a4a3a', x + Math.sin(heading) * 1.5, .2, z + Math.cos(heading) * 1.5, 4);
      }
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + .2, r = radius + 22 + random() * 8;
        cylinder(group, .5, .6, 1.2, i % 2 ? '#d0473a' : '#f4efe6', Math.sin(a) * r, -4, Math.cos(a) * r, 10);
        mesh(new T.SphereGeometry(.18, 6, 4), glow('#ffcf6b'), group, Math.sin(a) * r, -3.2, Math.cos(a) * r);
      }
      // String lights over the boardwalk, low enough to frame the arena.
      for (let i = 0; i < 72; i++) {
        const a = i / 72 * Math.PI * 2, r = radius + 7.5;
        mesh(new T.SphereGeometry(.13, 6, 4), glow(['#ffcf6b', '#ff8f6b', '#fff3c4'][i % 3]), group, Math.sin(a) * r, 3.6 - Math.abs(Math.sin(i * Math.PI / 6)) * .6, Math.cos(a) * r);
      }
      group.userData.update = (dt, time) => { water.position.y = -4.5 + Math.sin(time * .8) * .12; water.updateMatrix(); };
      return group;
    }
  };

  root.BumperMaps = { list: [parque, gelo, neon, doca], byId: { parque, gelo, neon, doca } };
})(globalThis);
