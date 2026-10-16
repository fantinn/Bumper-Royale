/* Static scenery only. The arena and simulation remain independent of this map. */
globalThis.BumperPavilion = {
  ceilingHeight: 8.8,
  build(T, scene, helpers, radius) {
    const { mesh, box, cylinder, mat } = helpers;
    const group = new T.Group(); scene.add(group);
    const edge = radius + 6, height = this.ceilingHeight;
    const glow = color => mat(color, { emissive: color, emissiveIntensity: 2 });
    function beam(a, b, width, color) {
      const start = new T.Vector3(...a), end = new T.Vector3(...b);
      const rod = mesh(new T.CylinderGeometry(width, width, start.distanceTo(end), 6), mat(color), group);
      rod.position.copy(start).add(end).multiplyScalar(.5);
      rod.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.sub(start).normalize());
    }
    function sign(text, subtitle, width, x, y, z, rotation = 0) {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#172a38'; ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#ffcc70'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, 1000, 232);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff0bd'; ctx.font = '900 95px Arial'; ctx.fillText(text, 512, 128);
      ctx.fillStyle = '#70e2db'; ctx.font = 'bold 31px Arial'; ctx.fillText(subtitle, 512, 198);
      const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
      const board = mesh(new T.PlaneGeometry(width, width / 4), new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide }), group, x, y, z);
      board.rotation.y = rotation;
    }
    // A recessed maintenance pit keeps the battle-royale falling rule readable indoors.
    box(group, [edge * 2 + 12, .6, edge * 2 + 12], '#1b2430', 0, -9, 0);
    for (const side of [-1, 1]) {
      box(group, [6, 1, edge * 2], '#7d6d65', side * (edge - 1), -1.3, 0);
      box(group, [edge * 2 - 6, 1, 6], '#7d6d65', 0, -1.3, side * (edge - 1));
      box(group, [.6, 3, edge * 2], '#24585b', side * edge, .4, 0);
      box(group, [edge * 2, 3, .6], '#24585b', 0, .4, side * edge);
      box(group, [.65, .22, edge * 2], '#efbd70', side * edge, 1.9, 0);
      box(group, [edge * 2, .22, .65], '#efbd70', 0, 1.9, side * edge);
      for (let p = -edge; p <= edge; p += edge / 3) {
        for (const [x, z] of [[p, side * edge], [side * edge, p]]) {
          const post = cylinder(group, .22, .28, height + 1.5, '#c4624d', x, height / 2 - .6, z, 8);
          post.userData.cameraObstacle = true;
          cylinder(group, .42, .42, .5, '#ebc17a', x, -.4, z, 8);
        }
      }
      for (let p = -edge + 2; p < edge; p += 2) {
        const color = ['#ffb765', '#66ded3', '#ff7b91'][Math.floor((p + edge) / 2) % 3];
        for (const [x, z] of [[p, side * (edge - .4)], [side * (edge - .4), p]]) {
          const bulb = mesh(new T.SphereGeometry(.16, 8, 6), glow(color), group, x, 6.5, z); bulb.castShadow = false;
        }
      }
    }
    // The conductive mesh is visible from below; no opaque roof blocks the camera.
    const ceiling = mesh(new T.PlaneGeometry(edge * 2, edge * 2), mat('#394b55', { metalness: .7, roughness: .46 }), group, 0, height + .12, 0);
    ceiling.rotation.x = Math.PI / 2; ceiling.castShadow = false;
    const grid = [];
    for (let p = -edge; p <= edge; p += 1) {
      grid.push(-edge, height, p, edge, height, p, p, height, -edge, p, height, edge);
    }
    const gridGeometry = new T.BufferGeometry(); gridGeometry.setAttribute('position', new T.Float32BufferAttribute(grid, 3));
    const gridLines = new T.LineSegments(gridGeometry, new T.LineBasicMaterial({ color: '#839395', transparent: true, opacity: .55 }));
    gridLines.userData.ownedMaterial = gridLines.material; group.add(gridLines);
    for (let z = -edge; z <= edge; z += edge / 3) {
      box(group, [edge * 2, .18, .18], '#a16b52', 0, height + .25, z);
      for (let x = -edge; x < edge; x += 6) beam([x, height + .25, z], [Math.min(edge, x + 3), height + 1.3, z], .06, '#c08b61');
    }
    for (const x of [-18, 0, 18]) for (const z of [-18, 0, 18]) {
      const lamp = mesh(new T.BoxGeometry(4, .09, .22), glow('#fff0bc'), group, x, height - .15, z); lamp.castShadow = false;
    }
    // Colored bulbs are baked into an unlit batch; no per-pixel point lights.
    sign('BATE BATE', 'PARQUE DO BAIRRO  •  SÓ SOBRA UM', 19, 0, 5.1, -edge + .4);
    sign('SEGURE FIRME!', 'ACELERE  •  EMPURRE  •  SOBREVIVA', 13, -edge + .4, 4.5, 0, Math.PI / 2);
    sign('ÚLTIMA RODADA', 'O PISO VAI CEDER!', 13, edge - .4, 4.5, 0, -Math.PI / 2);
    // Small ticket booth, benches and onlookers around the perimeter.
    box(group, [5, 3.8, 3], '#c75d50', 20, 1.1, -edge + 2);
    box(group, [5.5, .35, 3.5], '#efd19a', 20, 3.15, -edge + 2);
    box(group, [3.9, 1.6, .1], '#223446', 20, 1.6, -edge + 3.55);
    box(group, [4.3, .18, .7], '#efc385', 20, .7, -edge + 3.7);
    sign('FICHAS', 'UMA BATIDA DE CADA VEZ', 4, 20, 3.7, -edge + 3.8);
    for (const x of [-18, -9, 9]) {
      box(group, [4, .25, 1], '#d39159', x, -.05, -edge + 2);
      box(group, [4, .9, .16], '#d39159', x, .5, -edge + 1.55);
      for (const dx of [-1.5, 1.5]) box(group, [.18, .75, .8], '#293942', x + dx, -.5, -edge + 2);
    }
    const shirts = ['#f4bb67', '#c889b5', '#70c0af', '#739fc6'];
    for (let i = 0; i < 16; i++) {
      const x = i < 8 ? -edge + 2.3 : edge - 2.3, z = -22 + i % 8 * 6;
      cylinder(group, .29, .36, 1, shirts[i % 4], x, .45, z, 6);
      mesh(new T.IcosahedronGeometry(.28, 1), mat(i % 3 ? '#dcaa81' : '#986648'), group, x, 1.24, z);
      for (const dx of [-.16, .16]) box(group, [.2, .7, .25], '#263847', x + dx, -.36, z);
    }
    // Triangular pennants hanging under the eaves.
    for (const z of [-edge + .5, edge - .5]) for (let x = -edge + 1; x < edge - 1; x += 2) {
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute([x, 7.9, z, x + 1.6, 7.9, z, x + .8, 6.9, z], 3)); geometry.computeVertexNormals();
      mesh(geometry, mat(shirts[Math.floor((x + edge) / 2) % 4], { side: T.DoubleSide }), group);
    }
    return group;
  }
};
