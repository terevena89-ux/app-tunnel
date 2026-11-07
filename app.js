"use strict";
// =========================================================
// Tunnel — démo de gameplay
//
// Le monde est une grande grille de petites cases (3 px à l'écran).
// Chaque case a un « type » (vide, terre, argile, minerai...).
// À chaque image (environ 60 fois par seconde) on :
//   1. lit les doigts (gratter, ou regarder ailleurs à deux doigts),
//   2. fait tomber le mineur s'il n'a plus de sol,
//   3. recalcule la lumière si quelque chose a changé,
//   4. dessine les cases visibles, puis le mineur et la poussière.
// =========================================================

const VERSION = "0.1.0";

// ---------- 1. Réglages ----------

const CASE = 3;                    // taille d'une case à l'écran (px)
const LARG = 256, PROF = 1600;     // taille du monde, en cases
const N = LARG * PROF;

// Types de cases
const VIDE = 0, TERRE = 1, ARGILE = 2, BASALTE = 3, SABLE = 4,
      CUIVRE = 5, OR = 6, CRISTAL = 7, FOSSILE = 8, RECHARGE = 9,
      EAU = 10, SOCLE = 11;

// Résistance de chaque matière (plus c'est haut, plus il faut insister)
const RES = [];
RES[TERRE] = 1; RES[ARGILE] = 2; RES[BASALTE] = 4; RES[SABLE] = 0.5;
RES[CUIVRE] = 3; RES[OR] = 4; RES[CRISTAL] = 3; RES[FOSSILE] = 3; RES[RECHARGE] = 1.5;

const PUISSANCE = 18;        // usure par seconde sous le doigt
const RAYON_GRATTOIR = 1.8;  // taille du grattoir (en cases) : environ un ongle
const PORTEE = 22;           // distance max entre le mineur et le doigt (en cases)
const PORTEE_LUMIERE = 90;   // jusqu'où porte la lampe
const MEMOIRE = 0.26;        // luminosité des endroits déjà vus

// Couleurs des couches : terre, argile rouge, basalte
const COUL_COUCHE = [null, [112, 76, 50], [170, 86, 54], [56, 46, 70]];
const COUL_SOCLE = [34, 31, 38];
const COUL = [];
COUL[CUIVRE] = [226, 148, 92]; COUL[OR] = [236, 196, 80]; COUL[CRISTAL] = [160, 226, 242];
COUL[FOSSILE] = [234, 222, 196]; COUL[RECHARGE] = [126, 226, 160];
// Teinte « bougie douce » (rouge, vert, bleu) appliquée à la lumière
const TEINTE = [1.06, 0.93, 0.79];

// ---------- 2. Le monde ----------

const type = new Uint8Array(N);     // type de chaque case
const couche = new Uint8Array(N);   // couche d'origine (pour la couleur du fond et du sable)
const usure = new Float32Array(N);  // combien la case a déjà été grattée
const revele = new Uint8Array(N);   // 0 = jamais vue, 255 = vue (sert au fondu et au souvenir)

const idx = (x, y) => y * LARG + x;
const dansMonde = (x, y) => x >= 0 && y >= 0 && x < LARG && y < PROF;
const typeA = (x, y) => dansMonde(x, y) ? type[idx(x, y)] : SOCLE;
const solide = (x, y) => { const t = typeA(x, y); return t !== VIDE && t !== EAU; };
const rocheSimple = t => t >= TERRE && t <= BASALTE;

// « Hasard figé » : pour une même case, donne toujours le même nombre entre 0 et 1.
// Sert au grain de la roche, pour qu'il ne clignote pas d'une image à l'autre.
function hache(x, y, g = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(g, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Tirage au sort « rejouable » à partir d'une graine
function generateurAleatoire(graine) {
  return function () {
    graine = (graine + 0x6D2B79F5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bruit doux en une dimension (pour des frontières de couches ondulées)
function bruit1(x, g) {
  const i = Math.floor(x), f = x - i, a = hache(i, 0, g), b = hache(i + 1, 0, g);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

const graine = (Math.random() * 1e9) | 0;
const alea = generateurAleatoire(graine);
const entre = (a, b) => a + alea() * (b - a);

// Une « tache » de forme irrégulière (filon, poche de sable...)
function tache(cx, cy, r, t, densite = 1, siRoche = true) {
  const m = Math.ceil(r * 1.5);
  for (let y = Math.floor(cy - m); y <= cy + m; y++) {
    for (let x = Math.floor(cx - m); x <= cx + m; x++) {
      if (!dansMonde(x, y)) continue;
      const dx = x - cx, dy = y - cy, a = Math.atan2(dy, dx);
      const rr = r * (0.75 + 0.3 * Math.sin(a * 3 + cx) + 0.1 * Math.sin(a * 7 + cy));
      const i = idx(x, y);
      if (dx * dx + dy * dy < rr * rr && (!siRoche || rocheSimple(type[i])) && alea() < densite) type[i] = t;
    }
  }
}

// Une grotte naturelle : grande poche vide + stalactites au plafond, stalagmites au sol
function grotte(cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) {
    for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
      if (!dansMonde(x, y) || type[idx(x, y)] === SOCLE) continue;
      const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
      const r = 1 + 0.15 * Math.sin(a * 4 + cx) + 0.08 * Math.sin(a * 9 + cy);
      if (dx * dx + dy * dy < r * r) type[idx(x, y)] = VIDE;
    }
  }
  // Pointes : on cherche le plafond (ou le sol) de chaque colonne, puis on y ajoute un cône de roche
  const pointe = (xc, depart, sens, longueur, largeur) => {
    for (let d = 0; d < longueur; d++) {
      const demi = (largeur / 2) * (1 - d / longueur);
      for (let dx = -Math.ceil(demi); dx <= Math.ceil(demi); dx++) {
        if (Math.abs(dx) > demi + 0.3) continue;
        const x = xc + dx, y = depart + d * sens;
        if (dansMonde(x, y) && type[idx(x, y)] === VIDE) type[idx(x, y)] = couche[idx(x, y)];
      }
    }
  };
  for (let x = Math.floor(cx - rx); x <= cx + rx;) {
    const larg = 2 + Math.floor(alea() * 3), xc = x + (larg >> 1);
    let haut = -1, bas = -1;
    for (let y = Math.floor(cy - ry * 1.5); y <= cy; y++) if (typeA(xc, y) === VIDE) { haut = y; break; }
    for (let y = Math.ceil(cy + ry * 1.5); y >= cy; y--) if (typeA(xc, y) === VIDE) { bas = y; break; }
    if (haut >= 0 && alea() < 0.65) pointe(xc, haut, 1, entre(2, 8), larg);
    if (bas >= 0 && alea() < 0.4) pointe(xc, bas, -1, entre(1, 4), larg + 1);
    x += larg + Math.floor(alea() * 3);
  }
  // Un trésor caché juste sous le sol de la grotte
  const xt = Math.round(cx + (alea() - 0.5) * rx);
  for (let y = Math.ceil(cy + ry * 1.5); y >= cy; y--) {
    if (typeA(xt, y) === VIDE) {
      const choix = [CRISTAL, OR, FOSSILE, CRISTAL][Math.floor(alea() * 4)];
      tache(xt, y + 2, 2.2, choix);
      break;
    }
  }
}

// Point de départ du mineur
const DEPART_X = 126, DEPART_Y = 70;

function genererMonde() {
  // Les couches, avec des frontières qui ondulent
  for (let x = 0; x < LARG; x++) {
    const b1 = 450 + (bruit1(x / 23, 1) - 0.5) * 40 + (bruit1(x / 7, 2) - 0.5) * 10;
    const b2 = 950 + (bruit1(x / 29, 3) - 0.5) * 50 + (bruit1(x / 6, 4) - 0.5) * 10;
    const fond = 1500 + (bruit1(x / 17, 5) - 0.5) * 30;
    for (let y = 0; y < PROF; y++) {
      const i = idx(x, y), c = y < b1 ? 1 : y < b2 ? 2 : 3;
      couche[i] = c;
      type[i] = (y >= fond || x < 2 || x >= LARG - 2) ? SOCLE : c;
    }
  }
  // Poches de sable (même couleur que la couche, grain moucheté)
  for (let n = 0; n < 34; n++) tache(entre(10, LARG - 10), entre(40, 1480), entre(4, 9), SABLE);
  // Minerais, cristaux, fossiles, recharges
  for (let n = 0; n < 130; n++) tache(entre(4, LARG - 4), entre(30, 1490), entre(1.5, 3), CUIVRE, 0.85);
  for (let n = 0; n < 55; n++) tache(entre(4, LARG - 4), entre(300, 1490), entre(1.5, 2.5), OR, 0.85);
  for (let n = 0; n < 28; n++) tache(entre(4, LARG - 4), entre(150, 1490), entre(1.5, 2.5), CRISTAL);
  for (let n = 0; n < 12; n++) tache(entre(4, LARG - 4), entre(200, 1490), 2, FOSSILE);
  for (let n = 0; n < 16; n++) tache(entre(4, LARG - 4), entre(80, 1490), 1.5, RECHARGE);
  // Grottes naturelles, rares et grandes
  for (let n = 0; n < 9; n++) grotte(entre(30, LARG - 30), entre(110, 1440), entre(18, 34), entre(9, 16));
  // Poches d'eau (immobiles pour l'instant : l'eau qui coule arrivera à l'étape 3)
  for (let n = 0; n < 14; n++) {
    const cx = entre(15, LARG - 15), cy = entre(100, 1480), rx = entre(5, 12), ry = entre(3, 6);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dansMonde(x, y) && dx * dx + dy * dy < 1 && (rocheSimple(type[idx(x, y)]) || type[idx(x, y)] === SABLE)) type[idx(x, y)] = EAU;
    }
  }
  // Zone de départ propre : pas de sable ni d'eau tout près, une petite salle pour commencer
  for (let y = 0; y < DEPART_Y + 22; y++) for (let x = 100; x < 156; x++) {
    const i = idx(x, y);
    if (type[i] === SABLE || type[i] === EAU || type[i] === VIDE) type[i] = TERRE;
  }
  for (let y = DEPART_Y - 14; y < DEPART_Y; y++) for (let x = DEPART_X - 8; x < DEPART_X + 13; x++) {
    const bord = (x - DEPART_X - 2.5) ** 2 / 110 + (y - DEPART_Y + 7) ** 2 / 55;
    if (bord < 1) type[idx(x, y)] = VIDE;
  }
}

// ---------- 3. Le mineur ----------
// Position = coin bas-gauche, en cases. Il occupe 5 cases de large et 7 de haut.

const LM = 5, HM = 7;
const mineur = { x: DEPART_X, y: DEPART_Y, vy: 0, chute: 0, sens: 1 };

function solSous() {
  for (let k = 0; k < LM; k++) if (solide(mineur.x + k, mineur.y)) return true;
  return false;
}

// Gravité : s'il n'a plus de sol, il tombe, case par case (pour ne jamais traverser la roche)
function majMineur(dt) {
  if (solSous()) { mineur.vy = 0; mineur.chute = 0; return; }
  mineur.vy = Math.min(mineur.vy + 90 * dt, 45);
  mineur.chute += mineur.vy * dt;
  while (mineur.chute >= 1) {
    if (solSous()) { mineur.chute = 0; mineur.vy = 0; break; }
    mineur.y += 1;
    mineur.chute -= 1;
    lumiereSale = true;
  }
}

// La lampe est sur le casque, côté où il regarde
const lampeX = () => mineur.x + (mineur.sens > 0 ? LM - 1 : 0);
const lampeY = () => mineur.y - HM + 1;
const centreMineurX = () => mineur.x + LM / 2;
const centreMineurY = () => mineur.y + mineur.chute - HM / 2;

// Dessin du mineur, ligne par ligne (une lettre = une couleur)
const SPRITE = [
  " CCC ",
  "CCCCL",
  " PPY ",
  "PSSSP",
  " SSS ",
  " S S ",
  " N N "
];
const COUL_SPRITE = { C: "#E9A72E", L: "#fff3b8", P: "#e8bf94", Y: "#26304F", S: "#3f6fb0", N: "#26304F" };

// ---------- 4. La lumière ----------
// La lumière part de la lampe et « voyage » de case en case :
// dans le vide, chaque pas coûte 1 ; dans l'eau 2 ; dans la roche 5.
// Elle va donc loin dans les galeries et s'éteint vite dans la roche.
// (Méthode des « seaux » : on traite d'abord les cases les plus proches.)

const LR = 200;                        // coût maximum calculé (2 par pas)
const LW = LR + 1;                     // taille de la zone calculée autour de la lampe (en cases)
const dist = new Uint16Array(LW * LW);
const seaux = Array.from({ length: LR + 1 }, () => []);
let lumOx = 0, lumOy = 0, lumiereSale = true;

function relacher(k, c) {
  if (c < dist[k]) { dist[k] = c; seaux[c].push(k); }
}

function calculerLumiere() {
  dist.fill(65535);
  const sx = lampeX(), sy = lampeY();
  const demi = LR >> 1;
  lumOx = sx - demi; lumOy = sy - demi;
  const k0 = demi * LW + demi;
  dist[k0] = 0; seaux[0].push(k0);
  for (let c = 0; c <= LR; c++) {
    const q = seaux[c];
    for (let n = 0; n < q.length; n++) {
      const k = q[n];
      if (dist[k] !== c) continue;
      const lx = k % LW, ly = (k / LW) | 0;
      const t = typeA(lx + lumOx, ly + lumOy);
      // Pas tout droit = 2, pas en diagonale = 3 (≈ 2 × 1,4) : la lumière fait un rond, pas un losange
      const m = t === VIDE ? 1 : t === EAU ? 2 : 5;
      const nc = c + 2 * m, nd = c + 3 * m;
      if (nc > LR) continue;
      const g = lx > 0, dr = lx < LW - 1, h = ly > 0, b = ly < LW - 1;
      if (g) relacher(k - 1, nc);
      if (dr) relacher(k + 1, nc);
      if (h) relacher(k - LW, nc);
      if (b) relacher(k + LW, nc);
      if (nd <= LR) {
        if (g && h) relacher(k - LW - 1, nd);
        if (dr && h) relacher(k - LW + 1, nd);
        if (g && b) relacher(k + LW - 1, nd);
        if (dr && b) relacher(k + LW + 1, nd);
      }
    }
    q.length = 0;
  }
}

function distLumiere(x, y) {
  const lx = x - lumOx, ly = y - lumOy;
  if (lx < 0 || ly < 0 || lx >= LW || ly >= LW) return 65535;
  return dist[ly * LW + lx];
}

// ---------- 5. Gratter ----------

let derniereVibration = 0;
function vibrer(ms) {
  const t = performance.now();
  if (t - derniereVibration < 70 || !navigator.vibrate) return;
  derniereVibration = t;
  navigator.vibrate(ms);
}

// Gratte autour du point (px, py) du monde pendant dt secondes
function gratter(px, py, dt) {
  const cmx = centreMineurX(), cmy = centreMineurY();
  if ((px - cmx) ** 2 + (py - cmy) ** 2 > PORTEE * PORTEE) return; // trop loin du mineur
  const r = RAYON_GRATTOIR;
  for (let y = Math.floor(py - r); y <= py + r; y++) {
    for (let x = Math.floor(px - r); x <= px + r; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d > r || !dansMonde(x, y)) continue;
      const i = idx(x, y), t = type[i];
      if (t === VIDE || t === EAU || t === SOCLE) continue;
      usure[i] += dt * PUISSANCE * (d < r * 0.6 ? 1 : 0.6);
      if (usure[i] >= RES[t]) {
        type[i] = VIDE;
        usure[i] = 0;
        lumiereSale = true;
        poussiere(x, y, couleurCase(x, y, t));
        vibrer(RES[t] >= 3 ? 9 : 4);
      }
    }
  }
}

// Gratte le long du trajet du doigt depuis la dernière image (pour ne pas sauter de cases si on va vite)
function gratterTrajet(ax, ay, bx, by, dt) {
  const longueur = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(longueur / 0.8));
  const part = Math.max(dt / n, dt * 0.35);
  for (let k = 1; k <= n; k++) gratter(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, part);
}

// ---------- 6. Poussière ----------

const particules = [];
function poussiere(x, y, coul) {
  if (particules.length > 250 || Math.random() < 0.5) return;
  particules.push({
    x: x + 0.5, y: y + 0.5,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12,
    vie: 0.5 + Math.random() * 0.4,
    coul: "rgb(" + Math.min(255, coul[0] * 1.3) + "," + Math.min(255, coul[1] * 1.25) + "," + Math.min(255, coul[2] * 1.2) + ")"
  });
}
function majParticules(dt) {
  for (let n = particules.length - 1; n >= 0; n--) {
    const p = particules[n];
    p.vy += 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt;
    if (p.vie <= 0 || solide(Math.floor(p.x), Math.floor(p.y))) particules.splice(n, 1);
  }
}

// ---------- 7. Doigts : gratter, ou regarder ailleurs à deux doigts ----------

const ecran = document.getElementById("jeu");
const ctx = ecran.getContext("2d");
const doigts = new Map();
let modeRegard = false, decalX = 0, decalY = 0, attenteRetour = 0, milieuAvant = null;
let camX = 0, camY = 0;

// Position du doigt sur l'écran → position dans le monde (en cases)
const versMondeX = px => camX + px / CASE;
const versMondeY = py => camY + py / CASE;

ecran.addEventListener("pointerdown", e => {
  try { ecran.setPointerCapture(e.pointerId); } catch (err) {} // le doigt reste « attaché » au jeu même s'il sort de l'écran
  doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY });
  if (doigts.size >= 2) modeRegard = true; // dès le 2e doigt, on regarde au lieu de gratter
});
ecran.addEventListener("pointermove", e => {
  const d = doigts.get(e.pointerId);
  if (d) { d.x = e.clientX; d.y = e.clientY; }
});
function doigtLeve(e) {
  doigts.delete(e.pointerId);
  if (doigts.size === 0) {
    if (modeRegard) attenteRetour = 1.2; // on laisse un peu le regard là où il est, puis la caméra revient
    modeRegard = false;
    milieuAvant = null;
  }
}
ecran.addEventListener("pointerup", doigtLeve);
ecran.addEventListener("pointercancel", doigtLeve);
ecran.addEventListener("contextmenu", e => e.preventDefault());

function majEntrees(dt) {
  if (!modeRegard && doigts.size === 1) {
    const d = doigts.values().next().value;
    gratterTrajet(versMondeX(d.px), versMondeY(d.py), versMondeX(d.x), versMondeY(d.y), dt);
    d.px = d.x; d.py = d.y;
  }
  if (modeRegard && doigts.size >= 2) {
    const [a, b] = [...doigts.values()];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (milieuAvant) { decalX -= (m.x - milieuAvant.x) / CASE; decalY -= (m.y - milieuAvant.y) / CASE; }
    milieuAvant = m;
  } else {
    milieuAvant = null;
  }
  if (!modeRegard) {
    if (attenteRetour > 0) attenteRetour -= dt;
    else { const k = Math.exp(-dt * 4); decalX *= k; decalY *= k; }
  }
}

// ---------- 8. Caméra ----------

let largVue = 0, hautVue = 0, vueL = 0, vueH = 0, image = null;

function redimensionner() {
  largVue = innerWidth / CASE; hautVue = innerHeight / CASE;
  // Une case de plus de chaque côté pour pouvoir glisser en douceur entre deux cases
  vueL = Math.ceil(largVue) + 1; vueH = Math.ceil(hautVue) + 1;
  ecran.width = vueL; ecran.height = vueH;
  ecran.style.width = vueL * CASE + "px";
  ecran.style.height = vueH * CASE + "px";
  image = ctx.createImageData(vueL, vueH);
}

function cibleCamera() {
  return {
    x: Math.min(Math.max(centreMineurX() - largVue / 2 + decalX, 0), LARG - largVue),
    y: Math.min(Math.max(centreMineurY() - hautVue * 0.45 + decalY, 0), PROF - hautVue)
  };
}

function majCamera(dt) {
  const c = cibleCamera(), k = 1 - Math.exp(-dt * 6);
  camX += (c.x - camX) * k;
  camY += (c.y - camY) * k;
}

// ---------- 9. Dessin ----------

// Couleur « de base » d'une case de roche (avant la lumière)
function couleurCase(x, y, t) {
  const P = t === SOCLE ? COUL_SOCLE : (COUL[t] || COUL_COUCHE[couche[idx(x, y)]]);
  const n = 0.88 + 0.24 * hache(x, y);
  return [P[0] * n, P[1] * n, P[2] * n];
}

// Un endroit déjà vu reste faiblement visible s'il fait partie d'une galerie ou de son bord
function procheDuVide(x, y) {
  return typeA(x, y) === VIDE || typeA(x - 1, y) === VIDE || typeA(x + 1, y) === VIDE ||
         typeA(x, y - 1) === VIDE || typeA(x, y + 1) === VIDE || typeA(x - 2, y) === VIDE ||
         typeA(x + 2, y) === VIDE || typeA(x, y - 2) === VIDE || typeA(x, y + 2) === VIDE;
}

function dessiner(temps, dt) {
  // La flamme vacille : la portée de la lumière varie un peu
  const f = 1 + 0.05 * Math.sin(temps * 6.3) + 0.035 * Math.sin(temps * 14.1 + 1) + 0.02 * Math.sin(temps * 23.7);
  const R = PORTEE_LUMIERE * f;
  const scintille = Math.floor(temps * 4);
  const pasFondu = Math.min(255, Math.ceil(dt * 510)); // fondu complet en une demi-seconde
  const ox = Math.floor(camX), oy = Math.floor(camY);
  const d = image.data;

  for (let sy = 0; sy < vueH; sy++) {
    const y = oy + sy;
    for (let sx = 0; sx < vueL; sx++) {
      const x = ox + sx, q = (sy * vueL + sx) * 4;
      if (!dansMonde(x, y)) { d[q] = 6; d[q + 1] = 7; d[q + 2] = 10; d[q + 3] = 255; continue; }
      const i = idx(x, y), t = type[i];

      // Lumière directe de la lampe (adoucie)
      let l = 1 - distLumiere(x, y) / (2 * R);
      l = l <= 0 ? 0 : l * l * (3 - 2 * l);
      // Fondu à la première découverte
      let rv = revele[i];
      if (l > 0.04 && rv < 255) { rv = Math.min(255, rv + pasFondu); revele[i] = rv; }
      const kr = rv / 255;
      l *= kr;
      if (l < MEMOIRE * kr && rv > 0 && procheDuVide(x, y)) l = MEMOIRE * kr;
      if (l <= 0.004) { d[q] = 6; d[q + 1] = 7; d[q + 2] = 10; d[q + 3] = 255; continue; }

      let r, g, b;
      if (t === VIDE || t === EAU) {
        // Paroi de fond : la roche de la couche, assombrie, avec un grain plus doux
        const P = COUL_COUCHE[couche[i]];
        const lf = 0.8 + 0.4 * (hache(x >> 2, y >> 2) * 0.6 + hache(x >> 1, y >> 1) * 0.4);
        r = P[0] * 0.34 * lf; g = P[1] * 0.34 * lf; b = P[2] * 0.34 * lf;
        if (t === EAU) {
          const surface = typeA(x, y - 1) !== EAU;
          if (surface && Math.sin(x * 0.5 + temps * 3) > -0.2) { r = 150; g = 200; b = 240; }
          else { r = r * 0.45 + 40; g = g * 0.45 + 95; b = b * 0.45 + 165; }
        }
      } else {
        const c = couleurCase(x, y, t);
        r = c[0]; g = c[1]; b = c[2];
        if (t === SABLE) { // grain moucheté
          const m = hache(x * 3 + 1, y * 5 + 2) < 0.5 ? 1.28 : 0.74;
          r *= m; g *= m; b *= m;
        }
        const u = usure[i];
        if (u > 0) { const k = 1 + 0.35 * u / RES[t]; r *= k; g *= k; b *= k; } // case entamée : plus claire
        if (typeA(x - 1, y) === VIDE || typeA(x + 1, y) === VIDE || typeA(x, y - 1) === VIDE || typeA(x, y + 1) === VIDE) {
          r *= 0.62; g *= 0.62; b *= 0.62; // bord au contact du vide, plus sombre
        }
        if (COUL[t] && l > 0.3 && hache(x + scintille * 7, y + scintille * 13) > 0.975) { r = 255; g = 250; b = 225; }
      }
      d[q] = Math.min(255, r * l * TEINTE[0]);
      d[q + 1] = Math.min(255, g * l * TEINTE[1]);
      d[q + 2] = Math.min(255, b * l * TEINTE[2]);
      d[q + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Le mineur
  const mx0 = mineur.x - ox, my0 = Math.round(mineur.y + mineur.chute) - HM - oy;
  for (let ly = 0; ly < HM; ly++) {
    for (let lx = 0; lx < LM; lx++) {
      const ch = SPRITE[ly][mineur.sens > 0 ? lx : LM - 1 - lx];
      if (ch === " ") continue;
      ctx.fillStyle = COUL_SPRITE[ch];
      ctx.fillRect(mx0 + lx, my0 + ly, 1, 1);
    }
  }

  // La poussière
  for (const p of particules) {
    ctx.globalAlpha = Math.min(1, p.vie * 2);
    ctx.fillStyle = p.coul;
    ctx.fillRect(Math.floor(p.x) - ox, Math.floor(p.y) - oy, 1, 1);
  }
  ctx.globalAlpha = 1;

  // Décalage fin entre deux cases, pour un défilement fluide
  ecran.style.transform = "translate(" + (-(camX - ox) * CASE).toFixed(2) + "px," + (-(camY - oy) * CASE).toFixed(2) + "px)";
}

// ---------- 10. Boucle du jeu ----------

const affProfondeur = document.getElementById("profondeur");
let profAffichee = -1;

let tAvant = 0;
function boucle(ms) {
  const temps = ms / 1000;
  // Temps écoulé depuis l'image précédente, borné (si le tel a mis le jeu en pause, on ne « saute » pas)
  const dt = tAvant ? Math.max(0, Math.min(0.05, temps - tAvant)) : 1 / 60;
  tAvant = temps;

  majEntrees(dt);
  majMineur(dt);
  majParticules(dt);
  if (lumiereSale) { calculerLumiere(); lumiereSale = false; }
  majCamera(dt);
  dessiner(temps, dt);

  // Profondeur : 10 cases = 1 mètre
  const prof = Math.max(0, Math.round((mineur.y - DEPART_Y) / 10));
  if (prof !== profAffichee) { profAffichee = prof; affProfondeur.textContent = prof + " m"; }

  requestAnimationFrame(boucle);
}

// ---------- 11. Démarrage ----------

genererMonde();
redimensionner();
addEventListener("resize", redimensionner);
{ const c = cibleCamera(); camX = c.x; camY = c.y; }
document.getElementById("version").textContent = "v" + VERSION;
requestAnimationFrame(boucle);

// Service worker : permet d'ouvrir le jeu sans réseau et de l'installer
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
  // Nouvelle version prête : on recharge une fois (pas à la toute première installation)
  const avaitUneVersion = !!navigator.serviceWorker.controller;
  let dejaRecharge = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!avaitUneVersion || dejaRecharge) return;
    dejaRecharge = true;
    location.reload();
  });
}
