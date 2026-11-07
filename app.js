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

const VERSION = "0.7.0";

// ---------- 1. Réglages ----------

// ÉCHELLE : chaque bloc est 2 fois plus fin qu'au début (le mineur fait 4 × 6 blocs).
// Toutes les longueurs « d'origine » sont multipliées par E pour que la mine garde la même taille réelle.
const E = 2;

// Zoom : taille d'une case à l'écran, en px
const TAILLE_MIN = 1.5, TAILLE_MAX = 12;
let taille = 2.25, tailleCible = 2.25;
try { taille = tailleCible = Math.min(TAILLE_MAX, Math.max(TAILLE_MIN, +localStorage.getItem("tunnel-zoom2") || 2.25)); } catch (e) {}
const LARG = 256 * E, PROF = 1600 * E;   // taille du monde, en cases
const N = LARG * PROF;

// Types de cases
const VIDE = 0, TERRE = 1, ARGILE = 2, BASALTE = 3, SABLE = 4,
      CUIVRE = 5, OR = 6, CRISTAL = 7, FOSSILE = 8, RECHARGE = 9,
      EAU = 10, SOCLE = 11,
      GRAVIER = 12,   // (seulement un mini-objet : les éclats d'un cristal cassé)
      // Roches dures, mélangées dans chaque couche (de plus en plus nombreuses en descendant)
      CAILLOU = 13, SCHISTE = 14, OBSIDIENNE = 15;

// Dureté de chaque matière : nombre de « coups » (× le réglage « coups pour la terre »)
const RES = [];
RES[TERRE] = 1; RES[ARGILE] = 2; RES[BASALTE] = 4; RES[SABLE] = 0.5;
RES[CUIVRE] = 3; RES[OR] = 4; RES[CRISTAL] = 3; RES[FOSSILE] = 3; RES[RECHARGE] = 1.5;
RES[CAILLOU] = 4; RES[SCHISTE] = 7; RES[OBSIDIENNE] = 12;

// ---------- Réglages de DÉMO (curseurs du panneau « réglages ») ----------
// Chaque réglage : valeur par défaut, minimum, maximum, pas, nom affiché, unité.
// Ils sont gardés dans ce téléphone (pas synchronisés).
const DEF_REG = {
  rythme:      { v: 1,    min: 0.3, max: 2,    pas: 0.05, nom: "Rythme général", u: "×" },
  marche:      { v: 29,   min: 5,   max: 80,   pas: 1,    nom: "Vitesse de marche", u: "cases/s" },
  saut:        { v: 12,   min: 2,   max: 40,   pas: 0.5,  nom: "Hauteur de saut", u: "cases" },
  gravite:     { v: 76,   min: 20,  max: 250,  pas: 1,    nom: "Gravité", u: "" },
  rampage:     { v: 45,   min: 10,  max: 100,  pas: 5,    nom: "Vitesse de rampage", u: "%" },
  squishy:     { v: 1,    min: 0,   max: 3,    pas: 0.1,  nom: "Effet squishy", u: "×" },
  bouncy:      { v: 1,    min: 0,   max: 3,    pas: 0.1,  nom: "Effet bouncy", u: "×" },
  coupsSec:    { v: 4,    min: 1,   max: 12,   pas: 0.5,  nom: "Coups par seconde", u: "" },
  coupsTerre:  { v: 2,    min: 1,   max: 8,    pas: 1,    nom: "Coups pour la terre", u: "" },
  pinceau:     { v: 1,    min: 0.4, max: 3,    pas: 0.1,  nom: "Taille du pinceau", u: "×" },
  grossit:     { v: 2,    min: 1,   max: 4,    pas: 0.1,  nom: "Grossissement immobile", u: "×" },
  portee:      { v: 44,   min: 10,  max: 120,  pas: 1,    nom: "Portée du minage", u: "cases" },
  douceCrist:  { v: 220,  min: 40,  max: 800,  pas: 10,   nom: "Vitesse douce (cristaux)", u: "px/s" },
  lancer:      { v: 72,   min: 20,  max: 200,  pas: 1,    nom: "Puissance du lancer", u: "" },
  aimant:      { v: 12,   min: 0,   max: 50,   pas: 1,    nom: "Rayon de l'aimant", u: "cases" },
  lampe:       { v: 180,  min: 60,  max: 200,  pas: 5,    nom: "Portée de la lampe", u: "cases" },
  matieres:    { v: 1,    min: 0.2, max: 3,    pas: 0.05, nom: "Vitesse sable / eau", u: "×" }
};
const REG = {};
function regDefaut() { for (const k in DEF_REG) REG[k] = DEF_REG[k].v; }
regDefaut();
try { const s = JSON.parse(localStorage.getItem("tunnel-demo") || "{}"); for (const k in s) if (k in DEF_REG) REG[k] = s[k]; } catch (e) {}

// Le grattoir garde toujours la même taille SOUS LE DOIGT (environ un ongle) : de loin il couvre beaucoup de cases.
const RAYON_ECRAN = 7;       // rayon du grattoir à l'écran (px), × le réglage « taille du pinceau »
const PORTEE_LUMIERE = 90;   // (remplacé par le réglage « portée de la lampe »)
const MEMOIRE = 0.26;        // luminosité des endroits déjà vus

// Couleurs des couches : terre, argile rouge, basalte
const COUL_COUCHE = [null, [112, 76, 50], [170, 86, 54], [56, 46, 70]];
const COUL_SOCLE = [34, 31, 38];
const COUL = [];
COUL[CUIVRE] = [226, 148, 92]; COUL[OR] = [236, 196, 80]; COUL[CRISTAL] = [160, 226, 242];
COUL[FOSSILE] = [234, 222, 196]; COUL[RECHARGE] = [126, 226, 160];
// Roches dures : chacune sa couleur, pour savoir d'un coup d'œil ce qui va résister
const COUL_ROCHE = [];
COUL_ROCHE[CAILLOU] = [124, 116, 108]; COUL_ROCHE[SCHISTE] = [98, 56, 50]; COUL_ROCHE[OBSIDIENNE] = [40, 30, 52];
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
const rocheSimple = t => (t >= TERRE && t <= BASALTE) || (t >= CAILLOU && t <= OBSIDIENNE);

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
    const larg = (2 + Math.floor(alea() * 3)) * E, xc = x + (larg >> 1);
    let haut = -1, bas = -1;
    for (let y = Math.floor(cy - ry * 1.5); y <= cy; y++) if (typeA(xc, y) === VIDE) { haut = y; break; }
    for (let y = Math.ceil(cy + ry * 1.5); y >= cy; y--) if (typeA(xc, y) === VIDE) { bas = y; break; }
    if (haut >= 0 && alea() < 0.65) pointe(xc, haut, 1, entre(2, 8) * E, larg);
    if (bas >= 0 && alea() < 0.4) pointe(xc, bas, -1, entre(1, 4) * E, larg + E);
    x += larg + Math.floor(alea() * 3) * E;
  }
  // Un trésor caché juste sous le sol de la grotte
  const xt = Math.round(cx + (alea() - 0.5) * rx);
  for (let y = Math.ceil(cy + ry * 1.5); y >= cy; y--) {
    if (typeA(xt, y) === VIDE) {
      const choix = [CRISTAL, OR, FOSSILE, CRISTAL][Math.floor(alea() * 4)];
      const place = choix === CRISTAL ? placerCristal(xt, y + 5 * E) : choix === FOSSILE ? placerCristal(xt, y + 5 * E, alea, "fossile") : false;
      if (!place) tache(xt, y + 2 * E, 2.2 * E, OR);
      break;
    }
  }
}

// Point de départ du mineur
const DEPART_X = 126 * E, DEPART_Y = 70 * E;
// Réglages de DÉMO (pour tester vite) : couches très proches du départ, cristaux juste à côté
const DEMO_COUCHE_1 = 150 * E, DEMO_COUCHE_2 = 280 * E;

function genererMonde() {
  // Les couches, avec des frontières qui ondulent
  for (let x = 0; x < LARG; x++) {
    // DÉMO : couches rapprochées pour voir vite les nouvelles matières (vrai jeu : 450 / 950)
    const b1 = DEMO_COUCHE_1 + ((bruit1(x / (23 * E), 1) - 0.5) * 24 + (bruit1(x / (7 * E), 2) - 0.5) * 8) * E;
    const b2 = DEMO_COUCHE_2 + ((bruit1(x / (29 * E), 3) - 0.5) * 30 + (bruit1(x / (6 * E), 4) - 0.5) * 8) * E;
    const fond = (1500 + (bruit1(x / (17 * E), 5) - 0.5) * 30) * E;
    for (let y = 0; y < PROF; y++) {
      const i = idx(x, y), c = y < b1 ? 1 : y < b2 ? 2 : 3;
      couche[i] = c;
      type[i] = (y >= fond || x < 2 * E || x >= LARG - 2 * E) ? SOCLE : c;
    }
  }
  // Roches dures : presque rien juste sous le départ, puis de plus en plus en descendant
  const DUR = [null, CAILLOU, SCHISTE, OBSIDIENNE];
  for (let n = 0; n < 420; n++) {
    const x = entre(4 * E, LARG - 4 * E), y = entre(DEPART_Y + 15 * E, 1490 * E);
    if (alea() > Math.min(1, (y - DEPART_Y) / (70 * E))) continue;
    tache(x, y, entre(1.5, 4.5) * E, DUR[couche[idx(Math.floor(x), Math.floor(y))]]);
  }
  // Poches de sable (même couleur que la couche, grain moucheté)
  for (let n = 0; n < 34; n++) tache(entre(10, 246) * E, entre(40, 1480) * E, entre(4, 9) * E, SABLE);
  // Minerais, cristaux, fossiles, recharges
  for (let n = 0; n < 130; n++) tache(entre(4, 252) * E, entre(30, 1490) * E, entre(1.5, 3) * E, CUIVRE, 0.85);
  for (let n = 0; n < 55; n++) tache(entre(4, 252) * E, entre(300, 1490) * E, entre(1.5, 2.5) * E, OR, 0.85);
  for (let n = 0; n < 40; n++) placerCristal(entre(10, 246) * E, entre(150, 1490) * E); // gros cristaux (s'ils tiennent dans la roche)
  for (let n = 0; n < 24; n++) placerCristal(entre(10, 246) * E, entre(120, 1490) * E, alea, "fossile"); // gros fossiles
  for (let n = 0; n < 16; n++) tache(entre(4, 252) * E, entre(80, 1490) * E, 1.5 * E, RECHARGE);
  // Grottes naturelles, rares et grandes
  for (let n = 0; n < 9; n++) grotte(entre(30, 226) * E, entre(110, 1440) * E, entre(18, 34) * E, entre(9, 16) * E);
  // Poches d'eau (elles se vident dans les galeries quand on les perce)
  for (let n = 0; n < 14; n++) {
    const cx = entre(15, 241) * E, cy = entre(100, 1480) * E, rx = entre(5, 12) * E, ry = entre(3, 6) * E;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dansMonde(x, y) && dx * dx + dy * dy < 1 && (rocheSimple(type[idx(x, y)]) || type[idx(x, y)] === SABLE)) type[idx(x, y)] = EAU;
    }
  }
  // Zone de départ propre : pas de sable ni d'eau tout près, une petite salle pour commencer
  for (let y = 0; y < DEPART_Y + 22 * E; y++) for (let x = 100 * E; x < 156 * E; x++) {
    const i = idx(x, y);
    if (type[i] === SABLE || type[i] === EAU || type[i] === VIDE) type[i] = TERRE;
  }
  for (let y = DEPART_Y - 14 * E; y < DEPART_Y; y++) for (let x = DEPART_X - 8 * E; x < DEPART_X + 13 * E; x++) {
    const bord = ((x - DEPART_X) / E - 2.5) ** 2 / 110 + ((y - DEPART_Y) / E + 7) ** 2 / 55;
    if (bord < 1) type[idx(x, y)] = VIDE;
  }
  // DÉMO : quelques cristaux enfouis tout près du départ (à dégager puis détacher doucement)
  [[-18, 8], [20, 10], [-4, 22], [12, 30], [-24, 26], [26, 24]].forEach(([dx, dy], k) => placerCristal(DEPART_X + dx * E, DEPART_Y + dy * E, alea, k % 2 ? "fossile" : "cristal")); // DÉMO : cristaux et fossiles tout près
  // Les poches d'eau sont pleines
  for (let i = 0; i < N; i++) if (type[i] === EAU) eauNiv[i] = 1;
}

// ---------- 3. Le mineur ----------
// Position (x, y) = coin bas-gauche, en cases (avec des virgules pour un mouvement fluide).
// Il occupe 2 cases de large et 3 de haut ; il est dessiné en 8 × 12 « petits pixels »
// (chaque case = 4 × 4 petits pixels), sur un calque à part pour rester net.
// États : "sol" (posé), "air" (en vol ou en chute), "accroche" (grappin planté au plafond, il pend).

const LM = 2 * E, HM = 3 * E;
// Sa « boîte de collision » est un peu plus petite que son dessin (coins arrondis),
// pour qu'il passe là où, à l'œil, ça doit passer.
const MARGE_COTE = 0.25 * E, MARGE_HAUT = 0.35 * E;
// Vitesses « d'origine » (multipliées par V0 = rythme posé × échelle) ; la marche, le saut et la gravité
// viennent des réglages de démo (REG), pour pouvoir les essayer.
const V0 = 0.65 * E;
const CHUTE_MAX = 45 * V0, VITESSE_GLISSE = 5 * E;
const vSaut = () => Math.sqrt(2 * REG.gravite * REG.saut); // vitesse de départ pour atteindre la hauteur voulue
const mineur = {
  x: DEPART_X, y: DEPART_Y, vx: 0, vy: 0, sens: 1, etat: "sol", cible: null,
  controleAir: false,          // en saut « au clavier », on peut diriger en l'air
  ecrase: 0,                   // aplatissement à l'atterrissage (0 à 1), pour l'effet « rebondi »
  pas: 0,                      // compteur pour l'animation de marche
  murSens: 0,                  // côté du mur contre lequel il glisse (-1 / 1)
  coince: false,               // du sable lui est tombé dessus
  serre: false,                // il se faufile dans un passage bas (2/3 de sa taille) (tassé, ralenti)
  tasse: 0                     // tassement visible (0 à 1), suit « serre » en douceur
};
let dirTouche = 0;             // -1 gauche, 1 droite (touches du clavier ou boutons à l'écran)

// Outil du lance-pierre : ce qui se passe quand le mineur lancé touche la roche
let outil = "grappin";
try { outil = localStorage.getItem("tunnel-outil") || "grappin"; } catch (e) {}

// La boîte du mineur, placée en (x, y), toucherait-elle de la roche ?
// (haut = hauteur de la boîte : 6 cases debout, 4 quand il se faufile en se tassant)
const HM_SERRE = 2 * E;
function occupe(x, y, haut = mineur.serre ? HM_SERRE : HM) {
  const x0 = Math.floor(x + MARGE_COTE + 1e-6), x1 = Math.ceil(x + LM - MARGE_COTE - 1e-6) - 1;
  const y0 = Math.floor(y - haut + MARGE_HAUT + 1e-6), y1 = Math.ceil(y - 1e-6) - 1;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (solide(cx, cy)) return true;
  return false;
}
const auSol = () => occupe(mineur.x, mineur.y + 0.05);
const peutLancer = () => mineur.etat !== "air" && !mineur.coince && !mineur.serre;

// Outil « perce » : casse la terre et le sable autour du point d'impact (pas la roche dure)
function percer(cx, cy) {
  let casse = false;
  const R = 2.5 * E;
  for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > R * R || !dansMonde(x, y)) continue;
    const i = idx(x, y);
    if (type[i] === TERRE || type[i] === SABLE) { depenser(RES[type[i]] / 2); detruire(x, y); casse = true; }
  }
  if (casse) vibrer(12);
  return casse;
}

function atterrir() {
  const m = mineur;
  m.ecrase = Math.min(1, Math.max(m.ecrase, (m.vy - 8 * V0) / (35 * V0))); // plus il tombe vite, plus il s'aplatit
  if (m.vy > 20 * V0) sonChoc();
  m.etat = "sol"; m.vx = 0; m.vy = 0; m.controleAir = false;
  if (!occupe(m.x, Math.ceil(m.y - 1e-6))) m.y = Math.ceil(m.y - 1e-6); // bien posé sur la case
}

// Le mineur en vol touche la roche : la réaction dépend de l'outil.
// axe = "x" (mur), "haut" (plafond) ou "bas" (sol). Renvoie true s'il peut continuer d'avancer.
// Rebond doux : il s'écrase un peu et repart dans l'autre sens (jamais collé, jamais figé)
function rebondir(axe, force) {
  const m = mineur;
  if (axe === "x") { m.vx = -m.vx * force; if (Math.abs(m.vx) < 3 * V0) m.vx = -Math.sign(m.vx || m.sens) * 3 * V0; }
  else m.vy = Math.abs(m.vy) * force; // plafond : il redescend
  if (performance.now() - dernierRebond > 180) { // (pas de bruit en rafale s'il reste contre le mur)
    dernierRebond = performance.now();
    m.ecrase = Math.max(m.ecrase, 0.45);
    vibrer(5); sonChoc();
  }
}
let dernierRebond = 0;

function choc(axe) {
  const m = mineur;
  if (axe === "bas" && (m.controleAir || !(outil === "rebond" && m.vy > 14 * V0))) { atterrir(); return false; }
  if (m.controleAir) { rebondir(axe, 0.4 * REG.bouncy); return false; } // simple saut : il rebondit, sans outil
  if (outil === "grappin") {
    if (axe === "haut") { m.etat = "accroche"; m.vx = 0; m.vy = 0; m.ecrase = 0.4; vibrer(8); sonChoc(); return false; } // au plafond : il pend
    rebondir(axe, 0.4 * REG.bouncy); // contre un mur : il rebondit (plus d'accroche aux murs)
    return false;
  }
  if (outil === "rebond") {
    if (axe === "x") m.vx = -m.vx * 0.55;
    else { m.vy = -m.vy * 0.5; m.vx *= 0.8; }
    m.ecrase = 0.7; vibrer(5); sonChoc();
    return false;
  }
  // Perce : on casse devant soi ; si c'est de la roche dure, on s'arrête
  const cx = m.x + LM / 2 + (axe === "x" ? Math.sign(m.vx) * 2 * E : 0);
  const cy = m.y - HM / 2 + (axe === "haut" ? -2.5 * E : axe === "bas" ? 2 * E : 0);
  if (percer(cx, cy)) { m.vx *= 0.6; m.vy *= 0.6; return true; }
  if (axe === "x") m.vx = 0; else m.vy = 0;
  return false;
}

// Déplacement en vol, axe par axe et par petits morceaux (pour ne jamais traverser la roche).
// Si un coin de roche gêne un tout petit peu, on le contourne (au lieu de rester bloqué).
function deplacer(dx, dy) {
  const m = mineur;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.25));
  const sx = dx / n, sy = dy / n;
  let xBloque = false; // après un rebond sur un mur, on continue quand même à tomber / monter
  for (let k = 0; k < n; k++) {
    if (sx && !xBloque) {
      if (!occupe(m.x + sx, m.y)) m.x += sx;
      else {
        let contourne = false;
        for (const d of [-0.5 * E, -1 * E, -1.5 * E, 0.5 * E, 1 * E]) if (!occupe(m.x + sx, m.y + d) && !occupe(m.x, m.y + d)) { m.y += d; m.x += sx; contourne = true; break; }
        if (!contourne && !choc("x")) { if (m.etat !== "air") return; xBloque = true; }
      }
    }
    if (m.etat !== "air") return;
    if (sy) {
      if (!occupe(m.x, m.y + sy)) m.y += sy;
      else {
        let contourne = false;
        if (sy < 0) for (const d of [0.5 * E, -0.5 * E, 1 * E, -1 * E]) if (!occupe(m.x + d, m.y + sy) && !occupe(m.x + d, m.y)) { m.x += d; m.y += sy; contourne = true; break; }
        if (!contourne && !choc(sy > 0 ? "bas" : "haut")) return;
      }
    }
    if (m.etat !== "air") return;
  }
}

// Marche vers la cible ; monte tout seul les marches d'une case et contourne les petits coins
function marcher(dt) {
  const m = mineur;
  const ecart = m.cible - (m.x + LM / 2);
  if (Math.abs(ecart) < 0.3) { m.cible = null; return; }
  const dir = Math.sign(ecart);
  m.sens = dir;
  m.pas += dt;
  let reste = Math.min(Math.abs(ecart), REG.marche * (m.serre ? REG.rampage / 100 : 1) * dt); // tassé : il avance moins vite
  while (reste > 0) { // petits pas (vite, mais sans traverser de mur)
    const p = Math.min(0.4, reste); reste -= p;
    const nx = m.x + p * dir;
    if (!occupe(nx, m.y)) { m.x = nx; continue; }
    if (!m.serre && m.etat === "sol" && !occupe(nx, m.y, HM_SERRE)) { m.serre = true; m.x = nx; continue; } // passage bas : il se tasse et se faufile
    let passe = false;
    for (const h of [0.5 * E, 1 * E, 1.4 * E]) { // marche (ou bosse) à enjamber
      if (!occupe(m.x, m.y - h) && !occupe(nx, m.y - h)) { m.x = nx; m.y -= h; m.ecrase = Math.max(m.ecrase, 0.2); passe = true; break; }
    }
    if (!passe) { // un vrai mur : petit rebond en arrière au lieu de rester figé contre
      m.cible = null;
      if (performance.now() - dernierBoing > 350) {
        dernierBoing = performance.now();
        m.etat = "air"; m.vx = -dir * 5 * V0; m.vy = -9 * V0; m.controleAir = true; m.ecrase = 0.5;
        vibrer(5);
      }
      return;
    }
  }
}
let dernierBoing = 0;

// Saut (touche haut / espace, ou bouton à l'écran)
function sauter() {
  const m = mineur;
  if (m.coince || m.serre || m.etat === "air") return;
  if (m.etat === "sol" && !auSol()) return;
  if (m.etat === "glisse") { m.vx = -m.murSens * REG.marche; m.sens = -m.murSens; } // saut de mur
  else m.vx = dirTouche * REG.marche;
  m.etat = "air"; m.vy = -vSaut(); m.cible = null; m.controleAir = true;
  m.ecrase = -0.4; // il s'étire en partant
  sonSaut();
}

function majMineur(dt) {
  const m = mineur;
  const ax = Math.floor(m.x), ay = Math.floor(m.y);
  // Du sable lui est tombé dessus : il est coincé tant qu'on ne l'a pas dégagé (s'il peut juste se tasser, il se tasse)
  if (occupe(m.x, m.y, HM) && m.etat === "sol" && !occupe(m.x, m.y, HM_SERRE)) m.serre = true;
  if (m.serre && !occupe(m.x, m.y, HM)) m.serre = false; // assez de place : il se redresse
  m.tasse += ((m.serre ? 1 : 0) - m.tasse) * Math.min(1, dt * 8);
  m.coince = occupe(m.x, m.y);
  if (m.coince) { m.vx = 0; m.vy = 0; m.cible = null; depenser(dt * 12 * E * E); return; } // coincé : la lampe s'use
  if (m.etat === "accroche" && !occupe(m.x, m.y - 0.3)) m.etat = "air"; // le plafond a disparu
  if (m.etat === "glisse") {
    if (!occupe(m.x + m.murSens * 0.3, m.y)) m.etat = "air"; // plus de mur : il tombe
    else {
      m.vy += (VITESSE_GLISSE - m.vy) * Math.min(1, dt * 6);
      const ny = m.y + m.vy * dt;
      if (occupe(m.x, ny)) { if (m.vy > 0) atterrir(); else m.vy = 0; }
      else m.y = ny;
      m.sens = -m.murSens;
    }
  }
  if (m.etat === "sol") {
    if (dirTouche) m.cible = m.x + LM / 2 + dirTouche * 2 * E; // touche maintenue : il avance
    if (m.cible !== null) marcher(dt);
    else m.pas = 0;
    if (!auSol()) {
      // Petite descente : il la suit au lieu de « tomber »
      let colle = false;
      for (const h of [0.5 * E, 1 * E]) if (occupe(m.x, m.y + h + 0.05) && !occupe(m.x, m.y + h)) { m.y += h; colle = true; break; }
      if (!colle) { m.etat = "air"; m.vx = 0; m.vy = 0; }
    }
  }
  if (m.etat === "air") {
    m.vy = Math.min(m.vy + REG.gravite * dt, CHUTE_MAX);
    if (m.controleAir) m.vx += (dirTouche * REG.marche - m.vx) * Math.min(1, dt * 10);
    if (Math.abs(m.vx) > 1) m.sens = Math.sign(m.vx);
    deplacer(m.vx * dt, m.vy * dt);
    if (m.etat === "air" && m.vy >= 0 && auSol() && (m.controleAir || !(outil === "rebond" && m.vy > 14 * V0))) atterrir();
  }
  // L'aplatissement revient doucement à la normale (effet ressort)
  m.ecrase += (0 - m.ecrase) * Math.min(1, dt * 9);
  if (Math.floor(m.x) !== ax || Math.floor(m.y) !== ay) lumiereSale = true;
  noteCorniche(dt);
  if (dansLEau()) retourCorniche();
}

// ---------- 3 ter. Dernière corniche ----------
// On retient régulièrement les endroits sûrs (posé, au sec) où il est passé.
// Si l'eau l'atteint, il y revient.

const corniches = [];
let tempsCorniche = 0;
function eauDansBoite(x, y, seuil) {
  for (let cy = Math.floor(y - HM); cy < Math.ceil(y); cy++)
    for (let cx = Math.floor(x + MARGE_COTE); cx < Math.ceil(x + LM - MARGE_COTE); cx++)
      if (typeA(cx, cy) === EAU && eauNiv[idx(cx, cy)] > seuil) return true;
  return false;
}
const dansLEau = () => eauDansBoite(mineur.x, mineur.y, 0.35);
function noteCorniche(dt) {
  tempsCorniche -= dt;
  if (tempsCorniche > 0 || mineur.etat !== "sol" || !auSol() || eauDansBoite(mineur.x, mineur.y, 0.02)) return;
  tempsCorniche = 0.3;
  const der = corniches[corniches.length - 1];
  if (der && Math.abs(der.x - mineur.x) + Math.abs(der.y - mineur.y) < 3 * E) return;
  corniches.push({ x: mineur.x, y: mineur.y });
  if (corniches.length > 30) corniches.shift();
}
function retourCorniche() {
  if (!corniches.length || corniches[0].x !== DEPART_X || corniches[0].y !== DEPART_Y) corniches.unshift({ x: DEPART_X, y: DEPART_Y }); // en dernier recours : le départ
  for (let k = corniches.length - 1; k >= 0; k--) {
    const c = corniches[k];
    if (occupe(c.x, c.y) || !occupe(c.x, c.y + 0.05) || eauDansBoite(c.x, c.y, 0.02)) { if (k > 0) corniches.splice(k, 1); continue; }
    const m = mineur;
    for (let n = 0; n < 8; n++) poussiere(Math.floor(m.x + 1), Math.floor(m.y - 1), [120, 170, 230]);
    m.x = c.x; m.y = c.y; m.vx = 0; m.vy = 0; m.etat = "sol"; m.cible = null; m.ecrase = 0.8;
    lumiereSale = true; attenteRetour = 0; decalX = 0; decalY = 0;
    vibrer(30); sonRetour();
    return;
  }
}

// ---------- 3 quater. Sable qui s'écroule, eau qui coule ----------
// On ne s'occupe que des grains et des gouttes « réveillés » (qui viennent de perdre un appui),
// pour que ça reste rapide même dans une grande mine.

const eauNiv = new Float32Array(N);  // quantité d'eau dans chaque case (0 à 1)
const sableActif = new Set(), eauActive = new Set();
let horlogeSable = 0, horlogeEau = 0, calmeDepuis = 10;

// Une case vient de changer : on réveille le sable et l'eau autour
function reveiller(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (!dansMonde(nx, ny)) continue;
    const j = idx(nx, ny);
    if (type[j] === SABLE) sableActif.add(j);
    else if (type[j] === EAU) eauActive.add(j);
  }
}

function majSable() {
  if (!sableActif.size) return false;
  const liste = [...sableActif].sort((a, b) => b - a); // du bas vers le haut
  sableActif.clear();
  let bouge = false;
  for (const i of liste) {
    if (type[i] !== SABLE) continue;
    const x = i % LARG, y = (i / LARG) | 0;
    const cote = Math.random() < 0.5 ? -1 : 1;
    for (const dx of [0, cote, -cote]) {
      const nx = x + dx, ny = y + 1;
      if (!dansMonde(nx, ny)) continue;
      const j = idx(nx, ny), tj = type[j];
      if (tj !== VIDE && tj !== EAU) continue;
      if (dx && type[idx(nx, y)] !== VIDE && type[idx(nx, y)] !== EAU) continue; // en biais : il faut que le côté soit libre
      type[j] = SABLE; usure[j] = 0; usure[i] = 0;
      if (tj === EAU) { type[i] = EAU; eauNiv[i] = eauNiv[j]; eauNiv[j] = 0; eauActive.add(i); } // le sable coule, l'eau remonte
      else type[i] = VIDE;
      sableActif.add(j);
      reveiller(x, y);
      bouge = true;
      break;
    }
  }
  return bouge;
}

function majEau() {
  if (!eauActive.size) return false;
  const liste = [...eauActive].sort((a, b) => b - a); // du bas vers le haut
  eauActive.clear();
  let bouge = false;
  const libre = j => type[j] === VIDE || type[j] === EAU;
  const verser = (j, q) => { eauNiv[j] += q; if (type[j] !== EAU) { type[j] = EAU; } eauActive.add(j); };
  for (const i of liste) {
    if (type[i] !== EAU) continue;
    const x = i % LARG, y = (i / LARG) | 0;
    let m = eauNiv[i], coule = false;
    // 1. Vers le bas, autant que possible
    if (y + 1 < PROF) {
      const b = i + LARG;
      if (libre(b)) { const q = Math.min(m, 1 - eauNiv[b]); if (q > 0.002) { verser(b, q); m -= q; coule = true; } }
    }
    // 2. Sur les côtés, pour se mettre à niveau
    if (m > 0.01) {
      const ordre = Math.random() < 0.5 ? [-1, 1] : [1, -1];
      for (const dx of ordre) {
        const nx = x + dx;
        if (nx < 0 || nx >= LARG) continue;
        const s = i + dx;
        if (!libre(s)) continue;
        const ecart = m - eauNiv[s];
        if (ecart > 0.01) { const q = ecart / 3; verser(s, q); m -= q; coule = true; }
      }
    }
    if (m < 0.006) { m = 0; type[i] = VIDE; coule = true; } // une trace d'eau s'évapore
    eauNiv[i] = m;
    if (coule) {
      bouge = true;
      eauActive.add(i);
      if (y > 0 && type[i - LARG] === EAU) eauActive.add(i - LARG);
      if (x > 0 && type[i - 1] === EAU) eauActive.add(i - 1);
      if (x < LARG - 1 && type[i + 1] === EAU) eauActive.add(i + 1);
    }
  }
  return bouge;
}

// Le sable et l'eau avancent à leur rythme (même si on ne touche plus l'écran : ça finit de couler)
function majMatieres(dt) {
  let bouge = false;
  horlogeSable += dt;
  const pasSable = 1 / (30 * V0 * REG.matieres), pasEau = 1 / (150 * V0 * REG.matieres); // (plus de cases = plus de pas)
  while (horlogeSable >= pasSable) { horlogeSable -= pasSable; if (majSable()) bouge = true; }
  horlogeEau += dt;
  let tours = 0; // (au plus 6 tours par image, pour ne jamais ralentir le jeu)
  while (horlogeEau >= pasEau && tours++ < 8) { horlogeEau -= pasEau; if (majEau()) bouge = true; }
  if (horlogeEau > 0.1) horlogeEau = 0;
  if (bouge) {
    lumiereSale = true;
    if (calmeDepuis > 1.5) { vibrer(25); sonDanger(); } // ça se met à couler : on prévient
    calmeDepuis = 0;
  } else calmeDepuis += dt;
}

// Gouttes qui tombent du plafond près des poches d'eau (un indice du danger)
function majGouttes() {
  for (let n = 0; n < 12; n++) {
    const x = Math.floor(camX + Math.random() * largVue), y = Math.floor(camY + Math.random() * hautVue);
    if (typeA(x, y) !== VIDE || !solide(x, y - 1) || revele[idx(x, y)] < 200) continue;
    let eau = false;
    for (let k = 2 * E; k <= 6 * E; k++) if (typeA(x, y - k) === EAU) { eau = true; break; }
    if (eau && Math.random() < 0.08 && particules.length < 200)
      particules.push({ x: x + 0.3 + Math.random() * 0.4, y: y + 0.05, vx: 0, vy: 0, vie: 3, coul: "rgb(150,200,240)", goutte: true });
  }
}

// ---------- 3 bis. Le lance-pierre ----------
// On pose le doigt sur le mineur, on tire en arrière, on lâche : il part à l'opposé.

// Lancer : la puissance vient des réglages de démo ; tirer plus loin du mineur = plus fort
const FORCE_LANCER = 5.5 * 0.65, VITESSE_LANCER_MIN = 14 * V0;
const vLancerMax = () => REG.lancer;

function vitesseLancer(fx, fy) {
  let vx = (centreMineurX() - fx) * FORCE_LANCER, vy = (centreMineurY() - fy) * FORCE_LANCER;
  const v = Math.hypot(vx, vy);
  if (v > vLancerMax()) { vx *= vLancerMax() / v; vy *= vLancerMax() / v; }
  return { vx, vy, v: Math.min(v, vLancerMax()) };
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
    vy = Math.min(vy + REG.gravite / 60, CHUTE_MAX);
    x += vx / 60; y += vy / 60;
    if (occupe(x, y)) break;
    pts.push([x + LM / 2, y - HM / 2]);
  }
  return pts;
}

// Zone où poser le doigt pour attraper le mineur (plus grande que lui, mais pas sous ses pieds,
// pour qu'on puisse toujours creuser juste en dessous)
function dansPrise(wx, wy) {
  const marge = Math.max(1.5 * E, 14 / taille); // au moins 14 px autour de lui, même vu de loin
  return wx >= mineur.x - marge && wx <= mineur.x + LM + marge && wy >= mineur.y - HM - marge && wy <= mineur.y + 0.3;
}

// La lampe est sur le casque, côté où il regarde
const lampeX = () => Math.floor(mineur.x + (mineur.sens > 0 ? 1.6 : 0.4) * E);
const lampeY = () => Math.floor(mineur.y - 2.7 * E);
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

const LR = 400;                        // coût maximum calculé (2 par pas) : assez pour la plus grande portée de lampe
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
      const m = t === VIDE ? 1 : (t === EAU || t === CRISTAL) ? 2 : 5; // (le cristal laisse un peu passer la lumière)
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

let porteeActuelle = 180; // varie avec la flamme
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
  reveiller(x, y); // le sable au-dessus peut tomber, l'eau à côté peut couler
}

let matiereGrattee = 0; // ce qu'on gratte en ce moment (pour le son)

// ---------- Énergie (la lampe) ----------
// Chaque bloc creusé use un peu la lampe (plus la roche est dure, plus ça coûte) ; marcher et lancer sont gratuits.
// Quand elle est vide, l'expédition se termine. Les recharges trouvées dans la mine la remplissent.
const BUDGET_ENERGIE = 2600 * E * E;   // « points de dureté » qu'on peut creuser avec une lampe pleine (≈ 5 à 10 min)
let energie = 1, expeditionFinie = false, extinction = 0;
function depenser(points) {
  if (expeditionFinie) return;
  energie = Math.max(0, energie - points / BUDGET_ENERGIE);
}

// ---------- Gros cristaux ----------
// Un cristal est un seul gros objet qui occupe plusieurs cases, avec une forme à lui
// (aiguilles, grappe, géode…), dessiné finement par-dessus la mine.
// Pour le récolter : le déterrer tout autour (la roche qui le touche doit presque toute avoir disparu),
// puis le gratter doucement. Encore pris dans la roche, ou gratté trop vite : il se fissure, puis casse.

const VITESSE_DOUCE = 220;                     // px par seconde : au-delà, le doigt va trop vite
const cristalDe = new Int32Array(N).fill(-1);  // pour chaque case : numéro du cristal qui l'occupe (-1 = aucun)
const cristaux = [];
const ENCRE = -1;                              // (petit pixel de contour)
const hexVersRvb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const PAL_CRISTAL = {
  bleu: ["#e8fbff", "#a6e6f5", "#6cc4e0", "#3f8fb5", "#2c6488"].map(hexVersRvb),
  violet: ["#f6e9ff", "#d4b0f4", "#a77be0", "#7a52c0", "#553a90"].map(hexVersRvb)
};
const PAL_GEODE = ["#9a9488", "#7a756b", "#56514a", "#2a2034"].map(hexVersRvb);

// Fabrique au hasard le dessin d'un cristal (en petits pixels, 4 par case)
function dessinCristal(r) {
  const W = 30, H = 34, pix = new Array(W * H).fill(null);
  const mettre = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = c; };
  const pal = r() < 0.6 ? PAL_CRISTAL.bleu : PAL_CRISTAL.violet;
  const sorte = r() < 0.35 ? "aiguilles" : r() < 0.7 ? "grappe" : "geode";
  // Une aiguille à facettes : corps + pointe, éclairée à gauche, sombre à droite, un peu penchée
  const aiguille = (cx, base, larg, haut, pente, palette) => {
    for (let py = 0; py < haut; py++) {
      const pointe = haut - py <= larg / 2 + 1;
      const demi = pointe ? Math.max(0.5, (larg / 2) * (haut - py) / (larg / 2 + 1)) : larg / 2;
      for (let px = -demi; px <= demi; px += 1) {
        const t = (px + demi) / (2 * demi + 0.001);
        const k = py === haut - 1 ? 0 : t < 0.18 ? 0 : t < 0.42 ? 1 : t < 0.68 ? 2 : t < 0.86 ? 3 : 4;
        mettre(cx + px + py * pente, base - py, palette[k]);
      }
    }
  };
  if (sorte === "geode") {
    const cx = W / 2, cy = H - 11, rx = 8 + r() * 5, ry = 6 + r() * 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1) pix[y * W + x] = d > 0.62 ? PAL_GEODE[d > 0.85 ? 2 : d > 0.72 ? 1 : 0] : PAL_GEODE[3];
    }
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) { // petites pointes qui poussent du fond de la coque
      const x = cx - rx * 0.55 + r() * rx * 1.1;
      aiguille(x, cy + ry * 0.45, 2 + 2 * Math.floor(r() * 2), 3 + Math.floor(r() * 5), (x - cx) * 0.06, PAL_CRISTAL.violet);
    }
  } else {
    const n = sorte === "aiguilles" ? 1 + (r() < 0.5 ? 1 : 0) : 3 + (r() < 0.5 ? 1 : 0);
    const prismes = [];
    for (let k = 0; k < n; k++) {
      const larg = 4 + 2 * Math.floor(r() * 3);
      const haut = (k === 0 ? 16 : 7) + Math.floor(r() * (k === 0 ? 14 : 10));
      const decal = (k === 0 ? 0 : (k % 2 ? -1 : 1) * (4 + r() * 6));
      prismes.push({ cx: W / 2 + decal, larg, haut, pente: (r() - 0.5) * 0.5 + decal * 0.06 });
    }
    prismes.sort((a, b) => b.haut - a.haut); // les grands derrière, les petits devant
    for (const p of prismes) aiguille(p.cx, H - 3, p.larg, p.haut, p.pente, pal);
  }
  const pierre = pal === PAL_CRISTAL.violet ? "d'améthyste" : "de cristal";
  return { W, H, pix, nom: sorte === "geode" ? "Géode d'améthyste" : (sorte === "aiguilles" ? "Aiguille " : "Grappe ") + pierre };
}

// Fabrique au hasard le dessin d'un fossile (ammonite en spirale, grand os, ou squelette de poisson)
const PAL_FOSSILE = ["#fff6e6", "#eadfc4", "#cbbf9f", "#a39675", "#7d7258"].map(hexVersRvb);
function dessinFossile(r) {
  const W = 30, H = 30, pix = new Array(W * H).fill(null);
  const mettre = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) pix[y * W + x] = PAL_FOSSILE[k]; };
  const tirage = r(), sorte = tirage < 0.25 ? "ammonite" : tirage < 0.45 ? "os" : tirage < 0.65 ? "poisson" : tirage < 0.82 ? "crane" : "trilobite";
  const NOMS = { ammonite: "Ammonite", os: "Grand os", poisson: "Poisson fossile", crane: "Crâne fossile", trilobite: "Trilobite" };
  if (sorte === "crane") {
    const cx = W / 2, cy = H / 2 - 1, rx = 6 + r() * 2, ry = 5 + r() * 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1) mettre(x, y, d > 0.75 ? 3 : y < cy - ry * 0.3 ? 0 : 1);
    }
    for (const s of [-1, 1]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) mettre(cx + s * 2.5 + dx - 0.5, cy + dy, 4); // orbites
    mettre(cx, cy + 3, 4); // nez
    for (let x = -3; x <= 3; x++) { mettre(cx + x, cy + ry, x % 2 ? 2 : 0); mettre(cx + x, cy + ry + 1, 3); } // mâchoire et dents
  } else if (sorte === "trilobite") {
    const cx = W / 2, cy = H / 2, rx = 5 + r() * 2, ry = 8 + r() * 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      const lobe = Math.abs(x - cx) < rx * 0.3; // lobe du milieu
      const segment = y > cy - ry * 0.45 && Math.round(y) % 2 === 0; // anneaux du corps
      mettre(x, y, d > 0.8 ? 3 : segment ? 2 : lobe ? 1 : 0);
    }
  } else if (sorte === "ammonite") {
    const cx = W / 2, cy = H / 2, R = 7 + r() * 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) continue;
      const a = Math.atan2(y - cy, x - cx);
      const spirale = (d / R * 3 + a / (Math.PI * 2) + 1) % 1; // les tours de la coquille
      const cote = Math.floor((a + Math.PI) / (Math.PI * 2) * 22) % 2; // petites côtes
      mettre(x, y, spirale < 0.18 ? 4 : d > R - 1.2 ? 3 : cote ? 1 : (x < cx ? 0 : 2));
    }
  } else if (sorte === "os") {
    const L = 14 + Math.floor(r() * 9), y0 = H / 2, x0 = (W - L) / 2, pente = (r() - 0.5) * 0.5;
    for (let i = 0; i < L; i++) for (let j = -1; j <= 1; j++) mettre(x0 + i, y0 + j + i * pente, j < 0 ? 0 : j > 0 ? 2 : 1);
    for (const bout of [0, L - 1]) { // les deux bouts arrondis (en double bosse)
      const bx = x0 + bout, by = y0 + bout * pente;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++)
        if (Math.hypot(dx, Math.abs(dy) - 1.5) < 1.9) mettre(bx + dx, by + dy, dy < 0 ? 0 : dy > 1 ? 3 : 1);
    }
  } else {
    const L = 16 + Math.floor(r() * 8), y0 = H / 2, x0 = (W - L) / 2;
    for (let i = 0; i < L; i++) mettre(x0 + i, y0, 1); // colonne
    for (let i = 3; i < L - 4; i += 2) { const h = 3 + Math.round(2 * Math.sin(i / L * Math.PI)); for (let j = 1; j <= h; j++) { mettre(x0 + i - j * 0.3, y0 - j, 2); mettre(x0 + i - j * 0.3, y0 + j, 3); } } // arêtes
    for (let dy = -3; dy <= 3; dy++) for (let dx = 0; dx <= 3; dx++) if (Math.abs(dy) <= 3 - dx * 0.6) mettre(x0 + L + dx, y0 + dy, dx === 0 ? 0 : 1); // tête
    mettre(x0 + L + 1, y0 - 1, 4); // œil
    for (let dy = -3; dy <= 3; dy++) mettre(x0 - 1 - Math.abs(dy) * 0.5, y0 + dy, 2); // queue
  }
  return { W, H, pix, nom: NOMS[sorte] };
}
// Place un trésor (cristal ou fossile) centré vers (cx, cy), s'il tient entièrement dans la roche
function placerCristal(cx, cy, r = alea, sorte = "cristal") {
  const d0 = sorte === "fossile" ? dessinFossile(r) : dessinCristal(r);
  // Échelle : chaque petit pixel du dessin devient E × E petits pixels (même taille réelle, blocs plus fins)
  const d = { W: d0.W * E, H: d0.H * E, nom: d0.nom, pix: new Array(d0.W * E * d0.H * E).fill(null) };
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) d.pix[y * d.W + x] = d0.pix[Math.floor(y / E) * d0.W + Math.floor(x / E)];
  // Cadre réel du dessin
  let x0 = d.W, x1 = -1, y0 = d.H, y1 = -1;
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) if (d.pix[y * d.W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return false;
  const w = Math.ceil((x1 - x0 + 3) / 4), h = Math.ceil((y1 - y0 + 3) / 4); // (+ 1 petit pixel de contour de chaque côté)
  const W = w * 4, H = h * 4, pix = new Array(W * H).fill(null);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pix[(y - y0 + 1) * W + (x - x0 + 1)] = d.pix[y * d.W + x];
  const bx = Math.round(cx - w / 2), by = Math.round(cy - h / 2);
  // Les cases occupées : celles qui contiennent au moins 2 petits pixels du cristal
  const cases = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let n = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (pix[(j * 4 + y) * W + i * 4 + x]) n++;
    if (n >= 2) cases.push([i, j]); else for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) pix[(j * 4 + y) * W + i * 4 + x] = null;
  }
  for (const [i, j] of cases) if (!dansMonde(bx + i, by + j) || !rocheSimple(type[idx(bx + i, by + j)])) return false;
  // Contour fin (seulement à l'intérieur des cases du cristal)
  const dansCase = new Set(cases.map(([i, j]) => i + "," + j));
  const plein = (x, y) => x >= 0 && y >= 0 && x < W && y < H && pix[y * W + x] && pix[y * W + x] !== ENCRE;
  const contour = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (pix[y * W + x] || !dansCase.has((x >> 2) + "," + (y >> 2))) continue;
    if (plein(x + 1, y) || plein(x - 1, y) || plein(x, y + 1) || plein(x, y - 1)) contour.push(y * W + x);
  }
  for (const k of contour) pix[k] = ENCRE;
  const id = cristaux.length;
  const c = { id, sorte, nom: d.nom, x: bx, y: by, w, h, W, H, pix, cases: [], fissure: 0, usure: 0, vivant: true, touche: -1 };
  for (const [i, j] of cases) { const k = idx(bx + i, by + j); type[k] = sorte === "fossile" ? FOSSILE : CRISTAL; cristalDe[k] = id; c.cases.push(k); }
  cristaux.push(c);
  return true;
}

// Déterré ? On regarde toutes les cases qui touchent le cristal : il faut que (presque) toutes soient vides
function cristalDeterre(c) {
  let libres = 0, total = 0;
  const vu = new Set();
  for (const k of c.cases) {
    const x = k % LARG, y = (k / LARG) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!dansMonde(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (cristalDe[j] === c.id || vu.has(j)) continue;
      vu.add(j); total++;
      const t = type[j];
      if (t === VIDE || t === EAU) libres++;
    }
  }
  return total === 0 || libres / total >= 0.8;
}

function retirerCristal(c) {
  c.vivant = false;
  for (const k of c.cases) { type[k] = VIDE; cristalDe[k] = -1; usure[k] = 0; reveiller(k % LARG, (k / LARG) | 0); }
  lumiereSale = true;
}
function detacherCristal(c) { // récolté entier : il tombe et l'aimant l'attire
  retirerCristal(c);
  objets.push({ x: c.x + c.w / 2, y: c.y + c.h / 2, vx: 0, vy: 0, t: c.sorte === "fossile" ? FOSSILE : CRISTAL, c: 1, n: 1, repos: false, dessin: c });
  vibrer(25);
  if (c.sorte === "fossile") { bip(900, 0.2, 0.05); bip(1350, 0.25, 0.03); } else { bip(1800, 0.2, 0.05); bip(2700, 0.25, 0.03); }
}
function casserGrosCristal(c) { // cassé : il ne reste que des débris
  retirerCristal(c);
  for (let n = 0; n < Math.max(2, c.cases.length >> 1); n++) {
    const k = c.cases[(Math.random() * c.cases.length) | 0];
    objetTombe(k % LARG, (k / LARG) | 0, GRAVIER, 1);
    poussiere(k % LARG, (k / LARG) | 0, PAL_CRISTAL.bleu[1]);
  }
  vibrer(30); sonVerre();
}

let numImage = 0, dtImage = 1 / 60; // (pour ne gratter un cristal qu'une fois par image, même s'il est sous tout le grattoir)
function gratterCristal(c) {
  if (c.touche === numImage) return;
  c.touche = numImage;
  if (c.sorte === "fossile") {
    // Fossile : il ne casse pas, mais demande plus de travail. Tant qu'il n'est pas déterré, on n'avance pas.
    if (!cristalDeterre(c)) return;
    c.usure += dtImage * REG.rythme;
    if (c.usure >= 3.5 / 0.65) detacherCristal(c);
    return;
  }
  const deterre = cristalDeterre(c), doux = vitesseDoigt < REG.douceCrist;
  if (!deterre || !doux) { // encore pris dans la roche, ou doigt trop rapide : il se fissure
    if (c.fissure === 0) vibrer(8);
    c.fissure += dtImage * REG.rythme * (doux ? 0.55 : 1.6);
    if (c.fissure >= 1) casserGrosCristal(c);
    return;
  }
  c.usure += dtImage * REG.rythme;
  if (c.usure >= 1.4 / 0.65) detacherCristal(c);
}

let vitesseDoigt = 0; // vitesse du doigt sur l'écran (px/s), mesurée à chaque image
let tempsImmobile = 0, croissanceGrattoir = 1;

// ---------- Minage en coups rythmés ----------
// Le doigt posé donne de petits coups réguliers (réglage « coups par seconde »).
// À chaque coup, les cases sous le grattoir perdent des points de vie : 1 au centre, 0,5 au bord.
// Une case de terre demande « coups pour la terre » ; les autres matières, plus (voir RES).
const rayonBase = () => Math.max(0.5, rayonGrattoir() / taille);
const pvMax = t => RES[t] * REG.coupsTerre;
function aPortee(px, py) { return (px - centreMineurX()) ** 2 + (py - centreMineurY()) ** 2 <= REG.portee * REG.portee; }

// Un coup au point (px, py) du monde
function frapper(px, py) {
  if (expeditionFinie || energie <= 0 || !aPortee(px, py)) return false;
  const r0 = rayonBase(), r = r0 * croissanceGrattoir;
  let touche = 0, matiere = 0;
  for (let y = Math.floor(py - r); y <= py + r; y++) {
    for (let x = Math.floor(px - r); x <= px + r; x++) {
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d > r || !dansMonde(x, y)) continue;
      const i = idx(x, y), t = type[i];
      if (t === VIDE || t === EAU || t === SOCLE) continue;
      if ((t === CRISTAL || t === FOSSILE) && cristalDe[i] >= 0) continue; // (gros trésors : voir « frotter »)
      usure[i] += d < r0 * 0.5 ? 1 : 0.5; // le centre frappe plus fort
      touche++; if (!matiere || RES[t] > RES[matiere]) matiere = t;
      if (usure[i] >= pvMax(t)) { depenser(RES[t]); detruire(x, y); }
    }
  }
  if (touche) { sonCoup(matiere); vibrer(RES[matiere] >= 3 ? 9 : 5); }
  return touche > 0;
}

// Les gros cristaux et fossiles, eux, se « frottent » en continu (doucement !) tant que le grattoir est dessus
function frotterTresors(px, py) {
  if (expeditionFinie || energie <= 0 || !aPortee(px, py)) return;
  const r = rayonBase() * croissanceGrattoir;
  for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
    if (!dansMonde(x, y) || Math.hypot(x + 0.5 - px, y + 0.5 - py) > r) continue;
    const i = idx(x, y);
    if (cristalDe[i] >= 0) { const c = cristaux[cristalDe[i]]; if (c && c.vivant) gratterCristal(c); }
  }
}

// Avance le minage d'une image : mesure la vitesse du doigt, frotte les trésors, et donne les coups
// (le long du trajet depuis le coup précédent, pour qu'un geste dessine une galerie continue)
function majMinage(d, dtj) {
  const ax = versMondeX(d.px), ay = versMondeY(d.py), bx = versMondeX(d.x), by = versMondeY(d.y);
  const dtr = dtImage || 1 / 60;
  vitesseDoigt += (Math.hypot(d.x - d.px, d.y - d.py) / dtr - vitesseDoigt) * 0.5;
  frotterTresors(bx, by);
  if (geste.dernierCoup === undefined) { // premier contact : un coup tout de suite
    geste.dernierCoup = [bx, by]; geste.horloge = 0;
    frapper(bx, by);
    return;
  }
  geste.horloge += dtj;
  const periode = 1 / REG.coupsSec;
  while (geste.horloge >= periode) {
    geste.horloge -= periode;
    const [x0, y0] = geste.dernierCoup;
    const long = Math.hypot(bx - x0, by - y0), pas = Math.max(0.5, rayonBase());
    const n = Math.max(1, Math.ceil(long / pas));
    for (let k = 1; k <= n; k++) frapper(x0 + (bx - x0) * k / n, y0 + (by - y0) * k / n);
    geste.dernierCoup = [bx, by];
  }
}

// ---------- 6. Poussière et mini-objets ----------

const particules = [];
function poussiere(x, y, coul) {
  if (particules.length > 200 || Math.random() < 0.6) return;
  particules.push({
    x: x + 0.5, y: y + 0.5,
    vx: (Math.random() - 0.5) * 10 * E, vy: -Math.random() * 9 * E,
    vie: 0.4 + Math.random() * 0.3,
    coul: "rgb(" + Math.min(255, coul[0] * 1.3 | 0) + "," + Math.min(255, coul[1] * 1.25 | 0) + "," + Math.min(255, coul[2] * 1.2 | 0) + ")"
  });
}
function majParticules(dt) {
  for (let n = particules.length - 1; n >= 0; n--) {
    const p = particules[n];
    p.vy += 50 * E * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt;
    const touche = solide(Math.floor(p.x), Math.floor(p.y)) || (p.goutte && typeA(Math.floor(p.x), Math.floor(p.y)) === EAU);
    if (p.vie <= 0 || touche) {
      particules.splice(n, 1);
      if (p.goutte && touche && !p.eclabousse) for (const s of [-1, 1]) // petite éclaboussure
        particules.push({ x: p.x, y: p.y - 0.3, vx: s * (2 + Math.random() * 2), vy: -4, vie: 0.25, coul: p.coul, goutte: true, eclabousse: true });
    }
  }
}

// Ce qu'on a ramassé (par type de matière)
const compteur = {};
let compteurSale = true;

// Les mini-objets : chaque case creusée tombe, roule un peu, puis l'aimant du mineur les attire
const objets = [];
const MAX_OBJETS = 500;
// (rayon de l'aimant : réglage de démo REG.aimant, en cases)
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
  objets.push({ x: x + 0.5, y: y + 0.5, vx: (Math.random() - 0.5) * 5 * E, vy: -Math.random() * 4 * E, t, c, n: 1, repos: false });
}

function majObjets(dt) {
  const cx = centreMineurX(), cy = centreMineurY();
  for (let k = objets.length - 1; k >= 0; k--) {
    const o = objets[k];
    const dx = cx - o.x, dy = cy - o.y, d2 = dx * dx + dy * dy;
    if (d2 < 1.2 * E * E) { // ramassé !
      compteur[o.t] = (compteur[o.t] || 0) + o.n;
      compteurSale = true;
      sonRamasse(o.t);
      if (o.dessin) afficherTrouvaille(o.dessin); // gros cristal ou fossile : petit bandeau en haut
      if (o.t === RECHARGE && !expeditionFinie) energie = Math.min(1, energie + 0.06 * o.n); // la lampe reprend de la force
      objets.splice(k, 1);
      continue;
    }
    if (d2 < REG.aimant * REG.aimant) { // l'aimant l'attire (il passe à travers la roche)
      const d = Math.sqrt(d2);
      o.vx += dx / d * 140 * V0 * dt; o.vy += dy / d * 140 * V0 * dt;
      o.vx *= 0.9; o.vy *= 0.9;
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.repos = false;
      continue;
    }
    if (o.repos) { // posé : on vérifie juste que le sol est toujours là
      if (solide(Math.floor(o.x), Math.floor(o.y + 0.3))) continue;
      o.repos = false;
    }
    o.vy = Math.min(o.vy + 60 * 0.65 * V0 * dt, 30 * V0);
    const nx = o.x + o.vx * dt;
    if (solide(Math.floor(nx), Math.floor(o.y))) o.vx = -o.vx * 0.3; else o.x = nx;
    const ny = o.y + o.vy * dt;
    if (solide(Math.floor(o.x), Math.floor(ny + 0.25))) {
      o.y = Math.floor(ny + 0.25) - 0.25; o.vy = 0; o.vx *= 0.6;
      if (Math.abs(o.vx) < 0.4 * E) o.repos = true;
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
  if (t === GRAVIER) return [128, 124, 136]; // éclats ternes, sans valeur
  if (COUL[t]) return COUL[t];
  if (COUL_ROCHE[t]) return [COUL_ROCHE[t][0] * 1.15, COUL_ROCHE[t][1] * 1.15, COUL_ROCHE[t][2] * 1.2];
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
const FREQ_GRATTE = { [TERRE]: 700, [SABLE]: 450, [ARGILE]: 1000, [BASALTE]: 1900, [CUIVRE]: 2300, [OR]: 2600, [CRISTAL]: 3200, [FOSSILE]: 1500, [RECHARGE]: 1200, [CAILLOU]: 2100, [SCHISTE]: 2500, [OBSIDIENNE]: 3600 };
function majSonGrattage() {
  if (!son.ctx) return;
  const t = son.ctx.currentTime;
  if (son.actif && matiereGrattee) {
    son.filtre.frequency.setTargetAtTime(FREQ_GRATTE[matiereGrattee] || 900, t, 0.03);
    son.gainGratte.gain.setTargetAtTime(0.05, t, 0.02);
  } else son.gainGratte.gain.setTargetAtTime(0, t, 0.05);
}
// Un coup de grattoir : petit « tic » de bruit, plus aigu sur la roche dure
function sonCoup(t) {
  if (!son.actif || !son.ctx) return;
  const a = son.ctx, h = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = son.bruit; f.type = "bandpass"; f.Q.value = 2.5; f.frequency.value = (FREQ_GRATTE[t] || 900) * (0.9 + Math.random() * 0.2);
  g.gain.setValueAtTime(0.16, h); g.gain.exponentialRampToValueAtTime(0.0001, h + 0.07);
  src.connect(f).connect(g).connect(a.destination); src.start(h, Math.random() * 0.5); src.stop(h + 0.08);
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
function sonRetour() { bip(880, 0.1, 0.05); setTimeout(() => bip(660, 0.1, 0.05), 90); setTimeout(() => bip(440, 0.15, 0.05), 180); }
// Verre brisé : quelques notes aiguës en désordre
function sonVerre() { for (let k = 0; k < 4; k++) setTimeout(() => bip(2800 + Math.random() * 2200, 0.07, 0.03, "triangle"), k * 25); }
// Grondement sourd : du sable ou de l'eau se met à couler
function sonDanger() {
  if (!son.actif || !son.ctx) return;
  const a = son.ctx, t = a.currentTime, src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = son.bruit; f.type = "lowpass"; f.frequency.value = 180;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + 0.65);
}
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
  if (lancePierreActif && peutLancer() && dansPrise(wx, wy)) geste = { type: "lancer", id: e.pointerId };
  else geste = {
    type: "gratter", id: e.pointerId, t0: performance.now(), x0: e.clientX, y0: e.clientY, bouge: false,
    // Si on touche un endroit déjà creusé, ce sera peut-être un « va là » : on attend un peu avant de gratter
    surVide: false // (plus de « toucher pour marcher » : on gratte tout de suite)
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
    // (le toucher court ne fait plus marcher : on se déplace avec la barre en bas)
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
  if (mineur.etat === "accroche" || mineur.etat === "glisse") { mineur.etat = "air"; mineur.vx = 0; mineur.vy = 0; } // il lâche la paroi
  mineur.cible = wx;
}

function majEntrees(dt) {
  matiereGrattee = 0;
  // Doigt immobile : le grattoir s'élargit peu à peu (centre d'abord, puis autour)
  if (geste && geste.type === "gratter" && vitesseDoigt < 40) tempsImmobile += dt; else tempsImmobile = 0;
  croissanceGrattoir = 1 + (REG.grossit - 1) * Math.min(1, tempsImmobile * 0.65);
  if (!modeRegard && doigts.size === 1 && geste && geste.type === "gratter") {
    const d = doigts.values().next().value;
    const pret = !geste.surVide || geste.bouge || performance.now() - geste.t0 >= DUREE_TAP;
    if (pret) majMinage(d, dt * REG.rythme);
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
    if (d) force = Math.min(1, vitesseLancer(versMondeX(d.x), versMondeY(d.y)).v / vLancerMax());
  }
  majSonTension(force);
  majSonGrattage();
}

// Touches du clavier (sur PC) : flèches ou Q/D/Z, espace pour sauter
const TOUCHES_G = ["ArrowLeft", "KeyA", "KeyQ"], TOUCHES_D = ["ArrowRight", "KeyD"], TOUCHES_SAUT = ["ArrowUp", "KeyW", "KeyZ", "Space"];
const touchesTenues = new Set();
function majDirTouche() {
  dirTouche = Math.max(-1, Math.min(1, (touchesTenues.has("d") ? 1 : 0) - (touchesTenues.has("g") ? 1 : 0) + (typeof dirBarre === "number" ? dirBarre : 0)));
  if (!dirTouche && mineur.etat === "sol" && mineur.cible !== null && touchesTenues.size === 0 && !dirTouche) mineur.cible = null;
}
addEventListener("keydown", e => {
  if (TOUCHES_G.includes(e.code)) touchesTenues.add("g");
  else if (TOUCHES_D.includes(e.code)) touchesTenues.add("d");
  else if (TOUCHES_SAUT.includes(e.code)) { if (!e.repeat) sauter(); }
  else return;
  e.preventDefault();
  if (mineur.etat === "accroche" && touchesTenues.size) mineur.etat = "air";
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
  const sub = taille >= 6 ? 4 : taille >= 3 ? 2 : 1; // (petits pixels par case : seulement ce qui se voit, pour rester rapide)
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
  try { localStorage.setItem("tunnel-zoom2", String(tailleCible.toFixed(2))); } catch (e) {}
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
  const c = cibleCamera(), k = 1 - Math.exp(-dt * 6 * 0.65);
  camX += (c.x - camX) * k;
  camY += (c.y - camY) * k;
}

// ---------- 10. Dessin ----------

// Couleur « de base » d'une case de roche (avant la lumière)
function couleurCase(x, y, t) {
  const P = t === SOCLE ? COUL_SOCLE : (COUL[t] || COUL_ROCHE[t] || COUL_COUCHE[couche[idx(x, y)]]);
  const n = 0.9 + 0.2 * hache(x, y);
  return [P[0] * n, P[1] * n, P[2] * n];
}

// Un endroit déjà vu reste faiblement visible s'il fait partie d'une galerie ou de son bord
function procheDuVide(x, y) {
  return typeA(x, y) === VIDE || typeA(x - 1, y) === VIDE || typeA(x + 1, y) === VIDE ||
         typeA(x, y - 1) === VIDE || typeA(x, y + 1) === VIDE || typeA(x - 2, y) === VIDE ||
         typeA(x + 2, y) === VIDE || typeA(x, y - 2) === VIDE || typeA(x, y + 2) === VIDE;
}

// Petites tables de « grain » toutes prêtes (128 × 128), pour ne pas recalculer le hasard figé de chaque petit pixel
const BRUIT = [0, 1, 2, 3, 4].map(g => { const t = new Float32Array(128 * 128); for (let i = 0; i < t.length; i++) t[i] = hache(i & 127, i >> 7, 11 + g); return t; });

// Le monde : chaque case est un petit carré de SUB × SUB pixels (grain doux, arêtes au bord des galeries)
// (écrit « au plus court » : c'est la partie qui tourne le plus, des centaines de milliers de fois par seconde)
let image32 = null, imageBuf = null;
const NOIR32 = (255 << 24) | (10 << 16) | (7 << 8) | 6;
const pack = (r, g, b) => (255 << 24) | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
function dessinerMonde(temps, dt) {
  const R2 = 2 * porteeActuelle;
  const scintille = Math.floor(temps * 4);
  const pasFondu = Math.min(255, Math.ceil(dt * 510)); // fondu complet en une demi-seconde
  const ox = Math.floor(camX), oy = Math.floor(camY);
  if (imageBuf !== image.data.buffer) { imageBuf = image.data.buffer; image32 = new Uint32Array(imageBuf); }
  const d = image32, ligne = vueL * SUB, pasSub = 4 / SUB;
  const T0 = TEINTE[0], T1 = TEINTE[1], T2 = TEINTE[2];
  const B0 = BRUIT[0], B1 = BRUIT[1], B2 = BRUIT[2], B3 = BRUIT[3], B4 = BRUIT[4];
  const vid = (x, y) => x >= 0 && y >= 0 && x < LARG && y < PROF && type[y * LARG + x] === VIDE;

  for (let by = 0; by < vueH; by++) {
    const y = oy + by;
    const ly = y - lumOy;
    for (let bx = 0; bx < vueL; bx++) {
      const x = ox + bx;
      const base = by * SUB * ligne + bx * SUB;
      let noir = x < 0 || y < 0 || x >= LARG || y >= PROF, l = 0, t = 0, i = 0;
      if (!noir) {
        i = y * LARG + x; t = type[i];
        // Lumière directe de la lampe (adoucie)
        const lx = x - lumOx;
        const dl = (lx < 0 || ly < 0 || lx >= LW || ly >= LW) ? 65535 : dist[ly * LW + lx];
        l = 1 - dl / R2;
        l = l <= 0 ? 0 : l * l * (3 - 2 * l);
        // Fondu à la première découverte, puis souvenir des galeries déjà vues
        let rv = revele[i];
        if (l > 0.04 && rv < 255) { rv = rv + pasFondu > 255 ? 255 : rv + pasFondu; revele[i] = rv; }
        if (rv === 0) noir = true;
        else {
          const kr = rv / 255;
          l *= kr;
          if (l < MEMOIRE * kr && procheDuVide(x, y)) l = MEMOIRE * kr;
          if (l <= 0.004) noir = true;
        }
      }
      if (noir) {
        for (let j = 0; j < SUB; j++) { const q = base + j * ligne; for (let k = 0; k < SUB; k++) d[q + k] = NOIR32; }
        continue;
      }
      const vide = t === VIDE || t === EAU || t === CRISTAL || t === FOSSILE; // (cristaux et fossiles sont dessinés par-dessus, sur le calque)
      let r, g, b, hautVide = false, gVide = false, dVide = false, basVide = false;
      let niveauEau = 0, eau32 = 0, surf32 = 0, vague = false, etapeFissure = 0;
      if (vide) {
        // Paroi de fond : la roche de la couche, assombrie
        const P = COUL_COUCHE[couche[i]];
        r = P[0] * 0.34; g = P[1] * 0.34; b = P[2] * 0.34;
        if (t === EAU) {
          // Eau transparente : on voit la paroi au travers ; la case n'est remplie que jusqu'à son niveau
          const pleinDessus = y > 0 && type[i - LARG] === EAU;
          niveauEau = pleinDessus ? 1 : Math.min(1, eauNiv[i]);
          eau32 = pack((r * 0.45 + 40) * l * T0, (g * 0.45 + 95) * l * T1, (b * 0.45 + 165) * l * T2);
          surf32 = pack(150 * l, 200 * l, 240 * l);
          vague = !pleinDessus && Math.sin(x * 0.5 + temps * 3) > -0.2;
        }
      } else {
        const P = t === SOCLE ? COUL_SOCLE : (COUL[t] || COUL_ROCHE[t] || COUL_COUCHE[couche[i]]);
        const n = 0.9 + 0.2 * B1[(x & 127) | ((y & 127) << 7)];
        r = P[0] * n; g = P[1] * n; b = P[2] * n;
        const u = usure[i];
        // Case entamée (points de vie en baisse) : un peu plus claire, et fissurée par étapes
        if (u > 0) { const f = Math.min(1, u / pvMax(t)), k = 1 + 0.15 * f; r *= k; g *= k; b *= k; etapeFissure = 1 + Math.min(4, Math.floor(f * 5)); } // 5 étapes visibles avant de casser
        if (COUL[t] && l > 0.3 && hache(x + scintille * 7, y + scintille * 13) > 0.975) { r = 255; g = 250; b = 225; }
        hautVide = vid(x, y - 1); basVide = vid(x, y + 1); gVide = vid(x - 1, y); dVide = vid(x + 1, y);
        if (SUB === 1 && (hautVide || basVide || gVide || dVide)) { r *= 0.75; g *= 0.75; b *= 0.75; }
      }
      r *= l * T0; g *= l * T1; b *= l * T2;
      if (SUB === 1) { // de loin : un seul pixel par case
        let m = vide ? 0.85 + 0.3 * B0[((x >> 1) & 127) | (((y >> 1) & 127) << 7)] : 1;
        if (t === EAU && niveauEau >= 0.5) { d[base] = vague && niveauEau < 1 ? surf32 : eau32; continue; }
        if (t === SABLE) m *= B2[(x & 127) | ((y & 127) << 7)] < 0.5 ? 1.2 : 0.82;
        if (etapeFissure) m *= 1 - 0.07 * etapeFissure; // (de loin : le bloc s'assombrit un peu à chaque étape)
        d[base] = pack(r * m, g * m, b * m);
        continue;
      }
      // Les petits pixels de la case
      for (let j = 0; j < SUB; j++) {
        const q0 = base + j * ligne;
        const sy = y * 4 + j * pasSub, sy7 = (sy & 127) << 7, syp = ((sy >> 2) & 127) << 7;
        for (let k = 0; k < SUB; k++) {
          const sx = x * 4 + k * pasSub;
          let m;
          if (t === EAU) {
            const haut = (j + 0.5) / SUB, surf = 1 - niveauEau;
            if (haut >= surf) { d[q0 + k] = (haut - surf < 1 / SUB && vague) ? surf32 : eau32; continue; } // sous la surface
            m = 0.85 + 0.3 * B0[((sx >> 2) & 127) | syp];
          } else if (vide) m = 0.85 + 0.3 * B0[((sx >> 2) & 127) | syp];
          else {
            const o = (sx & 127) | sy7;
            m = 0.9 + 0.14 * B1[o];
            if (t === SABLE) m *= B2[o] < 0.5 ? 1.25 : 0.78; // grain moucheté
            if (etapeFissure) { // fissures qui s'élargissent, puis éclats qui se détachent (dernière étape)
              if (B3[o] < etapeFissure * 0.08) m *= 0.45;
              else if (etapeFissure === 5 && B4[o] < 0.22) m *= 0.18;
            }
            if (hautVide && j === 0) m *= 1.12;            // arête claire au-dessus des galeries
            else if (basVide && j === SUB - 1) m *= 0.68;  // dessous plus sombre
            if (gVide && k === 0) m *= 0.75;
            else if (dVide && k === SUB - 1) m *= 0.75;
          }
          d[q0 + k] = pack(r * m, g * m, b * m);
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
  const carre = (x, y, t = p) => cc.fillRect(net(x), net(y), net(x + t) - net(x), net(y + t) - net(y));
  const q = p * E;                            // petit pixel des objets et du mineur (même taille réelle qu'avant)
  const scintille = Math.floor(temps * 4);

  // Un gros cristal (dans la roche, ou qui tombe une fois détaché) : petit pixel par petit pixel
  const dessinerUnCristal = (c, ox, oy, Lfixe) => {
    // Rapide : sans fissure, on utilise une image toute prête (une par niveau de lumière, faite une seule fois)
    if (c.fissure === 0) {
      const L = Lfixe !== undefined ? Lfixe : lumiereEn(c.x + (c.w >> 1), c.y + (c.h >> 1));
      if (L < 0.02) return;
      const niv = Math.min(8, Math.round(L * 8));
      c.images = c.images || [];
      if (!c.images[niv]) {
        const can = document.createElement("canvas"); can.width = c.W; can.height = c.H;
        const g = can.getContext("2d"), k = niv / 8;
        for (let py = 0; py < c.H; py++) for (let px = 0; px < c.W; px++) {
          const col = c.pix[py * c.W + px];
          if (!col) continue;
          g.fillStyle = col === ENCRE ? CONTOUR : "rgb(" + Math.min(255, col[0] * k * TEINTE[0] | 0) + "," + Math.min(255, col[1] * k * TEINTE[1] | 0) + "," + Math.min(255, col[2] * k * TEINTE[2] | 0) + ")";
          g.fillRect(px, py, 1, 1);
        }
        c.images[niv] = can;
      }
      cc.imageSmoothingEnabled = false;
      cc.drawImage(c.images[niv], net(ox), net(oy), c.W * p, c.H * p);
      // Petit éclat de lumière qui scintille, de temps en temps
      if (L > 0.3) { const e = (hache(c.id, scintille) * c.pix.length) | 0; const col = c.pix[e]; if (col && col !== ENCRE) { cc.fillStyle = "#fffaf0"; carre(ox + (e % c.W) * p, oy + ((e / c.W) | 0) * p); } }
      return;
    }
    for (let py = 0; py < c.H; py++) for (let px = 0; px < c.W; px++) {
      const col = c.pix[py * c.W + px];
      if (!col) continue;
      const L = Lfixe !== undefined ? Lfixe : lumiereEn(c.x + (px >> 2), c.y + (py >> 2));
      if (L < 0.02) continue;
      if (col === ENCRE) { cc.fillStyle = CONTOUR; carre(ox + px * p, oy + py * p); continue; }
      let k = L;
      if (c.fissure > 0 && hache(px * 7 + c.id, py * 13 + 5) < c.fissure * 0.45) k *= 0.35; // fissures
      else if (L > 0.3 && hache(px + scintille * 7 + c.id, py + scintille * 13) > 0.985) k = 1.6; // éclat de lumière
      cc.fillStyle = "rgb(" + Math.min(255, col[0] * k * TEINTE[0] | 0) + "," + Math.min(255, col[1] * k * TEINTE[1] | 0) + "," + Math.min(255, col[2] * k * TEINTE[2] | 0) + ")";
      carre(ox + px * p, oy + py * p);
    }
  };
  for (const c of cristaux) {
    if (!c.vivant) continue;
    const ox = versEcranX(c.x), oy = versEcranY(c.y);
    if (ox > innerWidth || oy > innerHeight || ox + c.w * taille < 0 || oy + c.h * taille < 0) continue;
    dessinerUnCristal(c, ox, oy);
  }

  // Mini-objets
  for (const o of objets) {
    if (o.dessin) { // gros cristal détaché
      const c = o.dessin;
      dessinerUnCristal(c, versEcranX(o.x) - c.W * p / 2, versEcranY(o.y) - c.H * p / 2, Math.max(0.5, lumiereEn(Math.floor(o.x), Math.floor(o.y))));
      continue;
    }
    const sx = versEcranX(o.x) - q, sy = versEcranY(o.y) - q;
    if (sx < -10 || sy < -10 || sx > innerWidth + 10 || sy > innerHeight + 10) continue;
    const f = formeDe(o.t), col = couleurObjet(o.t, o.c);
    const L = Math.max(0.3, lumiereEn(Math.floor(o.x), Math.floor(o.y)));
    if (L < 0.31 && revele[idx(Math.floor(o.x), Math.floor(o.y))] === 0) continue;
    const pris = new Set(f.map(([a, b]) => a + "," + b));
    cc.fillStyle = CONTOUR;
    for (const [a, b] of f) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (!pris.has((a + dx) + "," + (b + dy))) carre(sx + (a + dx) * q, sy + (b + dy) * q, q);
    f.forEach(([a, b], n) => {
      const k = (n === 0 && COUL[o.t]) ? 1.35 : 1; // petit reflet sur les objets précieux
      cc.fillStyle = "rgb(" + Math.min(255, col[0] * L * k * TEINTE[0] | 0) + "," + Math.min(255, col[1] * L * k * TEINTE[1] | 0) + "," + Math.min(255, col[2] * L * k * TEINTE[2] | 0) + ")";
      carre(sx + a * q, sy + b * q, q);
    });
  }

  // Zone qu'on est en train de creuser : cases visées légèrement éclaircies + cercle fin sous le doigt
  if (geste && geste.type === "gratter" && !modeRegard) {
    const d = doigts.get(geste.id);
    if (d) {
      const wx = versMondeX(d.x), wy = versMondeY(d.y);
      const r = Math.max(0.5, rayonGrattoir() / taille) * croissanceGrattoir;
      const aPortee = (wx - centreMineurX()) ** 2 + (wy - centreMineurY()) ** 2 <= REG.portee * REG.portee;
      if (aPortee) {
        cc.fillStyle = "rgba(255,240,215,0.13)";
        for (let y = Math.floor(wy - r); y <= wy + r; y++) for (let x = Math.floor(wx - r); x <= wx + r; x++) {
          if (Math.hypot(x + 0.5 - wx, y + 0.5 - wy) > r || !solide(x, y) || typeA(x, y) === SOCLE) continue;
          const sx = versEcranX(x), sy = versEcranY(y);
          cc.fillRect(net(sx), net(sy), net(sx + taille) - net(sx), net(sy + taille) - net(sy));
        }
      }
      cc.strokeStyle = aPortee ? "rgba(255,240,215,0.55)" : "rgba(255,240,215,0.18)"; // trop loin : cercle pâle
      cc.lineWidth = 1;
      cc.beginPath(); cc.arc(d.x, d.y, Math.max(4, r * taille), 0, Math.PI * 2); cc.stroke();
    }
  }

  // Lance-pierre actif : petit cercle pointillé qui tourne lentement autour du mineur (là où l'attraper)
  if (lancePierreActif && peutLancer() && !(geste && geste.type === "lancer") && !expeditionFinie) {
    const cx = versEcranX(centreMineurX()), cy = versEcranY(centreMineurY());
    const rayon = HM / 2 * taille + Math.max(1.5 * taille, 14) * 0.8; // (à peu près la zone où on peut l'attraper)
    cc.fillStyle = "rgba(255,236,200,0.45)";
    const t = Math.max(1.5, q);
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2 + temps * 0.35;
      cc.fillRect(net(cx + Math.cos(a) * rayon - t / 2), net(cy + Math.sin(a) * rayon - t / 2), t, t);
    }
  }

  // Le mineur, avec son effet « rebondi » : il s'aplatit en atterrissant, s'étire en vol, sautille en marchant
  const m = mineur;
  let ex = 1, ey = 1;
  const B = REG.bouncy, Sq = REG.squishy; // réglages : force des effets « rebondi » et « tassé »
  if (m.ecrase > 0) { ex = 1 + 0.22 * m.ecrase * B; ey = 1 - 0.28 * m.ecrase * B; }
  else if (m.ecrase < 0) { ex = 1 + 0.15 * m.ecrase * B; ey = 1 - 0.2 * m.ecrase * B; }
  if (m.etat === "air" && !m.controleAir) { const e = Math.min(0.18, Math.abs(m.vy) / 250); ex *= 1 - e * 0.6; ey *= 1 + e; }
  if (m.tasse > 0.01) { ex *= 1 + 0.2 * m.tasse * Sq; ey *= 1 - Math.min(0.6, 0.34 * Sq) * m.tasse; } // tassé pour se faufiler : plus large, plus bas
  const marche = m.etat === "sol" && m.cible !== null;
  const cadre = marche ? Math.floor(m.pas * 9 * 0.65) % 2 : 0;
  let saut = marche && cadre === 1 ? -q : 0;
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
    cc.fillRect((x - 4) * q, (y - 12) * q, q + 0.02, q + 0.02);
  }
  cc.restore();

  // Coincé : on redessine le sable par-dessus lui (il est dedans)
  if (m.coince) {
    for (let y = Math.floor(m.y - HM); y < Math.ceil(m.y); y++) for (let x = Math.floor(m.x); x < Math.ceil(m.x + LM); x++) {
      if (typeA(x, y) !== SABLE) continue;
      const c = couleurCase(x, y, SABLE), L = lumiereEn(x, y);
      for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
        const mo = hache(x * 12 + k * 3 + 1, y * 20 + j * 5 + 2) < 0.5 ? 1.25 : 0.78;
        cc.fillStyle = "rgb(" + Math.min(255, c[0] * mo * L * TEINTE[0] | 0) + "," + Math.min(255, c[1] * mo * L * TEINTE[1] | 0) + "," + Math.min(255, c[2] * mo * L * TEINTE[2] | 0) + ")";
        carre(versEcranX(x) + k * p, versEcranY(y) + j * p);
      }
    }
  }

  // Poussière et gouttes
  for (const q2 of particules) {
    cc.globalAlpha = q2.goutte ? 0.9 : Math.min(1, q2.vie * 2.5);
    cc.fillStyle = q2.coul;
    carre(versEcranX(q2.x), versEcranY(q2.y), q);
    if (q2.goutte && !q2.eclabousse) carre(versEcranX(q2.x), versEcranY(q2.y) - q, q); // goutte allongée
  }
  cc.globalAlpha = 1;

  // Lance-pierre en cours : élastique + début du trajet (seulement le début : la suite, c'est à l'œil)
  if (geste && geste.type === "lancer" && !modeRegard) {
    const d = doigts.get(geste.id);
    if (d) {
      const fx = versMondeX(d.x), fy = versMondeY(d.y);
      cc.fillStyle = "rgba(205,150,105,0.9)";
      for (const bx of [m.x + 0.1, m.x + LM - 0.1]) { // deux brins d'élastique, des mains au doigt
        const by = m.y - 1.2 * E, ax = versEcranX(bx), ay = versEcranY(by);
        const n = Math.ceil(Math.hypot(d.x - ax, d.y - ay) / q);
        for (let k = 0; k <= n; k += 1) carre(ax + (d.x - ax) * k / n, ay + (d.y - ay) * k / n, q);
      }
      const pts = trajetPrevu(fx, fy), lim = Math.floor(pts.length * 0.35);
      for (let k = 2; k < lim; k += 3) {
        cc.globalAlpha = 0.85 * (1 - k / lim) + 0.1;
        cc.fillStyle = "#fff0dc";
        cc.fillRect(net(versEcranX(pts[k][0]) - q), net(versEcranY(pts[k][1]) - q), q * 2, q * 2);
      }
      cc.globalAlpha = 1;
      if (pts.length) m.sens = fx > centreMineurX() ? -1 : 1; // il regarde vers où il va partir
    }
  }
}

// ---------- 11. Compteur et boutons ----------

const affCompteur = document.getElementById("compteur");
const ORDRE_COMPTEUR = [TERRE, SABLE, CAILLOU, ARGILE, SCHISTE, BASALTE, OBSIDIENNE, CUIVRE, OR, CRISTAL, GRAVIER, FOSSILE, RECHARGE];
const NOM = { [TERRE]: "Terre", [SABLE]: "Sable", [ARGILE]: "Argile", [BASALTE]: "Basalte", [CUIVRE]: "Cuivre", [OR]: "Or", [CRISTAL]: "Cristal", [FOSSILE]: "Fossile", [RECHARGE]: "Recharge", [GRAVIER]: "Débris de cristal", [CAILLOU]: "Caillou", [SCHISTE]: "Schiste", [OBSIDIENNE]: "Obsidienne" };
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

// Taille du grattoir : réglage de démo « taille du pinceau »
function rayonGrattoir() { return RAYON_ECRAN * REG.pinceau; }

// ---------- Panneau des réglages de démo ----------
// Un bouton (roue dentée) ouvre un panneau en bas : un curseur par réglage, avec sa valeur en chiffres.
// Le jeu continue au-dessus, on voit l'effet tout de suite.
const panneau = document.getElementById("panneau-demo");
const listeReglages = document.getElementById("liste-reglages");
const GROUPES = [
  ["Général", ["rythme"]],
  ["Mineur", ["marche", "saut", "gravite", "rampage", "squishy", "bouncy"]],
  ["Minage", ["coupsSec", "coupsTerre", "pinceau", "grossit", "portee", "douceCrist"]],
  ["Lance-pierre et monde", ["lancer", "aimant", "lampe", "matieres"]]
];
const formatReg = (k, v) => {
  const d = DEF_REG[k], txt = (Math.round(v * 100) / 100).toLocaleString("fr-FR");
  return d.u === "×" ? "×" + txt : d.u === "%" ? txt + " %" : txt;
};
function sauverReglages() { try { localStorage.setItem("tunnel-demo", JSON.stringify(REG)); } catch (e) {} }
function construirePanneau() {
  listeReglages.innerHTML = "";
  for (const [titre, cles] of GROUPES) {
    const h = document.createElement("div");
    h.className = "groupe-reglages";
    h.textContent = titre;
    listeReglages.appendChild(h);
    for (const k of cles) {
      const d = DEF_REG[k];
      const ligne = document.createElement("label");
      ligne.className = "ligne-reglage";
      ligne.innerHTML = `<span>${d.nom}${d.u && d.u !== "×" && d.u !== "%" ? ` <small>(${d.u})</small>` : ""}</span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.pas}" value="${REG[k]}"><b>${formatReg(k, REG[k])}</b>`;
      const curseur = ligne.querySelector("input"), valeur = ligne.querySelector("b");
      curseur.addEventListener("input", () => {
        REG[k] = +curseur.value;
        valeur.textContent = formatReg(k, REG[k]);
        if (k === "lampe") lumiereSale = true;
        sauverReglages();
      });
      listeReglages.appendChild(ligne);
    }
  }
}
construirePanneau();
const boutonReglages = document.getElementById("bouton-reglages");
boutonReglages.innerHTML = pixelsSvg([[6, 1, 2, 2], [6, 11, 2, 2], [1, 6, 2, 2], [11, 6, 2, 2], [3, 3, 2, 2], [9, 3, 2, 2], [3, 9, 2, 2], [9, 9, 2, 2], [4, 5, 1, 4], [9, 5, 1, 4], [5, 4, 4, 1], [5, 9, 4, 1]]);
function ouvrirPanneau(ouvert) {
  panneau.hidden = !ouvert;
  boutonReglages.classList.toggle("actif", ouvert);
}
boutonReglages.addEventListener("click", () => ouvrirPanneau(panneau.hidden));
document.getElementById("fermer-reglages").addEventListener("click", () => ouvrirPanneau(false));
document.getElementById("reglages-defaut").addEventListener("click", () => {
  regDefaut(); sauverReglages(); construirePanneau(); lumiereSale = true;
});
// « Copier les valeurs » : un petit texte à coller dans la conversation
document.getElementById("reglages-copier").addEventListener("click", async () => {
  const texte = "Tunnel v" + VERSION + " — réglages :\n" +
    Object.keys(DEF_REG).map(k => "- " + DEF_REG[k].nom + " : " + formatReg(k, REG[k]) + (DEF_REG[k].u && !["×", "%"].includes(DEF_REG[k].u) ? " " + DEF_REG[k].u : "")).join("\n");
  const bouton = document.getElementById("reglages-copier");
  try { await navigator.clipboard.writeText(texte); bouton.textContent = "Copié"; }
  catch (e) { // (si la copie est refusée : on affiche le texte pour le copier à la main)
    window.prompt("Copie ce texte :", texte);
  }
  setTimeout(() => { bouton.textContent = "Copier les valeurs"; }, 1500);
});

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

// Bouton lance-pierre (activé / désactivé). Désactivé : toucher le mineur sert juste à creuser.
const boutonLance = document.getElementById("bouton-lance");
let lancePierreActif = true;
try { lancePierreActif = localStorage.getItem("tunnel-lance") !== "0"; } catch (e) {}
boutonLance.innerHTML = pixelsSvg([[3, 2, 2, 6], [9, 2, 2, 6], [4, 7, 6, 2], [6, 9, 2, 3], [5, 3, 4, 1]]);
function majBoutonLance() {
  boutonLance.classList.toggle("actif", lancePierreActif);
  boutonLance.setAttribute("aria-label", lancePierreActif ? "Désactiver le lance-pierre" : "Activer le lance-pierre");
  document.getElementById("outils").classList.toggle("eteint", !lancePierreActif);
}
boutonLance.addEventListener("click", () => {
  lancePierreActif = !lancePierreActif;
  try { localStorage.setItem("tunnel-lance", lancePierreActif ? "1" : "0"); } catch (e) {}
  majBoutonLance();
});
majBoutonLance();

// Joystick (en bas à gauche) : pousser à gauche / à droite = marcher, pousser vers le haut = sauter
const joystick = document.getElementById("joystick");
const joyBouton = document.getElementById("joy-bouton");
const JOY_RAYON = 34;          // jusqu'où le bouton peut aller (px)
let dirBarre = 0, doigtJoy = null, joyHaut = false;
function lireJoystick(e) {
  const r = joystick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > JOY_RAYON) { dx *= JOY_RAYON / d; dy *= JOY_RAYON / d; }
  joyBouton.style.transform = "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
  const ancien = dirBarre;
  dirBarre = dx > 10 ? 1 : dx < -10 ? -1 : 0;
  // Saut : une seule fois à chaque poussée vers le haut (il faut revenir avant de ressauter)
  const haut = dy < -JOY_RAYON * 0.6;
  if (haut && !joyHaut) sauter();
  joyHaut = haut;
  if (dirBarre && mineur.etat === "accroche") mineur.etat = "air";
  if (dirBarre !== ancien) majDirTouche();
}
joystick.addEventListener("pointerdown", e => {
  e.preventDefault();
  try { joystick.setPointerCapture(e.pointerId); } catch (err) {}
  doigtJoy = e.pointerId;
  joystick.classList.add("actif");
  lireJoystick(e);
});
joystick.addEventListener("pointermove", e => { if (e.pointerId === doigtJoy) lireJoystick(e); });
function lacherJoystick(e) {
  if (e.pointerId !== doigtJoy) return;
  doigtJoy = null; dirBarre = 0; joyHaut = false;
  joyBouton.style.transform = "";
  joystick.classList.remove("actif");
  majDirTouche();
  if (!dirTouche && mineur.etat === "sol") mineur.cible = null;
}
joystick.addEventListener("pointerup", lacherJoystick);
joystick.addEventListener("pointercancel", lacherJoystick);
joystick.addEventListener("contextmenu", e => e.preventDefault());

// Bandeau « trouvaille » : quand on ramasse un gros cristal ou un fossile, son dessin et son nom
// s'affichent un instant en haut de l'écran
const bandeau = document.getElementById("trouvaille");
const bandeauDessin = document.getElementById("trouvaille-dessin");
let minuteurBandeau = null;
function afficherTrouvaille(c) {
  const k = Math.max(1, Math.floor(Math.min(56 / c.W, 44 / c.H) * 2) / 2); // 1 petit pixel = k px (net)
  bandeauDessin.width = c.W; bandeauDessin.height = c.H;
  bandeauDessin.style.width = c.W * k + "px"; bandeauDessin.style.height = c.H * k + "px";
  const g = bandeauDessin.getContext("2d");
  g.clearRect(0, 0, c.W, c.H);
  for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
    const col = c.pix[y * c.W + x];
    if (!col) continue;
    g.fillStyle = col === ENCRE ? CONTOUR : "rgb(" + col[0] + "," + col[1] + "," + col[2] + ")";
    g.fillRect(x, y, 1, 1);
  }
  document.getElementById("trouvaille-nom").textContent = c.nom;
  bandeau.hidden = false;
  bandeau.classList.remove("parti");
  clearTimeout(minuteurBandeau);
  minuteurBandeau = setTimeout(() => {
    bandeau.classList.add("parti");
    minuteurBandeau = setTimeout(() => { bandeau.hidden = true; }, 400);
  }, 2200);
}

// ---------- 11 bis. Énergie à l'écran et fin d'expédition ----------

const barreEnergie = document.getElementById("energie-niveau");
let energieAffichee = -1;
function majBarreEnergie() {
  if (Math.abs(energie - energieAffichee) < 0.002) return;
  energieAffichee = energie;
  barreEnergie.style.width = (energie * 100).toFixed(1) + "%";
}

let profMax = 0;
const ecranFin = document.getElementById("fin");
function finExpedition() {
  expeditionFinie = true;
  geste = null;
  const lignes = ORDRE_COMPTEUR.filter(t => compteur[t]).map(t => {
    const c = couleurObjet(t, 1);
    return `<div><i style="background:rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})"></i><span>${NOM[t]}</span><b>${nombre.format(compteur[t])}</b></div>`;
  }).join("");
  document.getElementById("fin-profondeur").textContent = profMax + " m";
  document.getElementById("fin-butin").innerHTML = lignes || '<div><span>Rien ramassé</span></div>';
  ecranFin.hidden = false;
  vibrer(40);
}
// Nouvelle expédition : une nouvelle mine (le butin n'est pas encore gardé : le magasin viendra plus tard)
document.getElementById("fin-rejouer").addEventListener("click", () => location.reload());

// ---------- 12. Boucle du jeu ----------

const affProfondeur = document.getElementById("profondeur");
let profAffichee = -1;

let tAvant = 0;
function boucle(ms) {
  const temps = ms / 1000;
  // Temps écoulé depuis l'image précédente, borné (si le tel a mis le jeu en pause, on ne « saute » pas)
  const dt = tAvant ? Math.max(0, Math.min(0.05, temps - tAvant)) : 1 / 60;
  tAvant = temps;

  numImage++; dtImage = dt || 1 / 60;
  majEntrees(dt);
  const dtj = dt * REG.rythme; // temps « du jeu » (réglage rythme général)
  majMatieres(dtj);
  majMineur(dtj);
  majGouttes();
  majObjets(dtj);
  majParticules(dtj);
  if (lumiereSale) { calculerLumiere(); lumiereSale = false; }
  majCamera(dt);
  // La flamme vacille (plus fort quand l'énergie baisse), et sa portée suit l'énergie
  const faible = 1 - energie;
  const vacille = 1 + (0.05 + 0.06 * faible) * Math.sin(temps * 6.3) + 0.035 * Math.sin(temps * 14.1 + 1) + (0.02 + 0.05 * faible) * Math.sin(temps * 23.7);
  if (energie <= 0 && !expeditionFinie) { extinction += dt; if (extinction > 1.5) finExpedition(); }
  const eteint = Math.max(0, 1 - extinction / 1.5);
  porteeActuelle = REG.lampe * (0.12 + (0.18 * eteint) + 0.7 * energie) * vacille;
  majBarreEnergie();
  dessinerMonde(temps, dt);
  dessinerCalque(temps);
  majCompteur(dt);

  // Profondeur : 10 cases = 1 mètre
  const prof = Math.max(0, Math.round((Math.floor(mineur.y) - DEPART_Y) / (10 * E)));
  if (prof !== profAffichee) { profAffichee = prof; affProfondeur.textContent = prof + " m"; }
  if (prof > profMax) profMax = prof;

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
