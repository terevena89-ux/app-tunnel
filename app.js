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

const VERSION = "0.3.0";

// ---------- 1. Réglages ----------

// Zoom : taille d'une case à l'écran, en px (1,5 = vue de loin ; 9 = tout près)
const TAILLE_MIN = 1.5, TAILLE_MAX = 9;
let taille = 4.5, tailleCible = 4.5;
try { taille = tailleCible = Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, +localStorage.getItem("tunnel-zoom") || 4.5)); } catch (e) {}
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
const RAYON_ECRAN = 7;       // rayon du grattoir à l'écran (px), réglable avec le curseur
const RAYON_REF = 7 / 3;     // rayon en cases au zoom de référence (3 px par case)
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
// Il occupe 2 cases de large et 3 de haut ; il est dessiné en 8 × 12 « petits pixels »
// (chaque case = 4 × 4 petits pixels), sur un calque à part pour rester net.
// États : "sol" (posé), "air" (en vol ou en chute), "accroche" (grappin collé à la roche).

const LM = 2, HM = 3;
const GRAVITE = 90, CHUTE_MAX = 45, VITESSE_MARCHE = 11, SAUT = 25;
const mineur = {
  x: DEPART_X, y: DEPART_Y, vx: 0, vy: 0, sens: 1, etat: "sol", cible: null,
  controleAir: false,          // en saut « au clavier », on peut diriger en l'air
  ecrase: 0,                   // aplatissement à l'atterrissage (0 à 1), pour l'effet « rebondi »
  pas: 0                       // compteur pour l'animation de marche
};
let dirTouche = 0;             // -1 gauche, 1 droite (touches du clavier ou boutons à l'écran)

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
  for (let y = Math.floor(cy - 2.5); y <= cy + 2.5; y++) for (let x = Math.floor(cx - 2.5); x <= cx + 2.5; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > 6.25 || !dansMonde(x, y)) continue;
    const i = idx(x, y);
    if (type[i] === TERRE || type[i] === SABLE) { detruire(x, y); casse = true; }
  }
  if (casse) vibrer(12);
  return casse;
}

function atterrir() {
  const m = mineur;
  m.ecrase = Math.min(1, Math.max(m.ecrase, (m.vy - 8) / 35)); // plus il tombe vite, plus il s'aplatit
  if (m.vy > 20) sonChoc();
  m.etat = "sol"; m.vx = 0; m.vy = 0; m.controleAir = false;
  if (!occupe(m.x, Math.ceil(m.y - 1e-6))) m.y = Math.ceil(m.y - 1e-6); // bien posé sur la case
}

// Le mineur en vol touche la roche : la réaction dépend de l'outil.
// axe = "x" (mur), "haut" (plafond) ou "bas" (sol). Renvoie true s'il peut continuer d'avancer.
function choc(axe) {
  const m = mineur;
  if (m.controleAir) { // simple saut : pas d'outil, il se cogne juste
    if (axe === "bas") { atterrir(); return false; }
    if (axe === "x") m.vx = 0; else m.vy = 0;
    return false;
  }
  if (axe === "bas" && !(outil === "rebond" && m.vy > 14)) { atterrir(); return false; }
  if (outil === "grappin") { m.etat = "accroche"; m.vx = 0; m.vy = 0; m.ecrase = 0.5; vibrer(8); sonChoc(); return false; }
  if (outil === "rebond") {
    if (axe === "x") m.vx = -m.vx * 0.55;
    else { m.vy = -m.vy * 0.5; m.vx *= 0.8; }
    m.ecrase = 0.7; vibrer(5); sonChoc();
    return false;
  }
  // Perce : on casse devant soi ; si c'est de la roche dure, on s'arrête
  const cx = m.x + LM / 2 + (axe === "x" ? Math.sign(m.vx) * 2 : 0);
  const cy = m.y - HM / 2 + (axe === "haut" ? -2.5 : axe === "bas" ? 2 : 0);
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

// Marche vers la cible ; monte tout seul les marches d'une case
function marcher(dt) {
  const m = mineur;
  const ecart = m.cible - (m.x + LM / 2);
  if (Math.abs(ecart) < 0.3) { m.cible = null; return; }
  const dir = Math.sign(ecart);
  m.sens = dir;
  const nx = m.x + Math.min(Math.abs(ecart), VITESSE_MARCHE * dt) * dir;
  m.pas += dt;
  if (!occupe(nx, m.y)) { m.x = nx; return; }
  if (!occupe(m.x, m.y - 1) && !occupe(nx, m.y - 1)) { m.x = nx; m.y -= 1; m.ecrase = 0.25; return; }
  m.cible = null; // un vrai mur : il s'arrête
}

// Saut (touche haut / espace, ou bouton à l'écran)
function sauter() {
  const m = mineur;
  if (m.etat === "air") return;
  if (m.etat === "sol" && !auSol()) return;
  m.etat = "air"; m.vy = -SAUT; m.vx = dirTouche * VITESSE_MARCHE; m.cible = null; m.controleAir = true;
  m.ecrase = -0.4; // il s'étire en partant
  sonSaut();
}

function majMineur(dt) {
  const m = mineur;
  const ax = Math.floor(m.x), ay = Math.floor(m.y);
  if (m.etat === "accroche" && !contreParoi()) m.etat = "air"; // la roche a disparu : il tombe
  if (m.etat === "sol") {
    if (dirTouche) m.cible = m.x + LM / 2 + dirTouche * 2; // touche maintenue : il avance
    if (m.cible !== null) marcher(dt);
    else m.pas = 0;
    if (!auSol()) { m.etat = "air"; m.vx = 0; m.vy = 0; }
  }
  if (m.etat === "air") {
    m.vy = Math.min(m.vy + GRAVITE * dt, CHUTE_MAX);
    if (m.controleAir) m.vx += (dirTouche * VITESSE_MARCHE - m.vx) * Math.min(1, dt * 10);
    if (Math.abs(m.vx) > 1) m.sens = Math.sign(m.vx);
    deplacer(m.vx * dt, m.vy * dt);
    if (m.etat === "air" && m.vy >= 0 && auSol() && (m.controleAir || !(outil === "rebond" && m.vy > 14))) atterrir();
  }
  // L'aplatissement revient doucement à la normale (effet ressort)
  m.ecrase += (0 - m.ecrase) * Math.min(1, dt * 9);
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
  m.etat = "air"; m.vx = l.vx; m.vy = l.vy; m.cible = null; m.controleAir = false; m.ecrase = -0.6;
  vibrer(10);
  sonFwip();
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

// Zone où poser le doigt pour attraper le mineur (plus grande que lui, mais pas sous ses pieds,
// pour qu'on puisse toujours creuser juste en dessous)
function dansPrise(wx, wy) {
  const marge = Math.max(1.5, 14 / taille); // au moins 14 px autour de lui, même vu de loin
  return wx >= mineur.x - marge && wx <= mineur.x + LM + marge && wy >= mineur.y - HM - marge && wy <= mineur.y + 0.3;
}

// La lampe est sur le casque, côté où il regarde
const lampeX = () => Math.floor(mineur.x + (mineur.sens > 0 ? 1.6 : 0.4));
const lampeY = () => Math.floor(mineur.y - 2.7);
const centreMineurX = () => mineur.x + LM / 2;
const centreMineurY = () => mineur.y - HM / 2;

// Dessin du mineur (regarde à droite), 8 × 12 petits pixels. Une lettre = une couleur.
// Les 2 dernières lignes changent pendant la marche (jambes).
const SPRITE_HAUT = [
  ".KKKKKK.",
  "KYYYYYLK",
  "KYYYYYYK",
  "KyyyyyyK",
  "KSSWESWK",
  "KSSEESEK",
  "KsSSSSsK",
  ".KRBBRK.",
  ".KBbbBK.",
  ".KBBBBK."
];
const JAMBES = [
  [".KNKKNK.", "..K..K.."],
  [".KNKK.K.", "..K.KNK."]
];
const COUL_SPRITE = {
  K: "rgba(26,20,32,0.75)", Y: "#e9a72e", y: "#b97d1c", L: "#fff3b8", S: "#e8bf94", s: "#c99a70",
  E: "#26304f", W: "#faf6ec", R: "#c4533a", B: "#3f6fb0", b: "#2c4f86", N: "#3a2c26"
};

// ---------- 4. La lumière ----------
// La lumière part de la lampe et « voyage » de case en case :
// dans le vide, chaque pas coûte peu ; dans l'eau un peu plus ; dans la roche beaucoup.
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

let porteeActuelle = PORTEE_LUMIERE; // varie avec la flamme
// Luminosité d'une case (0 à 1), en tenant compte du souvenir
function lumiereEn(x, y) {
  let l = 1 - distLumiere(x, y) / (2 * porteeActuelle);
  l = l <= 0 ? 0 : l * l * (3 - 2 * l);
  if (dansMonde(x, y)) { const kr = revele[idx(x, y)] / 255; l = Math.max(l * kr, MEMOIRE * kr); }
  return l;
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

// Une case disparaît : elle tombe en mini-objet, avec un peu de poussière
function detruire(x, y) {
  const i = idx(x, y), t = type[i];
  objetTombe(x, y, t, couche[i]);
  poussiere(x, y, couleurCase(x, y, t));
  type[i] = VIDE;
  usure[i] = 0;
  lumiereSale = true;
}

let matiereGrattee = 0; // ce qu'on gratte en ce moment (pour le son)

// Gratte autour du point (px, py) du monde pendant dt secondes
function gratter(px, py, dt) {
  const cmx = centreMineurX(), cmy = centreMineurY();
  if ((px - cmx) ** 2 + (py - cmy) ** 2 > PORTEE * PORTEE) return; // trop loin du mineur
  const r = Math.max(0.5, rayonGrattoir() / taille);
  // Équilibre : on enlève à peu près la même quantité de roche par seconde, quelle que soit la taille
  const force = PUISSANCE * (RAYON_REF / r) ** 2;
  for (let y = Math.floor(py - r); y <= py + r; y++) {
    for (let x = Math.floor(px - r); x <= px + r; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d > r || !dansMonde(x, y)) continue;
      const i = idx(x, y), t = type[i];
      if (t === VIDE || t === EAU || t === SOCLE) continue;
      matiereGrattee = t;
      usure[i] += dt * force * (d < r * 0.6 ? 1 : 0.6);
      if (usure[i] >= RES[t]) {
        detruire(x, y);
        vibrer(RES[t] >= 3 ? 9 : 4);
      }
    }
  }
}

// Gratte le long du trajet du doigt depuis la dernière image (pour ne pas sauter de cases si on va vite)
function gratterTrajet(ax, ay, bx, by, dt) {
  const longueur = Math.hypot(bx - ax, by - ay);
  const pas = Math.min(0.8, Math.max(0.5, rayonGrattoir() / taille)); // jamais plus grand que le grattoir
  const n = Math.max(1, Math.ceil(longueur / pas));
  const part = Math.max(dt / n, dt * 0.35);
  for (let k = 1; k <= n; k++) gratter(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, part);
}

// ---------- 6. Poussière et mini-objets ----------

const particules = [];
function poussiere(x, y, coul) {
  if (particules.length > 200 || Math.random() < 0.6) return;
  particules.push({
    x: x + 0.5, y: y + 0.5,
    vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 9,
    vie: 0.4 + Math.random() * 0.3,
    coul: "rgb(" + Math.min(255, coul[0] * 1.3 | 0) + "," + Math.min(255, coul[1] * 1.25 | 0) + "," + Math.min(255, coul[2] * 1.2 | 0) + ")"
  });
}
function majParticules(dt) {
  for (let n = particules.length - 1; n >= 0; n--) {
    const p = particules[n];
    p.vy += 50 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt;
    if (p.vie <= 0 || solide(Math.floor(p.x), Math.floor(p.y))) particules.splice(n, 1);
  }
}

// Ce qu'on a ramassé (par type de matière)
const compteur = {};
let compteurSale = true;

// Les mini-objets : chaque case creusée tombe, roule un peu, puis l'aimant du mineur les attire
const objets = [];
const MAX_OBJETS = 500;
const AIMANT = 6;          // rayon de l'aimant (en cases) — à améliorer plus tard
function objetTombe(x, y, t, c) {
  if (t === SOCLE || t === EAU || t === VIDE) return;
  if (objets.length >= MAX_OBJETS) {
    // Trop d'objets : on regroupe avec un voisin du même type
    for (let k = objets.length - 1; k >= objets.length - 60 && k >= 0; k--) {
      const o = objets[k];
      if (o.t === t && Math.abs(o.x - x) < 4 && Math.abs(o.y - y) < 4) { o.n++; return; }
    }
    compteur[t] = (compteur[t] || 0) + 1; compteurSale = true; // sinon : directement dans le sac
    return;
  }
  objets.push({ x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4, t, c, n: 1, repos: false });
}

function majObjets(dt) {
  const cx = centreMineurX(), cy = centreMineurY();
  for (let k = objets.length - 1; k >= 0; k--) {
    const o = objets[k];
    const dx = cx - o.x, dy = cy - o.y, d2 = dx * dx + dy * dy;
    if (d2 < 1.2) { // ramassé !
      compteur[o.t] = (compteur[o.t] || 0) + o.n;
      compteurSale = true;
      sonRamasse(o.t);
      objets.splice(k, 1);
      continue;
    }
    if (d2 < AIMANT * AIMANT) { // l'aimant l'attire (il passe à travers la roche)
      const d = Math.sqrt(d2);
      o.vx += dx / d * 140 * dt; o.vy += dy / d * 140 * dt;
      o.vx *= 0.9; o.vy *= 0.9;
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.repos = false;
      continue;
    }
    if (o.repos) { // posé : on vérifie juste que le sol est toujours là
      if (solide(Math.floor(o.x), Math.floor(o.y + 0.3))) continue;
      o.repos = false;
    }
    o.vy = Math.min(o.vy + 60 * dt, 30);
    const nx = o.x + o.vx * dt;
    if (solide(Math.floor(nx), Math.floor(o.y))) o.vx = -o.vx * 0.3; else o.x = nx;
    const ny = o.y + o.vy * dt;
    if (solide(Math.floor(o.x), Math.floor(ny + 0.25))) {
      o.y = Math.floor(ny + 0.25) - 0.25; o.vy = 0; o.vx *= 0.6;
      if (Math.abs(o.vx) < 0.4) o.repos = true;
    } else o.y = ny;
  }
}

// Forme des mini-objets, en petits pixels (1/4 de case) : grains, pépites, éclats...
const FORME = {
  grain: [[0, 0], [1, 0], [0, 1], [1, 1]],
  pepite: [[1, -1], [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  eclat: [[0, -1], [0, 0], [0, 1], [0, 2], [1, 1], [1, 2]],
  os: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]],
  capsule: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]
};
function formeDe(t) {
  if (t === CUIVRE || t === OR) return FORME.pepite;
  if (t === CRISTAL) return FORME.eclat;
  if (t === FOSSILE) return FORME.os;
  if (t === RECHARGE) return FORME.capsule;
  return FORME.grain;
}
function couleurObjet(t, c) {
  if (COUL[t]) return COUL[t];
  const P = COUL_COUCHE[t >= TERRE && t <= BASALTE ? t : c];
  return t === SABLE ? [Math.min(255, P[0] * 1.35), Math.min(255, P[1] * 1.3), Math.min(255, P[2] * 1.2)] : [P[0] * 1.15, P[1] * 1.15, P[2] * 1.15];
}

// ---------- 7. Le son (coupé au départ) ----------
// Tout est fabriqué à la volée (pas de fichiers) : bruit filtré pour le grattage, petits « bips ».

const son = { actif: false, ctx: null, filtre: null, gainGratte: null, bruit: null, tension: null, gainTension: null, dernierBip: 0 };
try { son.actif = localStorage.getItem("tunnel-son") === "1"; } catch (e) {}

function initSon() {
  if (son.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const a = son.ctx = new AC();
  // Bruit blanc en boucle (1 seconde), filtré selon la matière
  const buf = a.createBuffer(1, a.sampleRate, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  son.bruit = buf;
  const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
  son.filtre = a.createBiquadFilter(); son.filtre.type = "bandpass"; son.filtre.Q.value = 1.4;
  son.gainGratte = a.createGain(); son.gainGratte.gain.value = 0;
  src.connect(son.filtre).connect(son.gainGratte).connect(a.destination);
  src.start();
  // Élastique qui se tend : un son grave qui monte quand on tire
  son.tension = a.createOscillator(); son.tension.type = "triangle"; son.tension.frequency.value = 90;
  son.gainTension = a.createGain(); son.gainTension.gain.value = 0;
  son.tension.connect(son.gainTension).connect(a.destination);
  son.tension.start();
}

// Hauteur du grattage selon la matière : terre sourde, basalte plus sec
const FREQ_GRATTE = { [TERRE]: 700, [SABLE]: 450, [ARGILE]: 1000, [BASALTE]: 1900, [CUIVRE]: 2300, [OR]: 2600, [CRISTAL]: 3200, [FOSSILE]: 1500, [RECHARGE]: 1200 };
function majSonGrattage() {
  if (!son.ctx) return;
  const t = son.ctx.currentTime;
  if (son.actif && matiereGrattee) {
    son.filtre.frequency.setTargetAtTime(FREQ_GRATTE[matiereGrattee] || 900, t, 0.03);
    son.gainGratte.gain.setTargetAtTime(0.05, t, 0.02);
  } else son.gainGratte.gain.setTargetAtTime(0, t, 0.05);
}

function bip(freq, duree, volume, forme = "sine") {
  if (!son.actif || !son.ctx) return;
  const a = son.ctx, t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = forme; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(volume, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + duree + 0.02);
}
// Petit « tic » de ramassage, plus aigu pour ce qui est rare
function sonRamasse(t) {
  const maintenant = performance.now();
  if (maintenant - son.dernierBip < 35) return;
  son.dernierBip = maintenant;
  const f = { [CUIVRE]: 1500, [OR]: 1900, [CRISTAL]: 2400, [FOSSILE]: 1100, [RECHARGE]: 1300 }[t];
  if (f) { bip(f, 0.12, 0.06); bip(f * 1.5, 0.1, 0.03); }
  else bip(700 + Math.random() * 120, 0.04, 0.025, "triangle");
}
function sonChoc() { bip(110, 0.12, 0.08); bip(70, 0.15, 0.06); }
function sonSaut() { bip(420, 0.08, 0.03, "triangle"); }
// « Fwip » du lâcher : bruit qui glisse de l'aigu au grave
function sonFwip() {
  if (!son.actif || !son.ctx) return;
  const a = son.ctx, t = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = son.bruit; f.type = "bandpass"; f.Q.value = 3;
  f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.18);
  g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 0.22);
}
function majSonTension(force) { // force de 0 à 1 (0 = pas de visée)
  if (!son.ctx) return;
  const t = son.ctx.currentTime;
  son.tension.frequency.setTargetAtTime(80 + force * 160, t, 0.05);
  son.gainTension.gain.setTargetAtTime(son.actif && force > 0 ? 0.025 : 0, t, 0.04);
}

// ---------- 8. Doigts : gratter, viser, aller, regarder / zoomer à deux doigts ----------

const ecran = document.getElementById("jeu");
const ctx = ecran.getContext("2d");
const calque = document.getElementById("calque");   // mineur, objets, poussière : dessinés nets par-dessus
const cc = calque.getContext("2d");
const doigts = new Map();
let modeRegard = false, decalX = 0, decalY = 0, attenteRetour = 0, milieuAvant = null;
let camX = 0, camY = 0;

// Position du doigt sur l'écran → position dans le monde (en cases), et l'inverse
const versMondeX = px => camX + px / taille;
const versMondeY = py => camY + py / taille;
const versEcranX = wx => (wx - camX) * taille;
const versEcranY = wy => (wy - camY) * taille;
let ecartAvant = null; // écart entre les deux doigts à l'image précédente (pour le pincer-zoomer)

// Le geste en cours avec un seul doigt :
//   "lancer"  = le doigt a été posé sur le mineur (lance-pierre),
//   "gratter" = ailleurs. Un toucher court sans bouger sur un endroit creusé = « va là ».
let geste = null;
const DUREE_TAP = 250; // ms

ecran.addEventListener("pointerdown", e => {
  try { ecran.setPointerCapture(e.pointerId); } catch (err) {} // le doigt reste « attaché » au jeu même s'il sort de l'écran
  if (son.actif) { initSon(); if (son.ctx.state === "suspended") son.ctx.resume(); }
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
  matiereGrattee = 0;
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
    zoomerVers(t, versEcranX(centreMineurX()), versEcranY(centreMineurY()));
  }
  if (!modeRegard) {
    if (attenteRetour > 0) attenteRetour -= dt;
    else { const k = Math.exp(-dt * 4); decalX *= k; decalY *= k; }
  }
  // Son de l'élastique pendant la visée
  let force = 0;
  if (geste && geste.type === "lancer" && !modeRegard) {
    const d = doigts.get(geste.id);
    if (d) force = Math.min(1, vitesseLancer(versMondeX(d.x), versMondeY(d.y)).v / VITESSE_LANCER_MAX);
  }
  majSonTension(force);
  majSonGrattage();
}

// Touches du clavier (sur PC) : flèches ou Q/D/Z, espace pour sauter
const TOUCHES_G = ["ArrowLeft", "KeyA", "KeyQ"], TOUCHES_D = ["ArrowRight", "KeyD"], TOUCHES_SAUT = ["ArrowUp", "KeyW", "KeyZ", "Space"];
const touchesTenues = new Set();
function majDirTouche() {
  dirTouche = (touchesTenues.has("d") ? 1 : 0) - (touchesTenues.has("g") ? 1 : 0);
  if (!dirTouche && mineur.etat === "sol" && mineur.cible !== null && touchesTenues.size === 0) mineur.cible = null;
}
addEventListener("keydown", e => {
  if (TOUCHES_G.includes(e.code)) touchesTenues.add("g");
  else if (TOUCHES_D.includes(e.code)) touchesTenues.add("d");
  else if (TOUCHES_SAUT.includes(e.code)) { if (!e.repeat) sauter(); }
  else return;
  e.preventDefault();
  if (mineur.etat === "accroche" && (touchesTenues.size)) mineur.etat = "air";
  majDirTouche();
});
addEventListener("keyup", e => {
  if (TOUCHES_G.includes(e.code)) touchesTenues.delete("g");
  else if (TOUCHES_D.includes(e.code)) touchesTenues.delete("d");
  else return;
  majDirTouche();
  if (!dirTouche && mineur.etat === "sol") mineur.cible = null;
});

// ---------- 9. Caméra et zoom ----------

let largVue = 0, hautVue = 0, vueL = 0, vueH = 0, image = null;
let SUB = 1;    // petits pixels par case dans le dessin du monde (1, 2 ou 4 selon le zoom)
let dpr = 1;    // densité de l'écran (le calque est dessiné à la vraie résolution du téléphone)

function redimensionner() {
  largVue = innerWidth / taille; hautVue = innerHeight / taille;
  // Le grain 4 × 4 des blocs n'est dessiné que quand il se voit (pour rester rapide)
  const sub = taille >= 5 ? 4 : taille >= 2.5 ? 2 : 1;
  // Une case de plus de chaque côté pour pouvoir glisser en douceur entre deux cases
  const l = Math.ceil(largVue) + 1, h = Math.ceil(hautVue) + 1;
  if (l !== vueL || h !== vueH || sub !== SUB || !image) {
    vueL = l; vueH = h; SUB = sub;
    ecran.width = vueL * SUB; ecran.height = vueH * SUB;
    image = ctx.createImageData(vueL * SUB, vueH * SUB);
  }
  ecran.style.width = vueL * taille + "px";
  ecran.style.height = vueH * taille + "px";
}

function redimCalque() {
  dpr = Math.min(3, devicePixelRatio || 1);
  calque.width = Math.round(innerWidth * dpr); calque.height = Math.round(innerHeight * dpr);
  calque.style.width = innerWidth + "px"; calque.style.height = innerHeight + "px";
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

// ---------- 10. Dessin ----------

// Couleur « de base » d'une case de roche (avant la lumière)
function couleurCase(x, y, t) {
  const P = t === SOCLE ? COUL_SOCLE : (COUL[t] || COUL_COUCHE[couche[idx(x, y)]]);
  const n = 0.9 + 0.2 * hache(x, y);
  return [P[0] * n, P[1] * n, P[2] * n];
}

// Un endroit déjà vu reste faiblement visible s'il fait partie d'une galerie ou de son bord
function procheDuVide(x, y) {
  return typeA(x, y) === VIDE || typeA(x - 1, y) === VIDE || typeA(x + 1, y) === VIDE ||
         typeA(x, y - 1) === VIDE || typeA(x, y + 1) === VIDE || typeA(x - 2, y) === VIDE ||
         typeA(x + 2, y) === VIDE || typeA(x, y - 2) === VIDE || typeA(x, y + 2) === VIDE;
}

// Le monde : chaque case est un petit carré de SUB × SUB pixels (grain doux, arêtes au bord des galeries)
function dessinerMonde(temps, dt) {
  const R = porteeActuelle;
  const scintille = Math.floor(temps * 4);
  const pasFondu = Math.min(255, Math.ceil(dt * 510)); // fondu complet en une demi-seconde
  const ox = Math.floor(camX), oy = Math.floor(camY);
  const d = image.data, ligne = vueL * SUB * 4, pasSub = 4 / SUB;

  for (let by = 0; by < vueH; by++) {
    const y = oy + by;
    for (let bx = 0; bx < vueL; bx++) {
      const x = ox + bx;
      const base = by * SUB * ligne + bx * SUB * 4;
      let noir = !dansMonde(x, y), r = 0, g = 0, b = 0, l = 0, t = 0, i = 0;
      if (!noir) {
        i = idx(x, y); t = type[i];
        // Lumière directe de la lampe (adoucie)
        l = 1 - distLumiere(x, y) / (2 * R);
        l = l <= 0 ? 0 : l * l * (3 - 2 * l);
        // Fondu à la première découverte
        let rv = revele[i];
        if (l > 0.04 && rv < 255) { rv = Math.min(255, rv + pasFondu); revele[i] = rv; }
        const kr = rv / 255;
        l *= kr;
        if (l < MEMOIRE * kr && rv > 0 && procheDuVide(x, y)) l = MEMOIRE * kr;
        if (l <= 0.004) noir = true;
      }
      if (noir) {
        for (let j = 0; j < SUB; j++) { let q = base + j * ligne; for (let k = 0; k < SUB; k++, q += 4) { d[q] = 6; d[q + 1] = 7; d[q + 2] = 10; d[q + 3] = 255; } }
        continue;
      }
      const vide = t === VIDE || t === EAU;
      let hautVide = false, gVide = false, dVide = false, basVide = false;
      if (vide) {
        // Paroi de fond : la roche de la couche, assombrie
        const P = COUL_COUCHE[couche[i]];
        r = P[0] * 0.34; g = P[1] * 0.34; b = P[2] * 0.34;
        if (t === EAU) {
          const surface = typeA(x, y - 1) !== EAU;
          if (surface && Math.sin(x * 0.5 + temps * 3) > -0.2) { r = 150; g = 200; b = 240; }
          else { r = r * 0.45 + 40; g = g * 0.45 + 95; b = b * 0.45 + 165; }
        }
      } else {
        const c = couleurCase(x, y, t);
        r = c[0]; g = c[1]; b = c[2];
        const u = usure[i];
        if (u > 0) { const k = 1 + 0.35 * u / RES[t]; r *= k; g *= k; b *= k; } // case entamée : plus claire
        if (COUL[t] && l > 0.3 && hache(x + scintille * 7, y + scintille * 13) > 0.975) { r = 255; g = 250; b = 225; }
        hautVide = typeA(x, y - 1) === VIDE; basVide = typeA(x, y + 1) === VIDE;
        gVide = typeA(x - 1, y) === VIDE; dVide = typeA(x + 1, y) === VIDE;
        if (SUB === 1 && (hautVide || basVide || gVide || dVide)) { r *= 0.75; g *= 0.75; b *= 0.75; }
      }
      r *= l * TEINTE[0]; g *= l * TEINTE[1]; b *= l * TEINTE[2];
      // Les petits pixels de la case
      for (let j = 0; j < SUB; j++) {
        let q = base + j * ligne;
        const sy = y * 4 + j * pasSub;
        for (let k = 0; k < SUB; k++, q += 4) {
          const sx = x * 4 + k * pasSub;
          let m;
          if (vide) m = t === EAU ? 1 : 0.85 + 0.3 * hache(sx >> 2, sy >> 2);
          else {
            m = SUB === 1 ? 1 : 0.9 + 0.14 * hache(sx, sy);
            if (t === SABLE) m *= hache(sx * 3 + 1, sy * 5 + 2) < 0.5 ? 1.25 : 0.78; // grain moucheté
            if (SUB > 1) {
              if (hautVide && j === 0) m *= 1.12;            // arête claire au-dessus des galeries
              else if (basVide && j === SUB - 1) m *= 0.68;  // dessous plus sombre
              if (gVide && k === 0) m *= 0.75;
              else if (dVide && k === SUB - 1) m *= 0.75;
            }
          }
          d[q] = Math.min(255, r * m); d[q + 1] = Math.min(255, g * m); d[q + 2] = Math.min(255, b * m); d[q + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  // Décalage fin entre deux cases, pour un défilement fluide
  ecran.style.transform = "translate(" + (-(camX - ox) * taille).toFixed(2) + "px," + (-(camY - oy) * taille).toFixed(2) + "px)";
}

// Le calque : mineur, mini-objets, poussière, lance-pierre (dessinés nets, en petits pixels de 1/4 de case)
const CONTOUR = "rgba(26,20,32,0.6)";
function dessinerCalque(temps) {
  cc.setTransform(1, 0, 0, 1, 0, 0);
  cc.clearRect(0, 0, calque.width, calque.height);
  cc.setTransform(dpr, 0, 0, dpr, 0, 0);
  const p = taille / 4;                       // taille d'un petit pixel à l'écran
  const net = v => Math.round(v * dpr) / dpr; // aligne sur les vrais pixels de l'écran
  const carre = (x, y) => cc.fillRect(net(x), net(y), net(x + p) - net(x), net(y + p) - net(y));

  // Mini-objets
  for (const o of objets) {
    const sx = versEcranX(o.x) - p, sy = versEcranY(o.y) - p;
    if (sx < -10 || sy < -10 || sx > innerWidth + 10 || sy > innerHeight + 10) continue;
    const f = formeDe(o.t), col = couleurObjet(o.t, o.c);
    const L = Math.max(0.3, lumiereEn(Math.floor(o.x), Math.floor(o.y)));
    if (L < 0.31 && revele[idx(Math.floor(o.x), Math.floor(o.y))] === 0) continue;
    const pris = new Set(f.map(([a, b]) => a + "," + b));
    cc.fillStyle = CONTOUR;
    for (const [a, b] of f) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (!pris.has((a + dx) + "," + (b + dy))) carre(sx + (a + dx) * p, sy + (b + dy) * p);
    f.forEach(([a, b], n) => {
      const k = (n === 0 && COUL[o.t]) ? 1.35 : 1; // petit reflet sur les objets précieux
      cc.fillStyle = "rgb(" + Math.min(255, col[0] * L * k * TEINTE[0] | 0) + "," + Math.min(255, col[1] * L * k * TEINTE[1] | 0) + "," + Math.min(255, col[2] * L * k * TEINTE[2] | 0) + ")";
      carre(sx + a * p, sy + b * p);
    });
  }

  // Le mineur, avec son effet « rebondi » : il s'aplatit en atterrissant, s'étire en vol, sautille en marchant
  const m = mineur;
  let ex = 1, ey = 1;
  if (m.ecrase > 0) { ex = 1 + 0.22 * m.ecrase; ey = 1 - 0.28 * m.ecrase; }
  else if (m.ecrase < 0) { ex = 1 + 0.15 * m.ecrase; ey = 1 - 0.2 * m.ecrase; }
  if (m.etat === "air" && !m.controleAir) { const e = Math.min(0.18, Math.abs(m.vy) / 250); ex *= 1 - e * 0.6; ey *= 1 + e; }
  const marche = m.etat === "sol" && m.cible !== null;
  const cadre = marche ? Math.floor(m.pas * 9) % 2 : 0;
  let saut = marche && cadre === 1 ? -p : 0;
  if (m.etat === "sol" && !marche) { const s = Math.sin(temps * 2.4); ey *= 1 + 0.03 * s; ex *= 1 - 0.02 * s; } // il respire
  const piedsX = versEcranX(m.x + LM / 2), piedsY = versEcranY(m.y) + saut;
  cc.save();
  cc.translate(net(piedsX), net(piedsY));
  cc.scale(ex * (m.sens > 0 ? 1 : -1), ey);
  const lignes = SPRITE_HAUT.concat(JAMBES[cadre]);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 8; x++) {
    const ch = lignes[y][x];
    if (ch === ".") continue;
    cc.fillStyle = COUL_SPRITE[ch];
    cc.fillRect((x - 4) * p, (y - 12) * p, p + 0.02, p + 0.02);
  }
  cc.restore();

  // Poussière
  for (const q of particules) {
    cc.globalAlpha = Math.min(1, q.vie * 2.5);
    cc.fillStyle = q.coul;
    carre(versEcranX(q.x), versEcranY(q.y));
  }
  cc.globalAlpha = 1;

  // Lance-pierre en cours : élastique + début du trajet (seulement le début : la suite, c'est à l'œil)
  if (geste && geste.type === "lancer" && !modeRegard) {
    const d = doigts.get(geste.id);
    if (d) {
      const fx = versMondeX(d.x), fy = versMondeY(d.y);
      cc.fillStyle = "rgba(205,150,105,0.9)";
      for (const bx of [m.x + 0.1, m.x + LM - 0.1]) { // deux brins d'élastique, des mains au doigt
        const by = m.y - 1.2, ax = versEcranX(bx), ay = versEcranY(by);
        const n = Math.ceil(Math.hypot(d.x - ax, d.y - ay) / p);
        for (let k = 0; k <= n; k += 1) carre(ax + (d.x - ax) * k / n, ay + (d.y - ay) * k / n);
      }
      const pts = trajetPrevu(fx, fy), lim = Math.floor(pts.length * 0.35);
      for (let k = 2; k < lim; k += 3) {
        cc.globalAlpha = 0.85 * (1 - k / lim) + 0.1;
        cc.fillStyle = "#fff0dc";
        cc.fillRect(net(versEcranX(pts[k][0]) - p), net(versEcranY(pts[k][1]) - p), p * 2, p * 2);
      }
      cc.globalAlpha = 1;
      if (pts.length) m.sens = fx > centreMineurX() ? -1 : 1; // il regarde vers où il va partir
    }
  }
}

// ---------- 11. Compteur et boutons ----------

const affCompteur = document.getElementById("compteur");
const ORDRE_COMPTEUR = [TERRE, SABLE, ARGILE, BASALTE, CUIVRE, OR, CRISTAL, FOSSILE, RECHARGE];
const NOM = { [TERRE]: "Terre", [SABLE]: "Sable", [ARGILE]: "Argile", [BASALTE]: "Basalte", [CUIVRE]: "Cuivre", [OR]: "Or", [CRISTAL]: "Cristal", [FOSSILE]: "Fossile", [RECHARGE]: "Recharge" };
const nombre = new Intl.NumberFormat("fr-FR");
let tempsCompteur = 0;
function majCompteur(dt) {
  tempsCompteur -= dt;
  if (!compteurSale || tempsCompteur > 0) return;
  compteurSale = false; tempsCompteur = 0.12;
  affCompteur.innerHTML = ORDRE_COMPTEUR.filter(t => compteur[t]).map(t => {
    const c = couleurObjet(t, 1);
    return `<div title="${NOM[t]}"><i style="background:rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})"></i>${nombre.format(compteur[t])}</div>`;
  }).join("");
}

// Boutons d'outils : petits dessins en pixels (x, y, largeur, hauteur sur une grille de 14)
const DESSINS_OUTILS = {
  grappin: [[6, 2, 2, 7], [5, 2, 4, 1], [4, 9, 2, 1], [3, 7, 1, 3], [8, 9, 2, 1], [10, 7, 1, 3]],
  rebond: [[2, 11, 10, 1], [5, 4, 4, 4], [4, 5, 1, 2], [9, 5, 1, 2], [2, 3, 1, 1], [1, 6, 1, 1], [11, 2, 1, 1]],
  perce: [[3, 3, 8, 1], [2, 4, 2, 1], [10, 4, 2, 1], [6, 4, 2, 8]]
};
const pixelsSvg = liste => '<svg viewBox="0 0 14 14" aria-hidden="true">' +
  liste.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor"/>`).join("") + "</svg>";
function majBoutonsOutils() {
  for (const b of document.querySelectorAll("#outils button")) b.classList.toggle("actif", b.dataset.outil === outil);
}
for (const b of document.querySelectorAll("#outils button")) {
  b.innerHTML = pixelsSvg(DESSINS_OUTILS[b.dataset.outil]);
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

// Taille du grattoir (curseur de démo)
const curseurGrattoir = document.getElementById("taille-grattoir");
let multGrattoir = 1;
try { multGrattoir = +localStorage.getItem("tunnel-grattoir") || 1; } catch (e) {}
curseurGrattoir.value = multGrattoir;
curseurGrattoir.addEventListener("input", () => {
  multGrattoir = +curseurGrattoir.value;
  try { localStorage.setItem("tunnel-grattoir", String(multGrattoir)); } catch (e) {}
});
function rayonGrattoir() { return RAYON_ECRAN * multGrattoir; }

// Bouton son (coupé / activé)
const DESSIN_HP = [[2, 5, 3, 4], [5, 4, 1, 6], [6, 3, 1, 8], [7, 2, 1, 10]];
const DESSIN_ONDES = [[9, 5, 1, 4], [11, 3, 1, 8]];
const DESSIN_COUPE = [[9, 4, 1, 1], [10, 5, 1, 1], [11, 6, 1, 2], [10, 8, 1, 1], [9, 9, 1, 1], [12, 4, 1, 1], [12, 9, 1, 1]];
const boutonSon = document.getElementById("bouton-son");
function majBoutonSon() {
  boutonSon.innerHTML = pixelsSvg(DESSIN_HP.concat(son.actif ? DESSIN_ONDES : DESSIN_COUPE));
  boutonSon.classList.toggle("actif", son.actif);
  boutonSon.setAttribute("aria-label", son.actif ? "Couper le son" : "Activer le son");
}
boutonSon.addEventListener("click", () => {
  son.actif = !son.actif;
  try { localStorage.setItem("tunnel-son", son.actif ? "1" : "0"); } catch (e) {}
  if (son.actif) { initSon(); if (son.ctx && son.ctx.state === "suspended") son.ctx.resume(); }
  majBoutonSon();
});
majBoutonSon();

// Boutons de déplacement à l'écran (optionnels, affichés avec le bouton « manette »)
const boutonManette = document.getElementById("bouton-manette");
const blocTouches = document.getElementById("touches");
let touchesVisibles = false;
try { touchesVisibles = localStorage.getItem("tunnel-touches") === "1"; } catch (e) {}
boutonManette.innerHTML = pixelsSvg([[2, 5, 10, 5], [1, 6, 1, 3], [12, 6, 1, 3], [3, 7, 3, 1], [4, 6, 1, 3], [9, 6, 1, 1], [10, 8, 1, 1]]);
function majTouches() {
  blocTouches.hidden = !touchesVisibles;
  boutonManette.classList.toggle("actif", touchesVisibles);
}
boutonManette.addEventListener("click", () => {
  touchesVisibles = !touchesVisibles;
  try { localStorage.setItem("tunnel-touches", touchesVisibles ? "1" : "0"); } catch (e) {}
  majTouches();
});
majTouches();
const DESSINS_TOUCHES = {
  g: [[4, 6, 1, 2], [5, 5, 1, 4], [6, 4, 1, 6], [7, 3, 1, 8], [8, 6, 3, 2]],
  d: [[9, 6, 1, 2], [8, 5, 1, 4], [7, 4, 1, 6], [6, 3, 1, 8], [3, 6, 3, 2]],
  saut: [[6, 4, 2, 1], [5, 5, 4, 1], [4, 6, 6, 1], [6, 7, 2, 4]]
};
for (const b of blocTouches.querySelectorAll("button")) {
  const quoi = b.dataset.touche;
  b.innerHTML = pixelsSvg(DESSINS_TOUCHES[quoi]);
  b.addEventListener("pointerdown", e => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    if (quoi === "saut") sauter();
    else { touchesTenues.add(quoi); if (mineur.etat === "accroche") mineur.etat = "air"; majDirTouche(); }
  });
  const lacher = () => { if (quoi !== "saut") { touchesTenues.delete(quoi); majDirTouche(); if (!dirTouche && mineur.etat === "sol") mineur.cible = null; } };
  b.addEventListener("pointerup", lacher);
  b.addEventListener("pointercancel", lacher);
  b.addEventListener("contextmenu", e => e.preventDefault());
}

// ---------- 12. Boucle du jeu ----------

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
  majObjets(dt);
  majParticules(dt);
  if (lumiereSale) { calculerLumiere(); lumiereSale = false; }
  majCamera(dt);
  // La flamme vacille : la portée de la lumière varie un peu
  porteeActuelle = PORTEE_LUMIERE * (1 + 0.05 * Math.sin(temps * 6.3) + 0.035 * Math.sin(temps * 14.1 + 1) + 0.02 * Math.sin(temps * 23.7));
  dessinerMonde(temps, dt);
  dessinerCalque(temps);
  majCompteur(dt);

  // Profondeur : 10 cases = 1 mètre
  const prof = Math.max(0, Math.round((Math.floor(mineur.y) - DEPART_Y) / 10));
  if (prof !== profAffichee) { profAffichee = prof; affProfondeur.textContent = prof + " m"; }

  requestAnimationFrame(boucle);
}

// ---------- 13. Démarrage ----------

genererMonde();
redimensionner();
redimCalque();
addEventListener("resize", () => { redimensionner(); redimCalque(); });
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
