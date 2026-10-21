/* piano.js — PIANO's one key of a grand, live: a port of PianoComponent.cpp.
 *
 * White line art on black in the plug-in's 1000 x 620 design space: key lever,
 * capstan, wippen, jack, hammer on its shank, backcheck, damper riding the string,
 * and the string itself, its length and its plucking finger set by the sliders.
 * The action plays the notes the recording plays, at the moments it plays them:
 * the key rocks down, the hammer flies to the string and checks, the damper lifts,
 * the string blurs into its first two modes and dies when the key comes up.
 *
 *   LivePiano.draw(g, params, frame, dt)   g: a 2D context in design space
 *     params: { length, pluck }   frame: { t: seconds into the loop | null, notes: [[t, midi, vel, dur]] }
 */
(function () {
  'use strict';
  const STRING_Y = 150, AGRAFFE_X = 470, PIN_X = 512;
  const KEY_BACK = 352, KEY_FRONT = 946, KEY_TOP = 344, KEY_BOTTOM = 378, KEY_BX = 630, KEY_BY = 360;
  const DAMPER_X = 308, HAMMER_LIFT_DEG = 17.6, ISO_X = -22, ISO_Y = -12, ROOT_Y = 40;
  const HOT = 'rgb(255,45,32)';
  const LABEL = 14.5;              // the parts' names, as large as the plug-in draws them here
  const FONT = 'Menlo, "SF Mono", Monaco, Consolas, "DejaVu Sans Mono", monospace';
  // the STEINWAY GRAND preset, as recorded (LENGTH and PLUCK come from the sliders)
  const ST = { gauge: 0.52, damper: 0.85, honky: 0.03, hammer: 0.52, strike: 0.42, electric: 0, reverse: 0 };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;
  const rad = d => d * Math.PI / 180;
  const ink = a => `rgba(255,255,255,${clamp01(a)})`;

  // ---- drawing, as the C++ helpers draw (every y below the SVG root's translate)
  function line(g, x1, y1, x2, y2, w, alpha) {           // drawLine: butt ends
    g.lineCap = 'butt'; g.lineWidth = w; g.strokeStyle = ink(alpha);
    g.beginPath(); g.moveTo(x1, y1 + ROOT_Y); g.lineTo(x2, y2 + ROOT_Y); g.stroke();
  }
  function poly(g, pts, close, w, alpha) {                // PathStrokeType (w): mitred, butt
    g.beginPath();
    pts.forEach(([x, y], i) => i ? g.lineTo(x, y + ROOT_Y) : g.moveTo(x, y + ROOT_Y));
    if (close) g.closePath();
    g.lineJoin = 'miter'; g.lineCap = 'butt'; g.lineWidth = w; g.strokeStyle = ink(alpha); g.stroke();
  }
  function ellipse(g, x, y, w, h, lw, alpha) {           // drawEllipse (x, y, w, h): its box, in root space
    g.beginPath(); g.ellipse(x + w / 2, y + h / 2 + ROOT_Y, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
    g.lineWidth = lw; g.strokeStyle = ink(alpha); g.stroke();
  }
  function label(g, x, y, text, alpha = 0.62, j = 'centre') {
    g.font = `${LABEL}px ${FONT}`; g.textBaseline = 'middle';
    g.textAlign = j === 'right' ? 'right' : 'center';
    g.fillStyle = ink(alpha);
    // drawText in a 220-wide box from (x - 110, y - sz), 1.8 sz tall: centred on y - 0.1 sz
    g.fillText(text, j === 'right' ? x + 110 : x, y + ROOT_Y - 0.1 * LABEL);
  }

  // ---- the scale design: the drawing follows the note being played
  function noteScale(midi, gauge) {
    const t = clamp01((midi - 21) / 87), wound = midi <= 41, wraps = wound ? (midi <= 28 ? 2 : 1) : 0;
    return { wound, relLength: 1 - t,
             relGauge: (wound ? 0.75 + 0.25 * (wraps === 2 ? 1 : 0.4) : 0.55 * (1 - t)) * lerp(0.75, 1.25, gauge) };
  }
  const unisonCount = midi => midi < 33 ? 1 : (midi < 55 ? 2 : 3);
  function strikeFraction(strike, pluck, wide, compass = 0.5) {
    const w = Math.max(pluck, wide), base = lerp(0.055, 0.2, strike) * lerp(1.12, 0.62, compass);
    return lerp(base, lerp(0.12, 0.48, strike), w);
  }

  function geometry(p, midi) {
    const d = noteScale(midi, ST.gauge), G = {};
    G.wound = d.wound; G.unisons = unisonCount(midi); G.hasDamper = midi < 89;
    G.stringLen = lerp(238, 402, p.length) * lerp(0.55, 1, d.relLength);
    G.xEnd = AGRAFFE_X - G.stringLen;
    G.hx = AGRAFFE_X - strikeFraction(ST.strike, 0, 0) * G.stringLen;
    G.px = AGRAFFE_X - strikeFraction(ST.strike, p.pluck, 0) * G.stringLen;
    G.elemHalf = 0;                                      // steel wire
    G.pivotX = G.hx + 150; G.pivotY = 230;
    G.wippenX = G.hx + 142; G.wippenY = 268;
    const compassT = clamp01((midi - 21) / 87);
    G.headR = lerp(22, 17, ST.hammer) * lerp(1.15, 0.82, compassT);
    G.stringW = lerp(1.2, 6.0, d.relGauge);
    G.damperLift = 26 * Math.pow(1 - ST.damper, 1.4);
    return G;
  }

  // ---- the animation, as the plug-in's: a clock in milliseconds
  const A = { now: 0, hammer: { mode: 0, from: 0, t0: 0, dur: 0 }, keyPos: 0, keyTarget: 0, stringAmp: 0, stringPh: 0,
              displayMidi: 60, held: 0, lastT: null };

  function hammerPos(now) {
    const h = A.hammer, t = now - h.t0;
    switch (h.mode) {
      case 1: { const p = Math.min(1, t / 45); if (p >= 1) { A.hammer = { mode: 2, from: 1, t0: now, dur: 0 }; return 1; } return h.from + (1 - h.from) * easeIn(p); }
      case 2: return 1 - 0.5 * easeOut(Math.min(1, t / 110));
      case 4: { const p = Math.min(1, t / 160); if (p >= 1) { A.hammer = { mode: 0, from: 0, t0: now, dur: 0 }; return 0; } return h.from * (1 - easeOut(p)); }
      default: return 0;
    }
  }

  function noteOn(midi, vel) {
    A.displayMidi = midi;
    A.keyTarget = 1;
    A.hammer = { mode: 1, from: hammerPos(A.now), t0: A.now, dur: 0 };
    A.stringAmp = Math.min(14, A.stringAmp * 0.4 + 3 + vel * 9);
  }

  /* the notes that began since the last frame (the loop wraps), and how many keys are down now */
  function follow(frame) {
    if (frame.t == null) { A.lastT = null; A.held = 0; return; }
    const t = frame.t, last = A.lastT;
    for (const [nt, midi, vel] of frame.notes) {
      const hit = last == null ? false : (last <= t ? (nt > last && nt <= t) : (nt > last || nt <= t));
      if (hit) noteOn(midi, vel);
    }
    A.held = frame.notes.filter(([nt, , , dur]) => t >= nt && t < nt + dur).length;
    A.lastT = t;
  }

  // ---- the parts

  function drawBed(g, G) {
    line(g, 200, 402, 958, 402, 1.0, 0.14);
    poly(g, [[618, 402], [618, 386], [646, 386], [646, 402]], false, 1.0, 0.35);
    line(g, KEY_BX, 386, KEY_BX, 352, 1.2, 0.5);
    ellipse(g, 905 - 16, 398 - 4.5, 32, 9, 0.8, 0.3);
    ellipse(g, 400 - 14, 398 - 4, 28, 8, 0.8, 0.3);
    line(g, 466, 160, 470, 139, 1.6, 0.8);
    line(g, AGRAFFE_X, STRING_Y, PIN_X, STRING_Y, 1.0, 0.25);
    line(g, PIN_X, 164, PIN_X, 136, 2.4, 0.6);
    line(g, PIN_X - 5, 136, PIN_X + 5, 136, 1.6, 0.6);
    line(g, G.hx - 14, 246, G.hx + 16, 246, 2.0, 0.22);
    poly(g, [[G.pivotX - 8, 240], [G.pivotX - 8, 222], [G.pivotX + 8, 222], [G.pivotX + 8, 240]], false, 1.1, 0.5);
  }

  function drawSoundboard(g, G) {
    const a = Math.min(1, (1 - ST.electric) * 1.2);
    if (a < 0.05) return;
    const right = Math.min(374, G.hx - 40);
    line(g, G.xEnd - 16, 168, right, 168, 1.1, 0.5 * a);
    line(g, G.xEnd - 16, 174, right, 174, 0.8, 0.3 * a);
    line(g, G.xEnd - 16 + ISO_X * 0.5, 168 + ISO_Y * 0.5, right + ISO_X * 0.5, 168 + ISO_Y * 0.5, 0.7, 0.16 * a);
    const span = right - (G.xEnd - 16);
    for (let i = 1; i <= 4; ++i) { const x = G.xEnd - 16 + span * i / 5; line(g, x, 174, x, 182, 1.0, 0.22 * a); }
    const bx = G.xEnd + 34;
    poly(g, [[bx - 7, 168], [bx - 4, STRING_Y], [bx + 5, STRING_Y], [bx + 8, 168]], true, 1.0, 0.55 * a);
  }

  function drawElement(g, G) {
    const L = G.xEnd, R = AGRAFFE_X;
    // the unisons are the isometric depth: this note's string count behind the front one
    for (let k = G.unisons - 1; k >= 1; --k) {
      const ox = ISO_X * 0.5 * k, oy = ISO_Y * 0.5 * k, sway = (k === 1 ? 1 : -1) * 3.4 * ST.honky;
      line(g, L + ox, STRING_Y + oy + sway, R + ox, STRING_Y + oy, G.stringW, k === 1 ? 0.5 : 0.28);
    }
    if (G.wound) {
      const ticks = Math.max(8, Math.floor(G.stringLen / 6.5));
      for (let i = 0; i < ticks; ++i) {
        const x = L + (i + 0.5) * G.stringLen / ticks;
        line(g, x, STRING_Y - G.stringW * 0.5 - 1.2, x, STRING_Y + G.stringW * 0.5 + 1.2, 0.6, 0.30);
      }
    }
    if (A.stringAmp > 0.06) {
      const Am = Math.min(13, A.stringAmp), pts = [[L, STRING_Y]];
      for (let i = 1; i <= 24; ++i) {
        const u = i / 24;
        pts.push([L + G.stringLen * u, STRING_Y + Am * Math.sin(Math.PI * u) * Math.sin(A.stringPh)
                                       + Am * 0.45 * Math.sin(2 * Math.PI * u) * Math.sin(A.stringPh * 2.7)]);
      }
      poly(g, pts, false, G.stringW, 0.95);
    } else line(g, L, STRING_Y, R, STRING_Y, G.stringW, 0.95);
  }

  function drawDamper(g, lift) {
    line(g, 308, 348, 268, 356, 1.4, 0.55);
    ellipse(g, 264 - 2.6, 357 - 2.6, 5.2, 5.2, 1.0, 0.55);
    g.save(); g.translate(0, -lift);
    poly(g, [[286, 128], [330, 128], [324, 150], [292, 150]], true, 1.3, 0.9);
    line(g, 292, 145, 324, 145, 0.7, 0.4);
    line(g, DAMPER_X, 150, DAMPER_X, 350, 0.9, 0.5);
    g.restore();
  }

  function drawKey(g, G) {
    poly(g, [[KEY_BACK, KEY_TOP], [KEY_FRONT, KEY_TOP], [KEY_FRONT + ISO_X, KEY_TOP + ISO_Y], [KEY_BACK + ISO_X, KEY_TOP + ISO_Y]], true, 1.1, 0.55);
    poly(g, [[KEY_BACK, KEY_TOP], [KEY_BACK, KEY_BOTTOM], [KEY_FRONT, KEY_BOTTOM], [KEY_FRONT, KEY_TOP]], false, 1.3, 0.95);
    poly(g, [[KEY_FRONT, KEY_TOP], [KEY_FRONT, KEY_BOTTOM], [KEY_FRONT + ISO_X, KEY_BOTTOM + ISO_Y], [KEY_FRONT + ISO_X, KEY_TOP + ISO_Y]], false, 1.0, 0.5);
    line(g, 700, KEY_TOP, 700 + ISO_X, KEY_TOP + ISO_Y, 0.8, 0.35);
    line(g, 700, KEY_TOP, 700, KEY_BOTTOM, 0.7, 0.2);
    const cx = G.hx - 8;
    line(g, cx - 4, KEY_TOP, cx - 4, 306, 1.0, 0.8);
    line(g, cx + 4, KEY_TOP, cx + 4, 306, 1.0, 0.8);
    ellipse(g, cx - 7, 306 - 2.8, 14, 5.6, 1.0, 0.85);
    const bx = G.hx - 78;
    line(g, bx, KEY_TOP, bx + 4, 252, 1.0, 0.7);
    poly(g, [[bx - 4, 254], [bx + 8, 236], [bx + 16, 242], [bx + 4, 260]], true, 1.1, 0.8);
  }

  function drawWippen(g, G) {
    const h = G.hx;
    const body = [[h - 30, 292], [h - 18, 284], [h + 8, 280], [h + 30, 270], [h + 70, 266], [h + 110, 262], [h + 138, 262],
                  [h + 146, 270], [h + 140, 282], [h + 96, 288], [h + 40, 292], [h - 8, 298], [h - 26, 300]];
    poly(g, body, true, 1.2, 0.85);
    g.save(); g.translate(ISO_X * 0.5, ISO_Y * 0.5); poly(g, body, true, 0.9, 0.25); g.restore();
    poly(g, [[h + 108, 284], [h + 88, 288], [h + 90, 252], [h + 93, 237]], false, 1.3, 0.95);
    poly(g, [[h + 34, 276], [h + 39, 271], [h + 44, 276], [h + 49, 271], [h + 54, 276]], false, 0.8, 0.5);
    ellipse(g, G.wippenX - 3, G.wippenY - 3, 6, 6, 1.0, 0.7);
  }

  function drawHammer(g, G, p) {
    const hx = G.hx, soft = 1 - ST.hammer, fade = 1 - 0.75 * p.pluck;
    for (const off of [-1.5, 1.5]) line(g, G.pivotX, G.pivotY + off, hx + 6, 218 + off, 1.0, 0.8 * fade);
    ellipse(g, hx + 95 - 6.5, 225 - 6.5, 13, 13, 1.0, 0.7 * fade);
    ellipse(g, G.pivotX - 2.6, G.pivotY - 2.6, 5.2, 5.2, 1.0, 0.8 * fade);
    ellipse(g, hx - 13 - G.headR, 209 - G.headR, G.headR * 2, G.headR * 2, 0.8, 0.25 * fade);
    ellipse(g, hx - G.headR, 216 - G.headR, G.headR * 2, G.headR * 2, lerp(1.0, 2.8, soft), lerp(0.95, 0.5, soft) * fade);
    if (soft > 0.55) ellipse(g, hx - G.headR - 3.5, 216 - G.headR - 3.5, G.headR * 2 + 7, G.headR * 2 + 7, 1.6, 0.16 * fade);
    const core = lerp(9.0, 12.5, ST.hammer);
    ellipse(g, hx - core, 216 - core, core * 2, core * 2, 1.1, 0.85 * fade);
  }

  function drawPlectrum(g, G, p) {
    if (p.pluck < 0.05) return;
    const a = Math.min(1, p.pluck * 1.15);
    poly(g, [[G.px - 6, 171], [G.px, STRING_Y + 3], [G.px + 6, 171]], true, 1.2, 0.85 * a);
    g.beginPath();
    g.moveTo(G.px - 3, 171 + ROOT_Y);
    g.bezierCurveTo(G.px - 5, 182 + ROOT_Y, G.px + 2, 190 + ROOT_Y, G.px + 9, 193 + ROOT_Y);
    g.lineWidth = 1.0; g.strokeStyle = ink(0.45 * a); g.stroke();
  }

  function drawLabels(g, G) {
    for (const [text, x, partY, rowY] of [['DAMPER LEVER', 260, 362, 472], ['BACKCHECK', G.hx - 78, 350, 496],
                                          ['CAPSTAN', G.hx - 8, 348, 472], ['KEY LEVER', 800, 384, 472]]) {
      label(g, x, rowY, text);
      line(g, x, rowY - 11, x, partY + 4, 0.6, 0.15);
    }
    label(g, G.hx + 218 + 90, 266, 'WIPPEN');
    line(g, G.hx + 212, 263, G.hx + 152, 263, 0.6, 0.15);
  }

  function drawGrips(g, G, p) {
    const dGripY = 118 - G.damperLift - Math.max(0, G.elemHalf);
    for (const [x, y, r, text] of [[G.xEnd, STRING_Y, 6.5, 'LENGTH'], [G.xEnd + G.stringLen * 0.72, STRING_Y, 6.5, 'GAUGE'],
                                   [DAMPER_X, dGripY, 5.5, null], [G.hx, 216, 5.5, null]]) {
      g.fillStyle = HOT; g.beginPath(); g.arc(x, y + ROOT_Y, r, 0, 2 * Math.PI); g.fill();
      if (text) label(g, x, y + r + 15, text, 0.72);
    }
    label(g, DAMPER_X - 128, dGripY - 4, 'DAMPER', 0.72, 'right');
    label(g, G.hx, 216 + G.headR + 20, p.pluck > 0.5 ? 'FINGER' : 'FELT', 0.72);
  }

  /* one frame: advance the action by dt, then draw it */
  function draw(g, p, frame, dt) {
    const dms = Math.min(50, dt * 1000);
    A.now += dms;
    follow(frame);
    if (A.held === 0) A.keyTarget = 0;                   // the key comes up when the key comes up
    A.keyPos += (A.keyTarget - A.keyPos) * Math.min(1, dms * (A.keyTarget > A.keyPos ? 0.045 : 0.012));
    const hp = hammerPos(A.now);
    A.stringAmp *= Math.exp(-dms / ((A.keyTarget === 0) ? 120 : 1500));
    A.stringPh += dms * 0.082;

    const G = geometry(p, A.displayMidi);
    const keyLift = ST.damper < 0.05 ? 0 : A.keyPos * 19;
    const lift = Math.min(36, G.damperLift + keyLift) + Math.max(0, G.elemHalf);

    drawBed(g, G);
    drawSoundboard(g, G);
    g.save(); g.translate(KEY_BX, KEY_BY + ROOT_Y); g.rotate(rad(1.35 * A.keyPos)); g.translate(-KEY_BX, -(KEY_BY + ROOT_Y));
    drawKey(g, G); g.restore();
    g.save(); g.translate(G.wippenX, G.wippenY + ROOT_Y); g.rotate(rad(-4.5 * A.keyPos)); g.translate(-G.wippenX, -(G.wippenY + ROOT_Y));
    drawWippen(g, G); g.restore();
    if (G.hasDamper) drawDamper(g, lift);
    drawElement(g, G);
    const ang = HAMMER_LIFT_DEG * Math.max(hp, A.keyPos * 0.14);
    g.save(); g.translate(G.pivotX, G.pivotY + ROOT_Y); g.rotate(rad(ang)); g.translate(-G.pivotX, -(G.pivotY + ROOT_Y));
    drawHammer(g, G, p); g.restore();
    drawPlectrum(g, G, p);
    drawLabels(g, G);
    drawGrips(g, G, p);
  }

  window.LivePiano = {
    draw,
    reset() { Object.assign(A, { hammer: { mode: 0, from: 0, t0: 0, dur: 0 }, keyPos: 0, keyTarget: 0, stringAmp: 0, held: 0, lastT: null }); },
  };
})();
