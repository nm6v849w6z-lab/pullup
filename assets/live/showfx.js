// =====================================================================
// Shows animés du direct 2D (2026-10-09) — visuels repris tels quels de la
// maquette « Shows Live 2D » (artifact CwXapZZvuernfxLUvwjC8w) :
//   - pompom girls au centre du parquet (temps morts) ;
//   - mascotte en fin de Q1 : dunk au trampoline (A) OU tour d'honneur et
//     check des fans (B), un match sur deux (staging.js : mascotVariant) ;
//   - canon rotatif sur chariot (fin de Q3).
// Dessin canvas 2D dans le repère de la maquette (2000 × 1277 : capture de
// l'arène, parquet en 193,120 → 1808,975) ; staging.js pose la
// transformation vers l'écran (DESIGN.court ↔ terrain 940 × 500).
// Personnages (squelette + cinématique inverse à deux segments), ombres,
// éclairage de show, public qui se lève, t-shirts : moteur de la maquette,
// aux couleurs du club qui reçoit (rouge / blanc / « KRA » de la maquette).
// =====================================================================

export const DESIGN = { W: 2000, H: 1277, court: [193, 120, 1615, 855], board: [818, -40, 366, 124] };
// Durée d'une boucle (s) : la scène de la maquette + un temps de respiration.
export const SHOW_CYCLE = { pom: 20, mascA: 14, mascB: 14, teeC: 12 };
// Style par variante (choix de la maquette : « auto »).
export const SHOW_LOOK = { pom: "cartoon", mascA: "cartoon", mascB: "real", teeC: "token" };

function hexRgb(h) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || "").trim());
  if (!m) return null;
  let x = m[1]; if (x.length === 3) x = x.split("").map(c => c + c).join("");
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
}
const lum = rgb => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHex = rgb => "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

// Couleurs du club : principale (tenues, canon, maillots du public),
// secondaire claire (liserés, lettrage) — repli crème de la maquette si la
// secondaire ne ressort pas sur la principale.
export function showColors(primary, secondary, short, number) {
  const p = hexRgb(primary) || [214, 58, 58];
  let s = hexRgb(secondary);
  if (!s || contrast(p, s) < 2.2) s = contrast(p, [246, 240, 230]) >= 2.2 ? [246, 240, 230] : [27, 18, 16];
  const txt = String(short || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "HM";
  return { p: toHex(p), s: toHex(s), d: toHex(p.map(v => v * 0.72)), short: txt, num: String(number == null ? 8 : number).slice(0, 2) };
}

export function createShowFx(team) {
  const TC = team || showColors();
  const W = DESIGN.W, H = DESIGN.H;
  let ctx = null;                       // contexte de l'écran (posé par draw)
  let Q = 1;                            // résolution du dessin hors écran des personnages
  const OFF = 440;
  const off = document.createElement('canvas'); off.width = OFF; off.height = OFF;
  const oc = off.getContext('2d');
  const OX = 220, OY = 400;
  const mask = document.createElement('canvas'); mask.width = 500; mask.height = 320;
  const mc = mask.getContext('2d');
  function setQ(q) {
    q = Math.max(0.5, Math.min(2, Math.round((q || 1) * 4) / 4));
    if (q === Q && off.width === Math.round(OFF * q)) return;
    Q = q; off.width = off.height = Math.round(OFF * q);
  }
      const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const OL = '#1b1210';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, u) => a + (b - a) * u;
  const sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const eo = u => { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); };
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  const RIG = {
    cartoon: { headR: 11, shY: 27, shW: 8.5, hipW: 5, thigh: 23, shin: 22, up: 15, fo: 14, limb: 5.4, ol: 1.9, neck: 4 },
    real: { headR: 7.4, shY: 30, shW: 9.5, hipW: 5.2, thigh: 25.5, shin: 24.5, up: 17, fo: 16, limb: 4.1, ol: 1.4, neck: 5 },
    token: { headR: 15, shY: 22, shW: 7.5, hipW: 4.6, thigh: 17, shin: 16, up: 12, fo: 11, limb: 5, ol: 1.9, neck: 3 }
  };
  const RIGM = {
    cartoon: { headR: 25, shY: 20, shW: 12, hipW: 7, thigh: 15, shin: 14, up: 13, fo: 13, limb: 7.5, ol: 2, neck: -6 },
    real: { headR: 17, shY: 28, shW: 12, hipW: 7, thigh: 22, shin: 21, up: 16, fo: 15, limb: 7, ol: 1.6, neck: -2 },
    token: { headR: 26, shY: 16, shW: 11, hipW: 6.5, thigh: 12, shin: 12, up: 11, fo: 11, limb: 7, ol: 2, neck: -2 }
  };
  const HPX = { dancer: { cartoon: 92, real: 98, token: 86 }, masc: { cartoon: 124, real: 132, token: 120 }, staff: { cartoon: 94, real: 100, token: 88 } };

  const P = {
    ready: { aL: [28, -55], aR: [28, -55], lL: [6, 6], lR: [6, 6] },
    highV: { aL: [145, 150], aR: [145, 150], lL: [9, 9], lR: [9, 9] },
    lowV: { aL: [38, 38], aR: [38, 38], lL: [9, 9], lR: [9, 9] },
    T: { aL: [90, 92], aR: [90, 92], lL: [11, 11], lR: [11, 11] },
    punchR: { aL: [28, -55], aR: [170, 178], lL: [4, 4], lR: [15, 15], lean: -4 },
    punchL: { aL: [170, 178], aR: [28, -55], lL: [15, 15], lR: [4, 4], lean: 4 },
    clasp: { aL: [18, -120], aR: [18, -120], lL: [24, -14], lR: [24, -14] },
    touch: { aL: [173, 179], aR: [173, 179], lL: [5, 5], lR: [5, 5] },
    kickR: { aL: [92, 96], aR: [92, 96], lL: [3, 3], lR: [100, 92], lean: -3 },
    kickL: { aL: [92, 96], aR: [92, 96], lL: [100, 92], lR: [3, 3], lean: 3 },
    jump: { aL: [138, 146], aR: [138, 146], lL: [58, 64], lR: [58, 64] },
    point: { aL: [28, -55], aR: [118, 116], lL: [6, 6], lR: [13, 13], lean: -5 },
    dip: { aL: [40, 20], aR: [40, 20], lL: [30, -22], lR: [30, -22] },
    slam: { aL: [150, 168], aR: [150, 168], lL: [30, 50], lR: [12, 30], lean: 6 },
    tuck: { aL: [120, 70], aR: [120, 70], lL: [45, -40], lR: [45, -40] },
    hang: { aL: [168, 176], aR: [168, 176], lL: [8, 14], lR: [8, 14] },
    land: { aL: [60, 40], aR: [60, 40], lL: [34, -26], lR: [34, -26] },
    hype1: { aL: [28, -55], aR: [165, 140], lL: [16, -6], lR: [16, -6] },
    hype2: { aL: [165, 140], aR: [28, -55], lL: [16, -6], lR: [16, -6] },
    brace: { aL: [-20, -60], aR: [40, 70], lL: [14, 14], lR: [14, 14] }
  };
  const KEYS = ['aL', 'aR', 'lL', 'lR'];
  function mixPose(a, b, u) {
    const o = {};
    for (const k of KEYS) { const x = a[k] || [6, 6], y = b[k] || [6, 6]; o[k] = [lerp(x[0], y[0], u), lerp(x[1], y[1], u)]; }
    o.lean = lerp(a.lean || 0, b.lean || 0, u); o.lift = lerp(a.lift || 0, b.lift || 0, u);
    return o;
  }
  function runPose(ph, amp) {
    amp = amp == null ? 1 : amp;
    const s = Math.sin(ph);
    const a = Math.max(0, s), b = Math.max(0, -s);
    return {
      lL: [8 + 16 * amp * a, 8 - 34 * amp * a], lR: [8 + 16 * amp * b, 8 - 34 * amp * b],
      aL: [24 - 26 * amp * s, -45 + 18 * s], aR: [24 + 26 * amp * s, -45 - 18 * s],
      lean: 0, lift: 2.4 * amp * Math.abs(Math.cos(ph))
    };
  }

  function dirv(th, s) { return [s * Math.sin(th * D2R), Math.cos(th * D2R)]; }
  function solve(R, p) {
    const lL = p.lL || [6, 6], lR = p.lR || [6, 6];
    const vL = R.thigh * Math.cos(lL[0] * D2R) + R.shin * Math.cos(lL[1] * D2R);
    const vR = R.thigh * Math.cos(lR[0] * D2R) + R.shin * Math.cos(lR[1] * D2R);
    const pelY = -Math.max(vL, vR) - (p.lift || 0);
    const legs = [[-1, lL], [1, lR]].map(([s, a]) => {
      const hip = [s * R.hipW, pelY];
      const d1 = dirv(a[0], s), d2 = dirv(a[1], s);
      const knee = [hip[0] + d1[0] * R.thigh, hip[1] + d1[1] * R.thigh];
      const foot = [knee[0] + d2[0] * R.shin, knee[1] + d2[1] * R.shin];
      return { hip, knee, foot };
    });
    const ln = (p.lean || 0) * D2R, cs = Math.cos(ln), sn = Math.sin(ln);
    const rot = (x, y) => [x * cs - y * sn, pelY + x * sn + y * cs];
    const arms = [[-1, p.aL || [20, 20]], [1, p.aR || [20, 20]]].map(([s, a]) => {
      const sh = [s * R.shW, -R.shY];
      const d1 = dirv(a[0], s), d2 = dirv(a[1], s);
      const el = [sh[0] + d1[0] * R.up, sh[1] + d1[1] * R.up];
      const ha = [el[0] + d2[0] * R.fo, el[1] + d2[1] * R.fo];
      return { sh: rot(sh[0], sh[1]), el: rot(el[0], el[1]), ha: rot(ha[0], ha[1]) };
    });
    const head = rot(0, -R.shY - R.neck - R.headR);
    return { pelY, legs, arms, head, rot };
  }

  function path(pts, col, w, ol, close) {
    oc.beginPath(); oc.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) oc.lineTo(pts[i][0], pts[i][1]);
    if (close) oc.closePath();
    return { fill: () => { oc.fillStyle = col; oc.fill(); if (ol) { oc.strokeStyle = OL; oc.lineWidth = ol; oc.lineJoin = 'round'; oc.stroke(); } } };
  }
  function limb(pts, col, w, ol) {
    oc.lineCap = 'round'; oc.lineJoin = 'round';
    oc.beginPath(); oc.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) oc.lineTo(pts[i][0], pts[i][1]);
    oc.strokeStyle = OL; oc.lineWidth = w + ol * 2; oc.stroke();
    oc.strokeStyle = col; oc.lineWidth = w; oc.stroke();
  }
  function circ(x, y, r, col, ol) {
    oc.beginPath(); oc.arc(x, y, r, 0, TAU); oc.fillStyle = col; oc.fill();
    if (ol) { oc.strokeStyle = OL; oc.lineWidth = ol; oc.stroke(); }
  }
  function oval(x, y, rx, ry, col, ol, rot) {
    oc.beginPath(); oc.ellipse(x, y, rx, ry, rot || 0, 0, TAU); oc.fillStyle = col; oc.fill();
    if (ol) { oc.strokeStyle = OL; oc.lineWidth = ol; oc.stroke(); }
  }
  function rrect(x, y, w, h, r) {
    oc.beginPath(); oc.moveTo(x + r, y); oc.arcTo(x + w, y, x + w, y + h, r); oc.arcTo(x + w, y + h, x, y + h, r);
    oc.arcTo(x, y + h, x, y, r); oc.arcTo(x, y, x + w, y, r); oc.closePath();
  }
  function textAt(x, y, s, size, col, face) {
    oc.save(); oc.translate(x, y); oc.scale(face, 1);
    oc.font = '700 ' + size + 'px system-ui, sans-serif'; oc.textAlign = 'center'; oc.textBaseline = 'middle';
    oc.fillStyle = col; oc.fillText(s, 0, 0); oc.restore();
  }

  function pompon(x, y, r, spin, shake, c1, c2) {
    oc.save(); oc.translate(x, y); oc.rotate(spin);
    circ(0, 0, r * 0.95, 'rgba(27,18,16,0.55)');
    oc.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + Math.sin(shake * 6 + i) * 0.12 * shake;
      const L = r * (0.78 + 0.3 * hash(i * 3.1) + 0.25 * shake * Math.sin(i * 2.3));
      oc.strokeStyle = i % 2 ? c1 : c2; oc.lineWidth = r * 0.34;
      oc.beginPath(); oc.moveTo(0, 0); oc.lineTo(Math.cos(a) * L, Math.sin(a) * L); oc.stroke();
    }
    circ(0, 0, r * 0.3, c2);
    oc.restore();
  }

  function drawHead(R, J, look, skin, hair, face, opts) {
    const [hx, hy] = J.head, r = R.headR;
    if (look === 'token') {
      const s = r * 2.15;
      rrect(hx - s / 2, hy - s / 2 - 1, s, s, s * 0.22);
      oc.fillStyle = opts.card || '#2a2f3a'; oc.fill(); oc.strokeStyle = '#4a5160'; oc.lineWidth = 1.6; oc.stroke();
      oc.save(); rrect(hx - s / 2, hy - s / 2 - 1, s, s, s * 0.22); oc.clip();
      opts.inner(hx, hy + r * 0.18, r * 0.7);
      oc.restore();
      if (opts.badge) { circ(hx + s * 0.45, hy - s * 0.45, 5.2, opts.badge, 1.2); textAt(hx + s * 0.45, hy - s * 0.45 + 0.3, opts.badgeTxt || '', 5.6, '#fff', face); }
    } else opts.inner(hx, hy, r);
  }

  function drawDancer(c, R, J, t) {
    const pal = c.pal, look = c.look;
    const skin = pal.skin, hair = pal.hair, red = TC.p, white = TC.s;
    const ol = R.ol;
    if (look !== 'token') {
      const sw = Math.sin(t * 7 + c.seed) * 0.25 + (c.pose.lean || 0) * D2R;
      const [hx, hy] = J.head;
      oc.save(); oc.translate(hx + R.headR * 0.55, hy - R.headR * 0.45); oc.rotate(0.5 + sw);
      oval(R.headR * 0.55, R.headR * 0.95, R.headR * 0.42, R.headR * 1.0, hair, ol * 0.8);
      oc.restore();
    }
    for (const L of J.legs) {
      limb([L.hip, L.knee, L.foot], skin, R.limb * 1.05, ol);
      oval(L.foot[0], L.foot[1] - 1.2, R.limb * 1.05, R.limb * 0.62, white, ol * 0.8);
      oc.strokeStyle = red; oc.lineWidth = 1.1; oc.beginPath(); oc.moveTo(L.foot[0] - R.limb * 0.8, L.foot[1] - 1.6); oc.lineTo(L.foot[0] + R.limb * 0.8, L.foot[1] - 1.6); oc.stroke();
    }
    const rot = J.rot, f = c.flare || 1;
    const skirt = [rot(-R.hipW - 1.4, -4), rot(R.hipW + 1.4, -4), rot(R.hipW * 2.3 * f, 9), rot(-R.hipW * 2.3 * f, 9)];
    path(skirt, red, 0, ol, true).fill();
    oc.strokeStyle = white; oc.lineWidth = 1.6; oc.beginPath(); const a1 = rot(R.hipW * 2.15 * f, 6.6), a2 = rot(-R.hipW * 2.15 * f, 6.6); oc.moveTo(a1[0], a1[1]); oc.lineTo(a2[0], a2[1]); oc.stroke();
    oc.strokeStyle = 'rgba(120,20,20,0.7)'; oc.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++) { const p1 = rot(i * R.hipW * 0.35, -3.5), p2 = rot(i * R.hipW * 0.8 * f, 8.5); oc.beginPath(); oc.moveTo(p1[0], p1[1]); oc.lineTo(p2[0], p2[1]); oc.stroke(); }
    const torso = [rot(-R.shW - 1, -R.shY - 1.5), rot(R.shW + 1, -R.shY - 1.5), rot(R.hipW + 1.2, -3), rot(-R.hipW - 1.2, -3)];
    path(torso, skin, 0, ol, true).fill();
    const top = [rot(-R.shW - 1, -R.shY - 1.5), rot(R.shW + 1, -R.shY - 1.5), rot(R.hipW + 2.2, -R.shY * 0.42), rot(-R.hipW - 2.2, -R.shY * 0.42)];
    path(top, red, 0, ol, true).fill();
    const v1 = rot(-R.shW * 0.55, -R.shY - 1), v2 = rot(0, -R.shY * 0.62), v3 = rot(R.shW * 0.55, -R.shY - 1);
    oc.strokeStyle = white; oc.lineWidth = 1.8; oc.lineJoin = 'round'; oc.beginPath(); oc.moveTo(v1[0], v1[1]); oc.lineTo(v2[0], v2[1]); oc.lineTo(v3[0], v3[1]); oc.stroke();
    if (look !== 'real') textAt(rot(0, -R.shY * 0.55)[0], rot(0, -R.shY * 0.55)[1] + 1, TC.short, R.shW * 0.62, white, c.face);
    drawHead(R, J, look, skin, hair, c.face, {
      inner: (x, y, r) => {
        circ(x, y, r, skin, ol);
        oc.save(); oc.beginPath(); oc.arc(x, y, r, 0, TAU); oc.clip();
        oc.fillStyle = hair; oc.beginPath(); oc.ellipse(x, y - r * 0.55, r * 1.1, r * 0.72, 0, 0, TAU); oc.fill();
        oc.restore();
        oc.beginPath(); oc.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.95); oc.strokeStyle = OL; oc.lineWidth = ol; oc.stroke();
        if (look === 'real') {
          circ(x - r * 0.36, y + r * 0.05, r * 0.11, '#2c2c2a'); circ(x + r * 0.36, y + r * 0.05, r * 0.11, '#2c2c2a');
          oc.strokeStyle = '#7a2a22'; oc.lineWidth = 0.9; oc.beginPath(); oc.arc(x, y + r * 0.32, r * 0.22, 0.2, Math.PI - 0.2); oc.stroke();
        } else {
          oval(x - r * 0.36, y + r * 0.06, r * 0.13, r * 0.17, '#2c2c2a'); oval(x + r * 0.36, y + r * 0.06, r * 0.13, r * 0.17, '#2c2c2a');
          circ(x - r * 0.33, y, r * 0.05, '#fff'); circ(x + r * 0.39, y, r * 0.05, '#fff');
          circ(x - r * 0.62, y + r * 0.36, r * 0.15, 'rgba(240,140,140,0.6)'); circ(x + r * 0.62, y + r * 0.36, r * 0.15, 'rgba(240,140,140,0.6)');
          oc.fillStyle = '#9e2a2a'; oc.beginPath(); oc.arc(x, y + r * 0.34, r * 0.26, 0.1, Math.PI - 0.1); oc.fill();
        }
        if (look === 'token') { oc.fillStyle = red; oc.beginPath(); oc.ellipse(x, y + r * 1.75, r * 1.4, r * 0.75, 0, Math.PI, TAU); oc.fill(); }
      },
      card: '#2a2f3a'
    });
    for (const A of J.arms) {
      limb([A.sh, A.el, A.ha], skin, R.limb * 0.92, ol);
      const wx = lerp(A.el[0], A.ha[0], 0.8), wy = lerp(A.el[1], A.ha[1], 0.8);
      circ(wx, wy, R.limb * 0.55, white);
    }
    const pr = look === 'real' ? 7.2 : look === 'token' ? 7.6 : 8.2;
    J.arms.forEach((A, i) => pompon(A.ha[0], A.ha[1], pr, c.spin * (i ? -1 : 1) + i, c.shake, red, white));
  }

  function drawMascot(c, R, J, t) {
    const look = c.look, ol = R.ol;
    const pur = '#7650cf', purD = '#5b3aa8', purL = '#a98ae8', red = TC.p, white = TC.s;
    const rot = J.rot;
    for (let s = -1; s <= 1; s += 2) {
      const b = rot(s * R.hipW * 1.4, -2), wv = Math.sin(t * 6 + s) * 6;
      const m = rot(s * (R.hipW * 3.2 + 2), 10 + wv * 0.3), e = rot(s * (R.hipW * 4.2 + wv * 0.4), 18);
      limb([b, m, e], purD, R.limb * 0.65, ol * 0.8);
    }
    for (const L of J.legs) {
      limb([L.hip, L.knee, L.foot], pur, R.limb, ol);
      for (let i = 1; i <= 2; i++) { const px = lerp(L.knee[0], L.foot[0], i / 3), py = lerp(L.knee[1], L.foot[1], i / 3); circ(px, py, R.limb * 0.2, purL); }
      oval(L.foot[0], L.foot[1] - 2, R.limb * 1.05, R.limb * 0.6, white, ol);
      oc.strokeStyle = '#1d9e75'; oc.lineWidth = 1.4; oc.beginPath(); oc.moveTo(L.foot[0] - R.limb * 0.85, L.foot[1] - 2.2); oc.lineTo(L.foot[0] + R.limb * 0.85, L.foot[1] - 2.2); oc.stroke();
    }
    const torso = [rot(-R.shW - 2, -R.shY - 2), rot(R.shW + 2, -R.shY - 2), rot(R.hipW + 4, 2), rot(-R.hipW - 4, 2)];
    path(torso, red, 0, ol, true).fill();
    const tc = rot(0, -R.shY * 0.45);
    textAt(tc[0], tc[1] + 1, TC.num, R.shW * 0.95, white, c.face);
    for (const A of J.arms) {
      limb([A.sh, A.el, A.ha], pur, R.limb * 0.9, ol);
      circ(A.ha[0], A.ha[1], R.limb * 0.42, purL);
    }
    if (c.ball) { const h = J.arms[1].ha; ballAt(h[0] + 3, h[1] - 4, 7.5); }
    drawHead(R, J, look, pur, pur, c.face, {
      inner: (x, y, r) => {
        circ(x, y, r, pur, ol);
        circ(x + r * 0.5, y - r * 0.5, r * 0.13, purD); circ(x - r * 0.55, y - r * 0.15, r * 0.09, purD); circ(x + r * 0.15, y - r * 0.75, r * 0.08, purD);
        oc.save(); oc.beginPath(); oc.arc(x, y, r, 0, TAU); oc.clip();
        oc.fillStyle = white; oc.fillRect(x - r, y - r * 0.62, r * 2, r * 0.26);
        oc.fillStyle = red; oc.fillRect(x - r, y - r * 0.52, r * 2, r * 0.07);
        oc.restore();
        oval(x - r * 0.33, y + r * 0.02, r * 0.27, r * 0.31, white, ol * 0.8); oval(x + r * 0.33, y + r * 0.02, r * 0.27, r * 0.31, white, ol * 0.8);
        circ(x - r * 0.28, y + r * 0.07, r * 0.13, '#1f1f22'); circ(x + r * 0.38, y + r * 0.07, r * 0.13, '#1f1f22');
        circ(x - r * 0.25, y + r * 0.02, r * 0.045, '#fff'); circ(x + r * 0.41, y + r * 0.02, r * 0.045, '#fff');
        oc.fillStyle = '#3a1830'; oc.beginPath(); oc.arc(x, y + r * 0.45, r * 0.24, 0.15, Math.PI - 0.15); oc.closePath(); oc.fill();
        oc.fillStyle = white; oc.fillRect(x - r * 0.12, y + r * 0.47, r * 0.1, r * 0.08); oc.fillRect(x + r * 0.03, y + r * 0.47, r * 0.1, r * 0.08);
      },
      card: '#2a2f3a', badge: red, badgeTxt: TC.num
    });
  }

  function staffGeo(R, J, aimLocal, recoil) {
    const A = J.arms[1];
    const d = aimLocal;
    const base = [A.ha[0] - d[0] * (14 + recoil), A.ha[1] - d[1] * (14 + recoil)];
    const muzzle = [A.ha[0] + d[0] * (30 - recoil), A.ha[1] + d[1] * (30 - recoil)];
    return { base, muzzle };
  }
  function aimPose(phi, face, braceAmt) {
    const ax = Math.cos(phi) * face, ay = Math.sin(phi);
    const th = Math.atan2(ax, ay) / D2R;
    return { aR: [lerp(40, th * 0.55, 0.6), th], aL: [-15, -th], lL: [14 + 8 * braceAmt, 14 - 10 * braceAmt], lR: [14 + 8 * braceAmt, 14 - 10 * braceAmt], lean: -8 * ax * braceAmt };
  }
  function drawStaff(c, R, J, t) {
    const ol = R.ol, look = c.look;
    const skin = c.pal.skin, red = TC.p, black = '#1f2124';
    for (const L of J.legs) {
      limb([L.hip, L.knee, L.foot], '#3b4a63', R.limb * 1.15, ol);
      oval(L.foot[0] + 1, L.foot[1] - 1.4, R.limb * 1.1, R.limb * 0.6, '#2a2a2a', ol * 0.8);
      oc.fillStyle = '#ddd'; oc.fillRect(L.foot[0] - R.limb, L.foot[1] - 0.8, R.limb * 2.1, 1);
    }
    const rot = J.rot;
    const torso = [rot(-R.shW - 1.5, -R.shY - 1.5), rot(R.shW + 1.5, -R.shY - 1.5), rot(R.hipW + 2.2, 1), rot(-R.hipW - 2.2, 1)];
    path(torso, black, 0, ol, true).fill();
    const c1 = rot(-R.shW * 0.5, -R.shY - 1), c2 = rot(0, -R.shY + 4), c3 = rot(R.shW * 0.5, -R.shY - 1);
    oc.strokeStyle = red; oc.lineWidth = 2; oc.beginPath(); oc.moveTo(c1[0], c1[1]); oc.lineTo(c2[0], c2[1]); oc.lineTo(c3[0], c3[1]); oc.stroke();
    if (look !== 'real') textAt(rot(0, -R.shY * 0.45)[0], rot(0, -R.shY * 0.45)[1], 'STAFF', R.shW * 0.5, '#e8e2d8', c.face);
    const A0 = J.arms[0];
    limb([A0.sh, A0.el, A0.ha], skin, R.limb * 0.9, ol); limb([A0.sh, lerp2(A0.sh, A0.el, 0.55)], black, R.limb * 1.15, 0);
    if (c.aim) {
      const g = staffGeo(R, J, c.aim, c.recoil || 0);
      limb([g.base, g.muzzle], '#5f5e5a', 7.5, ol);
      limb([[lerp(g.base[0], g.muzzle[0], 0.08), lerp(g.base[1], g.muzzle[1], 0.08)], [lerp(g.base[0], g.muzzle[0], 0.3), lerp(g.base[1], g.muzzle[1], 0.3)]], red, 9, ol);
      limb([[lerp(g.base[0], g.muzzle[0], 0.55), lerp(g.base[1], g.muzzle[1], 0.55)], [lerp(g.base[0], g.muzzle[0], 0.62), lerp(g.base[1], g.muzzle[1], 0.62)]], '#ef9f27', 8, 0);
      circ(g.muzzle[0], g.muzzle[1], 4.6, '#3d3d3a', ol);
    }
    const A1 = J.arms[1];
    limb([A1.sh, A1.el, A1.ha], skin, R.limb * 0.9, ol); limb([A1.sh, lerp2(A1.sh, A1.el, 0.55)], black, R.limb * 1.15, 0);
    drawHead(R, J, look, skin, '#2a1a12', c.face, {
      inner: (x, y, r) => {
        circ(x, y, r, skin, ol);
        oc.fillStyle = red; oc.beginPath(); oc.arc(x, y - r * 0.15, r * 1.02, Math.PI, TAU); oc.closePath(); oc.fill(); oc.strokeStyle = OL; oc.lineWidth = ol; oc.stroke();
        oval(x + r * 0.75, y - r * 0.18, r * 0.75, r * 0.2, '#a32d2d', ol * 0.7);
        circ(x - r * 0.2, y + r * 0.2, r * 0.11, '#2c2c2a'); circ(x + r * 0.42, y + r * 0.2, r * 0.11, '#2c2c2a');
        oc.strokeStyle = '#6b2a20'; oc.lineWidth = 1; oc.beginPath(); oc.arc(x + r * 0.12, y + r * 0.5, r * 0.2, 0.2, Math.PI - 0.2); oc.stroke();
        if (look === 'token') { oc.fillStyle = black; oc.beginPath(); oc.ellipse(x, y + r * 1.75, r * 1.4, r * 0.75, 0, Math.PI, TAU); oc.fill(); }
      },
      card: '#2a2f3a'
    });
  }
  function lerp2(a, b, u) { return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; }
  function ballAt(x, y, r) {
    circ(x, y, r, '#e8792a', 1.4);
    oc.strokeStyle = '#6b2f0b'; oc.lineWidth = 0.9;
    oc.beginPath(); oc.moveTo(x - r, y); oc.lineTo(x + r, y); oc.moveTo(x, y - r); oc.lineTo(x, y + r); oc.stroke();
    oc.beginPath(); oc.arc(x - r * 1.3, y, r * 0.95, -0.75, 0.75); oc.stroke(); oc.beginPath(); oc.arc(x + r * 1.3, y, r * 0.95, Math.PI - 0.75, Math.PI + 0.75); oc.stroke();
  }

  function rigOf(c) { return c.kind === 'masc' ? RIGM[c.look] : RIG[c.look]; }
  function localToWorld(c, p) { const k = c.Hpx / 100; return [c.x + c.face * p[0] * k, c.y - c.h + p[1] * k]; }

  function drawChar(c, t, env) {
    const R = rigOf(c), k = c.Hpx / 100;
    const J = solve(R, c.pose);
    oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, off.width, off.height);
    oc.setTransform(k * c.face * Q, 0, 0, k * Q, OX * Q, OY * Q);
    if (c.kind === 'dancer') drawDancer(c, R, J, t);
    else if (c.kind === 'masc') drawMascot(c, R, J, t);
    else drawStaff(c, R, J, t);
    oc.setTransform(Q, 0, 0, Q, 0, 0);
    const L = env.lightAt(c.x, c.y);
    oc.globalCompositeOperation = 'source-atop';
    const top = OY - c.Hpx * 1.1;
    const g = oc.createLinearGradient(0, top, 0, OY);
    const rim = clamp((L - 0.75) / 0.35, 0, 1);
    g.addColorStop(0, 'rgba(255,230,190,' + (0.06 + 0.22 * rim).toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(255,230,190,0)');
    g.addColorStop(0.62, 'rgba(25,12,8,0)');
    g.addColorStop(1, 'rgba(25,12,8,0.3)');
    oc.fillStyle = g; oc.fillRect(0, 0, OFF, OFF);
    const dark = clamp(0.98 - L, 0, 0.62);
    oc.fillStyle = 'rgba(16,10,9,' + dark.toFixed(3) + ')'; oc.fillRect(0, 0, OFF, OFF);
    oc.globalCompositeOperation = 'source-over';
    ctx.drawImage(off, c.x - OX, c.y - c.h - OY, OFF, OFF);
    return J;
  }

  function shadowEll(x, y, rx, ry, rot, a) {
    if (a <= 0.005) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + a.toFixed(3) + ')'); g.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.75).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
  }
  function drawShadow(c, env) {
    const r = c.Hpx * (c.kind === 'masc' ? 0.3 : 0.23), hh = c.h;
    const s = 1 + hh / 160;
    shadowEll(c.x, c.y + 1, r * s, r * 0.34 * s, 0, 0.62 / (1 + hh / 45));
    let bi = 0, best = null;
    for (const sp of env.allSpots) {
      const dx = c.x - sp.x, dy = c.y - sp.y, d = Math.hypot(dx, dy) || 1;
      const inf = sp.i * clamp(1 - d / (sp.r * 1.7), 0, 1);
      if (inf > bi) { bi = inf; best = { dx: dx / d, dy: dy / d, d }; }
    }
    if (best && bi > 0.04) {
      const near = clamp(best.d / 60, 0, 1);
      const ang = Math.atan2(best.dy, best.dx), len = c.Hpx * (0.08 + 0.14 * bi) * near + 6;
      shadowEll(c.x + best.dx * len * 0.7, c.y + best.dy * len * 0.7, len + r * 0.4, r * 0.4, ang, 0.2 * bi / (1 + hh / 40));
    }
  }

  const BAKED = [{ x: 810, y: 492, r: 300, i: 0.45 }, { x: 1290, y: 492, r: 300, i: 0.45 }];
  function makeEnv(dim, spots) {
    const all = BAKED.concat(spots);
    return {
      allSpots: all,
      lightAt: (x, y) => {
        let L = 0.84 - dim * 0.75;
        for (const sp of BAKED) { const d = Math.hypot(x - sp.x, (y - sp.y) * 1.2); L += 0.16 * clamp(1 - d / sp.r, 0, 1); }
        for (const sp of spots) { const d = Math.hypot(x - sp.x, (y - sp.y) * 1.2); L += sp.i * (0.32 + dim * 0.7) * clamp(1 - d / (sp.r * 1.15), 0, 1); }
        return clamp(L, 0.3, 1.12);
      }
    };
  }
  function drawLighting(dim, spots) {
    if (dim > 0.005) {
      mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over';
      mc.clearRect(0, 0, mask.width, mask.height);
      mc.fillStyle = 'rgba(6,4,10,' + dim.toFixed(3) + ')'; mc.fillRect(0, 0, mask.width, mask.height);
      mc.globalCompositeOperation = 'destination-out';
      const sx = mask.width / W, sy = mask.height / H;
      for (const sp of spots) {
        mc.save(); mc.translate(sp.x * sx, sp.y * sy); mc.scale(1, 0.82);
        const r = sp.r * sx * 1.25;
        const g = mc.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, 'rgba(0,0,0,' + sp.i.toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(0,0,0,' + (sp.i * 0.75).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = g; mc.beginPath(); mc.arc(0, 0, r, 0, TAU); mc.fill(); mc.restore();
      }
      mc.globalCompositeOperation = 'source-over';
      ctx.drawImage(mask, 0, 0, W, H);
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const sp of spots) {
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.scale(1, 0.82);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, sp.r);
      g.addColorStop(0, 'rgba(255,236,205,' + (0.2 * sp.i).toFixed(3) + ')'); g.addColorStop(0.6, 'rgba(255,226,190,' + (0.08 * sp.i).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, sp.r, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  const FANSK = ['#f1c7a3', '#c68b5e', '#8d5a3b', '#e0ac84', '#6e4430', '#f3d2b3'];
  const FANSH = [TC.p, TC.p, TC.s, '#3a3d46', TC.p, TC.d];
  function fan(x, y, up, seed, t) {
    const sk = FANSK[Math.floor(hash(seed) * 6)], sh = FANSH[Math.floor(hash(seed + 7) * 6)];
    const wv = Math.sin(t * 18 + seed) * 3 * up;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 5.4;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 2); ctx.lineTo(x - 9 - wv * 0.3, y - 10 * up + 1); ctx.moveTo(x + 5, y + 2); ctx.lineTo(x + 9 + wv * 0.3, y - 10 * up + 1); ctx.stroke();
    ctx.strokeStyle = sk; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.fillStyle = sh; ctx.strokeStyle = OL; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(x, y + 8, 8, 6, 0, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = sk; ctx.beginPath(); ctx.arc(x, y - 1, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
  }
  function burst(x, y, t0, t, n, seed) {
    const u = (t - t0) / 1.0; if (u < 0 || u > 1) return;
    const up = Math.sin(Math.PI * Math.min(1, u * 1.25));
    ctx.save(); ctx.globalAlpha = u < 0.75 ? 1 : (1 - u) / 0.25;
    for (let i = 0; i < n; i++) {
      const fx = x + (i - (n - 1) / 2) * 15 + (hash(seed + i) - 0.5) * 6, fy = y + (hash(seed + i * 3) - 0.5) * 10 - up * 7;
      fan(fx, fy, up, seed + i, t);
    }
    ctx.globalAlpha = 0.55 * (1 - u); ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 10 + 34 * u, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function mkPath(pts) {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, L, total: L[L.length - 1] };
  }
  function at(pi, d) {
    d = clamp(d, 0, pi.total);
    let i = 1; while (i < pi.L.length - 1 && pi.L[i] < d) i++;
    const a = pi.pts[i - 1], b = pi.pts[i], seg = (pi.L[i] - pi.L[i - 1]) || 1, u = (d - pi.L[i - 1]) / seg;
    return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), dx: (b[0] - a[0]) / seg, dy: (b[1] - a[1]) / seg };
  }
  function mover(pi, t0, speed, t) {
    const d = (t - t0) * speed;
    const p = at(pi, d);
    return { x: p.x, y: p.y, dx: p.dx, dy: p.dy, moving: d > 0 && d < pi.total, done: d >= pi.total, d, dur: pi.total / speed };
  }

  const PAL = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({
    skin: ['#f1c7a3', '#c68b5e', '#8d5a3b', '#e8b48e', '#a8714a', '#f3d2b3', '#6e4430', '#d9a07a'][i],
    hair: ['#3a2416', '#1c1410', '#d9a441', '#8a3b1c', '#1c1410', '#6b3f26', '#2a1a12', '#c98a3a'][i]
  }));

  const BEAT = 0.47, BAR = BEAT * 8;
  const B1 = ['highV', 'lowV', 'T', 'punchR', 'punchL', 'clasp', 'kickR', 'jump'];
  const B2 = ['touch', 'lowV', 'punchR', 'punchL', 'T', 'clasp', 'kickL', 'jump'];
  const B3 = ['highV', 'T', 'punchR', 'punchL', 'clasp', 'kickR', 'touch', 'touch'];
  // Ordre des trois mesures (temps mort suivant : autre enchaînement).
  const ORDERS = [[B1, B2, B3], [B2, B1, B3], [B1, B3, B2], [B3, B2, B1]];
  let seqOrder = 0;
  let pomTotal = 18.6;           // pompom A : fin du show (s), posée par draw
  const bar = k => ORDERS[seqOrder % ORDERS.length][k];
  function dancePose(seq, tl) {
    const n = clamp(Math.floor(tl / BEAT), 0, seq.length - 1);
    const u = tl / BEAT - n;
    const prev = P[n > 0 ? seq[n - 1] : 'ready'], cur = P[seq[n]];
    const p = mixPose(prev, cur, eo(u / 0.32));
    const name = seq[n];
    if (name === 'jump') p.lift = 26 * Math.sin(Math.PI * clamp(u / 0.8, 0, 1));
    else if (name.indexOf('kick') < 0) { const b = Math.exp(-u * 7) * (u < 0.05 ? u / 0.05 : 1); p.lL[0] += 12 * b; p.lL[1] -= 16 * b; p.lR[0] += 12 * b; p.lR[1] -= 16 * b; }
    return { pose: p, shake: Math.exp(-u * 5), flare: name === 'jump' ? 1.25 : 1 + 0.12 * Math.exp(-u * 6) };
  }
  function idlePose(t, seed) {
    const p = mixPose(P.ready, P.ready, 0); const b = 0.5 + 0.5 * Math.sin(t * 6.7 + seed);
    p.lL[0] += 5 * b; p.lL[1] -= 7 * b; p.lR[0] += 5 * b; p.lR[1] -= 7 * b; return p;
  }

  function dancerChar(i, look, x, y, extra) {
    return Object.assign({ kind: 'dancer', look, Hpx: HPX.dancer[look], x, y, h: 0, face: 1, pal: PAL[i], seed: i * 1.7, spin: 0, shake: 0, flare: 1, pose: P.ready }, extra || {});
  }

  function travelOrDance(i, look, pathIn, pathOut, tIn, tOut, speed, t, danceFn) {
    const mi = mover(pathIn, tIn, speed, t);
    let c;
    if (t >= tOut) {
      const mo = mover(pathOut, tOut, speed * 1.1, t);
      c = dancerChar(i, look, mo.x, mo.y);
      if (mo.moving) { c.pose = runPose(mo.d / 15); c.face = Math.abs(mo.dx) > 0.3 ? Math.sign(mo.dx) : 1; c.shake = 0.3; }
      else if (mo.done) return null;
    } else if (!mi.done) {
      if (!mi.moving) return null;
      c = dancerChar(i, look, mi.x, mi.y);
      c.pose = runPose(mi.d / 15); c.face = Math.abs(mi.dx) > 0.3 ? Math.sign(mi.dx) : 1; c.shake = 0.3;
    } else {
      c = dancerChar(i, look, mi.x, mi.y);
      danceFn(c);
    }
    c.spin = Math.sin(t * 3 + i) * 0.3;
    return c;
  }

  function scenePom(variant, look, t) {
    const out = { chars: [], dim: 0, spots: [], fx: [], guides: { paths: [] }, period: 18.6 };
    if (variant === 'A') {
      // Retour 2026-10-09 : entrée une seule fois, danse pendant TOUT le
      // temps mort (phrases de 4 mesures : lignes → V → V → lignes, ordre
      // des pas renouvelé à chaque phrase), sortie seulement à la fin
      // (pomTotal = instant où la dernière doit être sortie).
      const E = [200, 102];
      const rows = [[868, 492], [956, 492], [1044, 492], [1132, 492], [822, 606], [930, 610], [1070, 610], [1178, 606]];
      const vee = [[812, 470], [906, 512], [1094, 512], [1188, 470], [858, 600], [950, 642], [1050, 642], [1142, 600]];
      const D0 = 3.5, PH = 4 * BAR;
      const X0 = Math.max(D0 + BAR, pomTotal - 4.2);
      out.period = pomTotal;
      out.dim = 0.38 * sm((t - 1.2) / 1.6) * (1 - sm((t - X0 - 1.2) / 1.6));
      out.spots = [{ x: 1000, y: 552, r: 330, i: 1 }];
      const seqOf = k => ORDERS[(seqOrder + Math.floor(k / 4)) % ORDERS.length][(k % 4) % 3];
      // Place (et pas) de la danseuse i, td s après le début de la danse.
      const danceAt = (i, td) => {
        const k = Math.floor(td / BAR), tl = td - k * BAR, ph = k % 4;
        const from = ph === 1 ? rows[i] : ph === 3 ? vee[i] : null;
        if (from && tl < 2 * BEAT) {
          const to = ph === 1 ? vee[i] : rows[i], u = sm(tl / (2 * BEAT));
          return { x: lerp(from[0], to[0], u), y: lerp(from[1], to[1], u), run: tl };
        }
        const at = ph === 0 || ph === 3 ? rows[i] : vee[i];
        const lag = ph === 1 ? i * 0.07 : 0;
        return { x: at[0], y: at[1], seq: seqOf(k), tl: from ? tl - 2 * BEAT - lag : tl - lag };
      };
      for (let i = 0; i < 8; i++) {
        const tOut = X0 + 0.1 * (7 - i);
        const last = tOut > D0 ? danceAt(i, tOut - D0) : { x: rows[i][0], y: rows[i][1] };
        const pin = mkPath([E, [rows[i][0], 100 + 40 * (i % 4)], rows[i]]);
        const pout = mkPath([[last.x, last.y], [last.x, 140], E]);
        const c = travelOrDance(i, look, pin, pout, 0.17 * i, tOut, 430, t, (c) => {
          const td = t - D0;
          if (td < 0) { c.pose = idlePose(t, i); return; }
          const d0 = danceAt(i, td);
          c.x = d0.x; c.y = d0.y;
          if (d0.run != null) { c.pose = runPose(d0.run * 14, 0.55); c.shake = 0.4; return; }
          if (d0.tl < 0) { c.pose = idlePose(t, i); return; }
          const d = dancePose(d0.seq, d0.tl);
          Object.assign(c, { pose: d.pose, shake: d.shake, flare: d.flare });
        });
        if (c) out.chars.push(c);
        out.guides.paths.push(pin);
      }
      // Le public se lève à la fin de chaque phrase.
      for (let p = 0; ; p++) {
        const tf = D0 + p * PH + 2 * BAR + 6 * BEAT;
        if (tf > X0) break;
        if (t < tf - 0.5 || t > tf + 1.5) continue;
        out.fx.push(['burst', 48, 420, tf, 3, 11 + p], ['burst', 52, 760, tf + 0.1, 3, 21 + p], ['burst', 1950, 380, tf + 0.05, 3, 31 + p], ['burst', 1948, 800, tf + 0.15, 3, 41 + p], ['burst', 600, 1240, tf + 0.2, 4, 51 + p], ['burst', 1400, 1240, tf + 0.1, 4, 61 + p]);
      }
    } else if (variant === 'B') {
      const xs = [330, 450, 570, 690, 1310, 1430, 1550, 1670], y = 106;
      const D0 = 3.2, D1 = D0 + 3 * BAR, X0 = D1 + 0.3;
      out.dim = 0.16 * sm((t - 1) / 1.5) * (1 - sm((t - X0 - 1) / 1.5));
      out.spots = [{ x: 510, y: 104, r: 250, i: 0.85 }, { x: 1490, y: 104, r: 250, i: 0.85 }];
      for (let i = 0; i < 8; i++) {
        const left = i < 4, E = left ? [120, y] : [1880, y];
        const order = left ? 3 - i : i - 4;
        const pin = mkPath([E, [xs[i], y]]), pout = mkPath([[xs[i], y], E]);
        const c = travelOrDance(i, look, pin, pout, 0.2 * order, X0 + 0.12 * (3 - order), 430, t, (c) => {
          const td = t - D0;
          if (td < 0) { c.pose = idlePose(t, i); return; }
          const bar = Math.floor(td / BAR), tl = td - bar * BAR;
          const lag = bar === 1 ? i * 0.09 : bar === 2 ? (7 - i) * 0.09 : 0;
          const seq = bar === 0 ? B1 : bar === 1 ? B2 : B3;
          if (tl - lag < 0) { c.pose = idlePose(t, i); return; }
          const d = dancePose(seq, tl - lag);
          Object.assign(c, { pose: d.pose, shake: d.shake, flare: d.flare });
        });
        if (c) out.chars.push(c);
        out.guides.paths.push(pin);
      }
      const tf = D0 + 2 * BAR + 6 * BEAT;
      for (let k = 0; k < 6; k++) out.fx.push(['burst', 240 + k * 300 + (k > 2 ? 280 : 0), 22, tf + k * 0.08, 3, 70 + k]);
    } else {
      const ctrs = [[812, 500], [1288, 500]];
      const offs = [[0, -58], [-66, 0], [66, 0], [0, 58]];
      const D0 = 3.6, X0 = D0 + 3 * BAR + 0.3;
      const on = sm((t - 1.4) / 1.4) * (1 - sm((t - X0 - 1.2) / 1.4));
      out.dim = 0.32 * on;
      out.spots = [{ x: ctrs[0][0], y: ctrs[0][1], r: 200, i: on }, { x: ctrs[1][0], y: ctrs[1][1], r: 200, i: on }];
      for (let i = 0; i < 8; i++) {
        const g = i < 4 ? 0 : 1, j = i % 4;
        const T = [ctrs[g][0] + offs[j][0], ctrs[g][1] + offs[j][1]];
        const E = g ? [1822, 1090] : [178, 1090];
        const pin = mkPath([E, [E[0], 990], T]), pout = mkPath([T, [E[0], 990], E]);
        const c = travelOrDance(i, look, pin, pout, 0.2 * j, X0 + 0.12 * (3 - j), 440, t, (c) => {
          const td = t - D0;
          if (td < 0) { c.pose = idlePose(t, i); return; }
          const bar = Math.floor(td / BAR), tl = td - bar * BAR;
          const active = bar === 2 || bar === g;
          if (!active) { c.pose = idlePose(t, i); c.shake = 0.15; return; }
          const lag = bar === 2 ? j * 0.06 : 0;
          if (tl - lag < 0) { c.pose = idlePose(t, i); return; }
          const d = dancePose(bar === 2 ? B3 : B1, tl - lag);
          if (g === 1 && bar !== 2) { const m = d.pose; d.pose = { aL: m.aR, aR: m.aL, lL: m.lR, lR: m.lL, lean: -m.lean, lift: m.lift }; }
          Object.assign(c, { pose: d.pose, shake: d.shake, flare: d.flare });
        });
        if (c) out.chars.push(c);
        out.guides.paths.push(pin);
      }
      out.fx.push(['burst', 48, 500, D0 + 7 * BEAT, 3, 81], ['burst', 1952, 500, D0 + BAR + 7 * BEAT, 3, 82]);
      const tf = D0 + 2 * BAR + 6 * BEAT;
      out.fx.push(['burst', 50, 300, tf, 3, 83], ['burst', 1950, 300, tf, 3, 84], ['burst', 700, 1242, tf + 0.1, 4, 85], ['burst', 1300, 1242, tf + 0.1, 4, 86]);
    }
    return out;
  }

  function mascChar(look, x, y, extra) {
    return Object.assign({ kind: 'masc', look, Hpx: HPX.masc[look], x, y, h: 0, face: 1, seed: 3, pose: P.ready }, extra || {});
  }

  function sceneMasc(variant, look, t) {
    const out = { chars: [], dim: 0, spots: [], fx: [], floor: [], guides: { paths: [] }, period: 11 };
    if (variant === 'A') {
      out.period = 10.6;
      const k = HPX.masc[look] / 100, R = RIGM[look];
      const Js = solve(R, P.slam);
      const hand = Js.arms[1].ha;
      const hDunk = 50;
      const gx = 1718 - hand[0] * k, gy = 548 + hDunk - hand[1] * k;
      const tx = gx - 185, ty = gy;
      const C = [1846, 1088];
      const p1 = mkPath([C, [1300, gy]]), p2 = mkPath([[1300, gy], [tx - 6, ty]]), p3 = mkPath([[gx, gy], [gx + 30, gy + 60], C]);
      out.guides.paths.push(p1, p2, p3);
      out.floor.push(['tramp', tx, ty, t > 3.75 && t < 4.1 ? sm((t - 3.75) / 0.12) * (1 - sm((t - 3.95) / 0.15)) : 0]);
      let c = null;
      const ballG = [1718, 548 + 70];
      if (t < 2.0) { const m = mover(p1, 0, p1.total / 2.0, t); c = mascChar(look, m.x, m.y, { pose: runPose(m.d / 17), face: -1, ball: true }); }
      else if (t < 3.0) { const u = t - 2.0; const p = mixPose(P.ready, P.point, eo(u / 0.25)); const b = Math.max(0, Math.sin(u * 9)); p.lL[0] += 8 * b; p.lR[0] += 8 * b; p.lL[1] -= 10 * b; p.lR[1] -= 10 * b; c = mascChar(look, 1300, gy, { pose: p, face: 1, ball: true }); }
      else if (t < 3.78) { const m = mover(p2, 3.0, p2.total / 0.78, t); c = mascChar(look, m.x, m.y, { pose: runPose(m.d / 15, 1.1), face: 1, ball: true }); }
      else if (t < 4.05) { const u = (t - 3.78) / 0.27; c = mascChar(look, tx, ty - 6, { pose: mixPose(P.ready, P.dip, sm(u * 1.6)), face: 1, ball: true, h: -3 * Math.sin(Math.PI * u) }); }
      else if (t < 4.85) {
        const u = (t - 4.05) / 0.8;
        const x = lerp(tx, gx, u), h = hDunk * u + 4 * 85 * u * (1 - u);
        const p = u < 0.5 ? mixPose(P.dip, P.tuck, eo(u / 0.3)) : mixPose(P.tuck, P.slam, eo((u - 0.5) / 0.35));
        c = mascChar(look, x, gy, { pose: p, face: 1, h, ball: true });
      } else if (t < 5.25) { const u = (t - 4.85) / 0.4; c = mascChar(look, gx, gy, { pose: mixPose(P.slam, P.hang, eo(u / 0.4)), face: 1, h: hDunk - 6 * Math.sin(Math.PI * u) }); }
      else if (t < 5.55) { const u = (t - 5.25) / 0.3; c = mascChar(look, gx, gy, { pose: mixPose(P.hang, P.land, eo(u)), face: 1, h: hDunk * (1 - u * u) }); }
      else if (t < 7.3) {
        const u = t - 5.55;
        const ph = Math.floor(u / 0.44), v = (u % 0.44) / 0.44;
        const p = ph % 2 ? mixPose(P.highV, P.jump, eo(v / 0.3)) : mixPose(P.jump, P.highV, eo(v / 0.3));
        const h = ph % 2 ? 20 * Math.sin(Math.PI * v) : 0;
        c = mascChar(look, gx, gy, { pose: p, face: 1, h });
      } else { const m = mover(p3, 7.3, p3.total / 2.3, t); if (!m.done) c = mascChar(look, m.x, m.y, { pose: runPose(m.d / 17), face: m.dx >= 0 ? 1 : -1 }); }
      if (c) out.chars.push(c);
      if (t >= 4.85 && t < 9.4) {
        const u = t - 4.85;
        let z, bx = 1718;
        if (u < 0.32) z = 70 * (1 - (u / 0.32) * (u / 0.32));
        else { const v = u - 0.32; const b1 = 0.38, b2 = 0.26; z = v < b1 ? 26 * Math.sin(Math.PI * v / b1) : v < b1 + b2 ? 9 * Math.sin(Math.PI * (v - b1) / b2) : 0; bx += Math.min(v, 1.2) * 40; }
        out.fx.push(['ball', bx, ballG[1], z]);
        out.fx.push(['rim', 1718, 548, u]);
      }
      out.fx.push(['burst', 1952, 360, 2.25, 3, 91], ['burst', 1952, 520, 5.6, 4, 92], ['burst', 1950, 760, 5.9, 4, 93], ['burst', 1700, 1243, 6.1, 4, 94], ['burst', 1952, 920, 6.3, 3, 95]);
    } else if (variant === 'B') {
      out.period = 11.8;
      const pts = [[1850, 1092], [1850, 142], [150, 142], [150, 1092]];
      const pi = mkPath(pts); out.guides.paths.push(pi);
      const sp = 340, t0 = 0.2;
      const m = mover(pi, t0, sp, t);
      if (m.moving) {
        let h = 0;
        if (Math.abs(m.x - 1850) < 1 || Math.abs(m.x - 150) < 1) { if (m.y > 462 && m.y < 632) h = 52 * Math.sin(Math.PI * (632 - m.y) / 170); }
        let pose = runPose(m.d / 17), face = 1;
        if (h > 0) pose = mixPose(pose, P.tuck, clamp(h / 30, 0, 1));
        const seg = m.d < 950 ? 0 : m.d < 2650 ? 1 : 2;
        if (seg === 1) {
          face = -1;
          const k = Math.floor((m.d - 950) / 230), v = ((m.d - 950) % 230) / 230;
          if (v > 0.15 && v < 0.75) { const hp = k % 2 ? P.punchL : P.punchR; const pp = mixPose(pose, hp, sm((v - 0.15) / 0.15) * (1 - sm((v - 0.6) / 0.15))); pp.lL = pose.lL; pp.lR = pose.lR; pose = pp; }
        } else if (h === 0) {
          face = seg === 0 ? 1 : -1;
          const v = (m.d % 200) / 200;
          if (v > 0.2 && v < 0.7) { const pp = mixPose(pose, P.point, sm((v - 0.2) / 0.15) * (1 - sm((v - 0.55) / 0.15))); pp.lL = pose.lL; pp.lR = pose.lR; pose = pp; }
        }
        out.chars.push(mascChar(look, m.x, m.y, { pose, face, h }));
        out.overScore = m.x > 780 && m.x < 1220 && m.y < 200;
      }
      for (let d = 120; d < pi.total; d += 200) {
        const p = at(pi, d); const tt = t0 + d / sp;
        let fx, fy;
        if (Math.abs(p.x - 1850) < 1) { fx = 1952; fy = p.y; } else if (Math.abs(p.x - 150) < 1) { fx = 48; fy = p.y; } else { if (p.x > 800 && p.x < 1200) continue; fx = p.x; fy = 22; }
        if (fy > 460 && fy < 640) continue;
        out.fx.push(['burst', fx, fy, tt + 0.05, 3, Math.floor(d)]);
      }
    } else {
      out.period = 15;
      const pin = mkPath([[176, 1090], [176, 992], [1000, 604]]), pout = mkPath([[1000, 604], [1824, 992], [1824, 1090]]);
      out.guides.paths.push(pin, pout);
      let c = null; const mi = mover(pin, 0.2, 300, t);
      const tArr = 0.2 + pin.total / 300;
      const W0 = 5.7, WD = 5.2;
      const per = mkPath([[48, 1180], [48, 26], [1952, 26], [1952, 1180], [1952, 1244], [48, 1244], [48, 1180]]);
      const ws = (t - W0) / WD;
      if (t < tArr) { if (mi.moving) c = mascChar(look, mi.x, mi.y, { pose: runPose(mi.d / 15, 0.8), face: mi.dx >= 0 ? 1 : -1 }); }
      else if (t < 5.4) { const u = t - tArr; const n = Math.floor(u / 0.45), v = (u % 0.45) / 0.45; const p = mixPose(n % 2 ? P.hype1 : P.hype2, n % 2 ? P.hype2 : P.hype1, eo(v / 0.35)); c = mascChar(look, 1000, 604, { pose: p, face: 1 }); }
      else if (t < W0 + WD) {
        const front = at(per, clamp(ws, 0, 1) * per.total);
        const dx = front.x - 1000, dy = front.y - (604 - 80);
        const face = dx >= 0 ? 1 : -1;
        const th = Math.atan2(Math.abs(dx), dy) / D2R;
        const pt = { aL: [28, -55], aR: [th, th], lL: [10, 10], lR: [10, 10], lean: -4 };
        const p = mixPose(P.ready, pt, eo((t - 5.4) / 0.3));
        const b = Math.max(0, Math.sin(t * 10)); p.lL[0] += 6 * b; p.lR[0] += 6 * b; p.lL[1] -= 8 * b; p.lR[1] -= 8 * b;
        c = mascChar(look, 1000, 604, { pose: p, face });
      } else if (t < 12.0) {
        const u = t - (W0 + WD); const n = Math.floor(u / 0.42), v = (u % 0.42) / 0.42;
        const p = n % 2 ? mixPose(P.highV, P.jump, eo(v / 0.3)) : mixPose(P.jump, P.highV, eo(v / 0.3));
        c = mascChar(look, 1000, 604, { pose: p, face: 1, h: n % 2 ? 22 * Math.sin(Math.PI * v) : 0 });
      } else { const mo = mover(pout, 12.0, 300, t); if (mo.moving) c = mascChar(look, mo.x, mo.y, { pose: runPose(mo.d / 15, 0.8), face: mo.dx >= 0 ? 1 : -1 }); }
      if (c) out.chars.push(c);
      const cx = c ? c.x : 1000, cy = c ? c.y : 604;
      const on = sm((t - 0.3) / 1.6) * (1 - sm((t - 12.2) / 1.8));
      out.dim = 0.44 * on;
      out.spots = [{ x: cx, y: cy - 10, r: 190, i: on }];
      if (ws > 0 && ws < 1.05) out.fx.push(['wave', per, ws]);
      const te = W0 + WD + 0.1;
      out.fx.push(['burst', 48, 400, te, 3, 101], ['burst', 600, 22, te + 0.1, 3, 102], ['burst', 1400, 22, te, 3, 103], ['burst', 1952, 500, te + 0.15, 3, 104], ['burst', 1000, 1244, te + 0.05, 4, 105]);
    }
    return out;
  }

  function staffChar(look, x, y, extra) {
    return Object.assign({ kind: 'staff', look, Hpx: HPX.staff[look], x, y, h: 0, face: 1, pal: { skin: '#d9a07a' }, pose: P.ready }, extra || {});
  }
  function trajectory(S, h0, T, hT) {
    const dist = Math.hypot(T[0] - S[0], T[1] - S[1]);
    const A = T[1] < 120 ? Math.min(160, 0.12 * dist + 24) : Math.min(330, 0.28 * dist + 40);
    const D = Math.max(0.95, dist / 690);
    return { S, h0, T, hT, A, D, dist };
  }
  function trajAt(tr, u) {
    const gx = lerp(tr.S[0], tr.T[0], u), gy = lerp(tr.S[1], tr.T[1], u);
    const h = tr.h0 + (tr.hT - tr.h0) * u + 4 * tr.A * u * (1 - u);
    return { gx, gy, h, sx: gx, sy: gy - h };
  }
  function launchAngle(S, h0, T, hT) {
    const tr = trajectory(S, h0, T, hT);
    const vx = T[0] - S[0], vy = (T[1] - S[1]) - ((hT - h0) + 4 * tr.A);
    return Math.atan2(vy, vx);
  }

  const TEE = {
    A: { period: 7.8, launchers: [[905, 642], [1095, 642]], shots: [[0, 1.0, [42, 300], 30], [1, 1.55, [1958, 300], 30], [0, 2.6, [50, 790], 30], [1, 3.15, [1950, 790], 30], [0, 4.2, [330, 24], 12], [1, 4.75, [1670, 24], 12]] },
    B: { period: 8.4, launchers: [[215, 1106], [1785, 1106]], shots: [[0, 1.0, [46, 840], 30], [1, 1.6, [1954, 840], 30], [0, 2.3, [50, 420], 30], [1, 2.9, [1950, 420], 30], [0, 3.6, [150, 24], 12], [1, 4.2, [1850, 24], 12], [0, 4.9, [470, 24], 12], [1, 5.5, [1530, 24], 12]] },
    C: { period: 9.6, cart: [1000, 716], shots: [[0, 1.0, [42, 620], 30], [0, 2.1, [160, 24], 12], [0, 3.2, [560, 22], 12], [0, 4.3, [1440, 22], 12], [0, 5.4, [1840, 24], 12], [0, 6.5, [1958, 620], 30], [0, 7.6, [1000, 1248], 22]] }
  };

  function staffMuzzleWorld(look, L, phi, recoil) {
    const face = Math.cos(phi) >= 0 ? 1 : -1;
    const pose = aimPose(phi, face, 1);
    const R = RIG[look], J = solve(R, pose);
    const aimL = [Math.cos(phi) * face, Math.sin(phi)];
    const g = staffGeo(R, J, aimL, recoil || 0);
    const c = { x: L[0], y: L[1], h: 0, face, Hpx: HPX.staff[look] };
    return { m: localToWorld(c, g.muzzle), face, pose, aimL };
  }

  function sceneTee(variant, look, t) {
    const cfg = TEE[variant];
    const out = { chars: [], dim: 0.1, spots: [], fx: [], floor: [], shirts: [], guides: { paths: [], traj: [] }, period: cfg.period };
    const shots = cfg.shots.map((s, idx) => {
      const T = s[2], hT = s[3];
      if (variant === 'C') {
        const piv = [cfg.cart[0], cfg.cart[1] - 34];
        let phi = launchAngle([piv[0], cfg.cart[1]], 34, T, hT);
        const m = [piv[0] + Math.cos(phi) * 70, piv[1] + Math.sin(phi) * 70];
        const S = [m[0], cfg.cart[1]], h0 = cfg.cart[1] - m[1];
        phi = launchAngle(S, h0, T, hT);
        return { who: 0, tF: s[1], T, hT, phi, tr: trajectory(S, h0, T, hT), idx };
      }
      const L = cfg.launchers[s[0]];
      let phi = launchAngle(L, HPX.staff[look] * 0.55, T, hT);
      const mw = staffMuzzleWorld(look, L, phi, 0).m;
      const S = [mw[0], L[1]], h0 = L[1] - mw[1];
      phi = launchAngle(S, h0, T, hT);
      return { who: s[0], tF: s[1], T, hT, phi, tr: trajectory(S, h0, T, hT), idx };
    });
    function aimAt(who, t) {
      const mine = shots.filter(s => s.who === who);
      let prev = null, next = null;
      for (const s of mine) { if (s.tF <= t - 0.25) prev = s; else if (!next) next = s; }
      const restPhi = variant === 'C' ? -Math.PI / 2 : (cfg.launchers[who][0] < 1000 ? -Math.PI * 0.85 : -Math.PI * 0.15);
      const p0 = prev ? prev.phi : restPhi;
      if (!next) return { phi: p0, recoil: prev ? 7 * Math.exp(-(t - prev.tF) * 10) : 0, last: prev };
      const u = sm((t - (next.tF - 0.75)) / 0.5);
      let d = next.phi - p0; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      const recoil = prev && t - prev.tF < 0.6 ? 7 * Math.exp(-(t - prev.tF) * 10) : 0;
      return { phi: p0 + d * u, recoil, brace: sm((t - (next.tF - 0.35)) / 0.25), last: prev };
    }
    if (variant === 'C') {
      const a = aimAt(0, t);
      out.floor.push(['cart', cfg.cart[0], cfg.cart[1], a.phi, a.recoil]);
      const gc = staffChar(look, cfg.cart[0] - 62, cfg.cart[1] + 8, { face: 1 });
      gc.pose = mixPose(P.ready, { aL: [28, -55], aR: [60, 110], lL: [12, 12], lR: [12, 12] }, 1);
      out.chars.push(gc);
      const lc = staffChar(look, cfg.cart[0] + 64, cfg.cart[1] + 10, { face: -1 });
      const lu = ((t - 0.4) % 1.1) / 1.1; lc.pose = mixPose(P.clasp, P.T, sm(lu * 3) * (1 - sm((lu - 0.5) * 3)));
      out.chars.push(lc);
    } else {
      cfg.launchers.forEach((L, who) => {
        const a = aimAt(who, t);
        const mw = staffMuzzleWorld(look, L, a.phi, a.recoil);
        const pose = aimPose(a.phi, mw.face, a.brace == null ? 0.4 : 0.4 + 0.6 * a.brace);
        const rc = a.recoil * 0.6;
        out.chars.push(staffChar(look, L[0] - Math.cos(a.phi) * rc, L[1] - Math.sin(a.phi) * rc * 0.3, { pose, face: mw.face, aim: mw.aimL, recoil: a.recoil }));
      });
    }
    for (const s of shots) {
      const u = (t - s.tF) / s.tr.D;
      out.guides.traj.push(s.tr);
      const muz = trajAt(s.tr, 0);
      if (t >= s.tF && t - s.tF < 0.14) out.fx.push(['flash', muz.sx, muz.sy, (t - s.tF) / 0.14, variant === 'C' ? 1.6 : 1]);
      if (t >= s.tF && t - s.tF < 0.9) out.fx.push(['smoke', muz.sx, muz.sy, (t - s.tF) / 0.9, s.phi, variant === 'C' ? 1.5 : 1]);
      if (u >= 0 && u <= 1) out.shirts.push({ tr: s.tr, u, spinDir: Math.cos(s.phi) >= 0 ? 1 : -1, seed: s.idx });
      if (u > 1) out.fx.push(['burst', s.T[0], s.T[1] - s.hT, s.tF + s.tr.D, 3, 200 + s.idx]);
    }
    return out;
  }

  function drawShirtShadow(s) {
    const p = trajAt(s.tr, s.u);
    shadowEll(p.gx, p.gy, 11 + p.h * 0.05, 5 + p.h * 0.02, 0, 0.42 / (1 + p.h / 70));
  }
  function drawShirt(s, t) {
    const p = trajAt(s.tr, s.u);
    const sc = 1.3 * (1 + p.h / 260) * (s.u > 0.92 ? 1 - (s.u - 0.92) * 5 : 1);
    const spin = s.u * 4.2 * Math.PI * s.spinDir + s.seed;
    const flip = 0.3 + 0.7 * Math.abs(Math.cos(s.u * 11 + s.seed));
    ctx.save(); ctx.translate(p.sx, p.sy); ctx.rotate(spin); ctx.scale(sc * flip * 1.15, sc * 1.15);
    ctx.beginPath();
    ctx.moveTo(-11, -8); ctx.lineTo(-4, -11); ctx.quadraticCurveTo(0, -7, 4, -11); ctx.lineTo(11, -8); ctx.lineTo(13, -1); ctx.lineTo(7, -1); ctx.lineTo(7, 11); ctx.lineTo(-7, 11); ctx.lineTo(-7, -1); ctx.lineTo(-13, -1); ctx.closePath();
    ctx.fillStyle = s.seed % 3 === 2 ? TC.s : TC.p; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = OL; ctx.stroke();
    ctx.fillStyle = s.seed % 3 === 2 ? TC.p : TC.s; ctx.font = '800 7px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(TC.short, 0, 4);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.25;
    for (let i = 1; i <= 3; i++) { const q = trajAt(s.tr, Math.max(0, s.u - i * 0.025)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.sx, q.sy, 3 - i * 0.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function drawFloor(f, t) {
    if (f[0] === 'tramp') {
      const x = f[1], y = f[2], d = f[3];
      shadowEll(x, y + 4, 46, 15, 0, 0.5);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#26262a'; ctx.strokeStyle = OL; ctx.lineWidth = 2;
      for (const s of [-1, 1]) { ctx.fillRect(s * 30 - 2, -2, 4, 10); }
      ctx.beginPath(); ctx.ellipse(0, -4, 38, 13, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -4 + d * 3, 30, 9 + d * 2, 0, 0, TAU); ctx.fillStyle = '#378add'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, -6 + d * 3, 22, 5, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.restore();
    } else if (f[0] === 'cart') {
      const x = f[1], y = f[2], phi = f[3], rc = f[4];
      shadowEll(x, y + 4, 62, 18, 0, 0.55);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#2c2c2a'; ctx.strokeStyle = OL; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.rect(-44, -26, 88, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = TC.p; ctx.fillRect(-40, -22, 80, 5);
      ctx.fillStyle = TC.s; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(TC.short, 0, -8);
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 30, -3, 8, 0, TAU); ctx.fillStyle = '#1a1a1a'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 30, -3, 3, 0, TAU); ctx.fillStyle = '#888780'; ctx.fill(); }
      ctx.translate(0, -34);
      ctx.fillStyle = '#5f5e5a'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.rotate(phi); ctx.translate(-rc, 0);
      ctx.fillStyle = '#4a4a47'; ctx.beginPath(); ctx.rect(-18, -9, 88, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ef9f27'; ctx.fillRect(18, -9, 8, 18);
      ctx.fillStyle = TC.p; ctx.fillRect(-16, -9, 14, 18);
      ctx.fillStyle = '#2c2c2a'; ctx.beginPath(); ctx.ellipse(70, 0, 4, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawFx(f, t) {
    const k = f[0];
    if (k === 'burst') burst(f[1], f[2], f[3], t, f[4], f[5]);
    else if (k === 'ball') {
      const x = f[1], gy = f[2], z = f[3];
      shadowEll(x, gy + 2, 10 + z * 0.06, 4, 0, 0.5 / (1 + z / 40));
      ctx.save(); ctx.translate(x, gy - z - 9);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fillStyle = '#e8792a'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.strokeStyle = '#6b2f0b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.stroke();
      ctx.restore();
    } else if (k === 'rim') {
      const x = f[1], y = f[2], u = f[3];
      if (u > 1.2) return;
      const wob = Math.sin(u * 45) * 4 * Math.exp(-u * 5);
      ctx.save(); ctx.translate(x, y);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 70); g.addColorStop(0, 'rgba(255,220,160,' + (0.5 * Math.exp(-u * 4)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#e8792a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.ellipse(0, wob, 15, 15, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 6, wob + 10); ctx.lineTo(i * 4, wob + 26 + Math.abs(wob)); ctx.stroke(); }
      ctx.restore();
    } else if (k === 'flash') {
      const x = f[1], y = f[2], u = f[3], s = f[4];
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const r = (22 + 26 * u) * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,250,220,' + (0.95 * (1 - u)).toFixed(3) + ')'); g.addColorStop(0.4, 'rgba(255,200,90,' + (0.6 * (1 - u)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,160,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    } else if (k === 'smoke') {
      const x = f[1], y = f[2], u = f[3], phi = f[4], s = f[5];
      for (let i = 0; i < 4; i++) {
        const d = (8 + 30 * u + i * 9) * s, a = phi + (i - 1.5) * 0.35;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d - 12 * u;
        ctx.fillStyle = 'rgba(230,226,220,' + (0.5 * (1 - u) * (1 - i * 0.15)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(px, py, (5 + 13 * u + i * 2) * s, 0, TAU); ctx.fill();
      }
    } else if (k === 'wave') {
      const per = f[1], s = f[2];
      const front = s * per.total;
      for (let d = 0; d < per.total; d += 24) {
        const g = Math.exp(-Math.pow((d - front) / 70, 2));
        if (g < 0.08) continue;
        const p = at(per, d);
        if (p.y < 60 && p.x > 800 && p.x < 1200) continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, g * 1.3);
        fan(p.x + (hash(d) - 0.5) * 10, p.y - g * 8, g, d, t);
        ctx.restore();
      }
      const p = at(per, front);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 130); gr.addColorStop(0, 'rgba(255,230,180,0.35)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, 130, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  // Une image de la scène, temps t (s) depuis le début de la boucle.
  // opts : { show: "pom" | "masc" | "tee", variant: "A" | "B" | "C", t, q, order, total }
  // (total : pompom — durée du show, entrée et sortie comprises, en s)
  function draw(context, opts) {
    ctx = context; setQ(opts.q);
    const show = opts.show, variant = opts.variant;
    const look = SHOW_LOOK[show === "pom" ? "pom" : show + variant] || "cartoon";
    const t = Math.max(0, opts.t || 0);
    seqOrder = opts.order || 0;
    pomTotal = opts.total > 0 ? opts.total : 18.6;
    const sc = show === 'pom' ? scenePom(variant, look, t) : show === 'masc' ? sceneMasc(variant, look, t) : sceneTee(variant, look, t);
    drawLighting(sc.dim, sc.spots);
    const env = makeEnv(sc.dim, sc.spots);
    (sc.floor || []).forEach(f => drawFloor(f, t));
    sc.chars.forEach(c => drawShadow(c, env));
    (sc.shirts || []).forEach(drawShirtShadow);
    sc.chars.slice().sort((a, b) => a.y - b.y).forEach(c => drawChar(c, t, env));
    sc.fx.forEach(f => drawFx(f, t));
    (sc.shirts || []).forEach(s => drawShirt(s, t));
    return { chars: sc.chars.map(c => ({ kind: c.kind, x: c.x, y: c.y, h: c.h })), shirts: (sc.shirts || []).length, look };
  }
  return { draw, colors: TC };
}
