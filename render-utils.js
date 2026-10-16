/* Small buildless rendering helpers. No gameplay state or dependencies beyond Three.js. */
globalThis.BumperRender = {
  // Interpolate only visual state; authoritative physics remains fixed-step.
  pose(previous, current, alpha, out) {
    for (const key of ['x', 'y', 'z']) out[key] = previous[key] + (current[key] - previous[key]) * alpha;
    const turn = Math.atan2(Math.sin(current.angle - previous.angle), Math.cos(current.angle - previous.angle));
    out.angle = previous.angle + turn * alpha;
    return out;
  },
  // Bake child transforms and colors once; hundreds of props become a few draws.
  // Camera blockers and animated props remain independent so they can still be changed.
  batch(T, group) {
    const buckets = new Map();
    for (const child of [...group.children]) {
      if (!child.isMesh || child.userData.cameraObstacle || child.userData.animated || Array.isArray(child.material) || child.material.map) continue;
      const source = child.material, glowing = source.emissive && source.emissive.getHex() !== 0;
      const key = `${source.side}:${glowing ? 1 : 0}`;
      if (!buckets.has(key)) buckets.set(key, { meshes: [], side: source.side, glowing });
      buckets.get(key).meshes.push(child);
    }
    for (const bucket of buckets.values()) {
      const positions = [], normals = [], colors = [];
      let original = false;
      for (const child of bucket.meshes) {
        child.updateMatrix();
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.applyMatrix4(child.matrix);
        const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), color = child.material.color;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i), p.getY(i), p.getZ(i));
          normals.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
          colors.push(color.r, color.g, color.b);
        }
        original ||= Boolean(child.userData.original);
        geometry.dispose(); child.geometry.dispose(); group.remove(child);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      const Material = bucket.glowing ? T.MeshBasicMaterial : T.MeshLambertMaterial;
      const material = new Material({ vertexColors: true, side: bucket.side });
      const combined = new T.Mesh(geometry, material); combined.userData.ownedMaterial = material;
      if (original) combined.userData.original = material;
      group.add(combined);
    }
  },
  particles(T, scene, capacity = 128) {
    const slots = Array.from({ length: capacity }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1 }));
    const positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 3);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('color', new T.BufferAttribute(colors, 3).setUsage(T.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const points = new T.Points(geometry, new T.PointsMaterial({ size: .16, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    points.frustumCulled = false; scene.add(points);
    const tint = new T.Color(); let cursor = 0;
    return {
      clear() { for (const p of slots) p.life = 0; geometry.setDrawRange(0, 0); },
      emit(x, z, count, color, y, electric) {
        tint.set(color);
        for (let i = 0; i < count; i++) {
          const p = slots[cursor]; cursor = (cursor + 1) % capacity;
          const a = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 5;
          Object.assign(p, { x, y, z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, vy: electric ? -1 - Math.random() * 2 : 2 + Math.random() * 5, life: electric ? .2 + Math.random() * .2 : .4 + Math.random() * .4, r: tint.r, g: tint.g, b: tint.b });
        }
      },
      update(dt) {
        let active = 0;
        for (const p of slots) {
          if (p.life <= 0) continue;
          p.life -= dt; if (p.life <= 0) continue;
          p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const i = active++ * 3, fade = Math.min(1, p.life * 6);
          positions[i] = p.x; positions[i + 1] = p.y; positions[i + 2] = p.z;
          colors[i] = p.r * fade; colors[i + 1] = p.g * fade; colors[i + 2] = p.b * fade;
        }
        geometry.setDrawRange(0, active); geometry.attributes.position.needsUpdate = true; geometry.attributes.color.needsUpdate = true;
      }
    };
  }
};
