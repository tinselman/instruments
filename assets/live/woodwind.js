/* woodwind.js — BREATH AND BOW's woodwinds, live: a port of PlateWoodwind.cpp, its
 * single-reed family (clarinet .. saxophone), which is what the page's slider moves through.
 *
 * The instrument is built in metres from the numbers the sound is made from — its air
 * column the engine's own length — as a tube swept along a centreline: mouthpiece,
 * barrel or neck, joints, bow, bell, each lit from the upper left and cut into short
 * runs painted far to near. SIZE curls it up from a clarinet into an alto saxophone;
 * BORE opens the cylinder into a cone; MATERIAL runs wood -> plastic -> metal.
 * Playing (the engine's state, recorded 60 times a second beside the recordings): the
 * fingering closes every hole down to the sounding air column, the breath flows into
 * the mouthpiece, and the pressure's standing wave lies faintly along the bore.
 *
 *   LiveWoodwind.draw(g, params, frame, dt, clock)
 *     params: { size, bore, material, breath }   frame: { w: [...] | null, stepSize }
 */
(function () {
  'use strict';
  const P = window.Plate;
  const { kPi, kTwoPi, TXT, lerp, clamp01, smooth01, V, add, sub, mul, dot, cross, normalised, label, halo, ink, grey } = P;

  const kBoxL = 56, kBoxR = 884, kBoxT = 38, kBoxB = 466, kReadY = 498, kCapPpm = 1450, kMaxHoles = 40;
  const sstep = (e0, e1, x) => smooth01((x - e0) / (e1 - e0));
  const rad = d => d * kPi / 180;
  const len3 = a => Math.sqrt(dot(a, a));
  const lerp3 = (a, b, t) => add(a, mul(sub(b, a), t));
  const unitOr = (a, f) => { const l = len3(a); return l > 1e-9 ? mul(a, 1 / l) : f; };
  const pt = (x, y) => ({ x, y });
  const padd = (a, b) => pt(a.x + b.x, a.y + b.y), psub = (a, b) => pt(a.x - b.x, a.y - b.y), pmul = (a, s) => pt(a.x * s, a.y * s);
  const plen = a => Math.hypot(a.x, a.y), pdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerpP = (a, b, t) => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const lightDir = normalised(V(-0.55, -0.35, 0.75));
  const shade = n => 0.25 + 0.75 * Math.max(0, dot(normalised(n), lightDir));
  const towardViewer = v => P.viewDir(v);
  const greyC = (y, a = 1) => grey(y, a);

  // ---- the engine's air column: SIZE along the woodwinds' lengths, logarithmically
  const kWwLength = [0.28, 0.66, 1.00, 1.55, 2.90];
  function alongLog(a, x) { const pos = clamp01(x) * (a.length - 1), i = Math.min(a.length - 2, Math.floor(pos)); return a[i] * Math.pow(a[i + 1] / a[i], pos - i); }
  const fullLengthM = size => alongLog(kWwLength, size);

  // ---- what it is made of
  const kMats = [
    [0.040, 0.250, 1.30, 0.12, 12.0, 0.00, 0.00, 0.10, 0.0],
    [0.016, 0.190, 1.30, 0.22, 18.0, 0.00, 0.09, 0.00, 0.0],
    [0.030, 0.190, 1.20, 0.12, 7.0, 0.00, 0.00, 0.00, 0.0],
    [0.010, 0.070, 1.60, 0.70, 46.0, 0.14, 0.00, 0.00, 0.0],
    [0.006, 0.040, 1.60, 0.60, 70.0, 0.05, 0.00, 0.00, 1.0],
  ];
  const asMat = a => ({ base: a[0], diff: a[1], gam: a[2], spec: a[3], shine: a[4], sky: a[5], grain: a[6], fibre: a[7], clear: a[8] });
  const mixMat = (a, b, t) => asMat(a.map((x, i) => lerp(x, b[i], t)));
  function materialAt(x) { const pos = clamp01(x) * 4, i = Math.min(3, Math.floor(pos)); return mixMat(kMats[i], kMats[i + 1], smooth01(pos - i)); }
  const sInst = 0, sSilver = 1, sEbonite = 2, sThread = 3, sCane = 4;
  function stuffMat(stuff, instMat) {
    switch (stuff) {
      case sSilver: return asMat([0.030, 0.090, 1.50, 0.58, 40.0, 0.14, 0, 0, 0]);
      case sEbonite: return asMat([0.008, 0.050, 1.50, 0.30, 34.0, 0.03, 0, 0, 0]);
      case sThread: return asMat([0.050, 0.150, 1.20, 0.03, 5.0, 0, 0, 0, 0]);
      case sCane: return asMat([0.070, 0.200, 1.20, 0.06, 8.0, 0, 0, 0, 0]);
      default: return materialAt(instMat);
    }
  }
  function greyAt(m, N, Lt, H, Lb) {
    let y = m.base + m.diff * Math.pow(0.25 + 0.75 * Math.max(0, dot(N, Lt)), m.gam);
    y += m.spec * Math.pow(Math.max(0, dot(N, H)), m.shine);
    if (m.sky > 0) y += m.sky * Math.pow(Math.max(0, dot(N, Lb)), 3);
    return y;
  }

  // ---- the instrument
  const rBody = 0, rMouthpiece = 1, rBlades = 2, rWrap = 3, rCrook = 4, rBell = 5, rRing = 6, rCupPiece = 7, rCrown = 8;

  function RLaw(r0, r1) { return { r0, r1, bulge: 0, bulgeAt: 0.5, bulgeW: 1, flare: 0, flareP: 2.5, flare0: 0, flare0P: 2, beak: false }; }
  function rAt(R, t) {
    t = clamp01(t);
    let r = R.beak ? R.r1 * (0.34 + 0.66 * sstep(0, 0.5, t)) : lerp(R.r0, R.r1, t);
    if (R.bulge !== 0) { const u = (t - R.bulgeAt) / (0.5 * R.bulgeW); if (Math.abs(u) < 1) r += R.bulge * 0.5 * (1 + Math.cos(kPi * u)); }
    if (R.flare !== 0) r += R.flare * Math.pow(t, R.flareP);
    if (R.flare0 !== 0) r += R.flare0 * Math.pow(1 - t, R.flare0P);
    return r;
  }
  const shaped = R => R.beak || R.bulge !== 0 || R.flare !== 0 || R.flare0 !== 0;

  class Turtle {
    constructor(F) { this.F = F; this.p = V(0, 0, 0); this.th = 0; this.s = 0; }
    dir() { return V(Math.cos(this.th), 0, Math.sin(this.th)); }
    add(name, role, stuff, len, turn, R, seam = true) {
      if (len < 1e-5) return -1;
      let n = Math.max(2, Math.ceil(Math.abs(turn) / rad(4)));
      if (shaped(R)) n = Math.max(n, 18);
      n = Math.max(n, Math.ceil(len / 0.035));
      const Pt = { pts: [], name, role, stuff, seam, s0: this.s, s1: 0, rodSide: 1 };
      const push = t => Pt.pts.push({ p: this.p, t: this.dir(), s: this.s, r: rAt(R, t), ri: 0 });
      push(0);
      const ds = len / n, dth = turn / n;
      for (let i = 1; i <= n; ++i) {
        this.th += 0.5 * dth; this.p = add(this.p, mul(this.dir(), ds)); this.th += 0.5 * dth; this.s += ds;
        push(i / n);
      }
      Pt.s1 = this.s;
      this.F.parts.push(Pt);
      return this.F.parts.length - 1;
    }
  }

  function sampleAt(F, s, wantPart) {
    const np = F.parts.length;
    let k = 0;
    while (k < np - 1 && s > F.parts[k].s1) ++k;
    const pts = F.parts[k].pts;
    s = Math.min(pts[pts.length - 1].s, Math.max(pts[0].s, s));
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].s <= s) lo = m; else hi = m; }
    const t = pts[hi].s > pts[lo].s ? (s - pts[lo].s) / (pts[hi].s - pts[lo].s) : 0;
    return { p: lerp3(pts[lo].p, pts[hi].p, t), t: unitOr(lerp3(pts[lo].t, pts[hi].t, t), pts[lo].t), s,
             r: lerp(pts[lo].r, pts[hi].r, t), ri: lerp(pts[lo].ri, pts[hi].ri, t), part: k };
  }

  function markFingers(hs) {
    const n = hs.length;
    if (n <= 7) { for (const h of hs) if (!h.back) h.finger = true; return; }
    for (const f of [0.14, 0.26, 0.38, 0.55, 0.67, 0.79]) hs[Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))))].finger = true;
  }
  function holeRow(F, n, sTop, sBot) {
    for (let k = n - 1; k >= 0; --k) F.holes.push(newHole(sBot * Math.pow(sTop / sBot, k / (n - 1))));
  }
  const newHole = s => ({ s, rh: 0.003, rc: 0, az: 0, kind: 0, finger: false, back: false, part: -1, run: -1 });

  // ---- REED: the clarinet and the saxophone
  function buildSingle(F, z, b) {
    F.cone = b >= 0.5; F.keyed = true;
    const L = F.L, c = sstep(0.30, 0.48, z);
    F.curl = c;
    const Lref = lerp(0.66, 1.036, c), rs = Math.pow(L / Lref, 0.55);
    const mpF = lerp(lerp(0.130, 0.120, b), lerp(0.090, 0.075, b), c);
    const neckF = lerp(lerp(0.100, 0.085, b), lerp(0.140, 0.170, b), c);
    const bowR = lerp(0.034, 0.056, b) * rs, bowL = kPi * bowR * c;
    const btF = c * lerp(0.040, 0.085, b);
    const bellF = lerp(lerp(0.120, 0.170, b), lerp(0.080, 0.120, b), c);
    const bodyL = Math.max(0.2 * L, L * (1 - mpF - neckF - btF - bellF) - bowL);
    const rMp = lerp(0.0135, 0.0122, b) * rs;
    const nk0 = lerp(lerp(0.0152, 0.0086, b), lerp(0.0080, 0.0086, b), c) * rs;
    const nk1 = lerp(lerp(0.0152, 0.0105, b), lerp(0.0108, 0.0128, b), c) * rs;
    const bT = lerp(lerp(0.0145, 0.0112, b), lerp(0.0160, 0.0152, b), c) * rs;
    const bB = lerp(lerp(0.0150, 0.0215, b), lerp(0.0168, 0.0300, b), c) * rs;
    const bow1 = lerp(lerp(0.0150, 0.0215, b), lerp(0.0175, 0.0345, b), c) * rs;
    const bt1 = lerp(0.0180, 0.0410, b) * rs;
    const rim = lerp(lerp(0.0330, 0.0460, b), lerp(0.0420, 0.0620, b), c) * rs;
    const metalNeck = b > 0.5 || c > 0.5;
    const tailStuff = b > 0.5 ? sInst : (c > 0.5 ? sSilver : sInst);

    const tu = new Turtle(F);
    tu.th = lerp(rad(-26), rad(34), c);
    const mp = RLaw(rMp, rMp); mp.beak = true;
    F.mpPart = tu.add('MOUTHPIECE', rMouthpiece, sEbonite, mpF * L, 0, mp);
    F.mpBase = rMp; F.mpLen = mpF * L;
    const nk = RLaw(nk0, nk1); nk.bulge = (1 - b) * (1 - c) * 0.0009 * rs;
    tu.add(metalNeck ? 'NECK' : 'BARREL', metalNeck ? rCrook : rBody, tailStuff, neckF * L, -rad(108) * c, nk);
    const bMid = lerp(bT, bB, 0.53);
    const upIdx = tu.add('UPPER JOINT', rBody, sInst, 0.53 * bodyL, 0, RLaw(bT, bMid));
    const loIdx = tu.add('LOWER JOINT', rBody, sInst, 0.47 * bodyL, 0, RLaw(bMid, bB), b < 0.5);
    const bw1 = lerp(bB, bow1, c), bt1v = lerp(bw1, bt1, c);
    tu.add('BOW', rCrook, tailStuff, bowL, kPi * c, RLaw(bB, bw1));
    tu.add('', rBody, tailStuff, btF * L, 0, RLaw(bw1, bt1v), false);
    const bl = RLaw(bt1v, bt1v * (1 + 0.18 * b * c));
    bl.flare = Math.max(0, rim - bl.r1); bl.flareP = lerp(2.8, 2.5, b);
    tu.add('BELL', rBell, tailStuff, bellF * L, -rad(38) * c, bl);
    if (F.cone) { F.riA = 0.0055 * rs; F.riB = 0.8 * bt1v; }

    const sTop = F.parts[upIdx].s0 + 0.035 * rs, lowEnd = F.parts[loIdx].s1, bellS0 = L - bellF * L;
    const sBot = lerp(lowEnd - 0.028 * rs, bellS0 + 0.30 * bellF * L, c);
    holeRow(F, 14, sTop, sBot);
    markFingers(F.holes);
    let side = 0;
    for (const h of F.holes) {
      const q = sampleAt(F, h.s);
      const ri = F.cone ? lerp(F.riA, F.riB, clamp01(h.s / L)) : 0.55 * q.r;
      h.rh = Math.min(0.42 * q.r, Math.max(0.0022, lerp(0.58, 0.70, b) * ri));
      h.rc = Math.min(0.56 * q.r, Math.max(h.rh * 1.30, h.rh + 0.0015));
      h.kind = (b < 0.5 && h.finger) ? 1 : 2;
      if (!h.finger) h.az = ((++side & 1) ? 1 : -1) * lerp(0.50, 0.80, sstep(0.6, 0.9, h.s / L) * c);
    }
  }

  function nameFor(F, z, b, mat, prefixes = true) {
    const idx = Math.min(4, Math.max(0, Math.round(z * 4))), mi = Math.min(4, Math.max(0, Math.round(mat * 4)));
    const cl = ['E-FLAT CLARINET', 'CLARINET', 'ALTO CLARINET', 'BASS CLARINET', 'CONTRABASS CLARINET'];
    const sx = ['SOPRANINO SAXOPHONE', 'SOPRANO SAXOPHONE', 'ALTO SAXOPHONE', 'TENOR SAXOPHONE', 'BARITONE SAXOPHONE'];
    let n, usual = [1, 2];
    if (b > 0.35 && b < 0.65 && idx <= 1) n = 'TAROGATO';
    else n = b < 0.5 ? cl[idx] : sx[idx];
    if (b >= 0.5) usual = [3, 3];
    if (prefixes && mi !== usual[0] && mi !== usual[1]) n = ['BAMBOO ', 'WOODEN ', 'PLASTIC ', 'METAL ', 'GLASS '][mi] + n;
    return n;
  }

  // ---- on the plate
  function edgesOf(F, Pp) {
    const v = F.view, Vd = F.vd, n = Pp.pts.length;
    Pp.ea = []; Pp.eb = []; Pp.ec = []; Pp.ns = []; Pp.w = []; Pp.sn = []; Pp.drds = [];
    for (let i = 0; i < n; ++i) {
      const q = Pp.pts[i], T = q.t;
      const ns = unitOr(cross(T, Vd), unitOr(cross(T, V(0, 0, 1)), V(1, 0, 0)));
      const tv = dot(T, Vd), w = unitOr(sub(Vd, mul(T, tv)), V(0, -1, 0)), wl = Math.sqrt(Math.max(0, 1 - tv * tv));
      const a = i > 0 ? i - 1 : i, b = i + 1 < n ? i + 1 : i, ds = Pp.pts[b].s - Pp.pts[a].s;
      const drds = ds > 1e-9 ? (Pp.pts[b].r - Pp.pts[a].r) / ds : 0;
      const sn = Math.min(0.9, Math.max(-0.9, drds * tv / Math.max(0.08, wl))), cs = Math.sqrt(1 - sn * sn);
      Pp.ns.push(ns); Pp.w.push(w); Pp.sn.push(sn); Pp.drds.push(drds);
      Pp.ea.push(v.P(add(q.p, mul(add(mul(ns, cs), mul(w, sn)), q.r))));
      Pp.eb.push(v.P(add(q.p, mul(add(mul(ns, -cs), mul(w, sn)), q.r))));
      Pp.ec.push(v.P(q.p));
    }
  }

  function frontArc(F, Pp, i, rScale = 1, lift = 0, n = 16) {
    const q = Pp.pts[i], psiA = Math.asin(Pp.sn[i]), psiB = kPi - psiA, out = [];
    for (let k = 0; k <= n; ++k) {
      const a = lerp(psiA, psiB, k / n);
      out.push(F.view.P(add(q.p, mul(add(mul(Pp.ns[i], Math.cos(a)), mul(Pp.w[i], Math.sin(a))), q.r * rScale + lift))));
    }
    return out;
  }

  function alongRun(out, F, Pp, i0, i1, psi, k, wander, seed, lift = 0) {
    const qa = Pp.pts[i0], qb = Pp.pts[i1], len = qb.s - qa.s;
    const steps = Math.min(40, Math.max(2, Math.ceil(len / 0.006)));
    let seg = i0;
    const line = [];
    for (let m = 0; m <= steps; ++m) {
      const s = qa.s + len * m / steps;
      while (seg + 1 < i1 && Pp.pts[seg + 1].s < s) ++seg;
      const q0 = Pp.pts[seg], q1 = Pp.pts[seg + 1];
      const t = q1.s > q0.s ? clamp01((s - q0.s) / (q1.s - q0.s)) : 0;
      const p = lerp3(q0.p, q1.p, t);
      const ns = unitOr(lerp3(Pp.ns[seg], Pp.ns[seg + 1], t), Pp.ns[seg]), w = unitOr(lerp3(Pp.w[seg], Pp.w[seg + 1], t), Pp.w[seg]);
      const r = lerp(q0.r, q1.r, t);
      const ps = psi + wander * Math.sin(s * 41 + seed * 1.7) + 0.5 * wander * Math.sin(s * 97 + seed * 3.1);
      line.push(F.view.P(add(p, mul(add(mul(ns, Math.cos(ps)), mul(w, Math.sin(ps))), r * k + lift))));
    }
    out.push(line);
  }

  function makeRun(F, R) {
    const Pp = F.parts[R.part];
    if (Pp.role === rBlades) return;
    const m = stuffMat(Pp.stuff, F.mat), i0 = R.i0, i1 = R.i1, n = Pp.pts.length;
    const extStart = !(R.part === 0 && i0 === 0), extEnd = !(R.part === F.parts.length - 1 && i1 === n - 1);
    const dirFrom = (from, to) => { const d = psub(Pp.ec[to], Pp.ec[from]), l = plen(d); return l > 1e-9 ? pmul(d, 1 / l) : pt(0, 0); };
    const A = Pp.ea.slice(i0, i1 + 1).map(p => pt(p.x, p.y)), B = Pp.eb.slice(i0, i1 + 1).map(p => pt(p.x, p.y));
    const ext = 0.55;
    if (extStart) { const d = pmul(dirFrom(i0 + 1, i0), ext); A[0] = padd(A[0], d); B[0] = padd(B[0], d); }
    if (extEnd) { const d = pmul(dirFrom(i1 - 1, i1), ext); A[A.length - 1] = padd(A[A.length - 1], d); B[B.length - 1] = padd(B[B.length - 1], d); }
    R.fill = A.concat(B.slice().reverse());

    const ns = unitOr(add(Pp.ns[i0], Pp.ns[i1]), Pp.ns[i0]), w = unitOr(add(Pp.w[i0], Pp.w[i1]), Pp.w[i0]);
    const T = unitOr(add(Pp.pts[i0].t, Pp.pts[i1].t), Pp.pts[i0].t);
    const drds = 0.5 * (Pp.drds[i0] + Pp.drds[i1]);
    const psiA = Math.asin(Math.min(0.9, Math.max(-0.9, 0.5 * (Pp.sn[i0] + Pp.sn[i1])))), psiB = kPi - psiA, csA = Math.cos(psiA);
    const ga = pmul(padd(Pp.ea[i0], Pp.ea[i1]), 0.5), gb = pmul(padd(Pp.eb[i0], Pp.eb[i1]), 0.5);
    let nsScr = psub(F.view.P(add(Pp.pts[i0].p, mul(ns, 0.01))), Pp.ec[i0]);
    nsScr = pmul(nsScr, 1 / Math.max(1e-9, plen(nsScr)));
    const sideS = nsScr.x * F.lightScr.x + nsScr.y * F.lightScr.y;
    const Lt = unitOr(add(mul(ns, sideS), mul(w, 0.62)), w), Lb = unitOr(add(mul(ns, -sideS), mul(w, 0.30)), w);
    const H = normalised(add(Lt, F.vd));
    const mid = pmul(padd(ga, gb), 0.5);
    const fall = 1 - 0.18 * clamp01(0.6 * (mid.x - kBoxL) / (kBoxR - kBoxL) + 0.4 * (mid.y - kBoxT) / (kBoxB - kBoxT));
    const colourAt = psi => {
      const N = unitOr(sub(add(mul(ns, Math.cos(psi)), mul(w, Math.sin(psi))), mul(T, drds)), w);
      return greyC(clamp01(greyAt(m, N, Lt, H, Lb) * fall));
    };
    const fracOf = psi => clamp01((csA - Math.cos(psi)) / (2 * csA));
    const stops = [[0, colourAt(psiA)], [1, colourAt(psiB)]];
    const psis = [];
    for (let k = 1; k < 9; ++k) psis.push(lerp(psiA, psiB, k / 9));
    const psiS = Math.atan2(dot(w, H), dot(ns, H));
    if (m.spec > 0.15) for (const d of [-0.28, -0.12, -0.04, 0, 0.04, 0.12, 0.28]) { const p = psiS + d; if (p > psiA + 0.01 && p < psiB - 0.01) psis.push(p); }
    psis.sort((a, b) => a - b);
    for (const p of psis) stops.push([fracOf(p), colourAt(p)]);
    R.grad = { a: ga, b: gb, stops };
    R.edgeA = A; R.edgeB = B;
    const aLit = sideS > 0, lit = m.spec > 0.4 ? 0.70 : 0.64, dim = 0.46;
    R.alphaA = aLit ? lit : dim; R.alphaB = aLit ? dim : lit;
    R.widthA = aLit ? 1.15 : 0.95; R.widthB = aLit ? 0.95 : 1.15;
    R.strokes = [];
    if (Pp.stuff === sInst && m.grain > 0.01) {
      const it = { lines: [], w: 0.5, a: m.grain * 0.9 };
      for (let k = 0; k < 6; ++k) alongRun(it.lines, F, Pp, i0, i1, lerp(psiA + 0.35, psiB - 0.35, (k + 0.5) / 6), 1, 0.06, R.part * 7 + k);
      R.strokes.push(it);
      const it2 = { lines: [], w: 0.8, a: m.grain * 0.6 };
      alongRun(it2.lines, F, Pp, i0, i1, lerp(psiA, psiB, 0.34), 1, 0.1, R.part * 3 + 11);
      R.strokes.push(it2);
    }
    if (m.spec > 0.2 && psiS > psiA + 0.08 && psiS < psiB - 0.08) {
      const it = { lines: [], w: 0.8, a: Math.min(0.55, m.spec * 0.7) };
      alongRun(it.lines, F, Pp, i0, i1, psiS, 1, 0, 0);
      R.strokes.push(it);
    }
    if (i0 === 0 && R.part > 0 && Pp.seam) {
      const it = { lines: [frontArc(F, Pp, 0)], w: 0.8, a: 0.36 };
      const prev = F.parts[R.part - 1];
      if (prev.pts[prev.pts.length - 1].r > Pp.pts[0].r * 1.05) it.lines.push(frontArc(F, prev, prev.pts.length - 1));
      R.strokes.push(it);
    }
  }

  function buildRuns(F) {
    F.runs = [];
    F.parts.forEach((Pp, k) => {
      const n = Pp.pts.length;
      const depthOf = (a, b) => { let d = 0; for (let i = a; i <= b; ++i) d += dot(Pp.pts[i].p, F.vd); return d / (b - a + 1); };
      let i0 = 0;
      while (i0 < n - 1) {
        let j = i0 + 1;
        while (j + 1 < n && j - i0 < 12) {
          const A = Pp.pts[i0], B = Pp.pts[j + 1];
          if (dot(A.t, B.t) < Math.cos(rad(12))) break;
          if (Math.abs(B.r - A.r) > 0.15 * A.r + 0.0003) break;
          if (Math.abs(Pp.sn[j + 1] - Pp.sn[i0]) > 0.12) break;
          if (B.s - A.s > 0.11 * Math.sqrt(Math.max(1, F.L / 0.66))) break;
          ++j;
        }
        F.runs.push({ part: k, i0, i1: j, s0: Pp.pts[i0].s, s1: Pp.pts[j].s, depth: depthOf(i0, j), rod: [] });
        i0 = j;
      }
    });
    F.runs.forEach((r, i) => r.order = i);
    F.runs.sort((a, b) => a.depth - b.depth || a.order - b.order);
    for (const r of F.runs) makeRun(F, r);
  }

  function lastRunOver(F, s0, s1) { let best = -1; F.runs.forEach((r, i) => { if (r.s0 <= s1 && r.s1 >= s0) best = i; }); return best; }

  function beside(F, s, side, gap) {
    const q = sampleAt(F, s), ns = unitOr(cross(q.t, F.vd), V(0, 0, 1)), c = F.view.P(q.p);
    let n = psub(F.view.P(add(q.p, mul(ns, 0.01))), c);
    n = pmul(n, 1 / Math.max(1e-9, plen(n)));
    if (0.5 * n.x + 0.866 * n.y > 0) n = pmul(n, -1);
    return padd(c, pmul(n, side * (q.r * F.ppm + gap)));
  }

  function finish(F) {
    const v = new P.View3(); v.scale = 1; v.ox = 0; v.oy = 0;
    F.vd = towardViewer(v);
    const Vd = F.vd;
    // the mouthpiece: the table stays straight, the beak slopes to the tip
    {
      const Pp = F.parts[F.mpPart], T = Pp.pts[0].t;
      let ns = unitOr(cross(T, Vd), V(0, 0, -1));
      if (v.P(ns).y < 0) ns = mul(ns, -1);
      const w = unitOr(sub(Vd, mul(T, dot(Vd, T))), V(0, -1, 0));
      F.reedSide = unitOr(add(mul(ns, Math.cos(rad(28))), mul(w, Math.sin(rad(28)))), ns);
      for (const q of Pp.pts) q.p = add(q.p, mul(F.reedSide, F.mpBase - q.r));
      for (let i = 0; i < Pp.pts.length; ++i) {
        const a = i > 0 ? i - 1 : i, b = i + 1 < Pp.pts.length ? i + 1 : i;
        Pp.pts[i].t = unitOr(sub(Pp.pts[b].p, Pp.pts[a].p), T);
      }
    }
    // the bore
    {
      const x = clamp01(F.mat) * 4, wf = [0.26, 0.24, 0.16, 0.05, 0.18], i = Math.min(3, Math.floor(x)), wall = lerp(wf[i], wf[i + 1], x - i);
      for (const Pp of F.parts) for (const q of Pp.pts) {
        let ri = q.r * (1 - wall);
        if (Pp.role === rMouthpiece || Pp.role === rBlades || Pp.role === rCupPiece) ri = 0.45 * q.r;
        else if (Pp.role === rCrook || Pp.role === rWrap) ri = 0.62 * q.r;
        else if (F.riA < 0.5 && Pp.role !== rBell) ri = Math.min(ri, lerp(F.riA, F.riB, clamp01(q.s / F.L)));
        q.ri = Math.max(0.0006, ri);
      }
    }
    // fit the plate
    {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const Pp of F.parts) for (const q of Pp.pts) {
        const sp = v.P(q.p), r = q.r + 0.004;
        x0 = Math.min(x0, sp.x - r); x1 = Math.max(x1, sp.x + r); y0 = Math.min(y0, sp.y - r); y1 = Math.max(y1, sp.y + r);
      }
      const bw = Math.max(1e-3, x1 - x0), bh = Math.max(1e-3, y1 - y0);
      F.ppm = Math.min((kBoxR - kBoxL) / bw, (kBoxB - kBoxT) / bh, kCapPpm);
      v.scale = F.ppm;
      v.ox = 0.5 * (kBoxL + kBoxR) - F.ppm * 0.5 * (x0 + x1);
      v.oy = 0.5 * (kBoxT + kBoxB) - F.ppm * 0.5 * (y0 + y1);
      F.view = v;
    }
    for (const Pp of F.parts) edgesOf(F, Pp);
    {
      let main = F.parts[0];
      for (const Pp of F.parts) if (Pp.role === rBody && Pp.s1 - Pp.s0 > main.s1 - main.s0) main = Pp;
      const m = Math.floor(main.pts.length / 2);
      let n = psub(F.view.P(add(main.pts[m].p, mul(main.ns[m], 0.01))), main.ec[m]);
      n = pmul(n, 1 / Math.max(1e-9, plen(n)));
      F.lightScr = (-0.8 * n.x - 0.6 * n.y) >= 0 ? n : pmul(n, -1);
    }
    buildRuns(F);
    // the holes on the surface, facing us (and a little up)
    F.holes.sort((a, b) => a.s - b.s);
    if (F.holes.length > kMaxHoles) F.holes.length = kMaxHoles;
    const pref = unitOr(add(Vd, V(0, 0, 0.5)), Vd);
    const frame = q => { const F1 = unitOr(sub(pref, mul(q.t, dot(pref, q.t))), Vd); return [F1, unitOr(cross(q.t, F1), V(0, 1, 0))]; };
    for (const Pp of F.parts) {
      const q = Pp.pts[Math.floor(Pp.pts.length / 2)], [F1, F2] = frame(q);
      const ya = F.view.P(add(q.p, mul(add(mul(F1, Math.cos(1.15)), mul(F2, Math.sin(1.15))), q.r))).y;
      const yb = F.view.P(add(q.p, mul(add(mul(F1, Math.cos(-1.15)), mul(F2, Math.sin(-1.15))), q.r))).y;
      Pp.rodSide = ya > yb ? 1 : -1;
    }
    for (const h of F.holes) {
      const q = sampleAt(F, h.s), pk = q.part, [F1, F2] = frame(q);
      h.n = unitOr(add(mul(F1, Math.cos(h.az)), mul(F2, Math.sin(h.az))), F1);
      h.t = q.t; h.b = unitOr(cross(h.n, q.t), F2);
      h.c = add(q.p, mul(h.n, q.r));
      h.facing = dot(h.n, Vd);
      h.part = pk;
      const ra = h.az + F.parts[pk].rodSide * 1.15;
      h.rodAt = add(q.p, mul(add(mul(F1, Math.cos(ra)), mul(F2, Math.sin(ra))), q.r + 0.0032));
      h.run = lastRunOver(F, h.s - Math.max(h.rc, h.rh), h.s + Math.max(h.rc, h.rh));
    }
    // the rods, run by run
    for (let pi = 0; pi < F.parts.length; ++pi) {
      let sA = 1e9, sB = -1e9;
      for (const h of F.holes) if (h.part === pi && h.kind === 2 && !h.back) { sA = Math.min(sA, h.s - 0.012); sB = Math.max(sB, h.s + 0.012); }
      if (sB < sA) continue;
      const Pp = F.parts[pi];
      sA = Math.max(sA, Pp.s0); sB = Math.min(sB, Pp.s1);
      for (const R of F.runs) {
        if (R.part !== pi) continue;
        const a = Math.max(sA, R.s0), b = Math.min(sB, R.s1);
        if (b <= a) continue;
        const steps = Math.min(30, Math.max(1, Math.ceil((b - a) / 0.01))), line = [];
        for (let k = 0; k <= steps; ++k) {
          const q = sampleAt(F, lerp(a, b, k / steps)), [F1, F2] = frame(q), ra = Pp.rodSide * 1.15;
          line.push(F.view.P(add(q.p, mul(add(mul(F1, Math.cos(ra)), mul(F2, Math.sin(ra))), q.r + 0.0032))));
        }
        R.rod.push(line);
        for (const sp of [sA, sB])
          if (sp >= R.s0 - 1e-9 && sp <= R.s1 + 1e-9) {
            const q = sampleAt(F, sp), [F1, F2] = frame(q), ra = Pp.rodSide * 1.15;
            const d = add(mul(F1, Math.cos(ra)), mul(F2, Math.sin(ra)));
            R.rod.push([F.view.P(add(q.p, mul(d, q.r + 0.0036))), F.view.P(add(q.p, mul(d, q.r)))]);
          }
      }
    }
    // the mouth, and what is drawn after which run
    {
      const q0 = sampleAt(F, 0);
      F.mouthIn = q0.t;
      F.mouthAcross = unitOr(cross(q0.t, Vd), V(0, 0, 1));
      F.mouthP = add(q0.p, mul(F.reedSide, q0.r * 0.55));
      F.decoRun = lastRunOver(F, 0, F.mpLen);
      F.endRun = lastRunOver(F, F.L - 0.02, F.L);
    }
    // the air column along the plate
    F.axis = [];
    for (let i = 0; i <= 200; ++i) {
      const s = F.L * i / 200, q = sampleAt(F, s), role = F.parts[q.part].role;
      const body = q.r >= 0.0052 && role !== rMouthpiece && role !== rBlades && role !== rWrap && role !== rCupPiece;
      const ns = unitOr(cross(q.t, Vd), V(0, 0, 1)), c = F.view.P(q.p);
      let n = psub(F.view.P(add(q.p, mul(ns, 0.01))), c);
      n = pmul(n, 1 / Math.max(1e-9, plen(n)));
      F.axis.push({ c, n, s, ri: q.ri, r: q.r, body });
    }
    // the instrument as circles: what words and grips keep clear of
    F.hits = [];
    for (const Pp of F.parts) {
      const extra = 0.0045 * F.ppm;
      for (let i = 0; i + 1 < Pp.pts.length; ++i) {
        const a = Pp.ec[i], b = Pp.ec[i + 1], ra = Pp.pts[i].r * F.ppm + extra, rb = Pp.pts[i + 1].r * F.ppm + extra;
        const n = Math.max(1, Math.ceil(pdist(a, b) / Math.max(2, 0.5 * Math.min(ra, rb))));
        for (let k = 0; k <= n; ++k) { const t = k / n; F.hits.push({ c: lerpP(a, b, t), r: lerp(ra, rb, t) }); }
      }
    }
    placeWords(F);
  }

  // ---- grips and words, each in the first of its places that is clear
  function placeWords(F) {
    const taken = [];
    const R = (x, y, w, h) => ({ x, y, w, h });
    const expanded = (r, dx, dy) => R(r.x - dx, r.y - dy, r.w + 2 * dx, r.h + 2 * dy);
    const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const clearOf = (r, margin) => {
      if (r.x < 12 || r.x + r.w > 992 || r.y < 28 || r.y + r.h > 484) return false;
      for (const t of taken) if (meets(expanded(t, 6, 3), r)) return false;
      for (const h of F.hits) {
        const dx = Math.max(r.x - h.c.x, 0, h.c.x - (r.x + r.w)), dy = Math.max(r.y - h.c.y, 0, h.c.y - (r.y + r.h));
        if (dx * dx + dy * dy < (h.r + margin) * (h.r + margin)) return false;
      }
      return true;
    };
    const textW = (t, size) => 0.61 * size * t.length;
    const gripBox = (p, t) => R(p.x - 8, p.y - 9, 24 + textW(t, TXT - 1), 18);
    const wordBox = (p, t, j, size) => {
      const w = textW(t, size), x0 = j === 'left' ? p.x : (j === 'right' ? p.x - w : p.x - 0.5 * w);
      return R(x0 - 4, p.y - 0.62 * size - 1, w + 8, 1.24 * size + 2);
    };
    F.gripHalos = []; F.titleHalo = false;
    const placeGrip = (cands, t) => {
      for (const p of cands) if (clearOf(gripBox(p, t), 3)) { taken.push(gripBox(p, t)); return p; }
      taken.push(gripBox(cands[0], t)); F.gripHalos.push([cands[0], t]); return cands[0];
    };
    const L = F.L;
    {
      const last = F.parts[F.parts.length - 1], qe = last.pts[last.pts.length - 1], pe = F.view.P(qe.p);
      let te = psub(pe, F.view.P(sub(qe.p, mul(qe.t, 0.01))));
      te = pmul(te, 1 / Math.max(1e-9, plen(te)));
      const rimPx = qe.r * F.ppm;
      const cands = [padd(pe, pmul(te, rimPx * 0.35 + 18)), beside(F, L, -1, 16), beside(F, L, 1, 16),
        padd(pe, pt(rimPx + 18, -4)), padd(pe, pt(rimPx + 18, 20)), padd(pe, pt(rimPx * 0.4, -(rimPx + 26))),
        padd(pe, pt(-rimPx * 0.2, -(rimPx + 40))), padd(pe, pt(rimPx * 0.8, -(rimPx + 12))), beside(F, 0.97 * L, -1, 22),
        beside(F, 0.97 * L, 1, 22), padd(pe, pmul(te, rimPx + 30)), padd(pe, pt(0, -(rimPx + 64))), padd(pe, pt(-60, -(rimPx + 56))),
        padd(pe, pt(-130, -(rimPx + 34))), beside(F, 0.92 * L, 1, 40), beside(F, 0.86 * L, 1, 34), beside(F, 0.90 * L, -1, 40)];
      let done = false;
      for (let pass = 0; pass < 2 && !done; ++pass) {
        if (pass === 1) { if (F.shortName === F.name) break; F.name = F.shortName; }
        for (const p of cands) {
          const gb = gripBox(p, 'SIZE');
          if (!clearOf(gb, 3)) continue;
          for (const [tp, j] of [[pt(p.x + 12, p.y - 22), 'left'], [pt(p.x + 12, p.y + 22), 'left'], [pt(p.x + 42, p.y - 22), 'right'], [pt(p.x + 42, p.y + 22), 'right']]) {
            const tb = wordBox(tp, F.name, j, TXT + 1);
            if (clearOf(tb, 2) && !meets(gb, tb)) { F.gSize = p; F.title = tp; F.titleJ = j; taken.push(gb, tb); done = true; break; }
          }
          if (done) break;
        }
      }
      if (!done) {
        F.gSize = cands[0]; F.title = pt(F.gSize.x + 42, F.gSize.y - 22); F.titleJ = 'right'; F.titleHalo = true;
        F.gripHalos.push([F.gSize, 'SIZE']);
        taken.push(gripBox(F.gSize, 'SIZE'), wordBox(F.title, F.name, F.titleJ, TXT + 1));
      }
    }
    {
      const sB = 0.35 * F.mpLen, cands = [];
      for (const gap of [18, 28]) for (const ds of [0, 0.03, 0.06]) for (const side of [1, -1]) cands.push(beside(F, sB + ds * L, side, gap));
      F.gBreath = placeGrip(cands, 'BREATH');
    }
    {
      const cands = [];
      for (const f of [0.42, 0.50, 0.34, 0.58, 0.28, 0.66]) for (const side of [1, -1]) for (const gap of [16, 26]) cands.push(beside(F, f * L, side, gap));
      F.gMat = placeGrip(cands, 'MATERIAL');
    }
    {
      const cands = [];
      for (const f of [0.80, 0.86, 0.74, 0.90, 0.68]) for (const side of [-1, 1]) for (const gap of [16, 26]) cands.push(beside(F, f * L, side, gap));
      F.gBore = placeGrip(cands, 'BORE');
    }
    F.words = [];
    const say = (t, cands, j = 'centre') => {
      for (const p of cands) { const b = wordBox(p, t, j, TXT - 1); if (clearOf(b, 2)) { taken.push(b); F.words.push({ p, text: t, j }); return; } }
    };
    const around = (s, gap, firstSide = -1) => {
      const c = [];
      for (const gg of [gap, gap + 10]) for (const side of [firstSide, -firstSide]) for (const ds of [0, 0.025, -0.025, 0.05, -0.05]) c.push(beside(F, s + ds * F.L, side, gg));
      return c;
    };
    say('REED', around(0.40 * F.mpLen, 18));
    say('MOUTHPIECE', around(0.75 * F.mpLen, 18, 1));
    if (F.curl > 0.5) say('NECK', around(F.mpLen + 0.08 * L, 18));
    say(F.curl > 0.5 ? 'KEYS' : 'TONE HOLES', around(0.55 * L, 26));
    say('BELL', around(0.96 * L, 22));
    {
      F.overAt = beside(F, 0.35 * L, 1, 26);
      for (const f of [0.35, 0.28, 0.45, 0.22, 0.55]) for (const side of [1, -1]) for (const gap of [22, 34]) {
        const p = beside(F, f * L, side, gap), b = wordBox(p, 'OVERBLOWN', 'centre', TXT - 1);
        if (clearOf(b, 2)) { F.overAt = p; taken.push(b); return; }
      }
    }
  }

  function buildForm(p) {
    const F = { size: p.size, bore: p.bore, mat: p.material, parts: [], runs: [], holes: [], riA: 1, riB: 1, curl: 0, builds: ++builds };
    F.L = Math.max(0.1, fullLengthM(p.size));
    const z = clamp01(p.size), b = clamp01(p.bore), m = clamp01(p.material);
    buildSingle(F, z, b);
    F.name = nameFor(F, z, b, m);
    F.shortName = nameFor(F, z, b, m, false);
    finish(F);
    return F;
  }
  let builds = 0, cache = null;
  const formFor = p => (cache && cache.size === p.size && cache.bore === p.bore && cache.mat === p.material) ? cache : (cache = buildForm(p));

  // ---- drawing
  const pathOf = (pts, close) => P.pathPts(pts, close);
  function strokeLines(g, lines, w, alpha, cap = 'round') {
    g.beginPath();
    for (const l of lines) l.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
    g.lineJoin = 'round'; g.lineCap = cap; g.lineWidth = w; g.strokeStyle = ink(alpha); g.stroke();
  }

  function paintRun(g, R) {
    if (!R.fill || !R.fill.length) return;
    const gr = g.createLinearGradient(R.grad.a.x, R.grad.a.y, R.grad.b.x, R.grad.b.y);
    for (const [f, c] of R.grad.stops.slice().sort((a, b) => a[0] - b[0])) gr.addColorStop(clamp01(f), c);
    g.fillStyle = gr; g.fill(pathOf(R.fill, true));
    for (const s of R.strokes) strokeLines(g, s.lines, s.w, s.a);
    strokeLines(g, [R.edgeA], R.widthA, R.alphaA, 'butt');
    strokeLines(g, [R.edgeB], R.widthB, R.alphaB, 'butt');
  }

  function circle3(v, c, a, b, r, n = 20) {
    const out = [];
    for (let i = 0; i < n; ++i) { const t = kTwoPi * i / n; out.push(v.P(add(c, mul(add(mul(a, Math.cos(t)), mul(b, Math.sin(t))), r)))); }
    return out;
  }

  function drawOpening(g, F, q, out, rOut, rIn, throatR, throatDepth, m) {
    const v = F.view;
    const e1 = unitOr(cross(out, F.vd), unitOr(cross(out, V(0, 0, 1)), V(1, 0, 0))), e2 = unitOr(cross(out, e1), V(0, 0, 1));
    const facing = dot(out, F.vd), outer = circle3(v, q.p, e1, e2, rOut, 36);
    if (facing <= 0.02) {
      const sg = dot(e2, F.vd) < 0 ? -1 : 1, half = [];
      for (let i = 0; i <= 18; ++i) { const t = kPi * i / 18; half.push(v.P(add(q.p, mul(add(mul(e1, Math.cos(t)), mul(e2, sg * Math.sin(t))), rOut)))); }
      P.strokePath(g, pathOf(half), 1.0, 0.55);
      return;
    }
    const inner = circle3(v, q.p, e1, e2, rIn, 36), opa = 1 - 0.7 * m.clear;
    {
      const face = pathOf(outer, true); face.addPath(pathOf(inner, true));
      const H = normalised(add(lightDir, F.vd));
      g.fillStyle = greyC(clamp01(m.base + m.diff * Math.pow(shade(out), m.gam) + 0.4 * m.spec * Math.pow(Math.max(0, dot(out, H)), 8)), opa);
      g.fill(face, 'evenodd');
    }
    {
      const up = unitOr(sub(F.vd, mul(out, facing)), e2), far = v.P(sub(q.p, mul(up, rIn))), nearP = v.P(add(q.p, mul(up, rIn)));
      const shiny = m.spec > 0.4 && m.clear < 0.5;
      const gr = g.createLinearGradient(far.x, far.y, nearP.x, nearP.y);
      gr.addColorStop(0, greyC(shiny ? 0.36 : 0.16, opa)); gr.addColorStop(0.4, greyC(shiny ? 0.09 : 0.05, opa)); gr.addColorStop(1, greyC(0, opa));
      const ip = pathOf(inner, true);
      g.fillStyle = gr; g.fill(ip);
      if (throatR > 0) {
        const throat = pathOf(circle3(v, sub(q.p, mul(out, throatDepth)), e1, e2, throatR, 24), true);
        g.save(); g.clip(ip);
        g.fillStyle = greyC(0, 0.9); g.fill(throat);
        P.strokePath(g, throat, 0.6, 0.18);
        g.restore();
      }
      if (shiny) {
        const lines = []; let cur = null;
        for (let i = 0; i <= 40; ++i) {
          const t = kTwoPi * i / 40, d = add(mul(e1, Math.cos(t)), mul(e2, Math.sin(t)));
          if (dot(d, up) < -0.15) { const pnt = v.P(add(q.p, mul(d, 0.955 * rOut))); if (!cur) { cur = []; lines.push(cur); } cur.push(pnt); }
          else cur = null;
        }
        strokeLines(g, lines, 1.3, 0.6);
      }
    }
    P.strokePath(g, pathOf(inner, true), 0.7, 0.38);
    P.strokePath(g, pathOf(outer, true), m.spec > 0.4 ? 1.3 : 1.1, m.spec > 0.4 ? 0.75 : 0.66);
  }

  function dot2(g, c, r, alpha, haloPx = 1.2) {
    if (haloPx > 0) { g.fillStyle = '#000'; g.beginPath(); g.arc(c.x, c.y, r + haloPx, 0, kTwoPi); g.fill(); }
    g.fillStyle = ink(alpha); g.beginPath(); g.arc(c.x, c.y, r, 0, kTwoPi); g.fill();
  }

  function drawHole(g, F, h, cover, held) {
    if (h.back || h.facing < 0.1) return;
    const v = F.view, vis = clamp01((h.facing - 0.1) / 0.3);
    const hole = pathOf(circle3(v, h.c, h.t, h.b, h.rh, 20), true), centre = v.P(h.c);
    if (h.kind === 2) {
      const lift = lerp(0.0016 + 0.22 * h.rc, 0.0006, cover), cc = add(h.c, mul(h.n, lift));
      const lt = unitOr(sub(lightDir, mul(h.n, dot(lightDir, h.n))), h.t);
      g.fillStyle = greyC(0, vis * (1 - cover)); g.fill(hole);
      {
        const d = sub(h.rodAt, cc), toward = unitOr(sub(d, mul(h.n, dot(d, h.n))), h.b);
        const a = v.P(add(cc, mul(toward, h.rc))), b = v.P(h.rodAt);
        g.lineCap = 'butt'; g.lineWidth = 2.4; g.strokeStyle = `rgba(0,0,0,${vis})`;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        P.strokeLine(g, a.x, a.y, b.x, b.y, 0.9, 0.45 * vis);
      }
      const side = pathOf(circle3(v, sub(cc, mul(h.n, 0.0010 + 0.06 * h.rc)), h.t, h.b, h.rc, 24), true);
      const cup = pathOf(circle3(v, cc, h.t, h.b, h.rc, 24), true);
      g.fillStyle = greyC(0.06, vis); g.fill(side);
      {
        const p0 = v.P(add(cc, mul(lt, h.rc))), p1 = v.P(sub(cc, mul(lt, h.rc)));
        P.fillGradient(g, cup, p0, greyC(0.52, vis), p1, greyC(0.12, vis));
        const dish = pathOf(circle3(v, sub(cc, mul(h.n, 0.0003)), h.t, h.b, h.rc * 0.74, 20), true);
        P.fillGradient(g, dish, p0, greyC(0.16, vis), p1, greyC(0.32 + 0.10 * cover, vis));
      }
      P.strokePath(g, cup, 0.8, (0.55 + 0.25 * cover) * vis);
      {
        const lines = []; let cur = null;
        for (let k = 0; k <= 24; ++k) {
          const t = kTwoPi * k / 24, d = add(mul(h.t, Math.cos(t)), mul(h.b, Math.sin(t)));
          if (dot(d, lt) > 0.55) { const q = v.P(add(cc, mul(d, h.rc))); if (!cur) { cur = []; lines.push(cur); } cur.push(q); }
          else cur = null;
        }
        strokeLines(g, lines, 1.1, 0.55 * vis);
      }
      if (h.finger && cover > 0.02) dot2(g, v.P(cc), 2.2 + 0.8 * cover, (held ? 0.95 : 0.4) * cover * vis);
      return;
    }
    if (h.kind === 1) {
      const ringPts = circle3(v, add(h.c, mul(h.n, 0.0006)), h.t, h.b, h.rh * 1.6, 22);
      const ring = pathOf(ringPts, true); ring.addPath(hole);
      g.fillStyle = greyC(0.26, vis); g.fill(ring, 'evenodd');
      P.strokePath(g, pathOf(ringPts, true), 0.7, 0.5 * vis);
    }
    g.fillStyle = greyC(0, vis); g.fill(hole);
    P.strokePath(g, hole, 0.7, 0.5 * vis);
    if (cover > 0.02) {
      const pad = pathOf(circle3(v, add(h.c, mul(h.n, 0.0008)), h.t, h.b, h.rh * 1.22, 20), true);
      g.fillStyle = greyC(0.30, cover * vis); g.fill(pad);
      P.strokePath(g, pad, 0.8, 0.6 * cover * vis);
      dot2(g, centre, 2.5 + 0.9 * cover, (held ? 0.95 : 0.4) * cover * vis);
    }
  }

  function drawReedAndLigature(g, F, reedMat) {
    const v = F.view, Pp = F.parts[F.mpPart], L = F.mpLen, reedL = 0.80 * L, rs = F.reedSide;
    const table = s => { const q = sampleAt(F, s); return { p: add(q.p, mul(rs, q.r)), T: q.t }; };
    const N = 22, nearE = [], farE = [], tableNear = [];
    const T0 = table(0).T, uw = unitOr(cross(T0, rs), V(0, 1, 0)), nearSign = dot(uw, F.vd) > 0 ? 1 : -1;
    for (let i = 0; i <= N; ++i) {
      const u = i / N, s = u * reedL, p = table(s).p;
      const th = 0.0003 + 0.0030 * sstep(0, 0.62, u), hw = 0.0064 * (0.94 + 0.06 * sstep(0, 0.15, u));
      nearE.push(v.P(add(add(p, mul(rs, th)), mul(uw, hw * nearSign))));
      farE.push(v.P(sub(add(p, mul(rs, th)), mul(uw, hw * nearSign))));
      tableNear.push(v.P(add(p, mul(uw, hw * nearSign))));
    }
    const edge = pathOf(tableNear.concat(nearE.slice().reverse()), true);
    const cane = 1 - sstep(0.2, 0.45, reedMat), metal = sstep(0.62, 0.9, reedMat);
    g.fillStyle = greyC(0.10 + 0.05 * metal); g.fill(edge);
    P.strokePath(g, edge, 0.6, 0.35);
    const face = pathOf(farE.concat(nearE.slice().reverse()), true);
    {
      const lo = lerp(lerp(0.34, 0.38, cane), 0.42, metal), hi = lerp(lerp(0.16, 0.20, cane), 0.10, metal);
      P.fillGradient(g, face, nearE[0], greyC(lo), nearE[nearE.length - 1], greyC(hi));
    }
    if (cane > 0.05) {
      const fib = [];
      for (let k = 1; k < 5; ++k) { const l = []; for (let i = 2; i < nearE.length; ++i) l.push(lerpP(nearE[i], farE[i], k / 5)); fib.push(l); }
      strokeLines(g, fib, 0.4, 0.14 * cane);
      const kb = Math.round(0.62 * N);
      strokeLines(g, [[farE[kb], lerpP(lerpP(farE[kb], nearE[kb], 0.5), lerpP(farE[kb - 3], nearE[kb - 3], 0.5), 0.9), nearE[kb]]], 0.6, 0.35 * cane);
    }
    if (metal > 0.05) strokeLines(g, [[lerpP(nearE[2], farE[2], 0.35), lerpP(nearE[nearE.length - 1], farE[farE.length - 1], 0.35)]], 1.0, 0.5 * metal);
    P.strokePath(g, face, 0.9, 0.72);
    for (const f of [0.56, 0.76]) {
      const q = sampleAt(F, f * L);
      let k = 0;
      while (k + 1 < Pp.pts.length - 1 && Pp.pts[k + 1].s < f * L) ++k;
      const ns = Pp.ns[k], w = Pp.w[k], r = q.r + 0.0010, arc = [];
      for (let j = 0; j <= 18; ++j) {
        const a = kPi * j / 18, d = add(mul(ns, Math.cos(a)), mul(w, Math.sin(a)));
        arc.push(v.P(add(add(q.p, mul(d, r)), mul(rs, 0.0015 * Math.max(0, dot(d, rs))))));
      }
      const bandPx = 0.0034 * F.ppm, ap = pathOf(arc);
      g.lineJoin = 'round'; g.lineCap = 'butt';
      g.lineWidth = bandPx + 1.6; g.strokeStyle = '#000'; g.stroke(ap);
      g.lineWidth = bandPx; g.strokeStyle = greyC(0.30); g.stroke(ap);
      P.strokePath(g, ap, 0.7, 0.55);
      const base = add(q.p, mul(rs, q.r + 0.0035)), s0 = v.P(base), s1 = v.P(add(base, mul(rs, 0.0045)));
      P.strokeLine(g, s0.x, s0.y, s1.x, s1.y, 1.6, 0.5);
      const head = pathOf(circle3(v, add(base, mul(rs, 0.0048)), T0, uw, 0.0022, 12), true);
      g.fillStyle = greyC(0.2); g.fill(head);
      P.strokePath(g, head, 0.7, 0.6);
    }
  }

  function pressureShape(F, n, x) {
    n = Math.max(1, n); x = clamp01(x);
    if (!F.cone) return Math.abs(Math.cos(kPi * (n - 0.5) * x));
    const a = 0.08, k = kPi * n * (a + (1 - a) * x);
    return Math.pow(Math.abs(Math.sin(k) / k), 0.6) / Math.pow(Math.abs(Math.sin(kPi * n * a) / (kPi * n * a)), 0.6);
  }

  function dashes(pts, on, off, phase) {
    const n = pts.length, out = [];
    if (n < 2) return out;
    const cum = [0];
    for (let i = 1; i < n; ++i) cum[i] = cum[i - 1] + pdist(pts[i - 1], pts[i]);
    const total = cum[n - 1], period = on + off;
    if (total <= 1e-6 || period <= 0) return out;
    let k = 0;
    const at = d => { while (k + 2 < n && cum[k + 1] < d) ++k; const l = cum[k + 1] - cum[k], t = l > 1e-12 ? clamp01((d - cum[k]) / l) : 0; return lerpP(pts[k], pts[k + 1], t); };
    let d0 = -(phase % period);
    if (d0 > 0) d0 -= period;
    for (; d0 < total; d0 += period) {
      const a = Math.max(0, d0), b = Math.min(total, d0 + on);
      if (b <= a + 0.05) continue;
      const line = [at(a)];
      let j = k + 1;
      while (j < n && cum[j] < b) { line.push(pts[j]); ++j; }
      line.push(at(b));
      out.push(line);
    }
    return out;
  }

  // ---- the plate: the instrument as it is at this instant
  const A = new Array(64).fill(0);
  const kCover0 = 20;
  const REED = 0.0;                     // the CLARINET preset's cane reed

  function draw(g, p, frame, dt, clock) {
    const F = formFor(p), v = F.view;
    const w = frame.w || [0, 0, 60, 261.6, 0.6, 0, 0, 1, 1, 0, 0];
    const held = !!w[0], sounding = !!w[1];
    // the recorded column, scaled from the recorded instrument's length to this one's
    const tubeNow = w[4] * F.L / fullLengthM(frame.stepSize ?? p.size);
    const breathNow = sounding ? clamp01(w[5]) : 0, levelNow = sounding ? P.visLevel(w[6]) : 0;
    const mode = Math.max(1, w[7]), fingerMode = Math.max(1, w[8]), slurs = w[10], semis = w[2];
    const fresh = A[0] < 0.5 || A[1] !== F.builds;
    const ease = (i, target, tau) => (fresh ? (A[i] = target) : (A[i] += (target - A[i]) * (1 - Math.exp(-dt / tau))));
    const tube = ease(2, sounding ? tubeNow : A[2], 0.025);
    const breath = ease(3, held ? breathNow : 0, 0.06);
    const vis = ease(4, levelNow, 0.06);
    if (fresh) { A[5] = slurs; A[6] = 1; }
    if (slurs !== A[5]) { A[5] = slurs; A[6] = 0; } else A[6] = Math.min(1, A[6] + dt);
    const attack = 1 - clamp01(A[6] / 0.45);
    A[7] = (A[7] + dt * (0.8 + 3.2 * breath)) % 1000;
    A[8] = (A[8] + dt * kTwoPi * (5 + 4 * breath)) % (1000 * kTwoPi);
    A[0] = 1; A[1] = F.builds;
    const nh = F.holes.length;
    for (let i = 0; i < nh; ++i) {
      const h = F.holes[i];
      let target = 0;
      if (held) { const below = i + 1 < nh ? F.holes[i + 1].s : Math.max(h.s + 0.02, F.L); target = clamp01((tube - h.s) / Math.max(1e-4, below - h.s)); }
      ease(kCover0 + i, target, 0.03);
    }

    F.runs.forEach((R, ri) => {
      paintRun(g, R);
      if (R.rod.length) {
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath(); for (const l of R.rod) l.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
        g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = greyC(0.34); g.stroke();
        g.lineWidth = 0.6; g.strokeStyle = ink(0.55); g.stroke();
      }
      if (ri === F.endRun) {
        const last = F.parts[F.parts.length - 1], qe = last.pts[last.pts.length - 1], m = stuffMat(last.stuff, F.mat);
        const wall = m.spec > 0.4 && m.clear < 0.5 ? 0.0010 : 0.0032;
        let throatR = 0, throatD = 0;
        if (last.role === rBell && last.pts.length > 4) {
          const qt = last.pts[Math.floor(last.pts.length / 3)];
          throatR = Math.max(0.001, qt.ri); throatD = dot(sub(qe.p, qt.p), qe.t);
        }
        drawOpening(g, F, qe, qe.t, qe.r, Math.max(0.0008, qe.r - wall), throatR, throatD, m);
      }
      if (ri === F.decoRun) drawReedAndLigature(g, F, REED);
      for (let i = 0; i < nh; ++i) if (F.holes[i].run === ri) drawHole(g, F, F.holes[i], A[kCover0 + i], held);
    });

    // the sound in the tube: the pressure's standing wave along the bore
    if (vis > 0.02 && sounding) {
      const sEnd = Math.min(F.L, Math.max(0.02, tube)), up = [], dn = [], shimmer = 0.9 + 0.1 * Math.sin(clock * 37);
      for (const a of F.axis) {
        if (a.s > sEnd + 1e-9) break;
        if (!a.body && !up.length) continue;
        const amp = vis * shimmer * (0.60 * a.r + 0.15 * a.ri) * F.ppm * pressureShape(F, mode, a.s / sEnd);
        up.push(padd(a.c, pmul(a.n, amp))); dn.push(psub(a.c, pmul(a.n, amp)));
      }
      if (up.length > 1) {
        g.fillStyle = ink(0.10 * (0.35 + 0.65 * vis) + 0.05 * attack);
        g.fill(pathOf(up.concat(dn.slice().reverse()), true));
        strokeLines(g, dashes(up, 1, 2.6, 0).concat(dashes(dn, 1, 2.6, 0)), 1.1, clamp01(0.42 + 0.3 * vis + 0.25 * attack));
        for (let k = 1; k < mode; ++k) {
          const x = F.cone ? (k / mode - 0.08) / 0.92 : (2 * k - 1) / (2 * mode - 1);
          if (x <= 0 || x >= 1) continue;
          const q = sampleAt(F, x * sEnd), ns = unitOr(cross(q.t, F.vd), V(0, 0, 1));
          const p0 = v.P(add(q.p, mul(ns, 0.62 * q.r))), p1 = v.P(sub(q.p, mul(ns, 0.62 * q.r)));
          P.strokeLine(g, p0.x, p0.y, p1.x, p1.y, 0.7, 0.35 * vis + 0.1);
        }
      }
      if (sEnd < F.L - 0.005) {
        const q = sampleAt(F, sEnd), ns = unitOr(cross(q.t, F.vd), V(0, 0, 1));
        const a = v.P(add(q.p, mul(ns, 0.75 * q.r))), b = v.P(sub(q.p, mul(ns, 0.75 * q.r)));
        P.strokeLine(g, a.x, a.y, b.x, b.y, 1.0, 0.5 * vis);
      }
      if (mode > fingerMode) label(g, F.overAt.x, F.overAt.y, 'OVERBLOWN', TXT - 1, 0.5, 'centre');
    }

    // the breath, into the mouthpiece along its axis
    if (breath > 0.01) {
      const flow = A[7], breathy = clamp01(p.breath), M = F.mouthP, D = F.mouthIn, S = F.mouthAcross;
      const L0 = (34 + 46 * breath) / F.ppm, from = v.P(sub(M, mul(D, L0))), to = v.P(M);
      let stream = [];
      for (let k = 0; k < 4; ++k) {
        const o = (k - 1.5) / 1.5, line = [];
        for (let i = 0; i <= 18; ++i) {
          const u = i / 18, spread = lerp(11, 1.2, Math.pow(u, 0.55)) / F.ppm;
          line.push(v.P(add(sub(M, mul(D, L0 * (1 - u))), mul(S, o * spread))));
        }
        stream = stream.concat(dashes(line, 9, 6, -flow * 14 + k * 4.3));
      }
      const gr = g.createLinearGradient(from.x, from.y, to.x, to.y);
      gr.addColorStop(0, ink(0)); gr.addColorStop(1, ink(0.30 + 0.50 * breath));
      g.beginPath(); for (const l of stream) l.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
      g.lineJoin = 'round'; g.lineCap = 'butt'; g.lineWidth = 0.75; g.strokeStyle = gr; g.stroke();
      if (breathy > 0.05) {
        const nw = 1 + Math.round(breathy * 4);
        for (let k = 0; k < nw; ++k) {
          const ph = (flow * 0.6 + k * 0.618) % 1, ang = -1.2 + 0.9 * k + 0.4 * Math.sin(k * 2.3);
          const dir = pt(Math.cos(ang), Math.sin(ang) - 0.8), d0 = 4 + 26 * ph, wl = [];
          for (let i = 0; i <= 8; ++i) {
            const u = i / 8, dd = d0 + 9 * u, perp = pt(-dir.y, dir.x);
            wl.push(padd(padd(to, pmul(dir, dd)), pmul(perp, 3 * Math.sin(u * 5 + ph * 9 + k))));
          }
          strokeLines(g, [wl], 0.6, 0.35 * breath * breathy * Math.sin(kPi * ph));
        }
      }
    }
    if (attack > 0.01 && sounding) {
      const m = v.P(F.mouthP), r = 5 + 22 * (1 - attack);
      g.beginPath(); g.ellipse(m.x, m.y, r, r * 0.8, 0, 0, kTwoPi);
      g.lineJoin = 'round'; g.lineWidth = 0.8; g.strokeStyle = ink(0.5 * attack); g.stroke();
    }

    // words, the name, the grips
    for (const wd of F.words) label(g, wd.p.x, wd.p.y, wd.text, TXT - 1, 0.32, wd.j);
    if (F.titleHalo) halo(g, F.title.x, F.title.y, F.name, TXT + 1, F.titleJ);
    label(g, F.title.x, F.title.y, F.name, TXT + 1, 0.55, F.titleJ);
    for (const [q, t] of F.gripHalos) halo(g, q.x + 12, q.y, t, TXT - 1);
    let foot, closed = 0;
    for (let i = 0; i < nh; ++i) if (A[kCover0 + i] > 0.5 && !F.holes[i].back) ++closed;
    if (sounding && held) {
      foot = `${P.noteText(Math.round(semis))}   AIR COLUMN ${(Math.min(tube, 9.99) * 100).toFixed(1)} OF ${(F.L * 100).toFixed(1)} CM   ${closed} ${closed === 1 ? 'HOLE' : 'HOLES'} CLOSED`;
      if (mode > fingerMode) foot += `   OVERBLOWN, MODE ${mode}`;
      else if (mode > 1) foot += `   REGISTER ${mode}`;
    } else foot = `${(F.L * 100).toFixed(1)} CM OF AIR   ${nh} TONE HOLES, OPEN`;
    label(g, 500, kReadY, foot, TXT, 0.5, 'centre');
    P.grip(g, F.gBreath.x, F.gBreath.y, 'BREATH');
    P.grip(g, F.gSize.x, F.gSize.y, 'SIZE');
    P.grip(g, F.gBore.x, F.gBore.y, 'BORE');
    P.grip(g, F.gMat.x, F.gMat.y, 'MATERIAL');
  }

  window.LiveWoodwind = { draw, reset: () => A.fill(0) };
})();
