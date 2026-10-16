/* Painted arena floors: one canvas per map, mapped in world space across every
   collapsing zone so markings line up and break apart as the floor falls.
   Maps without a painter keep their flat tile colors (the dock planks look good as-is). */
(function (root) {
  'use strict';
  function seeded(n) { return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }
  // Canvas space: x right = world +x, y down = world +z; angle a follows atan2(x, z).
  function context(cfg, size) {
    const half = cfg.radius + .5, s = size / (half * 2), c = size / 2;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const P = {
      ctx, size, s, c, half, cfg, random: seeded(17),
      x: x => c + x * s, y: z => c + z * s, len: v => v * s,
      polar: (a, r) => [c + Math.sin(a) * r * s, c + Math.cos(a) * r * s],
      circle(r, fill, stroke, width) {
        ctx.beginPath(); ctx.arc(c, c, r * s, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width * s; ctx.stroke(); }
      },
      band(inner, outer, a0, a1, fill) {
        ctx.beginPath(); ctx.arc(c, c, outer * s, Math.PI / 2 - a0, Math.PI / 2 - a1, true); ctx.arc(c, c, inner * s, Math.PI / 2 - a1, Math.PI / 2 - a0, false);
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      },
      // Ring radii between collapsing zones, so players can read what falls next.
      ringEdges() { return Array.from({ length: cfg.phases - 1 }, (_, i) => cfg.radius - (i + 1) * cfg.ringWidth); },
      text(value, x, z, sizeUnits, color, glow) {
        ctx.save(); ctx.font = `900 ${sizeUnits * s}px "Barlow Condensed", Impact, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = sizeUnits * s * .35; }
        ctx.fillStyle = color; ctx.fillText(value, P.x(x), P.y(z)); ctx.restore();
      }
    };
    return P;
  }
  function scuffs(P, count, color, width) {
    const { ctx, random } = P;
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const r = P.cfg.islandRadius + random() * (P.cfg.radius - P.cfg.islandRadius), a = random() * Math.PI * 2, span = .2 + random() * .6;
      ctx.lineWidth = width * (.5 + random()) * P.s; ctx.beginPath(); ctx.arc(P.c, P.c, r * P.s, a, a + span); ctx.stroke();
    }
  }
  const painters = {
    parque(P) {
      const { ctx, size, cfg } = P;
      const base = ctx.createRadialGradient(P.c, P.c, 0, P.c, P.c, size / 2);
      base.addColorStop(0, '#8a9ca0'); base.addColorStop(1, '#5d6f74'); ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
      // Diamond-plate steel from a tiny tiled pattern.
      const tile = document.createElement('canvas'); tile.width = tile.height = 28; const t = tile.getContext('2d');
      const bump = (x, y, rot) => { t.save(); t.translate(x, y); t.rotate(rot); t.fillStyle = '#ffffff30'; t.fillRect(-5, -1.3, 10, 2.6); t.fillStyle = '#00000030'; t.fillRect(-5, 1.3, 10, 1.2); t.restore(); };
      bump(7, 7, Math.PI / 4); bump(21, 21, Math.PI / 4); bump(21, 7, -Math.PI / 4); bump(7, 21, -Math.PI / 4);
      ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, size, size);
      for (let i = 1; i < cfg.phases; i += 2) P.band(cfg.radius - (i + 1) * cfg.ringWidth, cfg.radius - i * cfg.ringWidth, 0, Math.PI * 2 - 1e-4, '#1b2b3a22');
      scuffs(P, 70, '#1a222a40', .22);
      // Hazard band on the outer ring.
      const inner = cfg.radius - cfg.ringWidth, outer = cfg.radius;
      for (let i = 0; i < 48; i++) P.band(inner, outer, i / 48 * Math.PI * 2, (i + 1) / 48 * Math.PI * 2, i % 2 ? '#f2c14e' : '#262c34');
      P.circle(outer - .08, null, '#fff3cf', .16); P.circle(inner + .06, null, '#fff3cf', .12);
      ctx.setLineDash([.9 * P.s, .6 * P.s]);
      for (const r of P.ringEdges().slice(1)) P.circle(r, null, '#eef6f6cc', .12);
      ctx.setLineDash([]);
      ctx.fillStyle = '#2a3438aa';
      for (const r of P.ringEdges()) for (let i = 0; i < 64; i++) { const [x, y] = P.polar(i / 64 * Math.PI * 2, r - .35); ctx.beginPath(); ctx.arc(x, y, .09 * P.s, 0, 7); ctx.fill(); }
      // Center medallion.
      P.circle(cfg.islandRadius, '#5d7477'); P.circle(cfg.islandRadius - .25, null, '#cfbdf0', .14); P.circle(cfg.islandRadius * .62, '#ffffff14', '#cfbdf0', .1);
      P.text('BATE', 0, -.75, 1.7, '#f6edd6'); P.text('BATE', 0, .9, 1.7, '#dfff72');
    },
    gelo(P) {
      const { ctx, size, cfg, random } = P;
      const base = ctx.createRadialGradient(P.c, P.c, 0, P.c, P.c, size / 2);
      base.addColorStop(0, '#f4fbff'); base.addColorStop(1, '#d3e6f2'); ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
      // Hockey markings frozen under the surface.
      ctx.globalAlpha = .75;
      ctx.fillStyle = '#d8394a'; ctx.fillRect(P.x(-.25), 0, P.len(.5), size);
      ctx.fillStyle = '#2f6fd6'; for (const z of [-10.5, 10.5]) ctx.fillRect(0, P.y(z - .3), size, P.len(.6));
      for (const [x, z] of [[-9, -15], [9, -15], [-9, 15], [9, 15]]) {
        ctx.beginPath(); ctx.arc(P.x(x), P.y(z), P.len(3), 0, 7); ctx.strokeStyle = '#d8394a'; ctx.lineWidth = P.len(.16); ctx.stroke();
        ctx.beginPath(); ctx.arc(P.x(x), P.y(z), P.len(.35), 0, 7); ctx.fillStyle = '#d8394a'; ctx.fill();
      }
      ctx.globalAlpha = 1;
      P.circle(cfg.islandRadius, '#e9f5fc', '#2f6fd6', .18); P.circle(.5, '#2f6fd6');
      // Skate scratches catch the light.
      ctx.lineCap = 'round';
      for (let i = 0; i < 1400; i++) {
        const x = (random() - .5) * cfg.radius * 2, z = (random() - .5) * cfg.radius * 2, a = random() * Math.PI, l = .6 + random() * 2.6;
        ctx.strokeStyle = random() > .4 ? '#ffffffcc' : '#9ab8cc55'; ctx.lineWidth = P.len(.02 + random() * .04);
        ctx.beginPath(); ctx.moveTo(P.x(x), P.y(z));
        ctx.quadraticCurveTo(P.x(x + Math.cos(a) * l * .5), P.y(z + Math.sin(a) * l * .5 + .2), P.x(x + Math.cos(a) * l), P.y(z + Math.sin(a) * l)); ctx.stroke();
      }
      const inner = cfg.radius - cfg.ringWidth, outer = cfg.radius;
      for (let i = 0; i < 40; i++) P.band(inner, outer, i / 40 * Math.PI * 2, (i + 1) / 40 * Math.PI * 2, i % 2 ? '#f4f8fbdd' : '#c43a4add');
      for (const r of P.ringEdges().slice(1)) P.circle(r, null, '#7fb0e0aa', .08);
      P.text('RINQUE', 0, 0, 1.5, '#2f6fd6');
    },
    neon(P) {
      const { ctx, size, cfg } = P;
      // Deep glossy black with a soft purple bloom toward the middle.
      const base = ctx.createRadialGradient(P.c, P.c, 0, P.c, P.c, size / 2);
      base.addColorStop(0, '#22144a'); base.addColorStop(.55, '#100b26'); base.addColorStop(1, '#08070f'); ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
      // Fine cyan grid, brighter every fourth line.
      for (let v = -cfg.radius; v <= cfg.radius; v += 1) {
        const major = Math.round(v) % 4 === 0;
        ctx.strokeStyle = major ? '#47f2ff60' : '#47f2ff1e'; ctx.lineWidth = P.len(major ? .06 : .03);
        ctx.beginPath(); ctx.moveTo(P.x(v), 0); ctx.lineTo(P.x(v), size); ctx.moveTo(0, P.y(v)); ctx.lineTo(size, P.y(v)); ctx.stroke();
      }
      // Thin glowing tubes on each collapse boundary.
      ctx.save(); ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = P.len(.6);
      for (const r of P.ringEdges().slice(1)) P.circle(r + .02, null, '#ff6fc0', .1);
      ctx.restore();
      // Outer band: dark with cyan chevrons pointing along the spin.
      const inner = cfg.radius - cfg.ringWidth, outer = cfg.radius, mid = (inner + outer) / 2;
      P.band(inner, outer, 0, Math.PI * 2 - 1e-4, '#0a0718');
      ctx.save(); ctx.shadowColor = '#47f2ff'; ctx.shadowBlur = P.len(.4); ctx.strokeStyle = '#47f2ffcc'; ctx.lineWidth = P.len(.14); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (let i = 0; i < 36; i++) {
        const a = i / 36 * Math.PI * 2, d = .9 / mid;
        const [x0, y0] = P.polar(a + d, inner + .7), [x1, y1] = P.polar(a, mid), [x2, y2] = P.polar(a + d, outer - .7);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.restore();
      ctx.save(); ctx.shadowColor = '#ff3fa4'; ctx.shadowBlur = P.len(.8);
      P.circle(outer - .1, null, '#ff3fa4', .16); P.circle(inner, null, '#ff3fa4aa', .08);
      ctx.restore();
      // Center: glowing logo disc.
      P.circle(cfg.islandRadius, '#160d33');
      ctx.save(); ctx.shadowColor = '#47f2ff'; ctx.shadowBlur = P.len(.6);
      P.circle(cfg.islandRadius - .3, null, '#47f2ff', .12); P.circle(cfg.islandRadius * .55, null, '#47f2ff66', .06);
      ctx.restore();
      P.text('NEON', 0, 0, 2.2, '#ffd6f0', '#ff3fa4');
    }
  };
  const cache = new Map();
  // Returns { canvas, half } for a painted map, or null to keep flat tile colors.
  function paint(id, cfg, size = 2048) {
    if (!painters[id]) return null;
    const key = `${id}:${size}`;
    if (!cache.has(key)) { const P = context(cfg, size); painters[id](P); cache.set(key, { canvas: P.ctx.canvas, half: P.half }); }
    return cache.get(key);
  }
  root.BumperFloors = { paint };
})(globalThis);
