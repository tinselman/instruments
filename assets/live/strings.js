/* strings.js — BREATH AND BOW's bowed string, live: a port of PlateString.cpp.
 *
 * The instrument lies on its back, scroll to the left, in the plug-in's three-quarter
 * view, modelled in centimetres from a luthier's measurements of each of BODY's four
 * stops (violin, viola, cello, double bass) and blended in between, so it changes
 * size smoothly as BODY moves. The bow, the fingers and the strings' vibration come
 * from the plug-in's own engine, recorded frame by frame (state.json) and replayed
 * in step with the recordings.
 *
 *   LiveStrings.draw(g, body, frame, dt, clock)   g: a 2D context in design space
 *     frame: { bowPos, bowLift, bowVel, voices: [{ sounding, level, held, slide }] }
 */
(function () {
  'use strict';
  const P = window.Plate;
  const { kPi, kTwoPi, TXT, lerp, clamp01, smooth01, V, add, sub, mul, dot, cross, normalised } = P;
  const { path3, quad3, strokeLine, strokePath, strokePlain, fillGrey, fillGradient, line3, strokeV, disc, taperedStroke,
          label, halo, word, grey, ink } = P;

  // ---- the four stops, in centimetres
  const nBodyL = 0, nRibH = 1, nArch = 2, nStrL = 3, nBrFrac = 4, nBrH = 5, nBrW = 6, nProj = 7, nOvs = 8,
        nFbLen = 9, nFbWn = 10, nFbWe = 11, nFbT = 12, nNutSp = 13, nBrSp = 14, nHead = 15, nScrollR = 16, nPegboxW = 17,
        nTpW = 18, nTpH = 19, nEndpin = 20, nChin = 21, nPpcm = 22, nTaper = 23, nLegArch = 24, nCount = 25;
  const kNum = [
    [35.5, 3.2, 1.6, 32.8, 0.552, 3.3, 4.1, 2.7, 0.6, 27.0, 2.40, 4.2, 0.55, 1.65, 3.4, 10.0, 1.95, 2.4, 3.9, 1.3, 0.0, 1.0, 10.6, 0.00, 0.26],
    [41.0, 3.9, 1.8, 38.0, 0.545, 3.6, 4.5, 2.9, 0.7, 30.5, 2.55, 4.6, 0.60, 1.75, 3.7, 11.5, 2.15, 2.6, 4.3, 1.4, 0.0, 1.0, 9.6, 0.00, 0.27],
    [75.5, 12.0, 2.6, 69.0, 0.532, 9.0, 9.0, 8.0, 2.0, 58.0, 3.10, 6.6, 1.00, 2.30, 5.0, 21.0, 3.70, 4.4, 8.0, 3.2, 12.0, 0.0, 5.9, 0.05, 0.36],
    [111.0, 20.0, 3.0, 105.0, 0.550, 16.0, 14.0, 13.5, 3.0, 88.0, 4.40, 11.0, 1.50, 3.40, 8.5, 31.0, 5.30, 6.6, 12.0, 5.0, 14.0, 0.0, 4.6, 0.42, 0.42],
  ];
  // the plan of each body: half the outline, (along, across) in body lengths, and how sharp a corner
  const kOutline = [
    [[0.000,0.000,0],[0.012,0.085,0],[0.045,0.160,0],[0.105,0.215,0],[0.190,0.237,0],[0.270,0.228,0],
     [0.330,0.206,0],[0.366,0.192,0],[0.398,0.197,1],[0.394,0.172,0.4],[0.440,0.158,0],[0.505,0.155,0],
     [0.565,0.162,0],[0.600,0.186,0.4],[0.606,0.213,1],[0.640,0.228,0],[0.700,0.262,0],[0.785,0.287,0],
     [0.870,0.272,0],[0.935,0.215,0],[0.978,0.125,0],[1.000,0.000,0]],
    [[0.000,0.000,0],[0.012,0.088,0],[0.045,0.166,0],[0.105,0.222,0],[0.190,0.245,0],[0.270,0.236,0],
     [0.330,0.214,0],[0.366,0.200,0],[0.398,0.205,1],[0.394,0.180,0.4],[0.440,0.166,0],[0.505,0.163,0],
     [0.565,0.170,0],[0.600,0.194,0.4],[0.606,0.222,1],[0.640,0.238,0],[0.700,0.273,0],[0.785,0.298,0],
     [0.870,0.283,0],[0.935,0.224,0],[0.978,0.130,0],[1.000,0.000,0]],
    [[0.000,0.000,0],[0.010,0.070,0],[0.040,0.140,0],[0.100,0.200,0],[0.185,0.228,0],[0.255,0.222,0],
     [0.310,0.203,0],[0.345,0.190,0],[0.375,0.193,0.9],[0.372,0.170,0.35],[0.425,0.157,0],[0.500,0.154,0],
     [0.570,0.160,0],[0.620,0.183,0.35],[0.628,0.207,0.9],[0.660,0.224,0],[0.715,0.260,0],[0.795,0.290,0],
     [0.875,0.276,0],[0.937,0.218,0],[0.978,0.127,0],[1.000,0.000,0]],
    [[0.000,0.000,0],[0.000,0.050,0.9],[0.055,0.090,0.3],[0.125,0.142,0.3],[0.200,0.196,0],[0.280,0.229,0],
     [0.345,0.225,0],[0.385,0.208,0],[0.414,0.193,0],[0.438,0.182,0],[0.470,0.174,0],[0.515,0.171,0],
     [0.560,0.176,0],[0.592,0.188,0],[0.620,0.205,0],[0.652,0.228,0],[0.710,0.270,0],[0.800,0.306,0],
     [0.880,0.292,0],[0.942,0.235,0],[0.981,0.135,0],[1.000,0.000,0]],
  ];
  const kKeys = 22, kSub = 4;
  const kBowPx = [372.0, 318.0], kContactY = [271.0, 246.0], kLiftPx = 55.0;
  const kHair0 = 0.100, kHair1 = 0.985;
  const stickH = s => 0.029 - 0.017 * Math.pow(Math.sin(kPi * clamp01(s / 0.97)), 1.2);
  const betaFor = x => 0.22 * Math.pow(0.03 / 0.22, clamp01(x));
  const kTuning = [[55, 62, 69, 76], [48, 55, 62, 69], [36, 43, 50, 57], [28, 33, 38, 43]];
  const kStopName = ['VIOLIN', 'VIOLA', 'CELLO', 'BASS'];
  const stopOf = body => Math.min(3, Math.max(0, Math.round(body * 3)));
  const kBreakU = 0.23;
  const longArch = u => Math.pow(Math.max(0, Math.sin(kPi * clamp01(u))), 0.45);

  /* Everything about the instrument that stays still: built once per BODY. */
  class Fiddle {
    wAt(u) { const f = clamp01(u) * 64, i = Math.min(63, Math.floor(f)); return lerp(this.wTab[i], this.wTab[i + 1], f - i); }
    zTop(x, y) {
      const n = this.n, u = (x - this.xRoot) / this.L, w = Math.max(1e-3, this.wAt(u)), r = Math.min(1, Math.abs(y) / w);
      return n[nRibH] + n[nArch] * longArch(u) * Math.pow(1 - r * r, 1.4);
    }
    zBack(u) {
      const soft = 1 - smooth01(u / 0.28), kink = Math.max(0, 1 - u / kBreakU);
      return this.n[nRibH] * this.n[nTaper] * lerp(soft, kink, this.flatBack);
    }
    zFb(x) { return this.zFbRoot + this.fbSlope * (x - this.xRoot); }
    fbHalf(x) { const n = this.n; return 0.5 * lerp(n[nFbWn], n[nFbWe], clamp01((x + this.S) / n[nFbLen])); }
    spread(x) {
      const n = this.n;
      if (x <= 0) return lerp(n[nNutSp], n[nBrSp], clamp01((x + this.S) / this.S));
      return lerp(n[nBrSp], n[nBrSp] * 0.62, clamp01(x / this.xTp0));
    }
    zBridgeTop(y) { const yn = y / (0.43 * this.n[nBrW]); return this.zBrBase + this.n[nBrH] * (1 - 0.08 * yn * yn); }
    onStrings(x, lane) {
      const n = this.n, y = lane / 3 * this.spread(x), yb = lane / 3 * n[nBrSp];
      if (x <= 0) return V(x, y, lerp(this.zNut, this.zBridgeTop(yb), clamp01((x + this.S) / this.S)));
      return V(x, y, lerp(this.zBridgeTop(yb), this.zTp0 + 0.05 * this.k, clamp01(x / this.xTp0)));
    }
    onString(s, x) { return this.onStrings(x, s - 1.5); }
    bodyGripAt() { const u = 0.972, y = 0.80 * this.wAt(u); return V(this.xRoot + u * this.L, y, this.n[nRibH] + 0.02 * this.k); }
    topEdgeZ(x) { return lerp(this.zt0, this.zt1, clamp01((-this.S - x) / Math.max(1e-3, -this.S - this.xJoin))); }
    scroll(phi, y) { const r = this.R0 * Math.exp(-0.125 * phi), a = -0.5 * kPi - phi; return V(this.xs + r * Math.cos(a), y, this.zs + r * Math.sin(a)); }
    scrollHalfW(phi) { return this.pbW * (0.56 - 0.20 * clamp01(phi / (4.6 * kPi))); }
    pegAt(j) {
      const x = -this.S - (0.13 + 0.155 * j) * this.n[nHead];
      const floorZ = lerp(this.zb0, this.zs - this.R0, clamp01((-this.S - x) / (-this.S - this.xs)));
      return V(x, 0, this.topEdgeZ(x) - 0.42 * (this.topEdgeZ(x) - floorZ));
    }
  }

  function buildFiddle(body) {
    const F = new Fiddle();
    F.body = body;
    F.t3 = clamp01(body) * 3;
    const i = Math.min(2, Math.floor(F.t3)), f = F.t3 - i;
    const n = F.n = [];
    for (let j = 0; j < nCount; ++j) n[j] = lerp(kNum[i][j], kNum[i + 1][j], f);
    F.L = n[nBodyL]; F.S = n[nStrL]; F.k = F.L / 35.5;
    F.xRoot = -n[nBrFrac] * F.L; F.xEnd = F.xRoot + F.L;
    F.chin = smooth01(n[nChin]);
    F.endpinOn = smooth01((F.t3 - 1.15) / 0.85);
    F.corner = 1 - smooth01((F.t3 - 2) / 1);
    F.flatBack = smooth01((F.t3 - 2.2) / 0.8);
    F.machine = smooth01((F.t3 - 2.35) / 0.55);
    const toBass = smooth01(F.t3 - 2);
    F.bowPx = lerp(kBowPx[0], kBowPx[1], toBass);
    F.open = kTuning[stopOf(body)];

    // ---- the outline
    const keys = [];
    for (let j = 0; j < kKeys; ++j)
      keys.push({ u: lerp(kOutline[i][j][0], kOutline[i + 1][j][0], f), w: lerp(kOutline[i][j][1], kOutline[i + 1][j][1], f),
                  sharp: lerp(kOutline[i][j][2], kOutline[i + 1][j][2], f) });
    const ring = [];
    for (let j = 0; j < kKeys; ++j) ring.push({ u: keys[j].u, w: -keys[j].w, sharp: keys[j].sharp });
    for (let j = kKeys - 2; j >= 1; --j) ring.push({ u: keys[j].u, w: keys[j].w, sharp: keys[j].sharp });
    const M = ring.length, at = q => ring[((q % M) + M) % M];
    F.edge = []; F.edgeU = []; F.nrm = [];
    for (let q = 0; q < M; ++q) {
      const p0 = at(q), p1 = at(q + 1), pm = at(q - 1), p2 = at(q + 2);
      const t0u = (1 - p0.sharp) * 0.5 * (p1.u - pm.u), t0w = (1 - p0.sharp) * 0.5 * (p1.w - pm.w);
      const t1u = (1 - p1.sharp) * 0.5 * (p2.u - p0.u), t1w = (1 - p1.sharp) * 0.5 * (p2.w - p0.w);
      for (let s = 0; s < kSub; ++s) {
        const t = s / kSub, tt = t * t, ttt = tt * t;
        const h00 = 2 * ttt - 3 * tt + 1, h10 = ttt - 2 * tt + t, h01 = -2 * ttt + 3 * tt, h11 = ttt - tt;
        const u = h00 * p0.u + h10 * t0u + h01 * p1.u + h11 * t1u, w = h00 * p0.w + h10 * t0w + h01 * p1.w + h11 * t1w;
        F.edgeU.push(u);
        F.edge.push(V(F.xRoot + u * F.L, w * F.L, n[nRibH]));
      }
    }
    const E = F.edge.length;
    for (let q = 0; q < E; ++q) {
      const a = F.edge[(q + E - 1) % E], b = F.edge[(q + 1) % E];
      const tx = b.x - a.x, ty = b.y - a.y, l = Math.max(1e-9, Math.hypot(tx, ty));
      F.nrm.push(V(ty / l, -tx / l, 0));
    }
    // half-width along the body, for the arching
    F.wTab = new Array(65).fill(0);
    for (let q = 0; q + 1 < E; ++q) {
      const u0 = F.edgeU[q], u1 = F.edgeU[q + 1], w0 = Math.abs(F.edge[q].y), w1 = Math.abs(F.edge[q + 1].y);
      const b0 = Math.ceil(Math.min(u0, u1) * 64), b1 = Math.floor(Math.max(u0, u1) * 64);
      for (let b = Math.max(0, b0); b <= Math.min(64, b1); ++b) {
        const t = Math.abs(u1 - u0) > 1e-9 ? (b / 64 - u0) / (u1 - u0) : 0;
        F.wTab[b] = Math.max(F.wTab[b], lerp(w0, w1, clamp01(t)));
      }
    }
    for (let pass = 0; pass < 4; ++pass) {
      const w = F.wTab.slice();
      for (let b = 1; b < 64; ++b) F.wTab[b] = 0.25 * w[b - 1] + 0.5 * w[b] + 0.25 * w[b + 1];
    }
    // ---- heights
    const uBr = n[nBrFrac];
    F.zBrBase = F.zTop(0, 0.3 * n[nBrW]);
    F.zFbRoot = n[nRibH] + n[nOvs] + n[nFbT];
    const zFbBridge = n[nRibH] + n[nArch] * longArch(uBr) + n[nProj];
    F.fbSlope = (zFbBridge - F.zFbRoot) / (0 - F.xRoot);
    F.clrNut = 0.05 * F.k;
    F.zNut = F.zFb(-F.S) + F.clrNut;
    F.xTp0 = F.S / 6.5;
    F.xTp1 = F.xEnd - 0.035 * F.L;
    F.zTp0 = F.zTop(F.xTp0, 0) + n[nTpH];
    F.zTp1 = F.zTop(F.xTp1, 0) + 0.35 * n[nTpH];
    // ---- the arching: two contours
    F.contours = [];
    for (const h of [0.30, 0.64]) {
      const sMin = Math.pow(h, 1 / 0.45), ua = Math.asin(Math.min(1, sMin)) / kPi + 0.004, ub = 1 - ua;
      const loop = [], NC = 30;
      for (let side = 0; side < 2; ++side)
        for (let q = 0; q <= NC; ++q) {
          const ph = q / NC;
          let u = ua + (ub - ua) * 0.5 * (1 - Math.cos(kPi * ph));
          if (side === 1) u = ub - (u - ua);
          const lg = longArch(u);
          const r = lg > h ? Math.sqrt(Math.max(0, 1 - Math.pow(h / lg, 1 / 1.4))) : 0;
          loop.push(V(F.xRoot + u * F.L, (side === 0 ? -1 : 1) * r * F.wAt(u), n[nRibH] + n[nArch] * h));
        }
      F.contours.push(loop);
    }
    // ---- purfling
    F.purfling = [];
    const pd = 0.011 * F.L;
    for (let q = 0; q < E; ++q) {
      const x = F.edge[q].x - F.nrm[q].x * pd, y = F.edge[q].y - F.nrm[q].y * pd;
      F.purfling.push(V(x, y, F.zTop(x, y) + 0.01 * F.k));
    }
    // ---- f-holes
    F.fh = [];
    for (let side = 0; side < 2; ++side) {
      const sg = side === 0 ? -1 : 1, kk = F.k, stretch = 1 + 0.10 * clamp01(F.t3 - 2);
      const Pt = (a, b) => { const x = a * kk * stretch, y = sg * b * kk; return V(x, y, F.zTop(x, y) + 0.02 * kk); };
      const ax = -3.45, ay = 2.10, bx = 3.65, by = 5.10;
      const c1x = ax + 0.9, c1y = ay + 1.9, c2x = bx - 0.9, c2y = by - 1.9;
      const fh = { slot: [], eyeU: [], eyeL: [], nick: [] };
      const NS = 18, other = [];
      for (let q = 0; q <= NS; ++q) {
        const s = q / NS, m = 1 - s;
        const cx = m * m * m * ax + 3 * m * m * s * c1x + 3 * m * s * s * c2x + s * s * s * bx;
        const cy = m * m * m * ay + 3 * m * m * s * c1y + 3 * m * s * s * c2y + s * s * s * by;
        const tx = 3 * m * m * (c1x - ax) + 6 * m * s * (c2x - c1x) + 3 * s * s * (bx - c2x);
        const ty = 3 * m * m * (c1y - ay) + 6 * m * s * (c2y - c1y) + 3 * s * s * (by - c2y);
        const tl = Math.max(1e-9, Math.hypot(tx, ty)), nx = -ty / tl, ny = tx / tl;
        const hw = 0.07 + 0.23 * Math.pow(Math.sin(kPi * s), 0.8);
        fh.slot.push(Pt(cx + nx * hw, cy + ny * hw));
        other.push(Pt(cx - nx * hw, cy - ny * hw));
        if (q === NS / 2) {
          fh.nick = [Pt(cx + nx * hw, cy + ny * hw), Pt(cx + nx * (hw + 0.34), cy + ny * (hw + 0.34)),
                     Pt(cx - nx * hw, cy - ny * hw), Pt(cx - nx * (hw + 0.34), cy - ny * (hw + 0.34))];
        }
      }
      for (let q = other.length - 1; q >= 0; --q) fh.slot.push(other[q]);
      for (let q = 0; q < 12; ++q) {
        const a = kTwoPi * q / 12;
        fh.eyeU.push(Pt(ax + 0.34 * Math.cos(a), ay + 0.34 * Math.sin(a)));
        fh.eyeL.push(Pt(bx + 0.44 * Math.cos(a), by + 0.44 * Math.sin(a)));
      }
      F.fh.push(fh);
    }
    // ---- the head
    F.pbW = n[nPegboxW];
    F.R0 = 1.22 * n[nScrollR];
    F.neckD = 0.035 * F.L;
    F.zt0 = F.zFb(-F.S) - 0.25 * F.k;
    F.zt1 = F.zt0 - 0.10 * n[nHead];
    const rj = F.R0 * Math.exp(-0.125 * 1.25 * kPi);
    F.xs = -F.S - n[nHead] + F.R0 * Math.exp(-0.125 * 0.5 * kPi);
    F.zs = F.zt1 - rj * 0.7071;
    F.xJoin = F.xs + rj * 0.7071;
    F.zb0 = F.zFb(-F.S) - n[nFbT] - F.neckD;
    // ---- the camera: centred across, the bow's place at a fixed height
    const v = new P.View3();
    v.scale = n[nPpcm]; v.ox = 0; v.oy = 0;
    let minX = 1e9, maxX = -1e9;
    const take = p => { const s = v.P(p); minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); };
    for (const p of F.edge) { take(p); take(V(p.x, p.y, 0)); }
    take(V(F.xs - F.R0, 0, F.zs));
    take(V(F.xEnd + (0.06 * F.L + n[nEndpin]) * F.endpinOn + 1, 0, 0.48 * n[nRibH]));
    const ref = v.P(F.onStrings(-0.10 * F.S, 0));
    v.ox = 500 - 0.5 * (minX + maxX);
    v.oy = lerp(kContactY[0], kContactY[1], toBass) - ref.y;
    F.view = v;
    // the ribs we see: facing us, and not behind the top
    {
      const Vd = P.viewDir(v), topPoly = F.edge.map(p => v.P(p));
      F.ribVis = new Array(E).fill(0);
      for (let q = 0; q < E; ++q) {
        const q1 = (q + 1) % E, nn = normalised(add(F.nrm[q], F.nrm[q1]));
        if (dot(nn, Vd) <= 0) continue;
        const mid = mul(add(F.edge[q], F.edge[q1]), 0.5);
        const zm = 0.5 * (n[nRibH] + F.zBack(0.5 * (F.edgeU[q] + F.edgeU[q1])));
        const sp = v.P(V(mid.x, mid.y, zm));
        F.ribVis[q] = P.inside(topPoly, sp.x, sp.y) ? 0 : 1;
      }
      for (let q = 0; q < E; ++q)
        if (!F.ribVis[q] && F.ribVis[(q + E - 1) % E] && F.ribVis[(q + 1) % E]) F.ribVis[q] = 1;
    }
    return F;
  }

  let cache = null;
  const fiddleFor = body => (cache && Math.abs(cache.body - body) < 1e-9) ? cache : (cache = buildFiddle(body));

  /* the string a player would use: the highest open string at or below the note */
  function stringFor(F, semis) { let s = 0; for (let q = 0; q < 4; ++q) if (semis >= F.open[q] - 0.2) s = q; return s; }

  // ---- the parts

  function drawPeg(g, F, v, j) {
    const pa = 1 - F.machine;
    if (pa < 0.01) return;
    const k = F.k, axis = F.pegAt(j), x = axis.x, z = axis.z, side = (j & 1) ? 1 : -1;
    const pk = lerp(1, 1.25, clamp01(F.t3 - 2));
    const y0 = side * 0.5 * F.pbW, y1 = side * (0.5 * F.pbW + 0.75 * k * pk), yc = side * (0.5 * F.pbW + (0.75 + 1.05) * k * pk);
    line3(g, v, V(x, y0, z), V(x, y1, z), 1.4, 0.40 * pa);
    const collar = disc(V(x, y1, z), V(0.32 * k * pk, 0, 0), V(0, 0, 0.32 * k * pk), 12);
    fillGrey(g, path3(v, collar, true), 0.05, pa);
    strokeV(g, v, collar, 0.7, 0.45 * pa, true);
    const d = normalised(V(0.80, 0, 0.60));
    const paddle = disc(V(x, yc, z), V(0, side * 1.05 * k * pk, 0), mul(d, 0.92 * k * pk), 18);
    const pp = path3(v, paddle, true), pn = cross(V(0, 1, 0), d);
    fillGrey(g, pp, 0.035 + 0.08 * P.shade(dot(pn, P.viewDir(v)) > 0 ? pn : mul(pn, -1)), pa);
    strokePath(g, pp, 0.8, 0.55 * pa);
    const ring = disc(V(x, yc + side * 0.55 * k * pk, z), V(0, 0.22 * k * pk, 0), mul(d, 0.22 * k * pk), 10);
    strokeV(g, v, ring, 0.6, 0.3 * pa, true);
  }

  function drawMachines(g, F, v, side) {
    const a = F.machine;
    if (a < 0.01) return;
    const k = F.k, j0 = side < 0 ? 0 : 1, j1 = j0 + 2, c0 = F.pegAt(j0), c1 = F.pegAt(j1);
    const hw = 0.5 * F.pbW, depth = F.zt0 - F.zb0, r = 0.31 * depth;
    const yP = side * (hw + 0.05 * k), yC = side * (hw + 0.22 * k), Vd = P.viewDir(v), near = side < 0;
    const zc = x => lerp(c1.z, c0.z, clamp01((x - c1.x) / (c0.x - c1.x)));
    {
      const hh = 1.25 * r, xa = c0.x + 1.1 * r, xb = c1.x - 1.1 * r, plate = [];
      for (let q = 0; q <= 8; ++q) { const t = -0.5 * kPi + kPi * q / 8; plate.push(V(xa + hh * Math.cos(t) * 0.6, yP, zc(xa) + hh * Math.sin(t))); }
      for (let q = 0; q <= 8; ++q) { const t = 0.5 * kPi + kPi * q / 8; plate.push(V(xb + hh * Math.cos(t) * 0.6, yP, zc(xb) + hh * Math.sin(t))); }
      const pp = path3(v, plate, true);
      fillGrey(g, pp, near ? 0.19 : 0.07, a);
      strokePath(g, pp, 0.8, (near ? 0.65 : 0.3) * a);
      if (near) {
        const lip = [];
        for (let q = 9; q < plate.length; ++q) lip.push(add(plate[q], V(0, -0.02 * k, 0.03 * k)));
        strokeV(g, v, lip, 0.8, 0.35 * a);
      }
    }
    for (const c of [c0, c1]) {
      const cc = V(c.x, yC, c.z), cog = [], NT = 20;
      for (let q = 0; q < 2 * NT; ++q) { const t = kPi * q / NT, rr = (q & 1) ? 0.84 * r : r; cog.push(add(cc, V(rr * Math.cos(t), 0, rr * Math.sin(t)))); }
      const cp = path3(v, cog, true);
      fillGrey(g, cp, near ? 0.30 : 0.08, a);
      strokePath(g, cp, 0.7, (near ? 0.7 : 0.28) * a);
      const hub = disc(add(cc, V(0, side * 0.05 * k, 0)), V(0.28 * r, 0, 0), V(0, 0, 0.28 * r), 10);
      strokeV(g, v, hub, 0.6, (near ? 0.5 : 0.2) * a, true);
      const d = normalised(V(0.05, side * 0.75, -0.66));
      const s0 = V(c.x + 1.0 * r, yP, c.z - 0.35 * r), s1 = add(s0, mul(d, 1.5 * r));
      line3(g, v, s0, s1, 1.8, 0.55 * a);
      const e1 = normalised(cross(d, V(1, 0, 0))), w1 = normalised(cross(e1, d));
      const key = disc(add(s1, mul(d, 1.05 * r)), mul(d, 1.1 * r), mul(w1, 0.72 * r), 18);
      const kp = path3(v, key, true);
      fillGrey(g, kp, 0.04 + 0.12 * P.shade(dot(e1, Vd) > 0 ? e1 : mul(e1, -1)), a);
      strokePath(g, kp, 0.8, (near ? 0.62 : 0.3) * a);
    }
  }

  function drawHead(g, F, v) {
    const Vd = P.viewDir(v), k = F.k, phiEnd = 4.6 * kPi;
    drawPeg(g, F, v, 1); drawPeg(g, F, v, 3); drawMachines(g, F, v, 1);
    {
      const NO = 40, nearOuter = [], farOuter = [];
      for (let q = 0; q <= NO; ++q) {
        const phi = kTwoPi * q / NO;
        nearOuter.push(F.scroll(phi, -F.scrollHalfW(phi)));
        farOuter.push(F.scroll(phi, F.scrollHalfW(phi)));
      }
      const farFace = path3(v, farOuter, true);
      fillGrey(g, farFace, 0);
      strokePath(g, farFace, 0.7, 0.22);
      for (let q = 0; q < NO; ++q) {
        const phi = kTwoPi * (q + 0.5) / NO, a = -0.5 * kPi - phi, nn = V(Math.cos(a), 0, Math.sin(a));
        if (dot(nn, Vd) <= 0) continue;
        fillGrey(g, quad3(v, nearOuter[q], nearOuter[q + 1], farOuter[q + 1], farOuter[q]), 0.015 + 0.13 * P.shade(nn));
      }
      {
        const sil = [];
        for (let q = 0; q <= NO; ++q) {
          const phi = kTwoPi * q / NO, a = -0.5 * kPi - phi;
          if (dot(V(Math.cos(a), 0, Math.sin(a)), Vd) > -0.05) sil.push(farOuter[q]);
        }
        strokeV(g, v, sil, 0.9, 0.5);
      }
      {
        const spine = [];
        for (let q = 3; q <= NO; ++q) {
          const phi = kTwoPi * q / NO, a = -0.5 * kPi - phi;
          if (dot(V(Math.cos(a), 0, Math.sin(a)), Vd) > 0) spine.push(F.scroll(phi, 0));
        }
        strokeV(g, v, spine, 0.6, 0.2);
      }
      const nearFace = path3(v, nearOuter, true);
      fillGrey(g, nearFace, 0.02 + 0.08 * P.shade(V(0, -1, 0)));
      const spiral = [], chamfer = [], NSp = 96;
      for (let q = 0; q <= NSp; ++q) {
        const phi = phiEnd * q / NSp;
        spiral.push(F.scroll(phi, -F.scrollHalfW(phi)));
        if (phi > 0.35 * kPi) chamfer.push(F.scroll(phi - 0.18 * kPi, -F.scrollHalfW(phi) + 0.12 * k));
      }
      strokeV(g, v, chamfer, 0.7, 0.3);
      strokeV(g, v, spiral, 1.0, 0.66);
      const re = F.R0 * Math.exp(-0.125 * phiEnd);
      const eye = disc(V(F.xs, -F.scrollHalfW(phiEnd) + 0.1 * k, F.zs), V(re * 0.8, 0, 0), V(0, 0, re * 0.8), 10);
      const ep = path3(v, eye, true);
      fillGrey(g, ep, 0.16);
      strokePath(g, ep, 0.7, 0.5);
    }
    {
      const hw = 0.5 * F.pbW, wall = 0.16 * F.pbW, x0 = -F.S + 0.15 * k;
      const nTopO = V(x0, -hw, F.zt0), nJoinO = V(F.xJoin, -hw, F.zt1), fTopO = V(x0, hw, F.zt0), fJoinO = V(F.xJoin, hw, F.zt1);
      fillGrey(g, quad3(v, V(x0, -hw + wall, F.zt0), V(F.xJoin, -hw + wall, F.zt1), V(F.xJoin, hw - wall, F.zt1), V(x0, hw - wall, F.zt0)), 0.012);
      fillGrey(g, quad3(v, V(x0, hw - wall, F.zt0), V(F.xJoin, hw - wall, F.zt1),
                        V(F.xJoin, hw - wall, F.zt1 - 0.55 * (F.zt1 - (F.zs - F.R0))), V(x0, hw - wall, F.zt0 - 0.55 * (F.zt0 - F.zb0))), 0.045);
      fillGrey(g, quad3(v, fTopO, fJoinO, V(F.xJoin, hw - wall, F.zt1), V(x0, hw - wall, F.zt0)), 0.10);
      line3(g, v, fTopO, fJoinO, 0.8, 0.45);
      line3(g, v, V(x0, hw - wall, F.zt0), V(F.xJoin, hw - wall, F.zt1), 0.6, 0.22);
      for (let j = 0; j < 4; ++j) { const a = F.pegAt(j); line3(g, v, V(a.x, -hw + wall, a.z), V(a.x, hw - wall, a.z), 1.2, 0.18); }
      const pegOf = [2, 0, 1, 3];
      for (let s = 0; s < 4; ++s) { const a = F.pegAt(pegOf[s]); line3(g, v, F.onString(s, -F.S), V(a.x, (s - 1.5) * 0.18 * F.pbW, a.z), 0.6, 0.3); }
      const pts = [nTopO, nJoinO];
      for (let q = 0; q <= 8; ++q) pts.push(F.scroll(1.25 * kPi + 0.75 * kPi * q / 8, -hw));
      pts.push(V(F.xs + 0.2 * F.R0, -hw, F.zs - F.R0));
      pts.push(V(x0, -hw, F.zb0));
      fillGrey(g, path3(v, pts, true), 0.02 + 0.08 * P.shade(V(0, -1, 0)));
      fillGrey(g, quad3(v, nTopO, nJoinO, V(F.xJoin, -hw + wall, F.zt1), V(x0, -hw + wall, F.zt0)), 0.13);
      line3(g, v, nTopO, nJoinO, 0.9, 0.6);
      line3(g, v, V(x0, -hw + wall, F.zt0), V(F.xJoin, -hw + wall, F.zt1), 0.6, 0.3);
      strokeV(g, v, [V(x0, -hw, F.zb0), V(F.xs + 0.2 * F.R0, -hw, F.zs - F.R0)], 0.9, 0.5);
    }
    drawPeg(g, F, v, 0); drawPeg(g, F, v, 2); drawMachines(g, F, v, -1);
  }

  function drawBody(g, F, v) {
    const E = F.edge.length, ribH = F.n[nRibH], vis = F.ribVis;
    const backPt = q => V(F.edge[q].x, F.edge[q].y, F.zBack(F.edgeU[q]));
    for (let q = 0; q < E; q += 2) {
      const q1 = (q + 1) % E, q2 = (q + 2) % E;
      if (!vis[q] && !vis[q1]) continue;
      const qa = vis[q] ? q : q1, qb = vis[q1] ? q2 : q1;
      const nn = normalised(add(add(F.nrm[qa], F.nrm[q1]), F.nrm[qb]));
      const a = F.edge[qa], b = F.edge[qb], bb = add(b, mul(sub(b, a), 0.08));
      const lvl = 0.008 + 0.25 * Math.pow(P.shade(nn), 1.7);
      const piece = quad3(v, a, bb, V(bb.x, bb.y, F.zBack(F.edgeU[qb])), backPt(qa));
      const um = F.edgeU[q1];
      if (um > 0.37 && um < 0.64) {
        const m = mul(add(a, b), 0.5), t0 = v.P(V(m.x, m.y, ribH)), t1 = v.P(V(m.x, m.y, F.zBack(um)));
        fillGradient(g, piece, t0, grey(lvl * 0.45), t1, grey(lvl * 1.15));
      } else fillGrey(g, piece, lvl);
    }
    const top = path3(v, F.edge, true);
    fillGrey(g, top, 0.055);
    g.save();
    g.clip(top);
    {
      const NU = 20, NR = 6;
      const Pt = (u, r) => { const x = F.xRoot + u * F.L, y = r * F.wAt(u); return V(x, y, F.zTop(x, y)); };
      for (let i = 0; i < NU; ++i) {
        const u0 = lerp(-0.01, 1.01, i / NU), u1 = lerp(-0.01, 1.01, (i + 1) / NU);
        for (let j = 0; j < NR; ++j) {
          const r0 = lerp(-1.2, 1.2, j / NR), r1 = lerp(-1.2, 1.2, (j + 1) / NR);
          const a = Pt(u0, r0), b = Pt(u1, r0), c = Pt(u1, r1), d = Pt(u0, r1);
          const nn = normalised(cross(sub(c, a), sub(d, b)));
          const lit = clamp01((P.shade(nn) - 0.60) / 0.34);
          const fall = 1 - 0.45 * clamp01(0.5 * (u0 + u1) * 0.7 + 0.25 * (r0 + r1 + 2) * 0.3);
          const m = mul(add(a, c), 0.5), grow = p => add(m, mul(sub(p, m), 1.06));
          fillGrey(g, quad3(v, grow(a), grow(b), grow(c), grow(d)), (0.028 + 0.16 * Math.pow(lit, 1.3)) * fall);
        }
      }
    }
    g.restore();
    for (const cl of F.contours) strokeV(g, v, cl, 0.6, 0.13, true);
    strokeV(g, v, F.purfling, 0.7, 0.24, true);
    for (let side = 1; side >= 0; --side) {
      const fh = F.fh[side], slot = path3(v, fh.slot, true);
      g.fillStyle = '#000'; g.fill(slot);
      strokePath(g, slot, 0.7, 0.5);
      for (const eye of [fh.eyeU, fh.eyeL]) { const ep = path3(v, eye, true); g.fillStyle = '#000'; g.fill(ep); strokePath(g, ep, 0.7, 0.5); }
      line3(g, v, fh.nick[0], fh.nick[1], 0.6, 0.35);
      line3(g, v, fh.nick[2], fh.nick[3], 0.6, 0.35);
    }
    {
      const creaseTop = new Path2D(), creaseBack = new Path2D(), backEdge = new Path2D();
      let open = false;
      for (let q = 0; q < E; ++q) {
        const q1 = (q + 1) % E;
        if (!vis[q]) { open = false; continue; }
        const a = F.edge[q], b = F.edge[q1], te = 0.012 * F.L;
        const a1 = v.P(V(a.x, a.y, ribH - te)), b1 = v.P(V(b.x, b.y, ribH - te));
        const a2 = v.P(V(a.x, a.y, F.zBack(F.edgeU[q]) + te)), b2 = v.P(V(b.x, b.y, F.zBack(F.edgeU[q1]) + te));
        const a3 = v.P(backPt(q)), b3 = v.P(backPt(q1));
        if (!open) { creaseTop.moveTo(a1.x, a1.y); creaseBack.moveTo(a2.x, a2.y); backEdge.moveTo(a3.x, a3.y); open = true; }
        creaseTop.lineTo(b1.x, b1.y); creaseBack.lineTo(b2.x, b2.y); backEdge.lineTo(b3.x, b3.y);
      }
      strokePath(g, creaseTop, 0.6, 0.2);
      strokePath(g, creaseBack, 0.6, 0.14);
      strokePath(g, backEdge, 1.1, 0.55);
      for (let q = 0; q < E; ++q) { const qp = (q + E - 1) % E; if (vis[q] !== vis[qp]) line3(g, v, F.edge[q], backPt(q), 0.9, 0.45); }
    }
    strokePath(g, top, 1.2, 0.66);
  }

  function drawNeck(g, F, v) {
    const k = F.k, S = F.S, xa = -S + 0.1 * k, xb = F.xRoot - 0.2 * k;
    const sil = [], edgeTop = [], NN = 12;
    for (let q = 0; q <= NN; ++q) {
      const x = lerp(xa, xb, q / NN), ay = 0.92 * F.fbHalf(x), az = F.neckD * lerp(1, 1.18, q / NN);
      const zc = F.zFb(x) - F.n[nFbT], t = kPi + Math.atan2(0.782 * az, 0.581 * ay);
      sil.push(V(x, ay * Math.cos(t), zc + az * Math.sin(t)));
      edgeTop.push(V(x, -ay, zc));
    }
    const heel = [];
    {
      const s0 = sil[sil.length - 1], zB = F.zBack(0);
      for (let q = 0; q <= 8; ++q) {
        const t = q / 8, x = lerp(s0.x - 1.2 * k, F.xRoot + 0.05 * k, Math.sin(0.5 * kPi * t)), z = lerp(s0.z + 0.2 * k, zB + 0.1 * k, t * t);
        heel.push(V(x, s0.y * (1 - 0.3 * t), z));
      }
    }
    fillGrey(g, path3(v, edgeTop.concat(sil.slice().reverse()), true), 0.05);
    {
      const s = sil[sil.length - 1];
      fillGrey(g, path3(v, heel.concat([V(F.xRoot + 0.1 * k, 0, F.n[nRibH]), V(s.x, 0, F.zFb(s.x) - F.n[nFbT])]), true), 0.035);
    }
    strokeV(g, v, sil.slice(0, sil.length - 2), 1.0, 0.55);
    strokeV(g, v, heel, 1.0, 0.5);
  }

  function drawFingerboard(g, F, v) {
    const S = F.S, k = F.k, t = F.n[nFbT], x0 = -S, x1 = -S + F.n[nFbLen];
    const w0 = F.fbHalf(x0), w1 = F.fbHalf(x1), z0 = F.zFb(x0), z1 = F.zFb(x1), camber = 0.12 * w1;
    const topPt = (x, yn) => { const w = F.fbHalf(x); return V(x, yn * w, F.zFb(x) - camber * (w / w1) * yn * yn); };
    fillGrey(g, quad3(v, topPt(x0, -1), topPt(x1, -1), V(x1, -w1, z1 - camber - t), V(x0, -w0, z0 - camber * (w0 / w1) - t)), 0.055);
    {
      const endFace = [];
      for (let q = 0; q <= 6; ++q) endFace.push(topPt(x1, -1 + 2 * q / 6));
      endFace.push(V(x1, w1, z1 - camber - t)); endFace.push(V(x1, -w1, z1 - camber - t));
      const ef = path3(v, endFace, true);
      fillGrey(g, ef, 0.03);
      strokePath(g, ef, 0.8, 0.45);
    }
    const topFace = [], NT = 6;
    for (let q = 0; q <= NT; ++q) topFace.push(topPt(lerp(x0, x1, q / NT), -1));
    for (let q = 0; q <= 6; ++q) topFace.push(topPt(x1, -1 + 2 * q / 6));
    for (let q = NT; q >= 0; --q) topFace.push(topPt(lerp(x0, x1, q / NT), 1));
    const tf = path3(v, topFace, true);
    fillGradient(g, tf, v.P(topPt(x0, 0)), grey(0.075), v.P(topPt(x1, 0)), grey(0.11));
    strokePath(g, tf, 0.9, 0.55);
    line3(g, v, V(x0, -w0, z0 - camber * (w0 / w1) - t), V(x1, -w1, z1 - camber - t), 0.8, 0.45);
    const wn = w0 * 1.02;
    const nut = quad3(v, V(x0 - 0.35 * k, -wn, F.zNut + 0.05 * k), V(x0, -wn, F.zNut + 0.05 * k), V(x0, wn, F.zNut + 0.05 * k), V(x0 - 0.35 * k, wn, F.zNut + 0.05 * k));
    fillGrey(g, nut, 0.2);
    strokePath(g, nut, 0.8, 0.6);
    line3(g, v, V(x0, -wn, F.zNut + 0.05 * k), V(x0, -wn, z0 - t), 0.8, 0.5);
  }

  function drawTailAndEnd(g, F, v) {
    const k = F.k, L = F.L, ribH = F.n[nRibH], Vd = P.viewDir(v);
    {
      const zc = 0.48 * ribH, ay = V(0, 1, 0), az = V(0, 0, 1);
      if (F.endpinOn < 0.99) {
        const a = 1 - F.endpinOn, r0 = 0.55 * k, r1 = 0.42 * k;
        const base = disc(V(F.xEnd + 0.05 * k, 0, zc), mul(ay, r0), mul(az, r0), 14);
        const knob = disc(V(F.xEnd + 0.75 * k, 0, zc), mul(ay, r1), mul(az, r1), 14);
        fillGrey(g, path3(v, base, true), 0.06 * a);
        strokeV(g, v, base, 0.7, 0.35 * a, true);
        line3(g, v, V(F.xEnd + 0.05 * k, 0, zc + r0 * 0.8), V(F.xEnd + 0.75 * k, 0, zc + r1), 0.7, 0.4 * a);
        line3(g, v, V(F.xEnd + 0.05 * k, 0, zc - r0 * 0.8), V(F.xEnd + 0.75 * k, 0, zc - r1), 0.7, 0.4 * a);
        fillGrey(g, path3(v, knob, true), 0.09 * a);
        strokeV(g, v, knob, 0.8, 0.5 * a, true);
      }
      if (F.endpinOn > 0.01) {
        const a = F.endpinOn, rc = 0.021 * L, rr = 0.0055 * L;
        const x0 = F.xEnd + 0.03 * L, x1 = F.xEnd + 0.03 * L + F.n[nEndpin] * a;
        const collar0 = disc(V(F.xEnd + 0.004 * L, 0, zc), mul(ay, rc), mul(az, rc), 16);
        const collar1 = disc(V(x0, 0, zc), mul(ay, rc * 0.8), mul(az, rc * 0.8), 16);
        fillGrey(g, path3(v, collar0, true), 0.05 * a);
        strokeV(g, v, collar0, 0.7, 0.35 * a, true);
        fillGrey(g, path3(v, collar1, true), 0.10 * a);
        strokeV(g, v, collar1, 0.8, 0.5 * a, true);
        const p0 = v.P(V(x0, 0, zc)), p1 = v.P(V(x1, 0, zc)), p2 = v.P(V(x1 + 0.03 * L * a, 0, zc - 0.002 * L));
        const wpx = 2 * rr * v.scale;
        taperedStroke(g, [p0, p1], wpx, wpx, 0.16 * a, 0);
        strokeLine(g, p0.x, p0.y - 0.5 * wpx, p1.x, p1.y - 0.5 * wpx, 0.8, 0.55 * a);
        strokeLine(g, p0.x, p0.y + 0.5 * wpx, p1.x, p1.y + 0.5 * wpx, 0.7, 0.35 * a);
        strokePath(g, P.pathPts([{ x: p1.x, y: p1.y - 0.5 * wpx }, p2, { x: p1.x, y: p1.y + 0.5 * wpx }], false), 0.8, 0.55 * a);
      }
    }
    {
      const sw = 0.9 * k * lerp(1, 2.2, clamp01(F.t3 - 1)), zS = ribH + 0.30 * k;
      const saddle = quad3(v, V(F.xEnd - 0.55 * k, -sw, zS), V(F.xEnd - 0.05 * k, -sw, zS), V(F.xEnd - 0.05 * k, sw, zS), V(F.xEnd - 0.55 * k, sw, zS));
      fillGrey(g, saddle, 0.12);
      strokePath(g, saddle, 0.7, 0.4);
      line3(g, v, V(F.xTp1, -0.1 * k, F.zTp1 - 0.25 * k), V(F.xEnd - 0.3 * k, -0.25 * k, zS + 0.1 * k), 0.8, 0.4);
      line3(g, v, V(F.xTp1, 0.1 * k, F.zTp1 - 0.25 * k), V(F.xEnd - 0.3 * k, 0.25 * k, zS + 0.1 * k), 0.8, 0.3);
    }
    {
      const W = F.n[nTpW], x0 = F.xTp0, x1 = F.xTp1;
      const zAt = x => lerp(F.zTp0, F.zTp1, clamp01((x - x0) / (x1 - x0)));
      const tk0 = 0.20 * W, tk1 = 0.12 * W;
      const half = x => W * lerp(0.5, 0.26, Math.pow(clamp01((x - x0) / (x1 - x0)), 0.9));
      const topFace = [], cap = 0.28 * W, NT = 6;
      for (let q = 0; q <= 8; ++q) { const a = -0.5 * kPi + kPi * q / 8, x = x0 + cap * (1 - Math.cos(a)); topFace.push(V(x, 0.5 * W * Math.sin(a), zAt(x))); }
      for (let q = 1; q <= NT; ++q) { const x = lerp(x0 + cap, x1, q / NT); topFace.push(V(x, half(x), zAt(x))); }
      for (let q = NT; q >= 1; --q) { const x = lerp(x0 + cap, x1, q / NT); topFace.push(V(x, -half(x), zAt(x))); }
      const side = [];
      for (let q = 0; q <= 4; ++q) { const a = -0.5 * kPi + 0.5 * kPi * q / 4, x = x0 + cap * (1 - Math.cos(a)); side.push(V(x, 0.5 * W * Math.sin(a), zAt(x))); }
      for (let q = 1; q <= NT; ++q) { const x = lerp(x0 + cap, x1, q / NT); side.push(V(x, -half(x), zAt(x))); }
      const nearLow = side.map(p => V(p.x, p.y, p.z - lerp(tk0, tk1, clamp01((p.x - x0) / (x1 - x0)))));
      fillGrey(g, path3(v, side.concat(nearLow.slice().reverse()), true), 0.03);
      fillGrey(g, quad3(v, V(x1, -half(x1), zAt(x1)), V(x1, half(x1), zAt(x1)), V(x1, half(x1), zAt(x1) - tk1), V(x1, -half(x1), zAt(x1) - tk1)), 0.02);
      strokeV(g, v, nearLow, 0.7, 0.35);
      line3(g, v, nearLow[nearLow.length - 1], V(x1, half(x1), zAt(x1) - tk1), 0.7, 0.3);
      const tp = path3(v, topFace, true);
      fillGradient(g, tp, v.P(V(x0, -0.3 * W, zAt(x0))), grey(0.085), v.P(V(x1, 0.3 * W, zAt(x1))), grey(0.03));
      strokePath(g, tp, 0.9, 0.6);
      const fret = [];
      for (let q = 0; q <= 8; ++q) { const a = -0.5 * kPi + kPi * q / 8, x = x0 + cap * (1 - Math.cos(a)) + 0.18 * cap; fret.push(V(x, 0.42 * W * Math.sin(a), zAt(x) + 0.02 * k)); }
      strokeV(g, v, fret, 0.6, 0.3);
      g.fillStyle = ink(0.45);
      for (let s = 0; s < 4; ++s) {
        const x = x0 + 0.95 * cap + 0.2 * W, p = v.P(V(x, (s - 1.5) / 3 * F.spread(x0), zAt(x)));
        g.beginPath(); g.ellipse(p.x, p.y, 1.2, 1.2, 0, 0, kTwoPi); g.fill();
      }
    }
    if (F.chin > 0.01) {
      const a = F.chin, cx = F.xEnd - 0.062 * L, cy = -0.104 * L, rx = 0.074 * L, ry = 0.056 * L;
      {
        const yb = -0.052 * L, xb = F.xEnd - 0.010 * L, zt = F.zTop(xb, yb) + 0.3 * k, zb = F.zBack(1) + 0.25 * ribH;
        for (const dy of [-0.012 * L, 0.012 * L]) line3(g, v, V(xb + 0.2 * k, yb + dy, zt), V(xb + 0.35 * k, yb + dy, zb), 1.0, 0.35 * a);
        line3(g, v, V(xb + 0.35 * k, yb - 0.016 * L, zb), V(xb + 0.35 * k, yb + 0.016 * L, zb), 1.2, 0.4 * a);
      }
      const NCh = 24, rim = [], base = [], cup = [];
      for (let q = 0; q < NCh; ++q) {
        const t = kTwoPi * q / NCh, pinch = 1 - 0.18 * Math.pow(Math.max(0, Math.sin(t)), 3);
        const x = cx + rx * Math.cos(t), y = cy + ry * Math.sin(t) * pinch, zb = F.zTop(x, y);
        const lip = 1 + 0.35 * Math.max(0, -Math.sin(t));
        rim.push(V(x, y, zb + 1.35 * k * lip));
        base.push(V(cx + 1.08 * rx * Math.cos(t), cy + 1.08 * ry * Math.sin(t) * pinch, zb + 0.05 * k));
        cup.push(V(cx + 0.62 * rx * Math.cos(t), cy + 0.62 * ry * Math.sin(t) * pinch, zb + 0.95 * k));
      }
      for (let q = 0; q < NCh; ++q) {
        const q1 = (q + 1) % NCh, t = kTwoPi * (q + 0.5) / NCh, nn = V(Math.cos(t) / rx, Math.sin(t) / ry, 0);
        if (dot(normalised(nn), Vd) <= 0) continue;
        const p = quad3(v, base[q], base[q1], rim[q1], rim[q]);
        g.fillStyle = `rgba(0,0,0,${a})`; g.fill(p);
        g.fillStyle = ink(a * (0.03 + 0.22 * P.shade(normalised(nn)))); g.fill(p);
      }
      const rp = path3(v, rim, true);
      g.fillStyle = `rgba(0,0,0,${a})`; g.fill(rp);
      fillGradient(g, rp, v.P(cup[NCh / 2]), ink(0.06 * a), v.P(cup[0]), ink(0.26 * a));
      strokePath(g, rp, 0.8, 0.45 * a);
      const lipPts = [];
      for (let q = NCh / 2; q <= NCh; ++q) lipPts.push(rim[q % NCh]);
      strokeV(g, v, lipPts, 1.2, 0.8 * a);
      strokeV(g, v, cup, 0.6, 0.22 * a, true);
      const baseVis = [];
      for (let q = 0; q <= NCh; ++q) {
        const t = kTwoPi * q / NCh;
        if (dot(normalised(V(Math.cos(t) / rx, Math.sin(t) / ry, 0)), Vd) > 0) baseVis.push(base[q % NCh]);
      }
      strokeV(g, v, baseVis, 0.7, 0.35 * a);
    }
  }

  function drawBridge(g, F, v) {
    const W = F.n[nBrW], H = F.n[nBrH], la = F.n[nLegArch], kb = W / 4.1;
    const tTop = 1.8 * 0.15 * kb, tFoot = 1.8 * 0.42 * kb;
    const half = [[0.000,1.000],[0.090,0.9965],[0.180,0.986],[0.270,0.968],[0.360,0.944],[0.430,0.920],
                  [0.452,0.900],[0.455,0.860],[0.425,0.740],[0.405,0.600],[0.410,0.460],[0.440,0.300],
                  [0.480,0.160],[0.500,0.080],[0.500,0.000],[0.300,0.000],[0.285,0.050]];
    const NH = half.length, kEar = 6, kFoot = 14;
    const pt = (yn, zn, face) => V(face * 0.5 * lerp(tFoot, tTop, zn), yn * W, F.zBrBase + zn * H);
    const ring = [];
    for (let q = NH - 1; q >= 1; --q) ring.push([half[q][0], half[q][1]]);
    for (let q = 0; q < NH; ++q) ring.push([-half[q][0], half[q][1]]);
    for (let q = 0; q <= 6; ++q) {
      const t = q / 6, yy = lerp(-0.27, 0.27, t);
      ring.push([yy, la * Math.pow(Math.max(0, 1 - Math.pow(yy / 0.28, 2)), 0.6)]);
    }
    const front = ring.map(r => pt(r[0], r[1], 1)), back = ring.map(r => pt(r[0], r[1], -1));
    {
      const i0 = NH - 1 + kEar, i1 = NH - 1 + kFoot, sideFace = [];
      for (let q = i0; q <= i1; ++q) sideFace.push(front[q]);
      for (let q = i1; q >= i0; --q) sideFace.push(back[q]);
      fillGrey(g, path3(v, sideFace, true), 0.03 + 0.10 * P.shade(V(0, -1, 0)));
      strokeV(g, v, back.slice(i0, i1 + 1), 0.7, 0.4);
    }
    {
      const i0 = NH - 1 - kEar, i1 = NH - 1 + kEar, strip = [];
      for (let q = i0; q <= i1; ++q) strip.push(front[q]);
      for (let q = i1; q >= i0; --q) strip.push(back[q]);
      const tp = path3(v, strip, true);
      fillGrey(g, tp, 0.46);
      strokePath(g, tp, 0.6, 0.55);
    }
    const fp = path3(v, front, true);
    fillGradient(g, fp, v.P(pt(0, 1, 1)), grey(0.10), v.P(pt(0, 0, 1)), grey(0.035));
    strokePath(g, fp, 0.9, 0.7);
    {
      const heart = [];
      for (let q = 0; q <= 12; ++q) { const t = kTwoPi * q / 12; heart.push(pt(0.045 * Math.sin(t), 0.60 + 0.055 * Math.cos(t) - 0.02 * Math.abs(Math.sin(t)), 1.02)); }
      strokeV(g, v, heart, 0.6, 0.22, true);
    }
    for (const sg of [-1, 1]) line3(g, v, pt(sg * 0.30, 0, 1.15), pt(sg * 0.50, 0, 1.15), 1.0, 0.5);
  }

  // ---- the bow

  function bowPose(F, bowX, lane, bowPos, lift, weight) {
    const v = F.view, b = { Lb: F.bowPx / v.scale, sc: kHair0 + bowPos * (kHair1 - kHair0), lift, weight };
    const onStr = F.onStrings(bowX, lane);
    const tilt = -(1 - lift) * 0.22 * lane;
    b.C = V(onStr.x, onStr.y, onStr.z + 0.06 * F.k + lift * (kLiftPx / v.scale));
    b.U = V(0, Math.cos(tilt), Math.sin(tilt));
    const N0 = V(0, -Math.sin(tilt), Math.cos(tilt)), X0 = V(1, 0, 0);
    const roll = lerp(0.80, 0.34, clamp01(weight));
    b.N = sub(mul(N0, Math.cos(roll)), mul(X0, Math.sin(roll)));
    b.X = add(mul(X0, Math.cos(roll)), mul(N0, Math.sin(roll)));
    b.at = (s, h, xo) => add(add(add(b.C, mul(b.U, (s - b.sc) * b.Lb)), mul(b.N, h * b.Lb)), mul(b.X, xo * b.Lb));
    b.stick = s => stickH(s) * (1 - 0.30 * weight * (1 - lift) * Math.sin(kPi * clamp01(s)));
    return b;
  }

  function drawBowShadow(g, F, v, b) {
    const sh = new Path2D(), NS = 16;
    let hSum = 0;
    for (let line = 0; line < 2; ++line)
      for (let q = 0; q <= NS; ++q) {
        const s = lerp(line === 0 ? kHair0 : 0, line === 0 ? kHair1 : 0.955, q / NS);
        const p = b.at(s, line === 0 ? 0 : b.stick(s), 0), zt = F.zTop(p.x, p.y);
        if (line === 0 && Math.abs(s - b.sc) < 0.5 / NS) hSum = p.z - zt;
        const sp = v.P(V(p.x, p.y, zt));
        q === 0 ? sh.moveTo(sp.x, sp.y) : sh.lineTo(sp.x, sp.y);
      }
    const hPx = Math.max(0, hSum) * v.scale, soft = 3 + 0.05 * hPx;
    g.save();
    g.clip(path3(v, F.edge, true));
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = soft * 2.6; g.stroke(sh);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = soft * 1.2; g.stroke(sh);
    g.restore();
  }

  function dashed(g, p, q, width, alpha) {
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    for (let d = 0; d < len - 0.5; d += 4) {
      const t0 = d / len, t1 = Math.min(1, (d + 2.2) / len);
      strokeLine(g, lerp(p.x, q.x, t0), lerp(p.y, q.y, t0), lerp(p.x, q.x, t1), lerp(p.y, q.y, t1), width, alpha);
    }
  }

  function drawFootprint(g, F, v, b, bowX, lane) {
    const a = clamp01(b.lift * 1.5);
    if (a < 0.02) return;
    const fp = [];
    for (let q = 0; q <= 8; ++q) fp.push(add(F.onStrings(bowX, lerp(-1.85, 1.85, q / 8)), V(0, 0, 0.03 * F.k)));
    strokeV(g, v, fp, 1.0, 0.40 * a);
    dashed(g, v.P(b.at(b.sc, 0, 0)), v.P(F.onStrings(bowX, lane)), 0.9, 0.55 * a);
  }

  function drawBow(g, v, b) {
    const B = (s, h, xo) => b.at(s, h, xo), BP = (s, h, xo) => v.P(b.at(s, h, xo));
    const hw = 0.0075;
    {
      const ribbon = quad3(v, B(kHair0, 0, -hw), B(kHair1, 0, -hw), B(kHair1, 0, hw), B(kHair0, 0, hw));
      strokePlain(g, ribbon, 2.2, '#000');
      fillGrey(g, ribbon, 0.20);
      line3(g, v, B(kHair0, 0, -hw), B(kHair1, 0, -hw), 0.7, 0.75);
      line3(g, v, B(kHair0, 0, hw), B(kHair1, 0, hw), 0.6, 0.45);
    }
    {
      const stick = [], NSt = 26;
      for (let q = 0; q <= NSt; ++q) { const s = lerp(0, 0.955, q / NSt); stick.push(BP(s, b.stick(s), 0)); }
      const w0 = 1.9 + 1.5 * b.weight;
      taperedStroke(g, stick, w0, w0 * 0.55, 0.78, 2.6);
    }
    {
      const hp = [[0.945, stickH(0.945) + 0.004], [0.975, 0.031], [0.994, 0.037], [1.000, 0.032],
                  [0.995, 0.012], [0.986, 0.000], [0.975, 0.003], [0.958, 0.011], [0.945, stickH(0.945) - 0.004]];
      const b0 = path3(v, hp.map(h => B(h[0], h[1], -0.0055)), true), b1 = path3(v, hp.map(h => B(h[0], h[1], 0.0055)), true);
      fillGrey(g, b0, 0.05); strokePath(g, b0, 0.6, 0.35);
      fillGrey(g, b1, 0.10); strokePath(g, b1, 0.8, 0.7);
      line3(g, v, B(1.0, 0.032, 0.0055), B(0.986, 0, 0.0055), 1.1, 0.85);
    }
    {
      const fpr = [[0.030, 0.025], [0.100, 0.023], [0.104, 0.010], [0.104, -0.003], [0.060, -0.006], [0.036, -0.003], [0.026, 0.011]];
      const fw = 0.0085, f0 = fpr.map(h => B(h[0], h[1], -fw)), f1 = fpr.map(h => B(h[0], h[1], fw));
      const b0 = path3(v, f0, true), b1 = path3(v, f1, true);
      strokePlain(g, b1, 2.4, '#000');
      fillGrey(g, b0, 0.04); strokePath(g, b0, 0.6, 0.35);
      fillGrey(g, quad3(v, f0[3], f0[4], f1[4], f1[3]), 0.06);
      fillGrey(g, quad3(v, f0[4], f0[5], f1[5], f1[4]), 0.06);
      fillGrey(g, quad3(v, f0[5], f0[6], f1[6], f1[5]), 0.08);
      fillGrey(g, b1, 0.11); strokePath(g, b1, 0.9, 0.75);
      line3(g, v, f0[4], f1[4], 0.6, 0.35);
      line3(g, v, f0[5], f1[5], 0.6, 0.35);
      fillGrey(g, quad3(v, B(0.096, 0.012, fw), B(0.104, 0.010, fw), B(0.104, -0.003, fw), B(0.096, -0.004, fw)), 0.45);
      const eye = disc(B(0.066, 0.010, fw + 0.0005), mul(b.U, 0.006 * b.Lb), mul(b.N, 0.006 * b.Lb), 10);
      strokeV(g, v, eye, 0.7, 0.6, true);
      const a0 = BP(-0.022, stickH(0), 0), a1 = BP(0.030, stickH(0.03), 0);
      taperedStroke(g, [a0, a1], 3.2, 3.2, 0.5, 1.5);
      const r0 = BP(-0.006, stickH(0), 0), dx = a1.x - a0.x, dy = a1.y - a0.y, dl = Math.max(1e-6, Math.hypot(dx, dy));
      strokeLine(g, r0.x - 2.2 * dy / dl, r0.y + 2.2 * dx / dl, r0.x + 2.2 * dy / dl, r0.y - 2.2 * dx / dl, 0.7, 0.9);
    }
  }

  function drawBowMotion(g, v, b, bowVel) {
    const speed = clamp01(Math.abs(bowVel) / 0.30), aMark = (1 - b.lift) * clamp01(Math.abs(bowVel) / 0.02);
    if (aMark < 0.02) return;
    const c0 = v.P(b.at(b.sc, 0, 0)), c1 = v.P(b.at(b.sc + 0.1, 0, 0));
    let ux = c1.x - c0.x, uy = c1.y - c0.y;
    const ul = Math.max(1e-6, Math.hypot(ux, uy)); ux /= ul; uy /= ul;
    const px = uy, py = -ux, dirSign = bowVel > 0 ? -1 : 1, len = 14 + 40 * speed;
    const mx = c0.x + ux * 58 + px * 13, my = c0.y + uy * 58 + py * 13;
    const ex = mx + dirSign * ux * len * 0.5, ey = my + dirSign * uy * len * 0.5;
    const sx = mx - dirSign * ux * len * 0.5, sy = my - dirSign * uy * len * 0.5, al = 0.5 * aMark;
    strokeLine(g, sx, sy, ex, ey, 0.8, al);
    const hx = -dirSign * ux, hy = -dirSign * uy;
    strokeLine(g, ex, ey, ex + hx * 6 + px * 3, ey + hy * 6 + py * 3, 0.8, al);
    strokeLine(g, ex, ey, ex + hx * 6 - px * 3, ey + hy * 6 - py * 3, 0.8, al);
    const kx = mx + px * 14, ky = my + py * 14;
    const mark = bowVel > 0
      ? P.pathPts([{ x: kx - 4, y: ky + 3 }, { x: kx - 4, y: ky - 3 }, { x: kx + 4, y: ky - 3 }, { x: kx + 4, y: ky + 3 }], false)
      : P.pathPts([{ x: kx - 3.5, y: ky - 4 }, { x: kx, y: ky + 4 }, { x: kx + 3.5, y: ky - 4 }], false);
    strokePath(g, mark, 1.0, 0.55 * aMark);
  }

  function gripSpots(F, bowX) {
    const v = F.view, A = v.P(F.onStrings(bowX, 0)), far = v.P(F.onStrings(bowX, 1.5));
    let ux = far.x - A.x, uy = far.y - A.y;
    const hb = Math.max(1, Math.hypot(ux, uy)); ux /= hb; uy /= hb;
    const px = -uy, py = ux;
    return { pos: { x: A.x + ux * (hb + 13) + px * 4.5, y: A.y + uy * (hb + 13) + py * 4.5 },
             wgt: { x: A.x + ux * (hb + 13 + 31) + px * 4.5, y: A.y + uy * (hb + 13 + 31) + py * 4.5 } };
  }

  // ---- the plate: the instrument as it is at this instant

  const anim = new Array(16).fill(0);
  const sPosition = 0.50, sWeight = 0.55;            // the VIOLIN preset's, as recorded

  function draw(g, body, frame, dt, clock) {
    const F = fiddleFor(body), v = F.view;
    const live = frame.voices.slice().sort((a, b) => a.sounding - b.sounding);
    const on = [], used = [false, false, false, false];
    let nHeld = 0, laneSum = 0, heldSlide = 0.5, anyHeld = false;
    for (const lv of live) {
      const s = stringFor(F, lv.sounding), below = lv.sounding < F.open[0] - 0.5;
      const stop = Math.pow(2, -(lv.sounding - F.open[s]) / 12);
      on.push({ s, xf: below ? -F.S : -F.S * Math.min(1, stop), below });
      used[s] = true;
      if (lv.held) { laneSum += s - 1.5; ++nHeld; anyHeld = true; heldSlide = lv.slide; }
    }
    const placeX = clamp01(sPosition + (anyHeld ? (heldSlide - 0.5) * 0.7 : 0));
    const wantX = -betaFor(placeX) * F.S;
    const wantLane = nHeld > 0 ? laneSum / nHeld : (live.length === 0 || anim[0] < 0.5 ? 0 : anim[4]);
    const fresh = anim[0] < 0.5 || Math.abs(anim[10] - body) > 1e-6;
    const ease = (i, target, tau) => (fresh ? (anim[i] = target) : (anim[i] += (target - anim[i]) * (1 - Math.exp(-dt / tau))));
    const bowPos = ease(1, clamp01(frame.bowPos), 0.018);
    const bowLift = ease(2, clamp01(frame.bowLift), 0.03);
    const bowX = ease(3, wantX, 0.06);
    const lane = ease(4, wantLane, 0.07);
    const bowVel = ease(6, frame.bowVel, 0.05);
    anim[0] = 1; anim[10] = body;
    const bp = bowPose(F, bowX, lane, bowPos, bowLift, sWeight);

    // the bow place's range on the table, TASTO to PONTICELLO
    {
      const xT = -betaFor(0) * F.S, xP = -betaFor(1) * F.S;
      let wMax = 0;
      for (let q = 0; q <= 16; ++q) wMax = Math.max(wMax, F.wAt((lerp(xT, xP, q / 16) - F.xRoot) / F.L));
      const yD = -(wMax + 0.05 * F.L), tick = 0.018 * F.L;
      line3(g, v, V(xT, yD, 0), V(xP, yD, 0), 0.6, 0.24);
      line3(g, v, V(xT, yD - tick, 0), V(xT, yD + tick, 0), 0.6, 0.3);
      line3(g, v, V(xP, yD - tick, 0), V(xP, yD + tick, 0), 0.6, 0.3);
      const mk = v.P(V(bowX, yD, 0));
      g.fillStyle = ink(0.4);
      g.beginPath(); g.moveTo(mk.x, mk.y - 3.5); g.lineTo(mk.x - 3.2, mk.y + 2.5); g.lineTo(mk.x + 3.2, mk.y + 2.5); g.closePath(); g.fill();
      const lt = v.P(V(xT, yD, 0)), lp = v.P(V(xP, yD, 0));
      label(g, lt.x - 9, lt.y + 2, 'TASTO', TXT - 1, 0.3, 'right');
      label(g, lp.x + 9, lp.y + 2, 'PONTICELLO', TXT - 1, 0.3, 'left');
    }
    drawHead(g, F, v);
    drawBody(g, F, v);
    drawBowShadow(g, F, v, bp);
    drawNeck(g, F, v);
    drawFingerboard(g, F, v);
    drawTailAndEnd(g, F, v);
    drawBridge(g, F, v);

    // the four strings, and the vibrating part of each one played
    for (let s = 0; s < 4; ++s) {
      const w = lerp(1.25, 0.75, s / 3), nut = F.onString(s, -F.S), br = F.onString(s, 0), tp = F.onString(s, F.xTp0);
      if (!used[s]) line3(g, v, nut, br, w, live.length === 0 ? 0.78 : 0.55);
      else {
        let xLow = 0;
        for (let q = 0; q < live.length; ++q) if (on[q].s === s) xLow = Math.min(xLow, on[q].xf);
        if (xLow > -F.S + 1e-6) line3(g, v, nut, F.onString(s, xLow), w * 0.8, 0.3);
      }
      line3(g, v, br, tp, w * 0.85, 0.45);
    }
    const dip = (1 - bowLift) * (0.2 + 0.8 * sWeight) * 0.42 * F.k;
    for (let q = 0; q < live.length; ++q) {
      const lv = live[q], s = on[q].s, xf = on[q].xf, vis = P.visLevel(lv.level);
      const a = F.onString(s, xf), b = F.onString(s, 0);
      const amp = vis * 1.25 * F.spread(0.5 * xf) / 3 * (0.85 + 0.15 * Math.sin(clock * 40 + q));
      const tc = (bowX - xf) / Math.max(1e-6, -xf);
      const lens = [], NL = 16;
      for (let side = 0; side < 2; ++side)
        for (let i = 0; i <= NL; ++i) {
          const t = side === 0 ? i / NL : 1 - i / NL;
          const d = (side === 0 ? 1 : -1) * 4 * amp * t * (1 - t);
          const z = tc > 0.02 && tc < 0.98 ? -dip * Math.min(t / tc, (1 - t) / (1 - tc)) : 0;
          lens.push(add(add(a, mul(sub(b, a), t)), V(0, d, z)));
        }
      const w = lerp(1.25, 0.75, s / 3);
      strokeV(g, v, lens, w, 0.55 + 0.45 * vis, true);
      if (on[q].below || Math.abs(lv.sounding - F.open[s]) < 0.3) continue;
      const fp = v.P(a), r = lv.held ? 3.2 : 2.6;
      g.fillStyle = '#000'; g.beginPath(); g.arc(fp.x, fp.y, r + 1.2, 0, kTwoPi); g.fill();
      g.fillStyle = ink(lv.held ? 0.95 : 0.32); g.beginPath(); g.arc(fp.x, fp.y, r, 0, kTwoPi); g.fill();
    }

    drawFootprint(g, F, v, bp, bowX, lane);
    drawBow(g, v, bp);
    drawBowMotion(g, v, bp, bowVel);

    // the grips and their words
    const gs = gripSpots(F, bowX), be = v.P(F.bodyGripAt());
    halo(g, gs.pos.x + 12, gs.pos.y, 'POSITION', TXT - 1);
    halo(g, gs.wgt.x + 12, gs.wgt.y, 'WEIGHT', TXT - 1);
    halo(g, be.x + 12, be.y, 'BODY', TXT - 1);
    label(g, be.x + 12, be.y - 22, kStopName[stopOf(body)], TXT + 1, 0.55, 'left');
    {
      const W = F.n[nBrW], nf = v.P(V(0, -0.5 * W, F.zBrBase)), ff = v.P(V(0, 0.5 * W, F.zBrBase));
      const bx = Math.max(nf.x, ff.x) + 9, s0 = v.P(F.onString(0, 0)), s1 = v.P(F.onString(0, F.xTp0));
      const xr = bx + 50, ys = lerp(s0.y, s1.y, clamp01((xr - s0.x) / Math.max(1, s1.x - s0.x)));
      let by = Math.max(nf.y - 3, ys + 11);
      {
        const W2 = F.n[nTpW], t0 = v.P(V(F.xTp0, -0.5 * W2, F.zTp0 - 0.2 * W2)), t1 = v.P(V(F.xTp1, -0.26 * W2, F.zTp1 - 0.12 * W2));
        if (xr > t0.x) by = Math.max(by, lerp(t0.y, t1.y, clamp01((xr - t0.x) / Math.max(1, t1.x - t0.x))) + 8);
      }
      word(g, bx, by, 'BRIDGE', TXT, 0.32, 'left');
    }
    const nt = v.P(V(-F.S + 0.02 * F.S, -0.5 * F.n[nFbWn], F.zb0));
    label(g, nt.x + 6, nt.y + 18, 'NUT', TXT, 0.3, 'centre');

    let foot = '';
    if (live.length) {
      const lv = live[live.length - 1], s = on[on.length - 1].s, stop = Math.pow(2, -(lv.sounding - F.open[s]) / 12);
      const nUsed = used.filter(Boolean).length;
      foot = P.noteText(Math.round(lv.sounding));
      if (on[on.length - 1].below) foot += ' BELOW THE OPEN ' + P.noteText(F.open[0]);
      else if (Math.abs(lv.sounding - F.open[s]) < 0.3) foot += ` OPEN ${P.noteName(F.open[s])} STRING   ${(F.S).toFixed(1)} CM`;
      else foot += ` STOPPED AT ${(F.S * Math.min(1, stop)).toFixed(1)} CM, ${P.noteName(F.open[s])} STRING`;
      if (nUsed > 1) foot += `   ${nUsed} STRINGS`;
    } else foot = `OPEN STRING ${P.noteText(F.open[0])}   ${(F.S).toFixed(1)} CM`;
    label(g, 140, 500, foot, TXT, 0.5, 'left');

    P.grip(g, gs.pos.x, gs.pos.y, 'POSITION');
    P.grip(g, gs.wgt.x, gs.wgt.y, 'WEIGHT');
    P.grip(g, be.x, be.y, 'BODY');
    return { bodyGrip: be };
  }

  window.LiveStrings = { draw, reset: () => anim.fill(0) };
})();
