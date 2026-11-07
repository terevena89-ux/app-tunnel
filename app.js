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

const VERSION = "0.2.0";

// ---------- 1. Réglages ----------

// Zoom : taille d'une case à l'écran, en px (1,5 = vue de loin ; 9 = tout près)
const TAILLE_MIN = 1.5, TAILLE_MAX = 9;
let taille = 3, tailleCible = 3;
try { taille = tailleCible = Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, +localStorage.getItem("tunnel-zoom") || 3)); } catch (e) {}
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

const PUISSANCE = 18;        // usure par seconde sous le doigt (au zoom normal)
// Le grattoir garde toujours la même taille SOUS LE DOIGT (environ un ongle) :
// de loin il couvre beaucoup de cases (large mais lent), de près peu de cases (fin mais rapide).
const RAYON_ECRAN = 5.4;     // rayon du grattoir à l'écran (px)
const RAYON_REF = 1.8;       // rayon en cases au zoom normal (3 px par case)
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
// Position (x, y) = coin bas-gauche, en cases (avec des virgules pour un mouvement fluide).
// Il occupe 5 cases de large et 7 de haut.
// États : "sol" (posé), "air" (en vol ou en chute), "accroche" (grappin collé à la roche).

const LM = 5, HM = 7;
const GRAVITE = 90, CHUTE_MAX = 45, VITESSE_MARCHE = 14;
const mineur = { x: DEPART_X, y: DEPART_Y, vx: 0, vy: 0, sens: 1, etat: "sol", cible: null };

// Outil du lance-pierre : ce qui se passe quand le mineur lancé touche la roche
let outil = "grappin";
try { outil = localStorage.getItem("tunnel-outil") || "grappin"; } catch (e) {}

// La boîte du mineur, placée en (x, y), toucherait-elle de la roche ?
function occupe(x, y) {
  const x0 = Math.floor(x + 1e-6), x1 = Math.ceil(x + LM - 1e-6) - 1;
  const y0 = Math.floor(y - HM + 1e-6), y1 = Math.ceil(y - 1e-6) - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (solide(cx, cy)) return true;
  return false;
}
const auSol = () => occupe(mineur.x, mineur.y + 0.05);
// Encore collé à la roche ? (sinon le grappin lâche)
const contreParoi = () => occupe(mineur.x - 0.3, mineur.y) || occupe(mineur.x + 0.3, mineur.y) ||
                          occupe(mineur.x, mineur.y - 0.3) || auSol();

// Outil « perce » : casse la terre et le sable autour du point d'impact (pas la roche dure)
function percer(cx, cy) {
  let casse = false;
  for (let y = Math.floor(cy - 3); y <= cy + 3; y++) for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > 9 || !dansMonde(x, y)) continue;
    const i = idx(x, y);
    if (type[i] === TERRE || type[i] === SABLE) {
      poussiere(x, y, couleurCase(x, y, type[i]));
      type[i] = VIDE; usure[i] = 0; casse = true;
    }
  }
  if (casse) { lumiereSale = true; vibrer(12); }
  return casse;
}

function atterrir() {
  const m = mineur;
  m.etat = "sol"; m.vx = 0; m.vy = 0;
  if (!occupe(m.x, Math.ceil(m.y - 1e-6))) m.y = Math.ceil(m.y - 1e-6); // bien posé sur la case
}

// Le mineur en vol touche la roche : la réaction dépend de l'outil.
// axe = "x" (mur), "haut" (plafond) ou "bas" (sol). Renvoie true s'il peut continuer d'avancer.
function choc(axe) {
  const m = mineur;
  if (axe === "bas" && !(outil === "rebond" && m.vy > 14)) { atterrir(); return false; }
  if (outil === "grappin") { m.etat = "accroche"; m.vx = 0; m.vy = 0; vibrer(8); return false; }
  if (outil === "rebond") {
    if (axe === "x") m.vx = -m.vx * 0.55;
    else { m.vy = -m.vy * 0.5; m.vx *= 0.8; }
    vibrer(5);
    return false;
  }
  // Perce : on casse devant soi ; si c'est de la roche dure, on s'arrête
  const cx = m.x + LM / 2 + (axe === "x" ? Math.sign(m.vx) * 4 : 0);
  const cy = m.y - HM / 2 + (axe === "haut" ? -5 : axe === "bas" ? 4 : 0);
  if (percer(cx, cy)) { m.vx *= 0.6; m.vy *= 0.6; return true; }
  if (axe === "x") m.vx = 0; else m.vy = 0;
  return false;
}

// Déplacement en vol, axe par axe et par petits morceaux (pour ne jamais traverser la roche)
function deplacer(dx, dy) {
  const m = mineur;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / n, sy = dy / n;
  for (let k = 0; k < n; k++) {
    if (sx) {
      if (!occupe(m.x + sx, m.y)) m.x += sx;
      else if (!choc("x")) return;
    }
    if (m.etat !== "air") return;
    if (sy) {
      if (!occupe(m.x, m.y + sy)) m.y += sy;
      else if (!choc(sy > 0 ? "bas" : "haut")) return;
    }
    if (m.etat !== "air") return;
  }
}

// Marche vers l'endroit touché ; monte tout seul les petites marches (1 ou 2 cases)
function marcher(dt) {
  const m = mineur;
  const ecart = m.cible - (m.x + LM / 2);
  if (Math.abs(ecart) < 0.6) { m.cible = null; return; }
  const dir = Math.sign(ecart);
  m.sens = dir;
  const nx = m.x + Math.min(Math.abs(ecart), VITESSE_MARCHE * dt) * dir;
  if (!occupe(nx, m.y)) { m.x = nx; return; }
  for (let h = 1; h <= 2; h++) {
    if (!occupe(m.x, m.y - h) && !occupe(nx, m.y - h)) { m.x = nx; m.y -= h; return; }
  }
  m.cible = null; // un vrai mur : il s'arrête
}

function majMineur(dt) {
  const m = mineur;
  const ax = Math.floor(m.x), ay = Math.floor(m.y);
  if (m.etat === "accroche" && !contreParoi()) m.etat = "air"; // la roche a disparu : il tombe
  if (m.etat === "sol") {
    if (m.cible !== null) marcher(dt);
    if (!auSol()) { m.etat = "air"; m.vx = 0; m.vy = 0; }
  }
  if (m.etat === "air") {
    m.vy = Math.min(m.vy + GRAVITE * dt, CHUTE_MAX);
    if (Math.abs(m.vx) > 1) m.sens = Math.sign(m.vx);
    deplacer(m.vx * dt, m.vy * dt);
    if (m.etat === "air" && m.vy >= 0 && auSol() && !(outil === "rebond" && m.vy > 14)) atterrir();
  }
  if (Math.floor(m.x) !== ax || Math.floor(m.y) !== ay) lumiereSale = true;
}

// ---------- 3 bis. Le lance-pierre ----------
// On pose le doigt sur le mineur, on tire en arrière, on lâche : il part à l'opposé.

const FORCE_LANCER = 6.5, VITESSE_LANCER_MAX = 100, VITESSE_LANCER_MIN = 14;

function vitesseLancer(fx, fy) {
  let vx = (centreMineurX() - fx) * FORCE_LANCER, vy = (centreMineurY() - fy) * FORCE_LANCER;
  const v = Math.hypot(vx, vy);
  if (v > VITESSE_LANCER_MAX) { vx *= VITESSE_LANCER_MAX / v; vy *= VITESSE_LANCER_MAX / v; }
  return { vx, vy, v: Math.min(v, VITESSE_LANCER_MAX) };
}

function lancer(fx, fy) {
  const l = vitesseLancer(fx, fy);
  if (l.v < VITESSE_LANCER_MIN) return; // tiré trop peu : on annule
  const m = mineur;
  m.etat = "air"; m.vx = l.vx; m.vy = l.vy; m.cible = null;
  vibrer(10);
}

// Trajet prévu (sans tenir compte de l'outil), pour afficher les pointillés
function trajetPrevu(fx, fy) {
  const l = vitesseLancer(fx, fy), pts = [];
  if (l.v < VITESSE_LANCER_MIN) return pts;
  let x = mineur.x, y = mineur.y, vx = l.vx, vy = l.vy;
  for (let n = 0; n < 150; n++) {
    vy = Math.min(vy + GRAVITE / 60, CHUTE_MAX);
    x += vx / 60; y += vy / 60;
    if (occupe(x, y)) break;
    pts.push([x + LM / 2, y - HM / 2]);
  }
  return pts;
}

// Zone où poser le doigt pour attraper le mineur (un peu plus grande que lui, mais pas sous ses pieds,
// pour qu'on puisse toujours creuser juste en dessous)
function dansPrise(wx, wy) {
  const marge = Math.max(2, 12 / taille); // au moins 12 px autour de lui, même vu de loin
  return wx >= mineur.x - marge && wx <= mineur.x + LM + marge && wy >= mineur.y - HM - marge && wy <= mineur.y + 0.3;
}

// La lampe est sur le casque, côté où il regarde
const lampeX = () => Math.floor(mineur.x) + (mineur.sens > 0 ? LM - 1 : 0);
const lampeY = () => Math.floor(mineur.y) - HM + 1;
const centreMineurX = () => mineur.x + LM / 2;
const centreMineurY = () => mineur.y - HM / 2;

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
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // pas encore touché l'écran
  derniereVibration = t;
  navigator.vibrate(ms);
}

// Gratte autour du point (px, py) du monde pendant dt secondes
function gratter(px, py, dt) {
  const cmx = centreMineurX(), cmy = centreMineurY();
  if ((px - cmx) ** 2 + (py - cmy) ** 2 > PORTEE * PORTEE) return; // trop loin du mineur
  const r = Math.max(0.5, RAYON_ECRAN / taille);
  // Équilibre : on enlève à peu près la même quantité de roche par seconde, quelle que soit la taille
  const force = PUISSANCE * (RAYON_REF / r) ** 2;
  for (let y = Math.floor(py - r); y <= py + r; y++) {
    for (let x = Math.floor(px - r); x <= px + r; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d > r || !dansMonde(x, y)) continue;
      const i = idx(x, y), t = type[i];
      if (t === VIDE || t === EAU || t === SOCLE) continue;
      usure[i] += dt * force * (d < r * 0.6 ? 1 : 0.6);
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
  const pas = Math.min(0.8, Math.max(0.5, RAYON_ECRAN / taille)); // jamais plus grand que le grattoir
  const n = Math.max(1, Math.ceil(longueur / pas));
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
const versMondeX = px => camX + px / taille;
const versMondeY = py => camY + py / taille;
let ecartAvant = null; // écart entre les deux doigts à l'image précédente (pour le pincer-zoomer)

// Le geste en cours avec un seul doigt :
//   "lancer"  = le doigt a été posé sur le mineur (lance-pierre),
//   "gratter" = ailleurs. Un toucher court sans bouger sur un endroit creusé = « va là ».
let geste = null;
const DUREE_TAP = 250; // ms

ecran.addEventListener("pointerdown", e => {
  try { ecran.setPointerCapture(e.pointerId); } catch (err) {} // le doigt reste « attaché » au jeu même s'il sort de l'écran
  doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY });
  if (doigts.size >= 2) { modeRegard = true; geste = null; return; } // dès le 2e doigt, on regarde au lieu de gratter
  const wx = versMondeX(e.clientX), wy = versMondeY(e.clientY);
  if (mineur.etat !== "air" && dansPrise(wx, wy)) geste = { type: "lancer", id: e.pointerId };
  else geste = {
    type: "gratter", id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY, bouge: false,
    // Si on touche un endroit déjà creusé, ce sera peut-être un « va là » : on attend un peu avant de gratter
    surVide: typeA(Math.floor(wx), Math.floor(wy)) === VIDE
  };
});
ecran.addEventListener("pointermove", e => {
  const d = doigts.get(e.pointerId);
  if (d) { d.x = e.clientX; d.y = e.clientY; }
  if (geste && geste.type === "gratter" && geste.id === e.pointerId && !geste.bouge &&
      Math.hypot(e.clientX - geste.x0, e.clientY - geste.y0) > 8) geste.bouge = true;
});
function doigtLeve(e) {
  if (geste && geste.id === e.pointerId && !modeRegard) {
    const wx = versMondeX(e.clientX), wy = versMondeY(e.clientY);
    if (geste.type === "lancer") lancer(wx, wy);
    else if (!geste.bouge && performance.now() - geste.t0 < DUREE_TAP) allerA(wx, wy);
  }
  if (geste && geste.id === e.pointerId) geste = null;
  doigts.delete(e.pointerId);
  if (doigts.size === 0) {
    if (modeRegard) { attenteRetour = 1.2; sauverZoom(); } // on laisse un peu le regard là où il est, puis la caméra revient
    modeRegard = false;
    milieuAvant = null;
    ecartAvant = null;
  }
}
ecran.addEventListener("pointerup", doigtLeve);
ecran.addEventListener("pointercancel", doigtLeve);
ecran.addEventListener("contextmenu", e => e.preventDefault());

// « Va là » : un toucher court sur un endroit creusé
function allerA(wx, wy) {
  const t = typeA(Math.floor(wx), Math.floor(wy));
  if (t !== VIDE && t !== EAU) return;
  if (mineur.etat === "accroche") { mineur.etat = "air"; mineur.vx = 0; mineur.vy = 0; } // il lâche la paroi
  mineur.cible = wx;
}

function majEntrees(dt) {
  if (!modeRegard && doigts.size === 1 && geste && geste.type === "gratter") {
    const d = doigts.values().next().value;
    const pret = !geste.surVide || geste.bouge || performance.now() - geste.t0 >= DUREE_TAP;
    if (pret) gratterTrajet(versMondeX(d.px), versMondeY(d.py), versMondeX(d.x), versMondeY(d.y), dt);
    d.px = d.x; d.py = d.y;
  }
  if (modeRegard && doigts.size >= 2) {
    const [a, b] = [...doigts.values()];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ecart = Math.hypot(a.x - b.x, a.y - b.y);
    // Écarter / rapprocher les doigts = zoomer, autour du point entre les deux doigts
    if (ecartAvant && ecart > 20) { zoomerVers(taille * ecart / ecartAvant, m.x, m.y); tailleCible = taille; }
    ecartAvant = ecart;
    // Déplacer les deux doigts = regarder ailleurs
    if (milieuAvant) { decalX -= (m.x - milieuAvant.x) / taille; decalY -= (m.y - milieuAvant.y) / taille; }
    milieuAvant = m;
  } else {
    milieuAvant = null;
    ecartAvant = null;
  }
  // Zoom doux avec les boutons + / − (centré sur le mineur)
  if (Math.abs(tailleCible - taille) > 0.002) {
    const t = taille + (tailleCible - taille) * (1 - Math.exp(-dt * 12));
    zoomerVers(t, (centreMineurX() - camX) * taille, (centreMineurY() - camY) * taille);
  }
  if (!modeRegard) {
    if (attenteRetour > 0) attenteRetour -= dt;
    else { const k = Math.exp(-dt * 4); decalX *= k; decalY *= k; }
  }
}

// ---------- 8. Caméra ----------

let largVue = 0, hautVue = 0, vueL = 0, vueH = 0, image = null;

function redimensionner() {
  largVue = innerWidth / taille; hautVue = innerHeight / taille;
  // Une case de plus de chaque côté pour pouvoir glisser en douceur entre deux cases
  const l = Math.ceil(largVue) + 1, h = Math.ceil(hautVue) + 1;
  if (l !== vueL || h !== vueH || !image) {
    vueL = l; vueH = h;
    ecran.width = vueL; ecran.height = vueH;
    image = ctx.createImageData(vueL, vueH);
  }
  ecran.style.width = vueL * taille + "px";
  ecran.style.height = vueH * taille + "px";
}

// Change le zoom en gardant immobile le point de l'écran (ax, ay) — sous les doigts ou sur le mineur
function zoomerVers(nouvelle, ax, ay) {
  nouvelle = Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, nouvelle));
  const wx = camX + ax / taille, wy = camY + ay / taille;
  taille = nouvelle;
  redimensionner();
  camX = wx - ax / taille; camY = wy - ay / taille;
  // La caméra suit une « cible » : on la décale pour qu'elle corresponde à la nouvelle vue
  const c = cibleCamera();
  decalX += camX - c.x; decalY += camY - c.y;
}

function sauverZoom() {
  try { localStorage.setItem("tunnel-zoom", String(tailleCible.toFixed(2))); } catch (e) {}
}

// La caméra vise le mineur (un peu au-dessus du milieu de l'écran), plus le décalage du regard
function cibleCamera() {
  const bord = (v, vue, total) => total <= vue ? (total - vue) / 2 : Math.min(Math.max(v, 0), total - vue);
  return {
    x: bord(centreMineurX() - largVue / 2 + decalX, largVue, LARG),
    y: bord(centreMineurY() - hautVue * 0.45 + decalY, hautVue, PROF)
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
  const mx0 = Math.round(mineur.x) - ox, my0 = Math.round(mineur.y) - HM - oy;
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

  // Lance-pierre en cours : élastique + début du trajet (seulement le début : la suite, c'est à l'œil)
  if (geste && geste.type === "lancer" && !modeRegard) {
    const d = doigts.get(geste.id);
    if (d) {
      const fx = versMondeX(d.x), fy = versMondeY(d.y);
      ctx.fillStyle = "rgba(205,150,105,0.9)";
      for (const bx of [mineur.x, mineur.x + LM]) { // deux brins d'élastique, des mains au doigt
        const by = mineur.y - 4, n = Math.ceil(Math.hypot(fx - bx, fy - by));
        for (let k = 0; k <= n; k++) ctx.fillRect(Math.floor(bx + (fx - bx) * k / n) - ox, Math.floor(by + (fy - by) * k / n) - oy, 1, 1);
      }
      const pts = trajetPrevu(fx, fy), lim = Math.floor(pts.length * 0.35);
      for (let k = 2; k < lim; k += 3) {
        ctx.globalAlpha = 0.85 * (1 - k / lim) + 0.1;
        ctx.fillStyle = "#fff0dc";
        ctx.fillRect(Math.floor(pts[k][0]) - ox, Math.floor(pts[k][1]) - oy, 1, 1);
      }
      ctx.globalAlpha = 1;
      if (pts.length) mineur.sens = fx > centreMineurX() ? -1 : 1; // il regarde vers où il va partir
    }
  }

  // Décalage fin entre deux cases, pour un défilement fluide
  ecran.style.transform = "translate(" + (-(camX - ox) * taille).toFixed(2) + "px," + (-(camY - oy) * taille).toFixed(2) + "px)";
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
  const prof = Math.max(0, Math.round((Math.floor(mineur.y) - DEPART_Y) / 10));
  if (prof !== profAffichee) { profAffichee = prof; affProfondeur.textContent = prof + " m"; }

  requestAnimationFrame(boucle);
}

// ---------- 11. Démarrage ----------

// Boutons d'outils : petits dessins en pixels (x, y, largeur, hauteur sur une grille de 14)
const DESSINS_OUTILS = {
  grappin: [[6, 2, 2, 7], [5, 2, 4, 1], [4, 9, 2, 1], [3, 7, 1, 3], [8, 9, 2, 1], [10, 7, 1, 3]],
  rebond: [[2, 11, 10, 1], [5, 4, 4, 4], [4, 5, 1, 2], [9, 5, 1, 2], [2, 3, 1, 1], [1, 6, 1, 1], [11, 2, 1, 1]],
  perce: [[3, 3, 8, 1], [2, 4, 2, 1], [10, 4, 2, 1], [6, 4, 2, 8]]
};
function majBoutonsOutils() {
  for (const b of document.querySelectorAll("#outils button")) b.classList.toggle("actif", b.dataset.outil === outil);
}
for (const b of document.querySelectorAll("#outils button")) {
  b.innerHTML = '<svg viewBox="0 0 14 14" aria-hidden="true">' +
    DESSINS_OUTILS[b.dataset.outil].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor"/>`).join("") +
    "</svg>";
  b.addEventListener("click", () => {
    outil = b.dataset.outil;
    try { localStorage.setItem("tunnel-outil", outil); } catch (e) {}
    majBoutonsOutils();
  });
}
majBoutonsOutils();

// Boutons de zoom : chaque appui rapproche ou éloigne d'un cran (×1,3), en douceur
for (const b of document.querySelectorAll("#zoom button")) {
  b.addEventListener("click", () => {
    tailleCible = Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, tailleCible * (b.dataset.zoom > 0 ? 1.3 : 1 / 1.3)));
    sauverZoom();
  });
}

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
