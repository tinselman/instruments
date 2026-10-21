/* plate.js — what every live drawing shares: the plug-ins' plate style on a canvas.
 *
 * A small stand-in for the JUCE drawing the plug-ins use (PlateDraw.h in BREATH AND
 * BOW): white hairlines on black, greys for the lit surfaces, red only for what you
 * can drag, Menlo words; and the three-quarter camera every instrument is seen
 * through. The instruments' own files (strings.js ...) are ports of the plug-ins'
 * drawing code and call these as the C++ calls its own.
 */
(function () {
  'use strict';
  const kPi = Math.PI, kTwoPi = 2 * Math.PI;
  const TXT = 13.0;
  const HOT = '255,45,32';

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
  const smooth01 = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  // ---- vectors in an instrument's own space: x along it, y across (away from the viewer), z up
  const V = (x, y, z) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const normalised = a => { const l = Math.sqrt(dot(a, a)); return l > 1e-12 ? mul(a, 1 / l) : V(0, 0, 1); };

  /* The camera: turned by yaw about the vertical, then looked down on by pitch; orthographic. */
  class View3 {
    constructor() { this.yaw = -0.28; this.pitch = 0.62; this.scale = 1; this.ox = 500; this.oy = 280; }
    toCamera(p) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const xr = p.x * cy - p.y * sy, yr = p.x * sy + p.y * cy;
      return V(xr, yr * sp + p.z * cp, -yr * cp + p.z * sp);
    }
    P(p) { const c = this.toCamera(p); return { x: this.ox + c.x * this.scale, y: this.oy - c.y * this.scale }; }
    depth(p) { return this.toCamera(p).z; }
    facing(n) { return this.toCamera(n).z > 0; }
  }
  /* toward the viewer, in the instrument's own coordinates */
  const viewDir = v => {
    const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw), sp = Math.sin(v.pitch), cp = Math.cos(v.pitch);
    return V(-sy * cp, -cy * cp, sp);
  };
  const lightDir = normalised(V(-0.55, -0.35, 0.75));
  const shade = n => 0.25 + 0.75 * Math.max(0, dot(normalised(n), lightDir));

  // ---- the graphics: a canvas context in the 1000-wide design space
  const grey = (level, a = 1) => { const c = Math.round(clamp01(level) * 255); return `rgba(${c},${c},${c},${clamp01(a)})`; };
  const ink = a => `rgba(255,255,255,${clamp01(a)})`;

  function pathPts(pts, close) {
    const p = new Path2D();
    pts.forEach((s, i) => i ? p.lineTo(s.x, s.y) : p.moveTo(s.x, s.y));
    if (close && pts.length) p.closePath();
    return p;
  }
  const path3 = (v, pts, close) => pathPts(pts.map(q => v.P(q)), close);
  const quad3 = (v, a, b, c, d) => pathPts([v.P(a), v.P(b), v.P(c), v.P(d)], true);

  function strokeLine(g, x1, y1, x2, y2, w, alpha) {         // JUCE drawLine: butt ends
    g.lineCap = 'butt'; g.lineWidth = w; g.strokeStyle = ink(alpha);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function strokePath(g, p, w, alpha) {                       // curved joints, rounded ends
    g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = w; g.strokeStyle = ink(alpha);
    g.stroke(p);
  }
  function strokePlain(g, p, w, style) {                      // PathStrokeType (w): mitred, butt
    g.lineJoin = 'miter'; g.lineCap = 'butt'; g.lineWidth = w; g.strokeStyle = style;
    g.stroke(p);
  }
  const fillGrey = (g, p, level, alpha = 1) => { g.fillStyle = grey(level, alpha); g.fill(p); };
  const fillInk = (g, p, alpha) => { g.fillStyle = ink(alpha); g.fill(p); };
  function fillGradient(g, p, a, ca, b, cb) {
    const gr = g.createLinearGradient(a.x, a.y, b.x, b.y);
    gr.addColorStop(0, ca); gr.addColorStop(1, cb);
    g.fillStyle = gr; g.fill(p);
  }
  const line3 = (g, v, a, b, w, alpha) => { const p = v.P(a), q = v.P(b); strokeLine(g, p.x, p.y, q.x, q.y, w, alpha); };
  const strokeV = (g, v, pts, w, alpha, close) => strokePath(g, path3(v, pts, close), w, alpha);

  /* a disc lying in a plane: centre, two in-plane axes */
  function disc(c, a, b, n = 16) {
    const out = [];
    for (let q = 0; q < n; ++q) { const t = kTwoPi * q / n; out.push(add(add(c, mul(a, Math.cos(t))), mul(b, Math.sin(t)))); }
    return out;
  }

  /* a line of changing width, as a filled outline (a bow's stick, an endpin) */
  function taperedStroke(g, pts, w0, w1, level, haloPx) {
    const N = pts.length;
    if (N < 2) return;
    const lft = [], rgt = [];
    for (let q = 0; q < N; ++q) {
      const a = pts[q === 0 ? 0 : q - 1], b = pts[q + 1 < N ? q + 1 : N - 1];
      let tx = b.x - a.x, ty = b.y - a.y;
      const l = Math.max(1e-9, Math.hypot(tx, ty));
      tx /= l; ty /= l;
      const w = 0.5 * lerp(w0, w1, q / (N - 1));
      lft.push({ x: pts[q].x - ty * w, y: pts[q].y + tx * w });
      rgt.push({ x: pts[q].x + ty * w, y: pts[q].y - tx * w });
    }
    const p = pathPts(lft.concat(rgt.reverse()), true);
    if (haloPx > 0) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = haloPx; g.strokeStyle = '#000'; g.stroke(p); }
    g.fillStyle = ink(level); g.fill(p);
  }

  // ---- words, placed as plate::label places them
  const FONT = 'Menlo, "SF Mono", Monaco, Consolas, "DejaVu Sans Mono", monospace';
  function text(g, x, y, s, size, style, j) {
    g.font = `${size}px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = j === 'left' ? 'left' : j === 'right' ? 'right' : 'center';
    g.fillStyle = style;
    g.fillText(s, x, y - 0.05 * size);
  }
  const label = (g, x, y, s, size = TXT, alpha = 0.34, j = 'centre') => text(g, x, y, s, size, ink(alpha), j);
  /* a black halo round a word: the lines it crosses stop short of it */
  function halo(g, x, y, s, size = TXT, j = 'left', r = 1.5) {
    const ring = [[1, 0], [-1, 0], [0.5, 0.87], [-0.5, 0.87], [0.5, -0.87], [-0.5, -0.87]];
    for (const o of ring) text(g, x + o[0] * r, y + o[1] * r, s, size, '#000', j);
  }
  const word = (g, x, y, s, size, alpha, j) => { halo(g, x, y, s, size, j); label(g, x, y, s, size, alpha, j); };

  /* a red grip, as Plate::drawGrips draws it */
  function grip(g, x, y, name) {
    const r = 5.6;
    g.fillStyle = `rgb(${HOT})`;
    g.beginPath(); g.arc(x, y, r, 0, kTwoPi); g.fill();
    if (name) label(g, x + 12, y, name, TXT - 1, 0.42, 'left');
  }

  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = m => NOTE[((m % 12) + 12) % 12];
  const noteText = m => noteName(m) + (Math.floor(m / 12) - 1);
  /* a voice's loudness as the drawing wants it: 0 silent .. 1 loud, on a dB scale */
  const visLevel = level => clamp01((20 * Math.log10(Math.max(1e-7, level)) + 62) / 44);

  /* point in a polygon of screen points */
  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }

  window.Plate = {
    kPi, kTwoPi, TXT, lerp, clamp01, smooth01, V, add, sub, mul, dot, cross, normalised, View3, viewDir, shade,
    grey, ink, pathPts, path3, quad3, strokeLine, strokePath, strokePlain, fillGrey, fillInk, fillGradient,
    line3, strokeV, disc, taperedStroke, label, halo, word, grip, noteName, noteText, visLevel, inside,
  };
})();
